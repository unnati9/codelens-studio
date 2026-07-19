import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createPresencePayload } from "./presence";
import { createBoardRealtimeSubscription } from "./subscription";

type RegisteredHandler = {
  type: string;
  filter: Record<string, unknown>;
  callback: (payload?: unknown) => void;
};

function createHarness() {
  const handlers: RegisteredHandler[] = [];
  let subscribeCallback: ((status: REALTIME_SUBSCRIBE_STATES, error?: Error) => void) | undefined;
  let presenceState: Record<string, unknown[]> = {};
  const channel = {
    on: vi.fn((type: string, filter: Record<string, unknown>, callback: () => void) => {
      handlers.push({ type, filter, callback });
      return channel;
    }),
    subscribe: vi.fn((callback: (status: REALTIME_SUBSCRIBE_STATES, error?: Error) => void) => {
      subscribeCallback = callback;
      return channel;
    }),
    track: vi.fn(async () => "ok" as const),
    untrack: vi.fn(async () => "ok" as const),
    presenceState: vi.fn(() => presenceState),
  };
  const client = {
    channel: vi.fn(() => channel as unknown as RealtimeChannel),
    removeChannel: vi.fn(async () => "ok" as const),
  } as unknown as Pick<SupabaseClient, "channel" | "removeChannel">;

  return {
    handlers,
    channel,
    client,
    setPresenceState(value: Record<string, unknown[]>) {
      presenceState = value;
    },
    emitStatus(status: REALTIME_SUBSCRIBE_STATES, error?: Error) {
      subscribeCallback?.(status, error);
    },
    emitPostgres(table: string, event: "INSERT" | "UPDATE" | "DELETE", payload: unknown) {
      const handler = handlers.find(
        (candidate) =>
          candidate.type === "postgres_changes" &&
          candidate.filter.table === table &&
          candidate.filter.event === event,
      );
      if (!handler) throw new Error(`Missing ${event} handler for ${table}.`);
      handler.callback(payload);
    },
    emitPresenceSync() {
      handlers
        .find((candidate) => candidate.type === "presence" && candidate.filter.event === "sync")
        ?.callback();
    },
  };
}

const boardId = "40ad7bd7-b5f4-4374-8c77-15219478ce2b";
const sessionId = "7995748f-7d76-4e45-9be5-cf82a6f868c9";
const presence = createPresencePayload({
  sessionId,
  guestId: "ca828087-d3d8-4487-a942-aac7a817e754",
  displayName: "Calm Reviewer 12",
  selectedNodeId: null,
  selectedAnnotationId: null,
  onlineAt: "2026-07-19T09:00:00.000Z",
});

describe("board realtime subscription", () => {
  it("uses active-board filters and dispatches validated changes", () => {
    const harness = createHarness();
    const changes: unknown[] = [];
    createBoardRealtimeSubscription({
      client: harness.client,
      boardId,
      sessionId,
      initialPresence: presence,
      onChange: (change) => changes.push(change),
      onPresence: vi.fn(),
      onStatus: vi.fn(),
      onError: vi.fn(),
    });

    const node = {
      id: "a9c28c6e-34e3-49d1-b6ea-258b2487f414",
      board_id: boardId,
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
      created_at: "2026-07-19T09:00:00.000Z",
      updated_at: "2026-07-19T09:00:00.000Z",
    };
    harness.emitPostgres("board_nodes", "UPDATE", {
      eventType: "UPDATE",
      new: node,
      old: node,
    });

    expect(changes).toMatchObject([{ entity: "node", action: "UPSERT", record: node }]);
    const nodeUpdate = harness.handlers.find(
      (handler) => handler.filter.table === "board_nodes" && handler.filter.event === "UPDATE",
    );
    expect(nodeUpdate?.filter.filter).toBe(`board_id=eq.${boardId}`);
    const nodeDelete = harness.handlers.find(
      (handler) => handler.filter.table === "board_nodes" && handler.filter.event === "DELETE",
    );
    expect(nodeDelete?.filter.filter).toBeUndefined();
  });

  it("tracks presence and reports presence sync", async () => {
    const harness = createHarness();
    const onPresence = vi.fn();
    createBoardRealtimeSubscription({
      client: harness.client,
      boardId,
      sessionId,
      initialPresence: presence,
      onChange: vi.fn(),
      onPresence,
      onStatus: vi.fn(),
      onError: vi.fn(),
    });
    harness.emitStatus(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    await Promise.resolve();
    expect(harness.channel.track).toHaveBeenCalledWith(presence);

    harness.setPresenceState({ [sessionId]: [presence] });
    harness.emitPresenceSync();
    expect(onPresence).toHaveBeenLastCalledWith([presence]);
  });

  it("cleans up a subscription exactly once", async () => {
    const harness = createHarness();
    const subscription = createBoardRealtimeSubscription({
      client: harness.client,
      boardId,
      sessionId,
      initialPresence: presence,
      onChange: vi.fn(),
      onPresence: vi.fn(),
      onStatus: vi.fn(),
      onError: vi.fn(),
    });
    harness.emitStatus(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);

    await Promise.all([subscription.stop(), subscription.stop()]);
    expect(harness.channel.untrack).toHaveBeenCalledTimes(1);
    expect(harness.client.removeChannel).toHaveBeenCalledTimes(1);
  });
});
