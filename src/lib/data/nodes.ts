import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { z } from "zod";
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

export async function createBoardNodes(records: BoardNodeRecord[]): Promise<BoardNodeRecord[]> {
  const validatedRecords = boardNodeArraySchema.parse(records);
  if (validatedRecords.length === 0) return [];

  const { data, error } = await getSupabaseBrowserClient()
    .from("board_nodes")
    .insert(validatedRecords)
    .select();

  if (error) {
    throw new Error(`Could not import code nodes: ${error.message}`);
  }

  return boardNodeArraySchema.parse(data);
}

export async function updateBoardNode(record: BoardNodeRecord): Promise<BoardNodeRecord> {
  const validatedRecord = boardNodeSchema.parse(record);
  const response = await fetch("/api/board-nodes/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ node: validatedRecord }),
  });
  const responseBody: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsedError = z
      .object({ error: z.object({ message: z.string().min(1) }) })
      .safeParse(responseBody);
    throw new Error(parsedError.success ? parsedError.data.error.message : "Could not save node.");
  }

  return z.object({ node: boardNodeSchema }).parse(responseBody).node;
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
