import type { SaveState } from "@/stores/canvas-ui-store";

export type SaveSource = "nodes" | "annotations";

type SourceState = {
  state: SaveState;
  error: string | null;
};

export class CombinedSaveState {
  private readonly sources = new Map<SaveSource, SourceState>([
    ["nodes", { state: "idle", error: null }],
    ["annotations", { state: "idle", error: null }],
  ]);

  constructor(private readonly onStateChange: (state: SaveState, error: string | null) => void) {}

  update(source: SaveSource, state: SaveState, error: string | null = null) {
    this.sources.set(source, { state, error });
    const sources = [...this.sources.values()];
    const failed = sources.find((candidate) => candidate.state === "failed");
    if (failed) {
      this.onStateChange("failed", failed.error);
    } else if (sources.some((candidate) => candidate.state === "saving")) {
      this.onStateChange("saving", null);
    } else if (sources.every((candidate) => candidate.state === "saved")) {
      this.onStateChange("saved", null);
    }
  }

  markAllSaved() {
    this.sources.set("nodes", { state: "saved", error: null });
    this.sources.set("annotations", { state: "saved", error: null });
    this.onStateChange("saved", null);
  }
}
