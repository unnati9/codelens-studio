import { NextResponse } from "next/server";
import { getGitHubSession } from "@/lib/github/auth";
import { listGitHubAccessibleRepositories } from "@/lib/github/connected-server";
import { githubRepositoriesApiResponseSchema } from "@/lib/github/connected-schema";
import { githubRouteError, githubUnauthorizedResponse } from "@/lib/github/route-response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getGitHubSession();
    if (!session) return githubUnauthorizedResponse();
    const result = await listGitHubAccessibleRepositories(session.accessToken);
    return NextResponse.json(githubRepositoriesApiResponseSchema.parse(result), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return githubRouteError(error);
  }
}
