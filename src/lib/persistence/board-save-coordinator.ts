import { createKeyedDebouncer } from "./keyed-debouncer";
import type { BoardNodeRecord } from "@/lib/validation/board";
import type { SaveState } from "@/stores/canvas-ui-store";

type PendingNodeSave = {
  record: BoardNodeRecord;
  revision: number;
};

type SaveStateListener = (state: SaveState, error?: string | null) => void;

export class BoardSaveCoordinator {
  private readonly revisions = new Map<string, number>();
  private immediateSaveCount = 0;
  private state: SaveState = "idle";
  private error: string | null = null;
  private readonly debouncer;

  constructor(
    persist: (record: BoardNodeRecord) => Promise<BoardNodeRecord>,
    private readonly onStateChange: SaveStateListener,
    delayMs = 550,
  ) {
    this.debouncer = createKeyedDebouncer(async ({ record, revision }: PendingNodeSave) => {
      try {
        await persist(record);
        if (this.revisions.get(record.id) === revision) {
          this.revisions.delete(record.id);
          this.markSavedIfIdle();
        }
      } catch (caughtError) {
        if (this.revisions.get(record.id) === revision) {
          this.revisions.delete(record.id);
          this.setState(
            "failed",
            caughtError instanceof Error ? caughtError.message : "Could not save node.",
          );
        }
      }
    }, delayMs);
  }

  queue(record: BoardNodeRecord) {
    const revision = (this.revisions.get(record.id) ?? 0) + 1;
    this.revisions.set(record.id, revision);
    this.setState("saving");
    this.debouncer.schedule(record.id, { record, revision });
  }

  beginImmediate() {
    this.immediateSaveCount += 1;
    this.setState("saving");
  }

  finishImmediate() {
    this.immediateSaveCount = Math.max(0, this.immediateSaveCount - 1);
    this.markSavedIfIdle();
  }

  failImmediate(message: string) {
    this.immediateSaveCount = Math.max(0, this.immediateSaveCount - 1);
    this.setState("failed", message);
  }

  async flush(nodeId?: string) {
    await this.debouncer.flush(nodeId);
  }

  getSnapshot() {
    return { state: this.state, error: this.error };
  }

  private markSavedIfIdle() {
    if (this.revisions.size === 0 && this.immediateSaveCount === 0) {
      this.setState("saved");
    }
  }

  private setState(state: SaveState, error: string | null = null) {
    this.state = state;
    this.error = error;
    this.onStateChange(state, error);
  }
}
