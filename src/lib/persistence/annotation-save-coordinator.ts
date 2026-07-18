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
  private state: SaveState = "idle";
  private error: string | null = null;
  private readonly debouncer;

  constructor(
    persist: (annotation: Annotation) => Promise<Annotation>,
    private readonly onStateChange: SaveStateListener,
    delayMs = 350,
  ) {
    this.debouncer = createKeyedDebouncer(
      async ({ annotation, revision }: PendingAnnotationSave) => {
        try {
          await persist(annotation);
          if (this.revisions.get(annotation.id) === revision) {
            this.revisions.delete(annotation.id);
            this.setState("saved");
          }
        } catch (caughtError) {
          if (this.revisions.get(annotation.id) === revision) {
            this.revisions.delete(annotation.id);
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
    this.setState("saving");
    this.debouncer.schedule(annotation.id, { annotation, revision });
  }

  async flush(annotationId?: string) {
    await this.debouncer.flush(annotationId);
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
