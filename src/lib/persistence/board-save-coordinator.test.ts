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

  it("flushes the final interaction immediately and reconciles the returned record", async () => {
    vi.useFakeTimers();
    const persisted = vi.fn(async (value: BoardNodeRecord) => ({
      ...value,
      updated_at: "2026-07-19T09:01:00.000Z",
    }));
    const onPersisted = vi.fn();
    const coordinator = new BoardSaveCoordinator(persisted, vi.fn(), 10_000, onPersisted);

    coordinator.queue({ ...record, position_x: 640 });
    await coordinator.flush(record.id);

    expect(persisted).toHaveBeenCalledTimes(1);
    expect(onPersisted).toHaveBeenCalledWith(
      expect.objectContaining({ position_x: 640, updated_at: "2026-07-19T09:01:00.000Z" }),
    );
  });

  it("retries a failed offline save before reconnect reconciliation", async () => {
    let attempts = 0;
    const persisted = vi.fn(async (value: BoardNodeRecord) => {
      attempts += 1;
      if (attempts === 1) throw new Error("Offline");
      return { ...value, updated_at: "2026-07-19T09:02:00.000Z" };
    });
    const coordinator = new BoardSaveCoordinator(persisted, vi.fn(), 0);

    coordinator.queue({ ...record, width: 720 });
    await coordinator.flush(record.id);
    expect(coordinator.hasPending(record.id)).toBe(true);
    await coordinator.retryFailed();

    expect(persisted).toHaveBeenCalledTimes(2);
    expect(coordinator.hasPending()).toBe(false);
    expect(coordinator.getSnapshot().state).toBe("saved");
  });
});
