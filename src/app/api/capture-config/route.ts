import {
  captureJson,
  captureRouteError,
  parseCaptureJson,
  validateCaptureOrigin,
} from "@/lib/capture/route-response";
import { getCaptureConfig, saveCaptureConfig } from "@/lib/capture/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const boardId = new URL(request.url).searchParams.get("boardId");
    if (!boardId)
      return captureJson(
        { error: { code: "INVALID_REQUEST", message: "A board is required." } },
        400,
      );
    return captureJson(await getCaptureConfig(boardId));
  } catch (error) {
    return captureRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!validateCaptureOrigin(request)) {
      return captureJson(
        {
          error: {
            code: "INVALID_ORIGIN",
            message: "The capture configuration origin is invalid.",
          },
        },
        403,
      );
    }
    return captureJson(await saveCaptureConfig(await parseCaptureJson(request)));
  } catch (error) {
    return captureRouteError(error);
  }
}
