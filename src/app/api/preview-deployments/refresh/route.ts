import { previewRefreshRequestSchema } from "@/lib/preview-deployments/schema";
import { refreshPreviewDeployment } from "@/lib/preview-deployments/service";
import {
  parsePreviewJsonRequest,
  previewJson,
  previewRouteError,
  validateSameOrigin,
} from "@/lib/preview-deployments/route-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!validateSameOrigin(request)) {
      return previewJson(
        { error: { code: "INVALID_ORIGIN", message: "The refresh request origin is invalid." } },
        403,
      );
    }
    const parsed = previewRefreshRequestSchema.safeParse(await parsePreviewJsonRequest(request));
    if (!parsed.success) {
      return previewJson(
        { error: { code: "INVALID_REQUEST", message: "A valid board is required." } },
        400,
      );
    }
    return previewJson(await refreshPreviewDeployment(parsed.data.boardId));
  } catch (error) {
    return previewRouteError(error);
  }
}
