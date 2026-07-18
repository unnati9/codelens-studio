"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { createBoard, listBoards } from "@/lib/data/boards";
import { useGuestIdentity } from "@/lib/guest/use-guest-identity";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { Board } from "@/lib/validation/board";
import { Brand } from "@/components/ui/brand";
import { ConfigNotice } from "@/components/ui/config-notice";

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function BoardsPage() {
  const { identity } = useGuestIdentity();
  const [boards, setBoards] = useState<Board[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

  const loadBoards = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setBoards(await listBoards());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not load boards.");
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBoards();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadBoards]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identity || !title.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const board = await createBoard({ title, guestId: identity.id });
      setBoards((current) => [board, ...current]);
      setTitle("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not create the board.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f2ed]">
      <header className="border-b border-[#dedbd2] bg-[#fffdf8]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Brand />
          <span className="text-sm font-medium text-[#686b72]">
            {identity?.displayName ?? "Preparing guest…"}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff5a36]">
              Workspace
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-[-0.04em] text-[#15263d]">
              Review boards
            </h1>
            <p className="mt-3 text-[#686b72]">Open a saved canvas or start a focused review.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex w-full max-w-xl gap-2">
            <label className="sr-only" htmlFor="board-title">
              Board title
            </label>
            <input
              id="board-title"
              data-testid="board-title-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Board title"
              maxLength={120}
              disabled={!configured || submitting}
              className="min-w-0 flex-1 rounded-xl border border-[#d8d3c8] bg-white px-4 py-3 text-sm shadow-sm placeholder:text-[#9a9da2]"
            />
            <button
              type="submit"
              data-testid="create-board-button"
              disabled={!identity || !configured || submitting || !title.trim()}
              className="rounded-xl bg-[#15263d] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create board"}
            </button>
          </form>
        </div>

        {!configured && (
          <div className="mt-8">
            <ConfigNotice />
          </div>
        )}
        {error && (
          <div className="mt-8 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <span>{error}</span>
            <button type="button" onClick={() => void loadBoards()} className="font-bold underline">
              Retry
            </button>
          </div>
        )}

        <section className="mt-10 overflow-hidden rounded-2xl border border-[#dcd8cf] bg-[#fffdf8] shadow-sm">
          <div className="grid grid-cols-[1fr_120px_190px_90px] gap-4 border-b border-[#e3dfd6] px-6 py-3 text-[11px] font-black uppercase tracking-widest text-[#84868b]">
            <span>Board title</span>
            <span>Status</span>
            <span>Updated</span>
            <span />
          </div>
          {loading ? (
            <div className="p-10 text-center text-sm text-[#74777d]">Loading saved boards…</div>
          ) : boards.length === 0 ? (
            <div className="p-12 text-center">
              <p className="font-bold text-[#15263d]">No review boards yet</p>
              <p className="mt-2 text-sm text-[#74777d]">
                Create the first board using the form above.
              </p>
            </div>
          ) : (
            boards.map((board) => (
              <article
                key={board.id}
                data-testid="board-row"
                data-board-id={board.id}
                className="grid grid-cols-[1fr_120px_190px_90px] items-center gap-4 border-b border-[#ebe7de] px-6 py-5 last:border-0"
              >
                <div className="min-w-0">
                  <h2 className="truncate font-bold text-[#202a38]">{board.title}</h2>
                  <p className="mt-1 truncate text-xs text-[#8a8c91]">
                    {board.description || "No description"}
                  </p>
                </div>
                <span className="w-fit rounded-full bg-[#e8edf3] px-2.5 py-1 text-[10px] font-black tracking-wide text-[#435268]">
                  {board.status.replace("_", " ")}
                </span>
                <time className="text-sm text-[#6e7178]" dateTime={board.updated_at}>
                  {formatUpdatedAt(board.updated_at)}
                </time>
                <Link
                  href={`/boards/${board.id}`}
                  data-testid="open-board-link"
                  className="text-sm font-bold text-[#e94929] hover:underline"
                >
                  Open →
                </Link>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
