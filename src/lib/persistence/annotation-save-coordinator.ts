import { createKeyedDebouncer } from "./keyed-debouncer";
import type { Annotation } from "@/lib/validation/annotation";
import type { SaveState } from "@/stores/canvas-ui-store";

type PendingAnnotationSave = {
  annotation: Annotation;
  revision: number;
};

type SaveStateListener = (state: SaveState, error?: string | null) => void;

export class AnnotationSaveCoordinator {
  private readonly revisions = new Map<string, number>();
  private readonly failedSaves = new Map<string, PendingAnnotationSave>();
  private state: SaveState = "idle";
  private error: string | null = null;
  private readonly debouncer;

  constructor(
    persist: (annotation: Annotation) => Promise<Annotation>,
    private readonly onStateChange: SaveStateListener,
    delayMs = 350,
    private readonly onPersisted?: (annotation: Annotation) => void,
  ) {
    this.debouncer = createKeyedDebouncer(
      async ({ annotation, revision }: PendingAnnotationSave) => {
        try {
          const saved = await persist(annotation);
          if (this.revisions.get(annotation.id) === revision) {
            this.onPersisted?.(saved);
            this.revisions.delete(annotation.id);
            this.failedSaves.delete(annotation.id);
            if (this.revisions.size === 0) this.setState("saved");
          }
        } catch (caughtError) {
          if (this.revisions.get(annotation.id) === revision) {
            this.failedSaves.set(annotation.id, { annotation, revision });
            this.setState(
              "failed",
              caughtError instanceof Error ? caughtError.message : "Could not save annotation.",
            );
          }
        }
      },
      delayMs,
    );
  }

  queue(annotation: Annotation) {
    const revision = (this.revisions.get(annotation.id) ?? 0) + 1;
    this.revisions.set(annotation.id, revision);
    this.failedSaves.delete(annotation.id);
    this.setState("saving");
    this.debouncer.schedule(annotation.id, { annotation, revision });
  }

  async flush(annotationId?: string) {
    await this.debouncer.flush(annotationId);
  }

  async retryFailed() {
    const failed = [...this.failedSaves.values()];
    if (failed.length === 0) return;
    this.setState("saving");
    for (const pending of failed) {
      if (this.revisions.get(pending.annotation.id) === pending.revision) {
        this.debouncer.schedule(pending.annotation.id, pending);
      }
    }
    await this.debouncer.flush();
  }

  hasPending(annotationId?: string) {
    return annotationId ? this.revisions.has(annotationId) : this.revisions.size > 0;
  }

  discard(annotationId: string) {
    this.debouncer.cancel(annotationId);
    this.revisions.delete(annotationId);
    this.failedSaves.delete(annotationId);
    if (this.revisions.size === 0) this.setState("saved");
  }

  getSnapshot() {
    return { state: this.state, error: this.error };
  }

  private setState(state: SaveState, error: string | null = null) {
    this.state = state;
    this.error = error;
    this.onStateChange(state, error);
  }
}
