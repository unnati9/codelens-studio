import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoardNodeRecord } from "@/lib/validation/board";
import { updateBoardNode } from "./nodes";

const node: BoardNodeRecord = {
  id: "3b40e363-6c3a-49e0-ab00-d598f76e5c7b",
  board_id: "0ec6c295-a45d-4797-86d8-974368c387bc",
  type: "image",
  title: null,
  position_x: 10,
  position_y: 20,
  width: 320,
  height: 240,
  z_index: 1,
  locked: false,
  content: {
    kind: "image",
    storagePath: "board/image.png",
    fileName: "image.png",
    mimeType: "image/png",
    sizeBytes: 100,
    naturalWidth: 320,
    naturalHeight: 240,
  },
  created_by: "guest-1",
  created_at: "2026-07-19T10:00:00.000Z",
  updated_at: "2026-07-19T10:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("updateBoardNode", () => {
  it("uses the same-origin POST endpoint instead of a cross-origin PATCH", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ node }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateBoardNode(node)).resolves.toEqual(node);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board-nodes/update",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node }),
      }),
    );
  });

  it("returns the server error message when a save fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { message: "Could not reach Supabase." } }, { status: 503 }),
        ),
    );

    await expect(updateBoardNode(node)).rejects.toThrow("Could not reach Supabase.");
  });
});
