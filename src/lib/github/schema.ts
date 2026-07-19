import { z } from "zod";

export const githubFileStatusSchema = z.enum([
  "added",
  "removed",
  "modified",
  "renamed",
  "copied",
  "changed",
  "unchanged",
]);

export const githubPullRequestLocatorSchema = z.object({
  owner: z.string().min(1).max(39),
  repository: z.string().min(1).max(100),
  pullNumber: z.number().int().positive(),
  canonicalUrl: z.url(),
});

export const githubChangedFileSchema = z.object({
  filename: z.string().min(1).max(1024),
  previousFilename: z.string().min(1).max(1024).nullable(),
  status: githubFileStatusSchema,
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changes: z.number().int().nonnegative(),
  patch: z.string().nullable(),
  rawUrl: z.url().nullable(),
  blobUrl: z.url().nullable(),
});

export const githubPullRequestSchema = z.object({
  repositoryFullName: z.string().min(3).max(240),
  pullNumber: z.number().int().positive(),
  title: z.string().min(1).max(1024),
  description: z.string().nullable(),
  authorLogin: z.string().min(1).max(120),
  authorAvatarUrl: z.url(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  baseBranch: z.string().min(1).max(1024),
  headBranch: z.string().min(1).max(1024),
  headCommitSha: z.string().regex(/^[a-f0-9]{7,64}$/i),
  htmlUrl: z.url(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changedFileCount: z.number().int().nonnegative(),
  files: z.array(githubChangedFileSchema),
  truncated: z.boolean(),
  fileLimit: z.number().int().positive(),
  importLimit: z.number().int().positive(),
  unusuallyLarge: z.boolean(),
});

export const githubPullRequestRequestSchema = z
  .object({
    url: z.string().trim().min(1).max(2048),
  })
  .strict();

export const githubPullRequestApiResponseSchema = z.object({
  pullRequest: githubPullRequestSchema,
});

export const githubImportErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    retryAt: z.string().datetime({ offset: true }).nullable().optional(),
  }),
});

export type GitHubFileStatus = z.infer<typeof githubFileStatusSchema>;
export type GitHubPullRequestLocator = z.infer<typeof githubPullRequestLocatorSchema>;
export type GitHubChangedFile = z.infer<typeof githubChangedFileSchema>;
export type GitHubPullRequest = z.infer<typeof githubPullRequestSchema>;

const githubPullRequestApiSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  body: z.string().nullable(),
  user: z.object({
    login: z.string().min(1),
    avatar_url: z.url(),
  }),
  state: z.enum(["open", "closed"]),
  merged_at: z.string().datetime({ offset: true }).nullable(),
  base: z.object({
    ref: z.string().min(1),
    repo: z.object({
      full_name: z.string().min(3),
      private: z.boolean(),
    }),
  }),
  head: z.object({
    ref: z.string().min(1),
    sha: z.string().regex(/^[a-f0-9]{7,64}$/i),
  }),
  html_url: z.url(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changed_files: z.number().int().nonnegative(),
});

const githubChangedFileApiSchema = z.object({
  filename: z.string().min(1),
  previous_filename: z.string().min(1).optional(),
  status: githubFileStatusSchema,
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changes: z.number().int().nonnegative(),
  patch: z.string().optional(),
  raw_url: z.url().nullable().optional(),
  blob_url: z.url().nullable().optional(),
});

export const githubChangedFileApiArraySchema = z.array(githubChangedFileApiSchema);

export function normalizeGitHubPullRequest(input: {
  pullRequest: unknown;
  files: unknown[];
  fileLimit: number;
  importLimit: number;
}): GitHubPullRequest {
  const pullRequest = githubPullRequestApiSchema.parse(input.pullRequest);
  const files = githubChangedFileApiArraySchema.parse(input.files).map((file) =>
    githubChangedFileSchema.parse({
      filename: file.filename,
      previousFilename: file.previous_filename ?? null,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch ?? null,
      rawUrl: file.raw_url ?? null,
      blobUrl: file.blob_url ?? null,
    }),
  );

  return githubPullRequestSchema.parse({
    repositoryFullName: pullRequest.base.repo.full_name,
    pullNumber: pullRequest.number,
    title: pullRequest.title,
    description: pullRequest.body,
    authorLogin: pullRequest.user.login,
    authorAvatarUrl: pullRequest.user.avatar_url,
    state: pullRequest.merged_at ? "MERGED" : pullRequest.state === "open" ? "OPEN" : "CLOSED",
    baseBranch: pullRequest.base.ref,
    headBranch: pullRequest.head.ref,
    headCommitSha: pullRequest.head.sha,
    htmlUrl: pullRequest.html_url,
    additions: pullRequest.additions,
    deletions: pullRequest.deletions,
    changedFileCount: pullRequest.changed_files,
    files,
    truncated: pullRequest.changed_files > files.length,
    fileLimit: input.fileLimit,
    importLimit: input.importLimit,
    unusuallyLarge: pullRequest.changed_files > 100,
  });
}
