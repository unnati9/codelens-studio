import type {
  REALTIME_SUBSCRIBE_STATES,
  RealtimeChannel,
  SupabaseClient,
} from "@supabase/supabase-js";
import { parseBoardRealtimeChange, type BoardRealtimeChange, type RealtimeEntity } from "./events";
import {
  collaboratorPresenceSchema,
  normalizePresenceState,
  type CollaboratorPresence,
} from "./presence";

type RealtimeClient = Pick<SupabaseClient, "channel" | "removeChannel">;

type SubscriptionOptions = {
  client: RealtimeClient;
  boardId: string;
  sessionId: string;
  initialPresence: CollaboratorPresence;
  onChange: (change: BoardRealtimeChange) => void;
  onPresence: (collaborators: CollaboratorPresence[]) => void;
  onStatus: (status: REALTIME_SUBSCRIBE_STATES, error?: Error) => void;
  onError: (error: Error) => void;
};

type EntitySubscription = {
  entity: RealtimeEntity;
  table: string;
  boardColumn: "id" | "board_id";
};

const entitySubscriptions: EntitySubscription[] = [
  { entity: "board", table: "boards", boardColumn: "id" },
  { entity: "node", table: "board_nodes", boardColumn: "board_id" },
  { entity: "annotation", table: "annotations", boardColumn: "board_id" },
  { entity: "thread", table: "comment_threads", boardColumn: "board_id" },
  { entity: "comment", table: "comments", boardColumn: "board_id" },
];

function errorFromUnknown(input: unknown, fallback: string) {
  return input instanceof Error ? input : new Error(fallback);
}

export function createBoardRealtimeSubscription(options: SubscriptionOptions) {
  const channel = options.client.channel(`board:${options.boardId}`, {
    config: { presence: { key: options.sessionId } },
  });
  let connected = false;
  let stopped = false;
  let stopPromise: Promise<void> | null = null;
  let presence = collaboratorPresenceSchema.parse(options.initialPresence);

  const dispatch = (entity: RealtimeEntity, payload: unknown) => {
    try {
      const change = parseBoardRealtimeChange(entity, options.boardId, payload);
      if (change) options.onChange(change);
    } catch (caughtError) {
      options.onError(errorFromUnknown(caughtError, `Malformed ${entity} realtime event.`));
    }
  };

  for (const subscription of entitySubscriptions) {
    const filter = `${subscription.boardColumn}=eq.${options.boardId}`;
    channel.on<Record<string, unknown>>(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: subscription.table, filter },
      (payload) => dispatch(subscription.entity, payload),
    );
    channel.on<Record<string, unknown>>(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: subscription.table, filter },
      (payload) => dispatch(subscription.entity, payload),
    );
    // Supabase cannot server-filter Postgres DELETE events. The dispatcher only
    // removes IDs already present in the active board stores.
    channel.on<Record<string, unknown>>(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: subscription.table },
      (payload) => dispatch(subscription.entity, payload),
    );
  }

  channel.on("presence", { event: "sync" }, () => {
    options.onPresence(normalizePresenceState(channel.presenceState()));
  });

  channel.subscribe((status, error) => {
    if (stopped) return;
    connected = status === "SUBSCRIBED";
    options.onStatus(status, error);
    if (connected) {
      void channel
        .track(presence)
        .then((result) => {
          if (result !== "ok") options.onError(new Error(`Presence tracking ${result}.`));
        })
        .catch((caughtError) =>
          options.onError(errorFromUnknown(caughtError, "Presence tracking failed.")),
        );
    }
  });

  return {
    channel: channel as RealtimeChannel,
    updatePresence(nextPresence: CollaboratorPresence) {
      presence = collaboratorPresenceSchema.parse(nextPresence);
      if (!connected || stopped) return;
      void channel
        .track(presence)
        .then((result) => {
          if (result !== "ok") options.onError(new Error(`Presence tracking ${result}.`));
        })
        .catch((caughtError) =>
          options.onError(errorFromUnknown(caughtError, "Presence tracking failed.")),
        );
    },
    stop() {
      if (stopPromise) return stopPromise;
      stopped = true;
      stopPromise = (async () => {
        try {
          if (connected) await channel.untrack();
        } finally {
          await options.client.removeChannel(channel);
        }
      })().catch((caughtError) => {
        options.onError(errorFromUnknown(caughtError, "Realtime cleanup failed."));
      });
      return stopPromise;
    },
  };
}

export type BoardRealtimeSubscription = ReturnType<typeof createBoardRealtimeSubscription>;
