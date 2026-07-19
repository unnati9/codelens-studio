import { GitHubImportError } from "@/lib/github/pull-request";

export const githubApiBaseUrl = "https://api.github.com";
const githubApiVersion = "2026-03-10";

export interface GitHubJsonOptions {
  accessToken?: string;
  notFoundCode?: string;
  notFoundMessage?: string;
  timeoutMs?: number;
}

function requestHeaders(accessToken?: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CodeLens-Studio",
    "X-GitHub-Api-Version": githubApiVersion,
  };
  const token = accessToken ?? process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new GitHubImportError(
      "MALFORMED_RESPONSE",
      "GitHub returned an unreadable response.",
      502,
    );
  }
}

function retryAtFromResponse(response: Response): string | null {
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) return new Date(reset * 1000).toISOString();
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return new Date(Date.now() + retryAfter * 1000).toISOString();
  }
  return null;
}

export async function githubJson(url: string, options: GitHubJsonOptions = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: requestHeaders(options.accessToken),
      cache: "no-store",
      signal: AbortSignal.timeout(Math.max(250, Math.min(options.timeoutMs ?? 15_000, 15_000))),
    });
  } catch (error) {
    throw new GitHubImportError(
      "NETWORK_FAILURE",
      error instanceof Error
        ? `Could not reach GitHub: ${error.message}`
        : "Could not reach GitHub.",
      502,
    );
  }

  if (response.ok) return responseBody(response);

  const remaining = response.headers.get("x-ratelimit-remaining");
  if (response.status === 429 || (response.status === 403 && remaining === "0")) {
    throw new GitHubImportError(
      "RATE_LIMITED",
      "GitHub's API rate limit has been reached. Try again later.",
      429,
      retryAtFromResponse(response),
    );
  }
  if (response.status === 401) {
    throw new GitHubImportError(
      "GITHUB_AUTH_EXPIRED",
      "The GitHub connection has expired. Reconnect GitHub and try again.",
      401,
    );
  }
  if (response.status === 404) {
    throw new GitHubImportError(
      options.notFoundCode ?? "NOT_FOUND",
      options.notFoundMessage ?? "The requested GitHub resource was not found.",
      404,
    );
  }
  if (response.status === 403) {
    throw new GitHubImportError(
      "GITHUB_FORBIDDEN",
      "The GitHub App does not have permission to access this resource.",
      403,
    );
  }

  const body = await responseBody(response);
  const message =
    typeof body === "object" && body && "message" in body && typeof body.message === "string"
      ? body.message
      : `GitHub returned status ${response.status}.`;
  throw new GitHubImportError("GITHUB_API_ERROR", message, 502);
}
