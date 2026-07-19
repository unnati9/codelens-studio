"use client";

import type { RealtimeConnectionState } from "@/lib/realtime/presence";
import { useRealtimeStore } from "@/stores/realtime-store";

const labels: Record<RealtimeConnectionState, string> = {
  CONNECTING: "Connecting",
  CONNECTED: "Connected",
  RECONNECTING: "Reconnecting",
  OFFLINE: "Offline",
  FAILED: "Failed",
};

function initials(displayName: string) {
  return displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function RealtimeIndicator({ sessionId }: { sessionId: string | null }) {
  const state = useRealtimeStore((store) => store.connectionState);
  const error = useRealtimeStore((store) => store.error);
  const collaborators = useRealtimeStore((store) => store.collaborators);
  const dotColor =
    state === "CONNECTED"
      ? "bg-emerald-500"
      : state === "OFFLINE" || state === "FAILED"
        ? "bg-red-500"
        : "bg-amber-400";

  return (
    <div
      role="status"
      data-testid="realtime-status"
      data-connection-state={state}
      title={error || `${labels[state]} · ${collaborators.length} online`}
      className="flex items-center gap-2 rounded-full border border-[#dcd8cf] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#5c6068]"
    >
      <span
        className={`h-2 w-2 rounded-full ${dotColor} ${
          state === "CONNECTING" || state === "RECONNECTING" ? "animate-pulse" : ""
        }`}
      />
      <span>{labels[state]}</span>
      {state === "CONNECTED" && (
        <>
          <span aria-hidden="true" className="text-[#c2beb4]">
            ·
          </span>
          <span data-testid="collaborator-count">{collaborators.length} online</span>
          <span className="flex -space-x-1.5" aria-label="Connected collaborators">
            {collaborators.slice(0, 3).map((collaborator) => (
              <span
                key={collaborator.sessionId}
                title={`${collaborator.displayName}${
                  collaborator.sessionId === sessionId ? " (you)" : ""
                }`}
                className="grid h-5 w-5 place-items-center rounded-full border border-white bg-[#e7edf5] text-[8px] font-black text-[#253348]"
              >
                {initials(collaborator.displayName)}
              </span>
            ))}
          </span>
        </>
      )}
    </div>
  );
}
