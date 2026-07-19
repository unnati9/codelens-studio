import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { CaptureJobError } from "@/lib/capture/service";

export function captureJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function validateCaptureOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}

export async function parseCaptureJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function captureRouteError(error: unknown) {
  if (error instanceof CaptureJobError) {
    return captureJson({ error: { code: error.code, message: error.message } }, error.status);
  }
  if (error instanceof ZodError) {
    return captureJson(
      {
        error: { code: "INVALID_REQUEST", message: error.issues[0]?.message ?? "Invalid request." },
      },
      400,
    );
  }
  return captureJson(
    {
      error: {
        code: "CAPTURE_SERVICE_ERROR",
        message: error instanceof Error ? error.message : "The capture service failed.",
      },
    },
    500,
  );
}
