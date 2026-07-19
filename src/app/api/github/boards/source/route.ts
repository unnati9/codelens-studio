import { NextResponse } from "next/server";
import {
  githubBoardSourceRequestSchema,
  githubBoardSourceResponseSchema,
} from "@/lib/github/board-source-schema";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { boardSchema } from "@/lib/validation/board";

export const dynamic = "force-dynamic";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return response({ error: { message: "The source update origin is invalid." } }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ error: { message: "Request body must be valid JSON." } }, 400);
  }
  const parsed = githubBoardSourceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return response({ error: { message: "Valid pull-request metadata is required." } }, 400);
  }
  const { boardId, source } = parsed.data;
  const { data, error } = await getSupabaseServerClient()
    .from("boards")
    .update({
      source_type: "GITHUB_PR",
      github_owner: source.owner,
      github_repository: source.repository,
      github_pull_request_number: source.pullRequestNumber,
      github_pull_request_url: source.pullRequestUrl,
      github_head_sha: source.headCommitSha,
      ...(source.baseBranch === undefined ? {} : { github_base_branch: source.baseBranch }),
      ...(source.headBranch === undefined ? {} : { github_head_branch: source.headBranch }),
      ...(source.baseCommitSha === undefined ? {} : { github_base_sha: source.baseCommitSha }),
      ...(source.authorLogin === undefined ? {} : { github_author_login: source.authorLogin }),
      ...(source.pullRequestTitle === undefined
        ? {}
        : { github_pull_request_title: source.pullRequestTitle }),
      ...(source.pullRequestDescription === undefined
        ? {}
        : { github_pull_request_description: source.pullRequestDescription }),
      ...(source.changedFileCount === undefined
        ? {}
        : { github_changed_file_count: source.changedFileCount }),
      github_last_synced_at: source.lastSyncedAt ?? source.lastImportedAt,
      last_imported_at: source.lastImportedAt,
    })
    .eq("id", boardId)
    .select()
    .single();
  if (error) {
    return response(
      { error: { message: `Could not save GitHub source metadata: ${error.message}` } },
      502,
    );
  }
  const board = boardSchema.safeParse(data);
  if (!board.success) {
    return response({ error: { message: "The database returned invalid board metadata." } }, 502);
  }
  return response(githubBoardSourceResponseSchema.parse({ board: board.data }));
}
