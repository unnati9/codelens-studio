import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board } from "@/lib/validation/board";

const supabaseMocks = vi.hoisted(() => ({ getClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: supabaseMocks.getClient,
}));

import { POST } from "./route";

const board: Board = {
  id: "0ec6c295-a45d-4797-86d8-974368c387bc",
  title: "Review board",
  description: null,
  status: "DRAFT",
  source_type: "GITHUB_PR",
  github_owner: "octocat",
  github_repository: "Hello-World",
  github_pull_request_number: 42,
  github_pull_request_url: "https://github.com/octocat/Hello-World/pull/42",
  github_head_sha: "0123456789abcdef0123456789abcdef01234567",
  github_base_branch: "main",
  github_head_branch: "feature/review",
  github_base_sha: "fedcba9876543210fedcba9876543210fedcba98",
  github_author_login: "octocat",
  github_pull_request_title: "Add review canvas",
  github_pull_request_description: "PR description",
  github_changed_file_count: 2,
  github_last_synced_at: "2026-07-19T12:00:00.000Z",
  last_imported_at: "2026-07-19T12:00:00.000Z",
  created_by: "guest-1",
  created_at: "2026-07-19T10:00:00.000Z",
  updated_at: "2026-07-19T12:00:00.000Z",
};

const source = {
  owner: "octocat",
  repository: "Hello-World",
  pullRequestNumber: 42,
  pullRequestUrl: "https://github.com/octocat/Hello-World/pull/42",
  headCommitSha: "0123456789abcdef0123456789abcdef01234567",
  baseBranch: "main",
  headBranch: "feature/review",
  baseCommitSha: "fedcba9876543210fedcba9876543210fedcba98",
  authorLogin: "octocat",
  pullRequestTitle: "Add review canvas",
  pullRequestDescription: "PR description",
  changedFileCount: 2,
  lastSyncedAt: "2026-07-19T12:00:00.000Z",
  lastImportedAt: "2026-07-19T12:00:00.000Z",
};

function request(body: unknown, origin = "https://codelens.example") {
  return new Request("https://codelens.example/api/github/boards/source", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}

function mockUpdate(result: { data: unknown; error: { message: string } | null }) {
  const chain = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
  };
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  const client = { from: vi.fn().mockReturnValue(chain) };
  supabaseMocks.getClient.mockReturnValue(client);
  return { chain, client };
}

beforeEach(() => {
  supabaseMocks.getClient.mockReset();
});

describe("GitHub board source API route", () => {
  it("persists allowlisted public PR metadata through the server client", async () => {
    const { chain, client } = mockUpdate({ data: board, error: null });

    const response = await POST(request({ boardId: board.id, source }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ board });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(client.from).toHaveBeenCalledWith("boards");
    expect(chain.eq).toHaveBeenCalledWith("id", board.id);
    expect(chain.update).toHaveBeenCalledWith({
      source_type: "GITHUB_PR",
      github_owner: source.owner,
      github_repository: source.repository,
      github_pull_request_number: source.pullRequestNumber,
      github_pull_request_url: source.pullRequestUrl,
      github_head_sha: source.headCommitSha,
      github_base_branch: source.baseBranch,
      github_head_branch: source.headBranch,
      github_base_sha: source.baseCommitSha,
      github_author_login: source.authorLogin,
      github_pull_request_title: source.pullRequestTitle,
      github_pull_request_description: source.pullRequestDescription,
      github_changed_file_count: source.changedFileCount,
      github_last_synced_at: source.lastSyncedAt,
      last_imported_at: source.lastImportedAt,
    });
  });

  it("rejects a cross-origin update before accessing Supabase", async () => {
    const response = await POST(request({ boardId: board.id, source }, "https://attacker.example"));

    expect(response.status).toBe(403);
    expect(supabaseMocks.getClient).not.toHaveBeenCalled();
  });

  it("rejects malformed source metadata before accessing Supabase", async () => {
    const response = await POST(request({ boardId: board.id, source: { owner: "octocat" } }));

    expect(response.status).toBe(400);
    expect(supabaseMocks.getClient).not.toHaveBeenCalled();
  });
});
