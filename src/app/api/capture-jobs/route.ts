import {
  captureJson,
  captureRouteError,
  parseCaptureJson,
  validateCaptureOrigin,
} from "@/lib/capture/route-response";
import { createCaptureJobs, listCaptureJobs, updateCaptureJob } from "@/lib/capture/service";

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
    return captureJson(await listCaptureJobs(boardId));
  } catch (error) {
    return captureRouteError(error);
  }
}

async function mutate(request: Request, operation: (input: unknown) => Promise<unknown>) {
  try {
    if (!validateCaptureOrigin(request)) {
      return captureJson(
        { error: { code: "INVALID_ORIGIN", message: "The capture request origin is invalid." } },
        403,
      );
    }
    return captureJson(await operation(await parseCaptureJson(request)));
  } catch (error) {
    return captureRouteError(error);
  }
}

export async function POST(request: Request) {
  return mutate(request, createCaptureJobs);
}

export async function PATCH(request: Request) {
  return mutate(request, updateCaptureJob);
}
