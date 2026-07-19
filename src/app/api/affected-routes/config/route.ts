import { NextResponse } from "next/server";
import { getRepositoryRouteConfig, saveRepositoryRouteConfig } from "@/lib/affected-routes/service";
import {
  affectedRouteConfigQuerySchema,
  repositoryRouteConfigInputSchema,
} from "@/lib/affected-routes/schema";
import {
  githubInvalidRequestResponse,
  githubRouteError,
  parseJsonRequest,
  validateSameOrigin,
} from "@/lib/github/route-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = affectedRouteConfigQuerySchema.safeParse({
      boardId: url.searchParams.get("boardId"),
    });
    if (!parsed.success) return githubInvalidRequestResponse("A valid board is required.");
    return NextResponse.json(await getRepositoryRouteConfig(parsed.data.boardId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return githubRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!validateSameOrigin(request)) {
      return NextResponse.json(
        { error: { code: "INVALID_ORIGIN", message: "The configuration origin is invalid." } },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    const parsed = repositoryRouteConfigInputSchema.safeParse(await parseJsonRequest(request));
    if (!parsed.success) {
      return githubInvalidRequestResponse("Valid repository route configuration is required.");
    }
    return NextResponse.json(await saveRepositoryRouteConfig(parsed.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return githubRouteError(error);
  }
}
