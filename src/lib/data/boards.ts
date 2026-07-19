import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { boardSchema, type Board, type BoardStatus } from "@/lib/validation/board";

export async function listBoards(): Promise<Board[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("boards")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load boards: ${error.message}`);
  }

  return boardSchema.array().parse(data);
}

export async function getBoard(boardId: string): Promise<Board> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("boards")
    .select("*")
    .eq("id", boardId)
    .single();

  if (error) {
    throw new Error(`Could not load board: ${error.message}`);
  }

  return boardSchema.parse(data);
}

export async function createBoard(input: {
  title: string;
  description?: string;
  guestId: string;
}): Promise<Board> {
  const now = new Date().toISOString();
  const record = boardSchema.parse({
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description?.trim() || null,
    status: "DRAFT",
    created_by: input.guestId,
    created_at: now,
    updated_at: now,
  });

  const { data, error } = await getSupabaseBrowserClient()
    .from("boards")
    .insert(record)
    .select()
    .single();

  if (error) {
    throw new Error(`Could not create board: ${error.message}`);
  }

  return boardSchema.parse(data);
}

export async function updateBoardStatus(boardId: string, status: BoardStatus): Promise<Board> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("boards")
    .update({ status })
    .eq("id", boardId)
    .select()
    .single();

  if (error) {
    throw new Error(`Could not update review status: ${error.message}`);
  }

  return boardSchema.parse(data);
}
