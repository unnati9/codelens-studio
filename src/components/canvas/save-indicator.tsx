"use client";

import { useCanvasUiStore, type SaveState } from "@/stores/canvas-ui-store";
import { useRealtimeStore } from "@/stores/realtime-store";

const labels: Record<SaveState, string> = {
  idle: "Ready",
  saving: "Saving…",
  saved: "Saved",
  failed: "Save failed",
};

export function SaveIndicator() {
  const state = useCanvasUiStore((store) => store.saveState);
  const error = useCanvasUiStore((store) => store.saveError);
  const connectionState = useRealtimeStore((store) => store.connectionState);
  const connectionError = useRealtimeStore((store) => store.error);
  const connectionLabel =
    connectionState === "OFFLINE"
      ? "Offline · not synced"
      : connectionState === "RECONNECTING"
        ? "Syncing…"
        : connectionState === "CONNECTING"
          ? "Waiting for sync"
          : connectionState === "FAILED"
            ? "Sync failed"
            : null;
  const label = connectionLabel ?? labels[state];
  const visibleError = connectionError || error;
  const color =
    connectionState === "FAILED" || connectionState === "OFFLINE" || state === "failed"
      ? "bg-red-500"
      : connectionState !== "CONNECTED" || state === "saving"
        ? "bg-amber-400"
        : "bg-emerald-500";

  return (
    <div
      title={visibleError || label}
      role="status"
      data-testid="save-state"
      data-save-state={state}
      className={`flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-xs font-bold ${
        connectionState === "FAILED" || connectionState === "OFFLINE" || state === "failed"
          ? "max-w-[360px] border-red-200 text-red-700"
          : "border-[#dcd8cf] text-[#5c6068]"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${color} ${
          connectionState === "CONNECTING" ||
          connectionState === "RECONNECTING" ||
          state === "saving"
            ? "animate-pulse"
            : ""
        }`}
      />
      <span>{label}</span>
      {(connectionState === "FAILED" || state === "failed") && visibleError && (
        <span data-testid="save-error" className="truncate font-medium">
          {visibleError}
        </span>
      )}
    </div>
  );
}
