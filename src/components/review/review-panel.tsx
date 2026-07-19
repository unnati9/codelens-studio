"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { GuestIdentity } from "@/lib/guest/identity";
import type { Annotation } from "@/lib/validation/annotation";
import type { ReviewThread, ThreadStatus } from "@/lib/validation/review";

type ReviewPanelProps = {
  annotations: Annotation[];
  identity: GuestIdentity;
  threads: ReviewThread[];
  selectedAnnotationId: string | null;
  filter: ThreadStatus;
  openCount: number;
  resolvedCount: number;
  onFilterChange: (filter: ThreadStatus) => void;
  onClose: () => void;
  onShowAll: () => void;
  onSelectThread: (thread: ReviewThread) => void;
  onCreateThread: (annotationId: string, body: string) => Promise<void>;
  onReply: (threadId: string, body: string) => Promise<void>;
  onStatusChange: (thread: ReviewThread, status: ThreadStatus) => Promise<void>;
};

function formatActivity(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function CommentComposer({
  label,
  onSubmit,
}: {
  label: string;
  onSubmit: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setBody("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Comment could not be sent.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div>
      <label className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7e8187]">
        {label}
      </label>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={4}
        maxLength={10_000}
        placeholder="Write a review comment…"
        className="mt-2 w-full resize-y rounded-xl border border-[#d8d4cb] bg-white px-3 py-2.5 text-sm leading-5 text-[#253348] outline-none focus:border-[#ff5a36]"
      />
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[10px] text-[#92949a]">Ctrl/Cmd+Enter</span>
        <button
          type="button"
          disabled={!body.trim() || sending}
          onClick={() => void submit()}
          className="rounded-lg bg-[#15263d] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

export function ReviewPanel({
  annotations,
  identity,
  threads,
  selectedAnnotationId,
  filter,
  openCount,
  resolvedCount,
  onFilterChange,
  onClose,
  onShowAll,
  onSelectThread,
  onCreateThread,
  onReply,
  onStatusChange,
}: ReviewPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedAnnotation = useMemo(
    () => annotations.find((annotation) => annotation.id === selectedAnnotationId) ?? null,
    [annotations, selectedAnnotationId],
  );
  const selectedThread = useMemo(
    () => threads.find((thread) => thread.annotationId === selectedAnnotationId) ?? null,
    [selectedAnnotationId, threads],
  );
  const filteredThreads = threads.filter((thread) => thread.status === filter);

  useEffect(() => {
    if (selectedThread) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [selectedThread, selectedThread?.comments.length]);

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-[#dedbd2] bg-[#fffdf8]">
      <div className="border-b border-[#e3dfd6] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-[#253348]">Review comments</h2>
          <button
            type="button"
            aria-label="Close comments"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-lg text-[#777b82] hover:bg-[#efede7]"
          >
            ×
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(["OPEN", "RESOLVED"] as const).map((status) => {
            const count = status === "OPEN" ? openCount : resolvedCount;
            return (
              <button
                key={status}
                type="button"
                onClick={() => {
                  onShowAll();
                  onFilterChange(status);
                }}
                className={`rounded-lg px-3 py-2 text-xs font-bold ${
                  filter === status && !selectedAnnotation
                    ? "bg-[#15263d] text-white"
                    : "bg-[#efede7] text-[#5c626b]"
                }`}
              >
                {status === "OPEN" ? "Open" : "Resolved"} {count}
              </button>
            );
          })}
        </div>
      </div>

      {selectedAnnotation ? (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
          <button
            type="button"
            onClick={onShowAll}
            className="text-xs font-bold text-[#59616d] hover:text-[#15263d]"
          >
            ← All threads
          </button>
          <div className="mt-4 rounded-xl border border-[#dedad1] bg-[#f4f2ed] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#ff5a36]">
                {selectedAnnotation.tool}
              </span>
              <span className="text-[10px] font-bold text-[#8a8d92]">
                {selectedAnnotation.targetType === "NODE" ? "Node annotation" : "Workspace"}
              </span>
            </div>
          </div>

          {selectedThread ? (
            <>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                    selectedThread.status === "OPEN"
                      ? "bg-orange-100 text-orange-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {selectedThread.status}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void onStatusChange(
                      selectedThread,
                      selectedThread.status === "OPEN" ? "RESOLVED" : "OPEN",
                    )
                  }
                  className="rounded-lg border border-[#d6d2c9] bg-white px-3 py-1.5 text-xs font-bold text-[#535b66]"
                >
                  {selectedThread.status === "OPEN" ? "Resolve" : "Reopen"}
                </button>
              </div>
              <ol className="mt-4 space-y-3">
                {selectedThread.comments.map((comment) => (
                  <li key={comment.id} className="rounded-xl border border-[#e1ddd4] bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-xs font-black text-[#253348]">
                        {comment.authorName}
                      </span>
                      <time className="shrink-0 text-[10px] text-[#92949a]">
                        {formatActivity(comment.createdAt)}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-5 text-[#4d5663]">
                      {comment.body}
                    </p>
                  </li>
                ))}
              </ol>
              <div className="mt-5 border-t border-[#e1ddd4] pt-4">
                <CommentComposer
                  label={`Reply as ${identity.displayName}`}
                  onSubmit={(body) => onReply(selectedThread.id, body)}
                />
              </div>
            </>
          ) : (
            <div className="mt-5">
              <p className="mb-4 text-sm leading-6 text-[#6e7178]">
                This annotation does not have a review thread yet. Add the first comment to create
                one.
              </p>
              <CommentComposer
                label={`Start thread as ${identity.displayName}`}
                onSubmit={(body) => onCreateThread(selectedAnnotation.id, body)}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {filteredThreads.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#d5d1c7] p-5 text-sm leading-6 text-[#85878c]">
              No {filter.toLowerCase()} comment threads. Select an annotation on the canvas to start
              one.
            </div>
          ) : (
            <ol className="space-y-3">
              {filteredThreads.map((thread) => {
                const annotation = annotations.find(
                  (candidate) => candidate.id === thread.annotationId,
                );
                const latest = thread.comments.at(-1);
                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      onClick={() => onSelectThread(thread)}
                      className="w-full rounded-xl border border-[#e1ddd4] bg-white p-3 text-left hover:border-[#ff9c86]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#ff5a36]">
                          {annotation?.tool ?? "Annotation"}
                        </span>
                        <time className="text-[10px] text-[#92949a]">
                          {formatActivity(thread.latestActivityAt)}
                        </time>
                      </div>
                      <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-5 text-[#4d5663]">
                        {latest?.body ?? "No messages yet"}
                      </p>
                      <p className="mt-2 text-[10px] font-bold text-[#8a8d92]">
                        {thread.comments.length}{" "}
                        {thread.comments.length === 1 ? "message" : "messages"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </aside>
  );
}
