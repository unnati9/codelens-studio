import { NextResponse } from "next/server";
import { getGitHubAuthConfig } from "@/lib/github/auth/config";
import {
  clearOAuthCookie,
  GITHUB_OAUTH_COOKIE,
  readCookieHeader,
  setSessionCookie,
} from "@/lib/github/auth/cookies";
import { encryptGitHubSession, verifyOAuthTransaction } from "@/lib/github/auth/crypto";
import { exchangeGitHubAuthorizationCode, GitHubAuthError } from "@/lib/github/auth/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(
  code: string,
  message: string,
  status: number,
  config: ReturnType<typeof getGitHubAuthConfig>,
) {
  const response = NextResponse.json({ error: { code, message } }, { status });
  clearOAuthCookie(response, config);
  return response;
}

export async function GET(request: Request) {
  let config: ReturnType<typeof getGitHubAuthConfig>;
  try {
    config = getGitHubAuthConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub authorization is unavailable.";
    return NextResponse.json(
      { error: { code: "AUTH_CONFIGURATION_ERROR", message } },
      { status: 503 },
    );
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.has("error")) {
    return errorResponse(
      "AUTHORIZATION_DENIED",
      "GitHub authorization was cancelled or denied.",
      400,
      config,
    );
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  if (!code || !state) {
    return errorResponse(
      "INVALID_CALLBACK",
      "The GitHub callback is missing required parameters.",
      400,
      config,
    );
  }

  const transaction = verifyOAuthTransaction(
    readCookieHeader(request.headers.get("cookie"), GITHUB_OAUTH_COOKIE),
    state,
    config.sessionSecret,
  );
  if (!transaction) {
    return errorResponse(
      "INVALID_OAUTH_STATE",
      "The GitHub authorization state is invalid or expired.",
      400,
      config,
    );
  }

  try {
    const session = await exchangeGitHubAuthorizationCode({
      code,
      codeVerifier: transaction.codeVerifier,
      config,
    });
    const responseUrl = new URL(transaction.returnTo, config.appUrl);
    responseUrl.searchParams.set("github", "connected");
    const response = NextResponse.redirect(responseUrl);
    clearOAuthCookie(response, config);
    setSessionCookie(
      response,
      encryptGitHubSession(session, config.sessionSecret),
      session,
      config,
    );
    return response;
  } catch (error) {
    const authError =
      error instanceof GitHubAuthError
        ? error
        : new GitHubAuthError("AUTHORIZATION_FAILED", "GitHub authorization failed.");
    return errorResponse(authError.code, authError.message, authError.status, config);
  }
}
