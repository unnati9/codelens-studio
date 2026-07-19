import { z } from "zod";
import { githubPullRequestSchema } from "@/lib/github/schema";

const gitHubOwnerSchema = z
  .string()
  .trim()
  .min(1)
  .max(39)
  .regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i);
const gitHubRepositoryNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z\d._-]+$/i);
const gitHubShaSchema = z.string().regex(/^[a-f0-9]{7,64}$/i);

export const githubInstallationSchema = z.object({
  installationId: z.number().int().positive(),
  accountLogin: z.string().min(1).max(120),
  accountAvatarUrl: z.url(),
  accountUrl: z.url().nullable(),
  repositorySelection: z.enum(["ALL", "SELECTED"]),
  appSlug: z.string().min(1).max(120).nullable(),
});

export const githubRepositorySchema = z.object({
  installationId: z.number().int().positive(),
  repositoryId: z.number().int().positive(),
  owner: z.string().min(1).max(120),
  name: z.string().min(1).max(100),
  fullName: z.string().min(3).max(240),
  isPrivate: z.boolean(),
  isArchived: z.boolean(),
  defaultBranch: z.string().min(1).max(1024),
  htmlUrl: z.url(),
  ownerAvatarUrl: z.url(),
});

export const githubPullRequestSummarySchema = z.object({
  pullNumber: z.number().int().positive(),
  title: z.string().min(1).max(1024),
  description: z.string().nullable(),
  authorLogin: z.string().min(1).max(120),
  authorAvatarUrl: z.url(),
  state: z.literal("OPEN"),
  isDraft: z.boolean(),
  baseBranch: z.string().min(1).max(1024),
  baseCommitSha: gitHubShaSchema,
  headBranch: z.string().min(1).max(1024),
  headCommitSha: gitHubShaSchema,
  htmlUrl: z.url(),
  updatedAt: z.string().datetime({ offset: true }),
});

export const githubRepositoryLocatorSchema = z
  .object({
    installationId: z.number().int().positive(),
    repositoryId: z.number().int().positive(),
    owner: gitHubOwnerSchema,
    repository: gitHubRepositoryNameSchema,
  })
  .strict();

export const githubConnectedPullRequestRequestSchema = githubRepositoryLocatorSchema
  .extend({ pullNumber: z.number().int().positive() })
  .strict();

export const githubRepositoriesApiResponseSchema = z.object({
  installations: z.array(githubInstallationSchema),
  repositories: z.array(githubRepositorySchema),
});

export const githubPullRequestsApiResponseSchema = z.object({
  repository: githubRepositorySchema,
  pullRequests: z.array(githubPullRequestSummarySchema),
});

export const githubConnectedPullRequestApiResponseSchema = z.object({
  repository: githubRepositorySchema,
  pullRequest: githubPullRequestSchema,
});

export const githubInstallationApiResponseSchema = z.object({
  installations: z.array(
    z.object({
      id: z.number().int().positive(),
      account: z.object({
        login: z.string().min(1),
        avatar_url: z.url(),
        html_url: z.url().nullable().optional(),
      }),
      repository_selection: z.enum(["all", "selected"]),
      html_url: z.url(),
      app_slug: z.string().min(1).nullable().optional(),
    }),
  ),
});

export const githubInstallationRepositoriesApiResponseSchema = z.object({
  repositories: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string().min(1),
      full_name: z.string().min(3),
      private: z.boolean(),
      archived: z.boolean(),
      default_branch: z.string().min(1),
      html_url: z.url(),
      owner: z.object({
        login: z.string().min(1),
        avatar_url: z.url(),
      }),
    }),
  ),
});

export const githubOpenPullRequestsApiResponseSchema = z.array(
  z.object({
    number: z.number().int().positive(),
    title: z.string().min(1),
    body: z.string().nullable(),
    user: z.object({
      login: z.string().min(1),
      avatar_url: z.url(),
    }),
    state: z.literal("open"),
    draft: z.boolean(),
    base: z.object({
      ref: z.string().min(1),
      sha: gitHubShaSchema,
    }),
    head: z.object({
      ref: z.string().min(1),
      sha: gitHubShaSchema,
    }),
    html_url: z.url(),
    updated_at: z.string().datetime({ offset: true }),
  }),
);

export function normalizeGitHubInstallations(input: unknown) {
  return githubInstallationApiResponseSchema.parse(input).installations.map((installation) =>
    githubInstallationSchema.parse({
      installationId: installation.id,
      accountLogin: installation.account.login,
      accountAvatarUrl: installation.account.avatar_url,
      accountUrl: installation.account.html_url ?? null,
      repositorySelection: installation.repository_selection.toUpperCase(),
      appSlug: installation.app_slug ?? null,
    }),
  );
}

export function normalizeGitHubRepositories(input: unknown, installationId: number) {
  return githubInstallationRepositoriesApiResponseSchema
    .parse(input)
    .repositories.map((repository) =>
      githubRepositorySchema.parse({
        installationId,
        repositoryId: repository.id,
        owner: repository.owner.login,
        name: repository.name,
        fullName: repository.full_name,
        isPrivate: repository.private,
        isArchived: repository.archived,
        defaultBranch: repository.default_branch,
        htmlUrl: repository.html_url,
        ownerAvatarUrl: repository.owner.avatar_url,
      }),
    );
}

export function normalizeGitHubPullRequestSummaries(input: unknown) {
  return githubOpenPullRequestsApiResponseSchema.parse(input).map((pullRequest) =>
    githubPullRequestSummarySchema.parse({
      pullNumber: pullRequest.number,
      title: pullRequest.title,
      description: pullRequest.body,
      authorLogin: pullRequest.user.login,
      authorAvatarUrl: pullRequest.user.avatar_url,
      state: "OPEN",
      isDraft: pullRequest.draft,
      baseBranch: pullRequest.base.ref,
      baseCommitSha: pullRequest.base.sha,
      headBranch: pullRequest.head.ref,
      headCommitSha: pullRequest.head.sha,
      htmlUrl: pullRequest.html_url,
      updatedAt: pullRequest.updated_at,
    }),
  );
}

export type GitHubInstallation = z.infer<typeof githubInstallationSchema>;
export type GitHubRepository = z.infer<typeof githubRepositorySchema>;
export type GitHubPullRequestSummary = z.infer<typeof githubPullRequestSummarySchema>;
export type GitHubRepositoryLocator = z.infer<typeof githubRepositoryLocatorSchema>;
export type GitHubConnectedPullRequestRequest = z.infer<
  typeof githubConnectedPullRequestRequestSchema
>;
