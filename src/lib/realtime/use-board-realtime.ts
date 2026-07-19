"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { connectionStateForSubscriptionStatus } from "./connection-state";
import { createPresencePayload } from "./presence";
import { createBoardRealtimeSubscription, type BoardRealtimeSubscription } from "./subscription";
import type { BoardRealtimeChange } from "./events";
import type { GuestIdentity } from "@/lib/guest/identity";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRealtimeStore } from "@/stores/realtime-store";

type UseBoardRealtimeOptions = {
  enabled: boolean;
  boardId: string;
  identity: GuestIdentity | null;
  sessionId: string | null;
  selectedNodeId: string | null;
  selectedAnnotationId: string | null;
  onChange: (change: BoardRealtimeChange) => void;
  onReconnect: () => Promise<void>;
};

const pendingChannelStops = new Map<string, Promise<void>>();

export function useBoardRealtime(options: UseBoardRealtimeOptions) {
  const subscriptionRef = useRef<BoardRealtimeSubscription | null>(null);
  const onlineAtRef = useRef<string | null>(null);
  const onChangeEvent = useEffectEvent(options.onChange);
  const onReconnectEvent = useEffectEvent(options.onReconnect);
  const getCurrentPresence = useEffectEvent(() => {
    if (!options.identity || !options.sessionId) return null;
    onlineAtRef.current ??= new Date().toISOString();
    return createPresencePayload({
      sessionId: options.sessionId,
      guestId: options.identity.id,
      displayName: options.identity.displayName,
      selectedNodeId: options.selectedNodeId,
      selectedAnnotationId: options.selectedAnnotationId,
      onlineAt: onlineAtRef.current,
    });
  });

  useEffect(() => {
    if (!options.enabled || !options.identity || !options.sessionId) return;

    const sessionId = options.sessionId;
    const realtime = useRealtimeStore.getState();
    const channelKey = `${options.boardId}:${sessionId}`;
    let cancelled = false;
    let hasConnected = false;
    let wasDisconnected = false;
    let subscription: BoardRealtimeSubscription | null = null;
    onlineAtRef.current ??= new Date().toISOString();
    realtime.initialize(options.boardId);
    if (!navigator.onLine) realtime.setConnection("OFFLINE");

    async function startSubscription() {
      await pendingChannelStops.get(channelKey);
      if (cancelled) return;
      const initialPresence = getCurrentPresence();
      if (!initialPresence) return;
      subscription = createBoardRealtimeSubscription({
        client: getSupabaseBrowserClient(),
        boardId: options.boardId,
        sessionId,
        initialPresence,
        onChange: onChangeEvent,
        onPresence: (collaborators) => useRealtimeStore.getState().setCollaborators(collaborators),
        onStatus: (status, error) => {
          const state = connectionStateForSubscriptionStatus(status, {
            online: navigator.onLine,
            hasConnected,
          });
          if (status === "SUBSCRIBED") {
            const shouldReconcile = hasConnected || wasDisconnected;
            hasConnected = true;
            wasDisconnected = false;
            if (shouldReconcile) {
              useRealtimeStore.getState().setConnection("RECONNECTING");
              void onReconnectEvent()
                .then(() => {
                  if (!cancelled) useRealtimeStore.getState().setConnection("CONNECTED");
                })
                .catch((caughtError) => {
                  if (cancelled) return;
                  useRealtimeStore
                    .getState()
                    .setConnection(
                      "FAILED",
                      caughtError instanceof Error
                        ? caughtError.message
                        : "Could not reconcile after reconnecting.",
                    );
                });
            } else {
              useRealtimeStore.getState().setConnection("CONNECTED");
            }
            return;
          }

          wasDisconnected = true;
          useRealtimeStore
            .getState()
            .setConnection(
              state,
              error?.message ?? (state === "FAILED" ? "Realtime failed." : null),
            );
        },
        onError: (error) => useRealtimeStore.getState().setConnection("FAILED", error.message),
      });
      subscriptionRef.current = subscription;
    }
    void startSubscription();

    const handleOffline = () => {
      wasDisconnected = true;
      useRealtimeStore.getState().setConnection("OFFLINE", "Changes cannot sync while offline.");
    };
    const handleOnline = () => {
      wasDisconnected = true;
      useRealtimeStore.getState().setConnection("RECONNECTING");
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (subscriptionRef.current === subscription) subscriptionRef.current = null;
      if (subscription) {
        const stopping = subscription.stop();
        pendingChannelStops.set(channelKey, stopping);
        void stopping.finally(() => {
          if (pendingChannelStops.get(channelKey) === stopping) {
            pendingChannelStops.delete(channelKey);
          }
        });
      }
      useRealtimeStore.getState().reset(options.boardId);
    };
  }, [options.boardId, options.enabled, options.identity, options.sessionId]);

  useEffect(() => {
    const subscription = subscriptionRef.current;
    if (!subscription || !options.identity || !options.sessionId) return;
    onlineAtRef.current ??= new Date().toISOString();
    subscription.updatePresence(
      createPresencePayload({
        sessionId: options.sessionId,
        guestId: options.identity.id,
        displayName: options.identity.displayName,
        selectedNodeId: options.selectedNodeId,
        selectedAnnotationId: options.selectedAnnotationId,
        onlineAt: onlineAtRef.current,
      }),
    );
  }, [options.identity, options.selectedAnnotationId, options.selectedNodeId, options.sessionId]);
}
