import { z } from "zod";
import { annotationFromDatabaseRow, type Annotation } from "@/lib/validation/annotation";
import {
  boardNodeSchema,
  boardSchema,
  type Board,
  type BoardNodeRecord,
} from "@/lib/validation/board";
import {
  commentThreadFromDatabaseRow,
  reviewCommentFromDatabaseRow,
  type CommentThread,
  type ReviewComment,
} from "@/lib/validation/review";

export type RealtimeEntity = "board" | "node" | "annotation" | "thread" | "comment";

export type BoardRealtimeChange =
  | { entity: "board"; action: "UPSERT"; record: Board }
  | { entity: "node"; action: "UPSERT"; record: BoardNodeRecord }
  | { entity: "annotation"; action: "UPSERT"; record: Annotation }
  | { entity: "thread"; action: "UPSERT"; record: CommentThread }
  | { entity: "comment"; action: "UPSERT"; record: ReviewComment }
  | { entity: RealtimeEntity; action: "DELETE"; id: string };

type BoardRealtimeUpsert = Extract<BoardRealtimeChange, { action: "UPSERT" }>;

const changePayloadSchema = z.object({
  eventType: z.enum(["INSERT", "UPDATE", "DELETE"]),
  new: z.unknown(),
  old: z.unknown(),
});

const deletedRecordSchema = z.object({ id: z.string().uuid() });

function parseUpsert(entity: RealtimeEntity, input: unknown): BoardRealtimeUpsert {
  switch (entity) {
    case "board":
      return { entity, action: "UPSERT", record: boardSchema.parse(input) };
    case "node":
      return { entity, action: "UPSERT", record: boardNodeSchema.parse(input) };
    case "annotation":
      return { entity, action: "UPSERT", record: annotationFromDatabaseRow(input) };
    case "thread":
      return { entity, action: "UPSERT", record: commentThreadFromDatabaseRow(input) };
    case "comment":
      return { entity, action: "UPSERT", record: reviewCommentFromDatabaseRow(input) };
  }
}

function recordBoardId(change: BoardRealtimeUpsert) {
  switch (change.entity) {
    case "board":
      return change.record.id;
    case "node":
      return change.record.board_id;
    case "annotation":
    case "thread":
    case "comment":
      return change.record.boardId;
  }
}

export function parseBoardRealtimeChange(
  entity: RealtimeEntity,
  activeBoardId: string,
  input: unknown,
): BoardRealtimeChange | null {
  const payload = changePayloadSchema.parse(input);
  if (payload.eventType === "DELETE") {
    return { entity, action: "DELETE", id: deletedRecordSchema.parse(payload.old).id };
  }

  const change = parseUpsert(entity, payload.new);
  return recordBoardId(change) === activeBoardId ? change : null;
}
