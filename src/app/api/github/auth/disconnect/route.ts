import { NextResponse } from "next/server";
import { getGitHubAuthConfig } from "@/lib/github/auth/config";
import { clearOAuthCookie, clearSessionCookie } from "@/lib/github/auth/cookies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const config = getGitHubAuthConfig();
    const response = NextResponse.json({ disconnected: true });
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
