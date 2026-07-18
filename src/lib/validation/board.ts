import { z } from "zod";

export const boardStatusSchema = z.enum(["DRAFT", "IN_REVIEW", "APPROVED"]);

export const boardSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  description: z.string().nullable(),
  status: boardStatusSchema,
  created_by: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const codeNodeContentSchema = z.object({
  kind: z.literal("code"),
  filename: z.string().trim().max(160),
  language: z.enum(["typescript", "javascript", "css", "html", "json", "text"]),
  code: z.string().max(100_000),
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
export type CodeNodeContent = z.infer<typeof codeNodeContentSchema>;
export type ImageNodeContent = z.infer<typeof imageNodeContentSchema>;
export type BoardNodeContent = z.infer<typeof boardNodeContentSchema>;
export type BoardNodeRecord = z.infer<typeof boardNodeSchema>;
