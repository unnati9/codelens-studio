import { NextResponse } from "next/server";
import { getGitHubAuthConfig } from "@/lib/github/auth/config";
import { getGitHubSession } from "@/lib/github/auth/session";
import {
  githubBoardSyncRequestSchema,
  githubBoardSyncResponseSchema,
} from "@/lib/github/board-sync-schema";
import { syncConnectedGitHubBoard } from "@/lib/github/board-sync";
import { asGitHubImportError } from "@/lib/github/pull-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const config = getGitHubAuthConfig();
    if (request.headers.get("origin") !== config.appUrl.origin) {
      return errorResponse("INVALID_ORIGIN", "The sync request origin is invalid.", 403);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Request body must be valid JSON.", 400);
    }
    const parsedRequest = githubBoardSyncRequestSchema.safeParse(body);
    if (!parsedRequest.success) {
      return errorResponse("INVALID_REQUEST", "A valid board and pull request are required.", 400);
    }

    const session = await getGitHubSession();
    if (!session) {
      return errorResponse("GITHUB_AUTH_REQUIRED", "Connect GitHub to continue.", 401);
    }

    const result = await syncConnectedGitHubBoard({
      accessToken: session.accessToken,
      boardId: parsedRequest.data.boardId,
      selection: parsedRequest.data.selection,
    });
    return NextResponse.json(githubBoardSyncResponseSchema.parse(result), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const normalized = asGitHubImportError(error);
    return errorResponse(normalized.code, normalized.message, normalized.status);
  }
}
