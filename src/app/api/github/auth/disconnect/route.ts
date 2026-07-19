import { NextResponse } from "next/server";
import { getGitHubAuthConfig } from "@/lib/github/auth/config";
import { clearOAuthCookie, clearSessionCookie } from "@/lib/github/auth/cookies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      return NextResponse.json(
        { error: { code: "INVALID_ORIGIN", message: "The disconnect request origin is invalid." } },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    const config = getGitHubAuthConfig();
    const response = NextResponse.json(
      { disconnected: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    clearOAuthCookie(response, config);
    clearSessionCookie(response, config);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub authorization is unavailable.";
    return NextResponse.json(
      { error: { code: "AUTH_CONFIGURATION_ERROR", message } },
      { status: 503 },
    );
  }
}
