import type { Node } from "@xyflow/react";
import {
  boardNodeSchema,
  type BoardNodeRecord,
  type BoardNodeContent,
} from "@/lib/validation/board";

export type BoardFlowNodeData = {
  record: BoardNodeRecord;
} & Record<string, unknown>;

export type BoardFlowNode = Node<BoardFlowNodeData, "code" | "image">;

function numericDimension(value: string | number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function getBoardFlowNodeDimensions(node: BoardFlowNode) {
  const source = node.data.record;
  const styledWidth = numericDimension(node.style?.width, source.width);
  const styledHeight = numericDimension(node.style?.height, source.height);

  return {
    // NodeResizer updates measured/top-level dimensions before controlled style values.
    width: numericDimension(node.measured?.width, numericDimension(node.width, styledWidth)),
    height: numericDimension(node.measured?.height, numericDimension(node.height, styledHeight)),
  };
}

export function deserializeBoardNode(input: unknown): BoardFlowNode {
  const record = boardNodeSchema.parse(input);

  return {
    id: record.id,
    type: record.type,
    position: { x: record.position_x, y: record.position_y },
    zIndex: record.z_index,
    draggable: !record.locked,
    style: {
      width: record.width,
      height: record.height,
      zIndex: record.z_index,
    },
    data: { record },
  };
}

export function serializeBoardNode(node: BoardFlowNode): BoardNodeRecord {
  const source = node.data.record;
  const dimensions = getBoardFlowNodeDimensions(node);

  return boardNodeSchema.parse({
    ...source,
    position_x: node.position.x,
    position_y: node.position.y,
    width: dimensions.width,
    height: dimensions.height,
    z_index: node.zIndex ?? source.z_index,
  });
}

export function updateFlowNodeRecord(
  node: BoardFlowNode,
  updates: Partial<Pick<BoardNodeRecord, "title" | "locked">> & {
    content?: BoardNodeContent;
    z_index?: number;
  },
): BoardFlowNode {
  const record = boardNodeSchema.parse({ ...serializeBoardNode(node), ...updates });

  return {
    ...node,
    zIndex: record.z_index,
    draggable: !record.locked,
    style: { ...node.style, zIndex: record.z_index },
    data: { record },
  };
}
