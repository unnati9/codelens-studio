import { getPreviewDeploymentProvider } from "@/lib/preview-deployments/providers";
import { previewConnectionRequestSchema } from "@/lib/preview-deployments/schema";
import { validatePreviewDeploymentUrl } from "@/lib/preview-deployments/safe-url";
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
        { error: { code: "INVALID_ORIGIN", message: "The connection test origin is invalid." } },
        403,
      );
    }
    const parsed = previewConnectionRequestSchema.safeParse(await parsePreviewJsonRequest(request));
    if (!parsed.success) {
      return previewJson(
        { error: { code: "INVALID_REQUEST", message: "Valid Vercel settings are required." } },
        400,
      );
    }
    const provider = getPreviewDeploymentProvider("VERCEL");
    return previewJson(
      await provider.testConnection({
        projectId: parsed.data.vercelProjectId,
        teamId: parsed.data.vercelTeamId || null,
        productionUrl: validatePreviewDeploymentUrl(parsed.data.productionUrl),
      }),
    );
  } catch (error) {
    return previewRouteError(error);
  }
}
