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
    source_type: null,
    github_owner: null,
    github_repository: null,
    github_pull_request_number: null,
    github_pull_request_url: null,
    github_head_sha: null,
    last_imported_at: null,
    created_by: input.guestId,
    created_at: now,
    updated_at: now,
  });

  const { data, error } = await getSupabaseBrowserClient()
    .from("boards")
    .insert({
      id: record.id,
      title: record.title,
      description: record.description,
      status: record.status,
      created_by: record.created_by,
      created_at: record.created_at,
      updated_at: record.updated_at,
    })
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

export async function updateBoardGitHubSource(
  boardId: string,
  source: {
    owner: string;
    repository: string;
    pullRequestNumber: number;
    pullRequestUrl: string;
    headCommitSha: string;
    lastImportedAt: string;
  },
): Promise<Board> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("boards")
    .update({
      source_type: "GITHUB_PR",
      github_owner: source.owner,
      github_repository: source.repository,
      github_pull_request_number: source.pullRequestNumber,
      github_pull_request_url: source.pullRequestUrl,
      github_head_sha: source.headCommitSha,
      last_imported_at: source.lastImportedAt,
    })
    .eq("id", boardId)
    .select()
    .single();

  if (error) {
    throw new Error(`Could not save GitHub source metadata: ${error.message}`);
  }

  return boardSchema.parse(data);
}
