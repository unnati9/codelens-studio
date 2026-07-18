"use client";

import { useCanvasUiStore, type SaveState } from "@/stores/canvas-ui-store";

const labels: Record<SaveState, string> = {
  idle: "Ready",
  saving: "Saving…",
  saved: "Saved",
  failed: "Save failed",
};

export function SaveIndicator() {
  const state = useCanvasUiStore((store) => store.saveState);
  const error = useCanvasUiStore((store) => store.saveError);
  const color =
    state === "failed" ? "bg-red-500" : state === "saving" ? "bg-amber-400" : "bg-emerald-500";

  return (
    <div
      title={error || labels[state]}
      role="status"
      data-testid="save-state"
      data-save-state={state}
      className={`flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-xs font-bold ${
        state === "failed"
          ? "max-w-[360px] border-red-200 text-red-700"
          : "border-[#dcd8cf] text-[#5c6068]"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${color} ${state === "saving" ? "animate-pulse" : ""}`}
      />
      <span>{labels[state]}</span>
      {state === "failed" && error && (
        <span data-testid="save-error" className="truncate font-medium">
          {error}
        </span>
      )}
    </div>
  );
}
