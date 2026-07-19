import type { GitHubChangedFile, GitHubPullRequest } from "@/lib/github/schema";
import { boardNodeArraySchema, type BoardNodeRecord } from "@/lib/validation/board";

export const IMPORTED_CODE_NODE_WIDTH = 680;
export const IMPORTED_CODE_NODE_HEIGHT = 500;
const NODE_GAP = 64;
const PATCH_CONTENT_LIMIT = 96_000;

const sourceExtensions = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "go",
  "h",
  "hpp",
  "html",
  "java",
  "js",
  "jsx",
  "json",
  "kt",
  "kts",
  "less",
  "mjs",
  "php",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "svelte",
  "swift",
  "ts",
  "tsx",
  "vue",
  "xml",
  "yaml",
  "yml",
]);

const binaryExtensions = new Set([
  "7z",
  "avi",
  "bmp",
  "class",
  "dll",
  "doc",
  "docx",
  "exe",
  "gif",
  "gz",
  "ico",
  "jar",
  "jpeg",
  "jpg",
  "mov",
  "mp3",
  "mp4",
  "pdf",
  "png",
  "tar",
  "tif",
  "tiff",
  "wasm",
  "webm",
  "webp",
  "woff",
  "woff2",
  "xls",
  "xlsx",
  "zip",
]);

const lockFiles = new Set([
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "composer.lock",
  "gemfile.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "uv.lock",
  "yarn.lock",
]);

function extension(filename: string) {
  const leaf = filename.split("/").at(-1) ?? filename;
  const index = leaf.lastIndexOf(".");
  return index >= 0 ? leaf.slice(index + 1).toLowerCase() : "";
}

export function detectCodeLanguage(
  filename: string,
): "typescript" | "javascript" | "css" | "html" | "json" | "text" {
  const fileExtension = extension(filename);
  if (fileExtension === "ts" || fileExtension === "tsx") return "typescript";
  if (["js", "jsx", "mjs", "cjs"].includes(fileExtension)) return "javascript";
  if (["css", "scss", "sass", "less"].includes(fileExtension)) return "css";
  if (["html", "htm", "vue", "svelte"].includes(fileExtension)) return "html";
  if (fileExtension === "json" || filename.endsWith(".jsonc")) return "json";
  return "text";
}

export function isDefaultGitHubFileSelected(file: GitHubChangedFile): boolean {
  const normalized = file.filename.toLowerCase();
  const leaf = normalized.split("/").at(-1) ?? normalized;
  const fileExtension = extension(normalized);
  const generated =
    /(^|\/)(dist|build|coverage|vendor|\.next|__generated__)(\/|$)/.test(normalized) ||
    /(?:\.generated\.|\.min\.(?:js|css)$|\.snap$)/.test(normalized);

  return (
    !lockFiles.has(leaf) &&
    !binaryExtensions.has(fileExtension) &&
    !generated &&
    sourceExtensions.has(fileExtension)
  );
}

export function createGitHubSourceKey(input: {
  boardId: string;
  repository: string;
  pullRequestNumber: number;
  headCommitSha: string;
  filename: string;
}) {
  return [
    "github-pr",
    input.boardId,
    input.repository.toLowerCase(),
    input.pullRequestNumber,
    input.headCommitSha.toLowerCase(),
    input.filename,
  ].join(":");
}

export function normalizeImportedDiffContent(
  file: GitHubChangedFile,
  pullRequestUrl: string,
): string {
  if (!file.patch) {
    return [
      `Diff preview unavailable for ${file.filename}.`,
      "",
      "GitHub may omit patches for binary or unusually large files.",
      `View on GitHub: ${file.blobUrl ?? pullRequestUrl}`,
    ].join("\n");
  }
  if (file.patch.length <= PATCH_CONTENT_LIMIT) return file.patch;
  return `${file.patch.slice(0, PATCH_CONTENT_LIMIT)}\n\n… Diff truncated by CodeLens Studio.`;
}

export type NodePlacement = { x: number; y: number };

export function createDeterministicNodePlacements(
  existingNodes: Pick<BoardNodeRecord, "position_x" | "position_y" | "width" | "height">[],
  count: number,
  columns = 2,
): NodePlacement[] {
  const safeColumns = Math.max(1, Math.floor(columns));
  const rightEdge = existingNodes.reduce(
    (maximum, node) => Math.max(maximum, node.position_x + node.width),
    0,
  );
  const topEdge = existingNodes.length
    ? Math.max(80, Math.min(...existingNodes.map((node) => node.position_y)))
    : 80;
  const startX = existingNodes.length ? rightEdge + NODE_GAP : 80;

  return Array.from({ length: count }, (_, index) => ({
    x: startX + (index % safeColumns) * (IMPORTED_CODE_NODE_WIDTH + NODE_GAP),
    y: topEdge + Math.floor(index / safeColumns) * (IMPORTED_CODE_NODE_HEIGHT + NODE_GAP),
  }));
}

export function findDuplicateGitHubFiles(
  files: GitHubChangedFile[],
  existingNodes: BoardNodeRecord[],
  sourceKeyForFile: (file: GitHubChangedFile) => string,
) {
  const existingKeys = new Set(
    existingNodes.flatMap((node) =>
      node.content.kind === "code" && node.content.source ? [node.content.source.sourceKey] : [],
    ),
  );
  return {
    importable: files.filter((file) => !existingKeys.has(sourceKeyForFile(file))),
    duplicates: files.filter((file) => existingKeys.has(sourceKeyForFile(file))),
  };
}

export function buildImportedCodeNodeRecords(input: {
  boardId: string;
  guestId: string;
  pullRequest: GitHubPullRequest;
  selectedFiles: GitHubChangedFile[];
  existingNodes: BoardNodeRecord[];
  importedAt?: string;
}): { records: BoardNodeRecord[]; skippedFiles: GitHubChangedFile[] } {
  if (input.selectedFiles.length > input.pullRequest.importLimit) {
    throw new Error(`Select no more than ${input.pullRequest.importLimit} files per import.`);
  }

  const importedAt = input.importedAt ?? new Date().toISOString();
  const sourceKeyForFile = (file: GitHubChangedFile) =>
    createGitHubSourceKey({
      boardId: input.boardId,
      repository: input.pullRequest.repositoryFullName,
      pullRequestNumber: input.pullRequest.pullNumber,
      headCommitSha: input.pullRequest.headCommitSha,
      filename: file.filename,
    });
  const { importable, duplicates } = findDuplicateGitHubFiles(
    input.selectedFiles,
    input.existingNodes,
    sourceKeyForFile,
  );
  const placements = createDeterministicNodePlacements(input.existingNodes, importable.length);
  const maxZIndex = input.existingNodes.reduce(
    (maximum, node) => Math.max(maximum, node.z_index),
    0,
  );

  const records = importable.map((file, index) => {
    const leaf = file.filename.split("/").at(-1) ?? file.filename;
    return {
      id: crypto.randomUUID(),
      board_id: input.boardId,
      type: "code" as const,
      title: leaf.slice(0, 160),
      position_x: placements[index].x,
      position_y: placements[index].y,
      width: IMPORTED_CODE_NODE_WIDTH,
      height: IMPORTED_CODE_NODE_HEIGHT,
      z_index: maxZIndex + index + 1,
      locked: false,
      content: {
        kind: "code" as const,
        filename: file.filename,
        language: detectCodeLanguage(file.filename),
        code: normalizeImportedDiffContent(file, input.pullRequest.htmlUrl),
        source: {
          sourceType: "GITHUB_PR" as const,
          sourceKey: sourceKeyForFile(file),
          repository: input.pullRequest.repositoryFullName,
          pullRequestNumber: input.pullRequest.pullNumber,
          headCommitSha: input.pullRequest.headCommitSha,
          filePath: file.filename,
          previousFilePath: file.previousFilename,
          fileStatus: file.status,
          additions: file.additions,
          deletions: file.deletions,
          blobUrl: file.blobUrl,
          rawUrl: file.rawUrl,
          pullRequestUrl: input.pullRequest.htmlUrl,
          patchAvailable: file.patch !== null,
          importedAt,
        },
      },
      created_by: input.guestId,
      created_at: importedAt,
      updated_at: importedAt,
    };
  });

  return { records: boardNodeArraySchema.parse(records), skippedFiles: duplicates };
}
