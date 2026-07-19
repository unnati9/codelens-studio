import { z } from "zod";

export const githubAuthUserSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1).max(120),
  name: z.string().max(255).nullable(),
  avatarUrl: z.url(),
  htmlUrl: z.url(),
});

export const githubSessionSchema = z.object({
  version: z.literal(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).nullable(),
  accessTokenExpiresAt: z.string().datetime({ offset: true }).nullable(),
  refreshTokenExpiresAt: z.string().datetime({ offset: true }).nullable(),
  issuedAt: z.string().datetime({ offset: true }),
  user: githubAuthUserSchema,
});

export const githubOAuthTransactionSchema = z.object({
  version: z.literal(1),
  state: z.string().min(32).max(256),
  codeVerifier: z.string().min(43).max(128),
  createdAt: z.number().int().nonnegative(),
  returnTo: z.string().startsWith("/").max(2048).default("/"),
});

export const githubOAuthTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  scope: z.string().optional(),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
});

export const githubUserApiResponseSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  name: z.string().nullable(),
  avatar_url: z.url(),
  html_url: z.url(),
});

export const githubAuthStatusResponseSchema = z.object({
  connected: z.boolean(),
  installUrl: z.url(),
  user: githubAuthUserSchema.nullable(),
  accessTokenExpiresAt: z.string().datetime({ offset: true }).nullable(),
});

export type GitHubAuthUser = z.infer<typeof githubAuthUserSchema>;
export type GitHubSession = z.infer<typeof githubSessionSchema>;
export type GitHubOAuthTransaction = z.infer<typeof githubOAuthTransactionSchema>;
