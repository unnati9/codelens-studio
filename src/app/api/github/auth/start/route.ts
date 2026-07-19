import { NextResponse } from "next/server";
import { getGitHubAuthConfig } from "@/lib/github/auth/config";
import { setOAuthCookie } from "@/lib/github/auth/cookies";
import {
  createCodeChallenge,
  createOAuthTransaction,
  signOAuthTransaction,
} from "@/lib/github/auth/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function validatedReturnPath(requestUrl: URL, appUrl: URL): string {
  const requested = requestUrl.searchParams.get("returnTo");
  if (!requested || !requested.startsWith("/") || requested.startsWith("//")) return "/";
  try {
    const resolved = new URL(requested, appUrl);
    if (resolved.origin !== appUrl.origin) return "/";
    return `${resolved.pathname}${resolved.search}`;
  } catch {
    return "/";
  }
}

export async function GET(request: Request) {
  try {
    const config = getGitHubAuthConfig();
    const transaction = createOAuthTransaction(
      Date.now(),
      validatedReturnPath(new URL(request.url), config.appUrl),
    );
    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callbackUrl.toString(),
      state: transaction.state,
      code_challenge: createCodeChallenge(transaction.codeVerifier),
      code_challenge_method: "S256",
    }).toString();

    const response = NextResponse.redirect(authorizeUrl);
    setOAuthCookie(response, signOAuthTransaction(transaction, config.sessionSecret), config);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub authorization is unavailable.";
    return NextResponse.json(
      { error: { code: "AUTH_CONFIGURATION_ERROR", message } },
      { status: 503 },
    );
  }
}
