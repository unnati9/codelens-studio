import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardSaveCoordinator } from "./board-save-coordinator";
import type { BoardNodeRecord } from "@/lib/validation/board";

const record: BoardNodeRecord = {
  id: "a9c28c6e-34e3-49d1-b6ea-258b2487f414",
  board_id: "40ad7bd7-b5f4-4374-8c77-15219478ce2b",
  type: "code",
  title: "Review service",
  position_x: 120,
  position_y: 80,
  width: 480,
  height: 360,
  z_index: 1,
  locked: false,
  content: {
    kind: "code",
    filename: "review.ts",
    language: "typescript",
    code: "export const review = true;",
  },
  created_by: "guest-1",
  created_at: "2026-07-18T09:00:00.000Z",
  updated_at: "2026-07-18T09:00:00.000Z",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("BoardSaveCoordinator", () => {
  it("does not report saved while an immediate upload is still active", async () => {
    vi.useFakeTimers();
    const states: string[] = [];
    const coordinator = new BoardSaveCoordinator(
      async (value) => value,
      (state) => states.push(state),
      100,
    );

    coordinator.beginImmediate();
    coordinator.queue(record);
    await vi.advanceTimersByTimeAsync(100);

    expect(states.at(-1)).toBe("saving");
    coordinator.finishImmediate();
    expect(states.at(-1)).toBe("saved");
  });

  it("reports the latest persistence error visibly", async () => {
    vi.useFakeTimers();
    const changes: Array<{ state: string; error?: string | null }> = [];
    const coordinator = new BoardSaveCoordinator(
      async () => {
        throw new Error("Database unavailable");
      },
      (state, error) => changes.push({ state, error }),
      100,
    );

    coordinator.queue(record);
    await vi.advanceTimersByTimeAsync(100);

    expect(changes.at(-1)).toEqual({ state: "failed", error: "Database unavailable" });
    expect(coordinator.getSnapshot()).toEqual({
      state: "failed",
      error: "Database unavailable",
    });
  });
});
