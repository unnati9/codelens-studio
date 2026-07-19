import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { groupCommentsByThread } from "@/lib/review/threads";
import {
  commentThreadFromDatabaseRow,
  commentThreadToDatabaseRow,
  reviewCommentFromDatabaseRow,
  reviewCommentToDatabaseRow,
  type CommentThread,
  type ReviewComment,
  type ReviewThread,
  type ThreadStatus,
} from "@/lib/validation/review";

export async function listReviewThreads(boardId: string): Promise<ReviewThread[]> {
  const client = getSupabaseBrowserClient();
  const { data: threadRows, error: threadError } = await client
    .from("comment_threads")
    .select("*")
    .eq("board_id", boardId);

  if (threadError) {
    throw new Error(`Could not load comment threads: ${threadError.message}`);
  }

  const threads = (threadRows ?? []).map(commentThreadFromDatabaseRow);
  if (threads.length === 0) return [];

  const { data: commentRows, error: commentError } = await client
    .from("comments")
    .select("*")
    .in(
      "thread_id",
      threads.map((thread) => thread.id),
    )
    .order("created_at", { ascending: true });

  if (commentError) {
    throw new Error(`Could not load comments: ${commentError.message}`);
  }

  return groupCommentsByThread(threads, (commentRows ?? []).map(reviewCommentFromDatabaseRow));
}

export async function createCommentThread(thread: CommentThread): Promise<CommentThread> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("comment_threads")
    .insert(commentThreadToDatabaseRow(thread))
    .select()
    .single();

  if (error) throw new Error(`Could not create comment thread: ${error.message}`);
  return commentThreadFromDatabaseRow(data);
}

export async function createReviewComment(comment: ReviewComment): Promise<ReviewComment> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("comments")
    .insert(reviewCommentToDatabaseRow(comment))
    .select()
    .single();

  if (error) throw new Error(`Could not send comment: ${error.message}`);
  return reviewCommentFromDatabaseRow(data);
}

export async function updateCommentThreadStatus(
  threadId: string,
  status: ThreadStatus,
  actorId: string,
): Promise<CommentThread> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseBrowserClient()
    .from("comment_threads")
    .update({
      status,
      resolved_by: status === "RESOLVED" ? actorId : null,
      resolved_at: status === "RESOLVED" ? now : null,
    })
    .eq("id", threadId)
    .select()
    .single();

  if (error) throw new Error(`Could not update comment thread: ${error.message}`);
  return commentThreadFromDatabaseRow(data);
}
