import { z } from "zod";
import { isSupportedAnalysisFile } from "@/lib/affected-routes/classification";
import type { AffectedRouteAnalysisLimits } from "@/lib/affected-routes/analyzer";
import {
  repositorySourceSnapshotSchema,
  type RepositorySourceFile,
  type RepositorySourceSnapshot,
} from "@/lib/affected-routes/schema";
import { githubApiBaseUrl, githubJson } from "@/lib/github/api-client";

const githubTreeSchema = z.object({
  tree: z.array(
    z.object({
      path: z.string().min(1).max(1024),
      type: z.enum(["blob", "tree", "commit"]),
      sha: z.string().regex(/^[a-f0-9]{40}$/i),
      size: z.number().int().nonnegative().optional(),
    }),
  ),
  truncated: z.boolean(),
});

const githubBlobSchema = z.object({
  content: z.string(),
  encoding: z.literal("base64"),
  size: z.number().int().nonnegative(),
});

type GitHubTreeEntry = z.infer<typeof githubTreeSchema>["tree"][number];
type GitHubTreeBlob = GitHubTreeEntry & { type: "blob" };

function pathPriority(path: string, changedFiles: Set<string>) {
  if (/(?:^|\/)(?:tsconfig|jsconfig)(?:\.[^/]+)?\.json$/i.test(path)) return 0;
  if (changedFiles.has(path)) return 1;
  if (
    /(?:^|\/)(?:src\/)?(?:app\/(?:.*\/)?(?:page|layout)|pages\/[^/]+)\.[cm]?[jt]sx?$/i.test(path)
  ) {
    return 2;
  }
  if (/(?:global|globals)\.(?:css|scss|sass|less)$/i.test(path)) return 3;
  return 4;
}

function remainingTime(deadline: number) {
  return Math.max(0, deadline - Date.now());
}

export async function fetchGitHubRepositorySnapshot(input: {
  owner: string;
  repository: string;
  headSha: string;
  changedFiles: string[];
  limits: AffectedRouteAnalysisLimits;
  accessToken: string;
}): Promise<RepositorySourceSnapshot> {
  const deadline = Date.now() + input.limits.timeoutMs;
  const repositoryName = `${input.owner}/${input.repository}`;
  const basePath = `${githubApiBaseUrl}/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}`;
  const tree = githubTreeSchema.parse(
    await githubJson(`${basePath}/git/trees/${encodeURIComponent(input.headSha)}?recursive=1`, {
      accessToken: input.accessToken,
      timeoutMs: remainingTime(deadline),
      notFoundCode: "REPOSITORY_SOURCE_NOT_FOUND",
      notFoundMessage: "The repository source tree is unavailable for this commit.",
    }),
  );
  const blobs = tree.tree.filter((entry): entry is GitHubTreeBlob => entry.type === "blob");
  const changedFiles = new Set(input.changedFiles);
  const supported = blobs.filter((entry) => isSupportedAnalysisFile(entry.path));
  const oversized = supported.filter(
    (entry) => entry.size !== undefined && entry.size > input.limits.maxFileSizeBytes,
  );
  const eligible = supported.filter(
    (entry) => entry.size === undefined || entry.size <= input.limits.maxFileSizeBytes,
  );
  const candidates = eligible
    .sort(
      (left, right) =>
        pathPriority(left.path, changedFiles) - pathPriority(right.path, changedFiles) ||
        left.path.localeCompare(right.path),
    )
    .slice(0, input.limits.maxFiles);
  const files = new Map<string, RepositorySourceFile>();
  const warnings: string[] = [];
  let cursor = 0;
  let timedOut = false;

  async function worker() {
    while (cursor < candidates.length) {
      if (remainingTime(deadline) < 250) {
        timedOut = true;
        return;
      }
      const candidate = candidates[cursor];
      cursor += 1;
      let blob: z.infer<typeof githubBlobSchema>;
      try {
        blob = githubBlobSchema.parse(
          await githubJson(`${basePath}/git/blobs/${candidate.sha}`, {
            accessToken: input.accessToken,
            timeoutMs: remainingTime(deadline),
            notFoundCode: "REPOSITORY_SOURCE_NOT_FOUND",
            notFoundMessage: `The source for ${candidate.path} is unavailable.`,
          }),
        );
      } catch (error) {
        if (remainingTime(deadline) < 500) {
          timedOut = true;
          return;
        }
        throw error;
      }
      if (blob.size > input.limits.maxFileSizeBytes) continue;
      const content = Buffer.from(blob.content.replaceAll("\n", ""), "base64").toString("utf8");
      if (content.includes("\0")) continue;
      files.set(candidate.path, {
        path: candidate.path,
        content,
        sizeBytes: Buffer.byteLength(content),
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(8, candidates.length) }, () => worker()));
  if (tree.truncated) warnings.push("GitHub returned a truncated recursive repository tree.");
  if (eligible.length > input.limits.maxFiles) {
    warnings.push(`Repository source loading reached the ${input.limits.maxFiles}-file limit.`);
  }
  if (oversized.length > 0) {
    warnings.push(
      `${oversized.length} source file${oversized.length === 1 ? "" : "s"} exceeded the ${input.limits.maxFileSizeBytes}-byte file-size limit.`,
    );
  }
  if (timedOut) warnings.push("Repository source loading reached the execution-time limit.");

  return repositorySourceSnapshotSchema.parse({
    repository: repositoryName,
    headSha: input.headSha,
    files: candidates.flatMap((candidate) => {
      const file = files.get(candidate.path);
      return file ? [file] : [];
    }),
    repositoryFilesSeen: blobs.length,
    filesSkipped: Math.max(0, blobs.length - files.size),
    treeTruncated: tree.truncated,
    timedOut,
    warnings,
  });
}
