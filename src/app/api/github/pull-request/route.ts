import { NextResponse } from "next/server";
import { fetchPublicGitHubPullRequest } from "@/lib/github/server";
import { asGitHubImportError, parseGitHubPullRequestUrl } from "@/lib/github/pull-request";
import {
  githubImportErrorResponseSchema,
  githubPullRequestApiResponseSchema,
  githubPullRequestRequestSchema,
} from "@/lib/github/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json(
      githubImportErrorResponseSchema.parse({
        error: { code: "INVALID_REQUEST", message: "Request body must be valid JSON." },
      }),
      { status: 400 },
    );
  }

  const parsedRequest = githubPullRequestRequestSchema.safeParse(requestBody);
  if (!parsedRequest.success) {
    return NextResponse.json(
      githubImportErrorResponseSchema.parse({
        error: { code: "INVALID_REQUEST", message: "A pull-request URL is required." },
      }),
      { status: 400 },
    );
  }

  try {
    const locator = parseGitHubPullRequestUrl(parsedRequest.data.url);
    const pullRequest = await fetchPublicGitHubPullRequest(locator);
    return NextResponse.json(githubPullRequestApiResponseSchema.parse({ pullRequest }));
  } catch (error) {
    const normalized = asGitHubImportError(error);
    return NextResponse.json(
      githubImportErrorResponseSchema.parse({
        error: {
          code: normalized.code,
          message: normalized.message,
          retryAt: normalized.retryAt,
        },
      }),
      { status: normalized.status },
    );
  }
}
