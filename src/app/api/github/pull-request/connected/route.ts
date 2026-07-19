import { NextResponse } from "next/server";
import { getGitHubSession } from "@/lib/github/auth";
import { fetchConnectedGitHubPullRequest } from "@/lib/github/connected-server";
import {
  githubConnectedPullRequestApiResponseSchema,
  githubConnectedPullRequestRequestSchema,
} from "@/lib/github/connected-schema";
import {
  githubInvalidRequestResponse,
  githubRouteError,
  githubUnauthorizedResponse,
  parseJsonRequest,
} from "@/lib/github/route-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await getGitHubSession();
    if (!session) return githubUnauthorizedResponse();
    const parsedRequest = githubConnectedPullRequestRequestSchema.safeParse(
      await parseJsonRequest(request),
    );
    if (!parsedRequest.success) {
      return githubInvalidRequestResponse(
        "A valid GitHub App installation, repository, and pull request are required.",
      );
    }
    const result = await fetchConnectedGitHubPullRequest(session.accessToken, parsedRequest.data);
    return NextResponse.json(githubConnectedPullRequestApiResponseSchema.parse(result), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return githubRouteError(error);
  }
}
