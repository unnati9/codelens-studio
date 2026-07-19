import { z } from "zod";
import {
  githubConnectedPullRequestRequestSchema,
  githubRepositorySchema,
} from "@/lib/github/connected-schema";
import { githubPullRequestSchema } from "@/lib/github/schema";
import { boardNodeArraySchema, boardSchema } from "@/lib/validation/board";

export const githubBoardSyncRequestSchema = z
  .object({
    boardId: z.string().uuid(),
    selection: githubConnectedPullRequestRequestSchema.optional(),
  })
  .strict();

export const githubBoardSyncResponseSchema = z.object({
  board: boardSchema,
  repository: githubRepositorySchema,
  pullRequest: githubPullRequestSchema,
  headChanged: z.boolean(),
  staleNodes: boardNodeArraySchema,
});

export type GitHubBoardSyncRequest = z.infer<typeof githubBoardSyncRequestSchema>;
export type GitHubBoardSyncResponse = z.infer<typeof githubBoardSyncResponseSchema>;
