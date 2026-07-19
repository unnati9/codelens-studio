import { z } from "zod";

export const GITHUB_AUTH_CALLBACK_PATH = "/api/github/auth/callback";

const githubAppSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i);

export interface GitHubAuthConfig {
  appUrl: URL;
  callbackUrl: URL;
  clientId: string;
  clientSecret: string;
  appSlug: string;
  sessionSecret: string;
  secureCookies: boolean;
}

export class GitHubAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubAuthConfigurationError";
  }
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new GitHubAuthConfigurationError(`${name} is required.`);
  return value;
}

function configuredAppUrl(): URL {
  const value = requiredEnvironmentValue("APP_URL");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GitHubAuthConfigurationError("APP_URL must be an absolute URL.");
  }

  const localDevelopmentHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localDevelopmentHost)) {
    throw new GitHubAuthConfigurationError(
      "APP_URL must use HTTPS, except when running on localhost.",
    );
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new GitHubAuthConfigurationError(
      "APP_URL must contain only the application origin, without credentials, a path, query, or hash.",
    );
  }
  return url;
}

function configuredCallbackUrl(appUrl: URL): URL {
  const expectedUrl = new URL(GITHUB_AUTH_CALLBACK_PATH, appUrl);
  const configuredValue = process.env.GITHUB_APP_CALLBACK_URL?.trim();
  if (!configuredValue) return expectedUrl;

  let configuredUrl: URL;
  try {
    configuredUrl = new URL(configuredValue);
  } catch {
    throw new GitHubAuthConfigurationError("GITHUB_APP_CALLBACK_URL must be an absolute URL.");
  }

  if (configuredUrl.toString() !== expectedUrl.toString()) {
    throw new GitHubAuthConfigurationError(
      `GITHUB_APP_CALLBACK_URL must exactly match ${expectedUrl.toString()}.`,
    );
  }
  return expectedUrl;
}

export function getGitHubAuthConfig(): GitHubAuthConfig {
  const appUrl = configuredAppUrl();
  const appSlugResult = githubAppSlugSchema.safeParse(requiredEnvironmentValue("GITHUB_APP_SLUG"));
  if (!appSlugResult.success) {
    throw new GitHubAuthConfigurationError("GITHUB_APP_SLUG is invalid.");
  }

  const sessionSecret = requiredEnvironmentValue("GITHUB_SESSION_SECRET");
  if (Buffer.byteLength(sessionSecret, "utf8") < 32) {
    throw new GitHubAuthConfigurationError("GITHUB_SESSION_SECRET must be at least 32 bytes.");
  }

  return {
    appUrl,
    callbackUrl: configuredCallbackUrl(appUrl),
    clientId: requiredEnvironmentValue("GITHUB_APP_CLIENT_ID"),
    clientSecret: requiredEnvironmentValue("GITHUB_APP_CLIENT_SECRET"),
    appSlug: appSlugResult.data,
    sessionSecret,
    secureCookies: process.env.NODE_ENV === "production",
  };
}

export function githubAppInstallUrl(appSlug: string): string {
  const parsedSlug = githubAppSlugSchema.parse(appSlug);
  return `https://github.com/apps/${parsedSlug}/installations/new`;
}
