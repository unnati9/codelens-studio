import { NextResponse } from "next/server";
import { asPreviewDeploymentError } from "@/lib/preview-deployments/error";

export function previewJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function previewRouteError(error: unknown) {
  const normalized = asPreviewDeploymentError(error);
  return previewJson(
    { error: { code: normalized.code, message: normalized.message } },
    normalized.status,
  );
}

export function validateSameOrigin(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}

export async function parsePreviewJsonRequest(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
