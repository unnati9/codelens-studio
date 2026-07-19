import type { NextResponse } from "next/server";
import type { GitHubAuthConfig } from "@/lib/github/auth/config";
import type { GitHubSession } from "@/lib/github/auth/schema";

export const GITHUB_SESSION_COOKIE = "codelens_github_session";
export const GITHUB_OAUTH_COOKIE = "codelens_github_oauth";
export const GITHUB_OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

export function readCookieHeader(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator === -1) continue;
    if (entry.slice(0, separator).trim() === name) {
      return entry.slice(separator + 1).trim();
    }
  }
  return undefined;
}

export function githubCookieSecurity(config: GitHubAuthConfig) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.secureCookies,
    path: "/",
  };
}

function sessionCookieMaxAge(session: GitHubSession, now = Date.now()): number {
  const expiresAt = session.refreshTokenExpiresAt ?? session.accessTokenExpiresAt;
  if (!expiresAt) return 30 * 24 * 60 * 60;
  return Math.max(60, Math.floor((Date.parse(expiresAt) - now) / 1000));
}

export function githubSessionCookieOptions(
  session: GitHubSession,
  config: GitHubAuthConfig,
  now = Date.now(),
) {
  return {
    ...githubCookieSecurity(config),
    maxAge: sessionCookieMaxAge(session, now),
  };
}

export function setOAuthCookie(
  response: NextResponse,
  value: string,
  config: GitHubAuthConfig,
): void {
  response.cookies.set(GITHUB_OAUTH_COOKIE, value, {
    ...githubCookieSecurity(config),
    maxAge: GITHUB_OAUTH_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearOAuthCookie(response: NextResponse, config: GitHubAuthConfig): void {
  response.cookies.set(GITHUB_OAUTH_COOKIE, "", {
    ...githubCookieSecurity(config),
    expires: new Date(0),
    maxAge: 0,
  });
}

export function setSessionCookie(
  response: NextResponse,
  value: string,
  session: GitHubSession,
  config: GitHubAuthConfig,
): void {
  response.cookies.set(GITHUB_SESSION_COOKIE, value, githubSessionCookieOptions(session, config));
}

export function clearSessionCookie(response: NextResponse, config: GitHubAuthConfig): void {
  response.cookies.set(GITHUB_SESSION_COOKIE, "", {
    ...githubCookieSecurity(config),
    expires: new Date(0),
    maxAge: 0,
  });
}
