import {
  previewConfigurationQuerySchema,
  repositoryPreviewConfigInputSchema,
} from "@/lib/preview-deployments/schema";
import {
  getPreviewConfiguration,
  savePreviewConfiguration,
} from "@/lib/preview-deployments/service";
import {
  parsePreviewJsonRequest,
  previewJson,
  previewRouteError,
  validateSameOrigin,
} from "@/lib/preview-deployments/route-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const query = previewConfigurationQuerySchema.safeParse({
      boardId: requestUrl.searchParams.get("boardId"),
    });
    if (!query.success) {
      return previewJson(
        { error: { code: "INVALID_REQUEST", message: "A valid board is required." } },
        400,
      );
    }
    return previewJson(await getPreviewConfiguration(query.data.boardId));
  } catch (error) {
    return previewRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!validateSameOrigin(request)) {
      return previewJson(
        {
          error: {
            code: "INVALID_ORIGIN",
            message: "The configuration request origin is invalid.",
          },
        },
        403,
      );
    }
    const parsed = repositoryPreviewConfigInputSchema.safeParse(
      await parsePreviewJsonRequest(request),
    );
    if (!parsed.success) {
      return previewJson(
        { error: { code: "INVALID_REQUEST", message: "Valid preview configuration is required." } },
        400,
      );
    }
    return previewJson(await savePreviewConfiguration(parsed.data));
  } catch (error) {
    return previewRouteError(error);
  }
}
