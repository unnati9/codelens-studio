import { z } from "zod";
import {
  githubBoardSyncResponseSchema,
  type GitHubBoardSyncRequest,
  type GitHubBoardSyncResponse,
} from "@/lib/github/board-sync-schema";

const errorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export async function syncGitHubBoard(
  request: GitHubBoardSyncRequest,
): Promise<GitHubBoardSyncResponse> {
  const response = await fetch("/api/github/boards/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorSchema.safeParse(body);
    throw new Error(
      parsed.success ? parsed.data.error.message : "Could not sync the pull request.",
    );
  }
  return githubBoardSyncResponseSchema.parse(body);
}
