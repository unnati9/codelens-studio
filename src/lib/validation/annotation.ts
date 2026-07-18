import { z } from "zod";

export const annotationTargetTypeSchema = z.enum(["NODE", "WORKSPACE"]);
export const annotationToolSchema = z.enum(["FREEHAND", "RECTANGLE", "ARROW", "HIGHLIGHT"]);

const finiteNumber = z.number().finite();

export const annotationGeometrySchema = z
  .object({
    x: finiteNumber.optional(),
    y: finiteNumber.optional(),
    width: finiteNumber.nonnegative().optional(),
    height: finiteNumber.nonnegative().optional(),
    points: z.array(finiteNumber).optional(),
    startX: finiteNumber.optional(),
    startY: finiteNumber.optional(),
    endX: finiteNumber.optional(),
    endY: finiteNumber.optional(),
  })
  .strict();

export const annotationStyleSchema = z.object({
  stroke: z.string().trim().min(1).max(64),
  fill: z.string().trim().min(1).max(64).optional(),
  strokeWidth: z.number().finite().positive().max(64),
  opacity: z.number().finite().min(0).max(1),
});

function geometryValuesForTool(
  tool: z.infer<typeof annotationToolSchema>,
  geometry: z.infer<typeof annotationGeometrySchema>,
) {
  switch (tool) {
    case "FREEHAND":
      return geometry.points ?? [];
    case "RECTANGLE":
    case "HIGHLIGHT":
      return [geometry.x, geometry.y, geometry.width, geometry.height];
    case "ARROW":
      return [geometry.startX, geometry.startY, geometry.endX, geometry.endY];
  }
}

export const annotationSchema = z
  .object({
    id: z.string().uuid(),
    boardId: z.string().uuid(),
    targetType: annotationTargetTypeSchema,
    targetNodeId: z.string().uuid().optional(),
    tool: annotationToolSchema,
    geometry: annotationGeometrySchema,
    style: annotationStyleSchema,
    createdBy: z.string().min(1),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .superRefine((annotation, context) => {
    if (annotation.targetType === "NODE" && !annotation.targetNodeId) {
      context.addIssue({
        code: "custom",
        message: "Node annotations require a target node.",
        path: ["targetNodeId"],
      });
    }
    if (annotation.targetType === "WORKSPACE" && annotation.targetNodeId) {
      context.addIssue({
        code: "custom",
        message: "Workspace annotations cannot target a node.",
        path: ["targetNodeId"],
      });
    }

    const values = geometryValuesForTool(annotation.tool, annotation.geometry);
    const expectedLength = annotation.tool === "FREEHAND" ? 4 : 4;
    if (
      values.length < expectedLength ||
      values.some((value) => value === undefined) ||
      (annotation.tool === "FREEHAND" && values.length % 2 !== 0)
    ) {
      context.addIssue({
        code: "custom",
        message: `Geometry does not match the ${annotation.tool.toLowerCase()} tool.`,
        path: ["geometry"],
      });
      return;
    }

    if (
      annotation.targetType === "NODE" &&
      values.some((value) => typeof value === "number" && (value < 0 || value > 1))
    ) {
      context.addIssue({
        code: "custom",
        message: "Node annotation geometry must be normalized between 0 and 1.",
        path: ["geometry"],
      });
    }
  });

export const annotationArraySchema = z.array(annotationSchema);

export const annotationDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  board_id: z.string().uuid(),
  target_type: annotationTargetTypeSchema,
  target_node_id: z.string().uuid().nullable(),
  tool: annotationToolSchema,
  geometry: annotationGeometrySchema,
  style: annotationStyleSchema,
  created_by: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type AnnotationTargetType = z.infer<typeof annotationTargetTypeSchema>;
export type AnnotationTool = z.infer<typeof annotationToolSchema>;
export type AnnotationGeometry = z.infer<typeof annotationGeometrySchema>;
export type AnnotationStyle = z.infer<typeof annotationStyleSchema>;
export type Annotation = z.infer<typeof annotationSchema>;
export type AnnotationDatabaseRow = z.infer<typeof annotationDatabaseRowSchema>;

export function annotationFromDatabaseRow(input: unknown): Annotation {
  const row = annotationDatabaseRowSchema.parse(input);
  return annotationSchema.parse({
    id: row.id,
    boardId: row.board_id,
    targetType: row.target_type,
    targetNodeId: row.target_node_id ?? undefined,
    tool: row.tool,
    geometry: row.geometry,
    style: row.style,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function annotationToDatabaseRow(input: Annotation): AnnotationDatabaseRow {
  const annotation = annotationSchema.parse(input);
  return annotationDatabaseRowSchema.parse({
    id: annotation.id,
    board_id: annotation.boardId,
    target_type: annotation.targetType,
    target_node_id: annotation.targetNodeId ?? null,
    tool: annotation.tool,
    geometry: annotation.geometry,
    style: annotation.style,
    created_by: annotation.createdBy,
    created_at: annotation.createdAt,
    updated_at: annotation.updatedAt,
  });
}
