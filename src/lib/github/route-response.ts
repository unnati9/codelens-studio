import { NextResponse } from "next/server";
import { asGitHubImportError } from "@/lib/github/pull-request";
import { githubImportErrorResponseSchema } from "@/lib/github/schema";

export function githubRouteError(error: unknown) {
  const normalized = asGitHubImportError(error);
  return NextResponse.json(
    githubImportErrorResponseSchema.parse({
      error: {
        code: normalized.code,
        message: normalized.message,
        retryAt: normalized.retryAt,
      },
    }),
    { status: normalized.status, headers: { "Cache-Control": "no-store" } },
  );
}

export function githubUnauthorizedResponse() {
  return NextResponse.json(
    githubImportErrorResponseSchema.parse({
      error: {
        code: "GITHUB_AUTH_REQUIRED",
        message: "Connect GitHub to continue.",
      },
    }),
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export function githubInvalidRequestResponse(message: string) {
  return NextResponse.json(
    githubImportErrorResponseSchema.parse({
      error: { code: "INVALID_REQUEST", message },
    }),
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

export async function parseJsonRequest(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
