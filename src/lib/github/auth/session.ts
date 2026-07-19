import { cookies } from "next/headers";
import { getGitHubAuthConfig } from "@/lib/github/auth/config";
import { githubSessionCookieOptions, GITHUB_SESSION_COOKIE } from "@/lib/github/auth/cookies";
import { decryptGitHubSession, encryptGitHubSession } from "@/lib/github/auth/crypto";
import { refreshGitHubSession } from "@/lib/github/auth/oauth";
import type { GitHubSession } from "@/lib/github/auth/schema";

const refreshLeewayMs = 60_000;

function expired(isoDate: string | null, now: number): boolean {
  return isoDate !== null && Date.parse(isoDate) <= now;
}

export async function getGitHubSession(): Promise<GitHubSession | null> {
  const config = getGitHubAuthConfig();
  const cookieStore = await cookies();
  const session = decryptGitHubSession(
    cookieStore.get(GITHUB_SESSION_COOKIE)?.value,
    config.sessionSecret,
  );
  if (!session) return null;

  const now = Date.now();
  if (
    !session.accessTokenExpiresAt ||
    Date.parse(session.accessTokenExpiresAt) > now + refreshLeewayMs
  ) {
    return session;
  }
  if (
    !session.refreshToken ||
    (session.refreshTokenExpiresAt && expired(session.refreshTokenExpiresAt, now))
  ) {
    return expired(session.accessTokenExpiresAt, now) ? null : session;
  }

  const refreshedSession = await refreshGitHubSession(session, config, now);
  cookieStore.set(
    GITHUB_SESSION_COOKIE,
    encryptGitHubSession(refreshedSession, config.sessionSecret),
    githubSessionCookieOptions(refreshedSession, config, now),
  );
  return refreshedSession;
}

export type { GitHubSession } from "@/lib/github/auth/schema";
