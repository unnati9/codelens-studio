import { z } from "zod";
import { boardSchema } from "@/lib/validation/board";

const shaSchema = z.string().regex(/^[a-f0-9]{7,64}$/i);

export const githubBoardSourceInputSchema = z.object({
  owner: z.string().min(1).max(120),
  repository: z.string().min(1).max(240),
  pullRequestNumber: z.number().int().positive(),
  pullRequestUrl: z.url(),
  headCommitSha: shaSchema,
  lastImportedAt: z.string().datetime({ offset: true }),
  baseBranch: z.string().min(1).max(1024).optional(),
  headBranch: z.string().min(1).max(1024).optional(),
  baseCommitSha: shaSchema.optional(),
  authorLogin: z.string().min(1).max(120).optional(),
  pullRequestTitle: z.string().min(1).max(1024).optional(),
  pullRequestDescription: z.string().nullable().optional(),
  changedFileCount: z.number().int().nonnegative().optional(),
  lastSyncedAt: z.string().datetime({ offset: true }).optional(),
});

export const githubBoardSourceRequestSchema = z
  .object({
    boardId: z.string().uuid(),
    source: githubBoardSourceInputSchema,
  })
  .strict();

export const githubBoardSourceResponseSchema = z.object({ board: boardSchema });

export type GitHubBoardSourceInput = z.infer<typeof githubBoardSourceInputSchema>;
