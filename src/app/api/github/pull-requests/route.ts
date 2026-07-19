import { NextResponse } from "next/server";
import { getGitHubSession } from "@/lib/github/auth";
import { listOpenGitHubPullRequests } from "@/lib/github/connected-server";
import {
  githubPullRequestsApiResponseSchema,
  githubRepositoryLocatorSchema,
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
    const parsedRequest = githubRepositoryLocatorSchema.safeParse(await parseJsonRequest(request));
    if (!parsedRequest.success) {
      return githubInvalidRequestResponse(
        "A valid GitHub App installation and repository are required.",
      );
    }
    const result = await listOpenGitHubPullRequests(session.accessToken, parsedRequest.data);
    return NextResponse.json(githubPullRequestsApiResponseSchema.parse(result), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return githubRouteError(error);
  }
}
