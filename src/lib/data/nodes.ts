import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  boardNodeArraySchema,
  boardNodeSchema,
  type BoardNodeRecord,
} from "@/lib/validation/board";

export async function listBoardNodes(boardId: string): Promise<BoardNodeRecord[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("board_nodes")
    .select("*")
    .eq("board_id", boardId)
    .order("z_index", { ascending: true });

  if (error) {
    throw new Error(`Could not load board nodes: ${error.message}`);
  }

  return boardNodeArraySchema.parse(data);
}

export async function createBoardNode(record: BoardNodeRecord): Promise<BoardNodeRecord> {
  const validatedRecord = boardNodeSchema.parse(record);
  const { data, error } = await getSupabaseBrowserClient()
    .from("board_nodes")
    .insert(validatedRecord)
    .select()
    .single();

  if (error) {
    throw new Error(`Could not create node: ${error.message}`);
  }

  return boardNodeSchema.parse(data);
}

export async function updateBoardNode(record: BoardNodeRecord): Promise<BoardNodeRecord> {
  const validatedRecord = boardNodeSchema.parse(record);
  const { data, error } = await getSupabaseBrowserClient()
    .from("board_nodes")
    .update({
      title: validatedRecord.title,
      position_x: validatedRecord.position_x,
      position_y: validatedRecord.position_y,
      width: validatedRecord.width,
      height: validatedRecord.height,
      z_index: validatedRecord.z_index,
      locked: validatedRecord.locked,
      content: validatedRecord.content,
    })
    .eq("id", validatedRecord.id)
    .eq("board_id", validatedRecord.board_id)
    .select()
    .single();

  if (error) {
    throw new Error(`Could not save node: ${error.message}`);
  }

  return boardNodeSchema.parse(data);
}

export async function deleteBoardNode(boardId: string, nodeId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from("board_nodes")
    .delete()
    .eq("id", nodeId)
    .eq("board_id", boardId);

  if (error) {
    throw new Error(`Could not delete node: ${error.message}`);
  }
}
