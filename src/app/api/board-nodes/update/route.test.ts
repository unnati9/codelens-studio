import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardNodeRecord } from "@/lib/validation/board";
import { POST } from "./route";

const supabaseMocks = vi.hoisted(() => ({
  getClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: supabaseMocks.getClient,
}));

const node: BoardNodeRecord = {
  id: "3b40e363-6c3a-49e0-ab00-d598f76e5c7b",
  board_id: "0ec6c295-a45d-4797-86d8-974368c387bc",
  type: "image",
  title: "Architecture",
  position_x: 120,
  position_y: 240,
  width: 640,
  height: 480,
  z_index: 2,
  locked: false,
  content: {
    kind: "image",
    storagePath: "board/image.png",
    fileName: "image.png",
    mimeType: "image/png",
    sizeBytes: 1024,
    naturalWidth: 1280,
    naturalHeight: 960,
  },
  created_by: "guest-1",
  created_at: "2026-07-19T10:00:00.000Z",
  updated_at: "2026-07-19T10:00:00.000Z",
};

function updateRequest(body: unknown = { node }) {
  return new Request("http://localhost/api/board-nodes/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockSupabaseUpdate(result: { data: unknown; error: { message: string } | null }) {
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

describe("board-node update API route", () => {
  it("updates an allowlisted board node through the server client", async () => {
    const { chain, client } = mockSupabaseUpdate({ data: node, error: null });

    const response = await POST(updateRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ node });
    expect(client.from).toHaveBeenCalledWith("board_nodes");
    expect(chain.update).toHaveBeenCalledWith({
      title: node.title,
      position_x: node.position_x,
      position_y: node.position_y,
      width: node.width,
      height: node.height,
      z_index: node.z_index,
      locked: node.locked,
      content: node.content,
    });
    expect(chain.eq).toHaveBeenNthCalledWith(1, "id", node.id);
    expect(chain.eq).toHaveBeenNthCalledWith(2, "board_id", node.board_id);
  });

  it("rejects an invalid board node before calling Supabase", async () => {
    const response = await POST(updateRequest({ node: { id: "not-a-uuid" } }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { message: "A valid board node is required." },
    });
    expect(supabaseMocks.getClient).not.toHaveBeenCalled();
  });

  it("surfaces a server-side Supabase update failure", async () => {
    mockSupabaseUpdate({ data: null, error: { message: "upstream unavailable" } });

    const response = await POST(updateRequest());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Could not save node: upstream unavailable" },
    });
  });
});
