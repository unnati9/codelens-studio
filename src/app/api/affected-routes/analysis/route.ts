import { NextResponse } from "next/server";
import { analyzeBoardAffectedRoutes } from "@/lib/affected-routes/service";
import { affectedRouteAnalysisRequestSchema } from "@/lib/affected-routes/schema";
import {
  githubInvalidRequestResponse,
  githubRouteError,
  parseJsonRequest,
  validateSameOrigin,
} from "@/lib/github/route-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!validateSameOrigin(request)) {
      return NextResponse.json(
        { error: { code: "INVALID_ORIGIN", message: "The analysis request origin is invalid." } },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    const parsed = affectedRouteAnalysisRequestSchema.safeParse(await parseJsonRequest(request));
    if (!parsed.success) return githubInvalidRequestResponse("A valid board is required.");
    return NextResponse.json(
      await analyzeBoardAffectedRoutes(parsed.data.boardId, parsed.data.force),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return githubRouteError(error);
  }
}
