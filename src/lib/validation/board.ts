import { z } from "zod";
import { githubFileStatusSchema } from "@/lib/github/schema";

export const boardStatusSchema = z.enum(["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED"]);

export const boardSourceTypeSchema = z.literal("GITHUB_PR");

export const boardSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    description: z.string().nullable(),
    status: boardStatusSchema,
    source_type: boardSourceTypeSchema.nullable().default(null),
    github_owner: z.string().min(1).max(120).nullable().default(null),
    github_repository: z.string().min(1).max(240).nullable().default(null),
    github_pull_request_number: z.number().int().positive().nullable().default(null),
    github_pull_request_url: z.url().nullable().default(null),
    github_head_sha: z
      .string()
      .regex(/^[a-f0-9]{7,64}$/i)
      .nullable()
      .default(null),
    github_base_branch: z.string().min(1).max(1024).nullable().default(null),
    github_head_branch: z.string().min(1).max(1024).nullable().default(null),
    github_base_sha: z
      .string()
      .regex(/^[a-f0-9]{7,64}$/i)
      .nullable()
      .default(null),
    github_author_login: z.string().min(1).max(120).nullable().default(null),
    github_pull_request_title: z.string().min(1).max(1024).nullable().default(null),
    github_pull_request_description: z.string().nullable().default(null),
    github_changed_file_count: z.number().int().nonnegative().nullable().default(null),
    github_last_synced_at: z.string().datetime({ offset: true }).nullable().default(null),
    last_imported_at: z.string().datetime({ offset: true }).nullable().default(null),
    created_by: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .superRefine((board, context) => {
    if (
      board.source_type === "GITHUB_PR" &&
      (!board.github_owner ||
        !board.github_repository ||
        !board.github_pull_request_number ||
        !board.github_pull_request_url ||
        !board.github_head_sha)
    ) {
      context.addIssue({
        code: "custom",
        message: "GitHub boards require complete pull-request source metadata.",
        path: ["source_type"],
      });
    }
  });

export const githubCodeSourceSchema = z.object({
  sourceType: z.literal("GITHUB_PR"),
  sourceKey: z.string().min(1).max(2048),
  repository: z.string().min(3).max(240),
  pullRequestNumber: z.number().int().positive(),
  headCommitSha: z.string().regex(/^[a-f0-9]{7,64}$/i),
  filePath: z.string().min(1).max(1024),
  previousFilePath: z.string().min(1).max(1024).nullable(),
  fileStatus: githubFileStatusSchema,
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  blobUrl: z.url().nullable(),
  rawUrl: z.url().nullable(),
  pullRequestUrl: z.url(),
  patchAvailable: z.boolean(),
  importedAt: z.string().datetime({ offset: true }),
  isStale: z.boolean().default(false),
  staleAt: z.string().datetime({ offset: true }).nullable().default(null),
  latestHeadCommitSha: z
    .string()
    .regex(/^[a-f0-9]{7,64}$/i)
    .nullable()
    .default(null),
});

export const codeNodeContentSchema = z.object({
  kind: z.literal("code"),
  filename: z.string().trim().max(1024),
  language: z.enum(["typescript", "javascript", "css", "html", "json", "text"]),
  code: z.string().max(100_000),
  source: githubCodeSourceSchema.optional(),
});

export const imageNodeContentSchema = z.object({
  kind: z.literal("image"),
  storagePath: z.string().min(1).nullable(),
  fileName: z.string().min(1).nullable(),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]).nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  naturalWidth: z.number().positive().nullable(),
  naturalHeight: z.number().positive().nullable(),
});

export const boardNodeContentSchema = z.discriminatedUnion("kind", [
  codeNodeContentSchema,
  imageNodeContentSchema,
]);

export const boardNodeSchema = z
  .object({
    id: z.string().uuid(),
    board_id: z.string().uuid(),
    type: z.enum(["code", "image"]),
    title: z.string().max(160).nullable(),
    position_x: z.coerce.number().finite(),
    position_y: z.coerce.number().finite(),
    width: z.coerce.number().min(240),
    height: z.coerce.number().min(180),
    z_index: z.number().int(),
    locked: z.boolean(),
    content: boardNodeContentSchema,
    created_by: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .superRefine((node, context) => {
    if (node.type !== node.content.kind) {
      context.addIssue({
        code: "custom",
        message: `Node type ${node.type} does not match ${node.content.kind} content`,
        path: ["content", "kind"],
      });
    }
  });

export const boardNodeArraySchema = z.array(boardNodeSchema);

export type Board = z.infer<typeof boardSchema>;
export type BoardStatus = z.infer<typeof boardStatusSchema>;
export type BoardSourceType = z.infer<typeof boardSourceTypeSchema>;
export type GitHubCodeSource = z.infer<typeof githubCodeSourceSchema>;
export type CodeNodeContent = z.infer<typeof codeNodeContentSchema>;
export type ImageNodeContent = z.infer<typeof imageNodeContentSchema>;
export type BoardNodeContent = z.infer<typeof boardNodeContentSchema>;
export type BoardNodeRecord = z.infer<typeof boardNodeSchema>;
