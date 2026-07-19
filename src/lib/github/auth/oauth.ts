import {
  githubOAuthTokenResponseSchema,
  githubSessionSchema,
  githubUserApiResponseSchema,
  type GitHubSession,
} from "@/lib/github/auth/schema";
import type { GitHubAuthConfig } from "@/lib/github/auth/config";

const githubApiVersion = "2026-03-10";
const githubTokenUrl = "https://github.com/login/oauth/access_token";

export class GitHubAuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = "GitHubAuthError";
    this.code = code;
    this.status = status;
  }
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new GitHubAuthError("MALFORMED_GITHUB_RESPONSE", "GitHub returned invalid JSON.");
  }
}

async function fetchToken(body: URLSearchParams): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(githubTokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "CodeLens-Studio",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new GitHubAuthError(
      "GITHUB_NETWORK_FAILURE",
      error instanceof Error
        ? `Could not reach GitHub: ${error.message}`
        : "Could not reach GitHub.",
    );
  }

  const data = await responseJson(response);
  if (!response.ok) {
    throw new GitHubAuthError("TOKEN_EXCHANGE_FAILED", "GitHub rejected the authorization code.");
  }
  if (typeof data === "object" && data && "error" in data) {
    throw new GitHubAuthError("TOKEN_EXCHANGE_FAILED", "GitHub rejected the authorization code.");
  }
  return data;
}

function sessionFromTokenResponse(
  tokenResponse: unknown,
  user: GitHubSession["user"],
  now: number,
  fallbackRefresh?: Pick<GitHubSession, "refreshToken" | "refreshTokenExpiresAt">,
): GitHubSession {
  const token = githubOAuthTokenResponseSchema.safeParse(tokenResponse);
  if (!token.success || token.data.token_type.toLowerCase() !== "bearer") {
    throw new GitHubAuthError(
      "MALFORMED_GITHUB_RESPONSE",
      "GitHub returned an invalid access token response.",
    );
  }

  const refreshToken = token.data.refresh_token ?? fallbackRefresh?.refreshToken ?? null;
  const refreshTokenExpiresAt = token.data.refresh_token_expires_in
    ? new Date(now + token.data.refresh_token_expires_in * 1000).toISOString()
    : (fallbackRefresh?.refreshTokenExpiresAt ?? null);

  return githubSessionSchema.parse({
    version: 1,
    accessToken: token.data.access_token,
    refreshToken,
    accessTokenExpiresAt: token.data.expires_in
      ? new Date(now + token.data.expires_in * 1000).toISOString()
      : null,
    refreshTokenExpiresAt,
    issuedAt: new Date(now).toISOString(),
    user,
  });
}

async function fetchAuthenticatedUser(accessToken: string): Promise<GitHubSession["user"]> {
  let response: Response;
  try {
    response = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "CodeLens-Studio",
        "X-GitHub-Api-Version": githubApiVersion,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new GitHubAuthError(
      "GITHUB_NETWORK_FAILURE",
      error instanceof Error
        ? `Could not reach GitHub: ${error.message}`
        : "Could not reach GitHub.",
    );
  }

  if (!response.ok) {
    throw new GitHubAuthError("USER_VALIDATION_FAILED", "GitHub could not validate the user.", 401);
  }
  const parsedUser = githubUserApiResponseSchema.safeParse(await responseJson(response));
  if (!parsedUser.success) {
    throw new GitHubAuthError(
      "MALFORMED_GITHUB_RESPONSE",
      "GitHub returned an invalid user response.",
    );
  }

  return {
    id: parsedUser.data.id,
    login: parsedUser.data.login,
    name: parsedUser.data.name,
    avatarUrl: parsedUser.data.avatar_url,
    htmlUrl: parsedUser.data.html_url,
  };
}

export async function exchangeGitHubAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  config: GitHubAuthConfig;
  now?: number;
}): Promise<GitHubSession> {
  const tokenResponse = await fetchToken(
    new URLSearchParams({
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      code: input.code,
      redirect_uri: input.config.callbackUrl.toString(),
      code_verifier: input.codeVerifier,
    }),
  );
  const parsedToken = githubOAuthTokenResponseSchema.safeParse(tokenResponse);
  if (!parsedToken.success) {
    throw new GitHubAuthError(
      "MALFORMED_GITHUB_RESPONSE",
      "GitHub returned an invalid access token response.",
    );
  }
  const user = await fetchAuthenticatedUser(parsedToken.data.access_token);
  return sessionFromTokenResponse(tokenResponse, user, input.now ?? Date.now());
}

export async function refreshGitHubSession(
  session: GitHubSession,
  config: GitHubAuthConfig,
  now = Date.now(),
): Promise<GitHubSession> {
  if (!session.refreshToken) {
    throw new GitHubAuthError("SESSION_EXPIRED", "The GitHub session cannot be refreshed.", 401);
  }
  const tokenResponse = await fetchToken(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    }),
  );
  return sessionFromTokenResponse(tokenResponse, session.user, now, session);
}
