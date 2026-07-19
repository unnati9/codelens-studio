import { NextResponse } from "next/server";
import { getGitHubAuthConfig, githubAppInstallUrl } from "@/lib/github/auth/config";
import { githubAuthStatusResponseSchema } from "@/lib/github/auth/schema";
import { getGitHubSession } from "@/lib/github/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const config = getGitHubAuthConfig();
    const session = await getGitHubSession();
    return NextResponse.json(
      githubAuthStatusResponseSchema.parse({
        connected: session !== null,
        installUrl: githubAppInstallUrl(config.appSlug),
        user: session?.user ?? null,
        accessTokenExpiresAt: session?.accessTokenExpiresAt ?? null,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub authorization is unavailable.";
    return NextResponse.json(
      { error: { code: "AUTH_SESSION_ERROR", message } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
