"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBoard } from "@/lib/data/boards";
import { useGuestIdentity } from "@/lib/guest/use-guest-identity";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export function LandingActions() {
  const router = useRouter();
  const { identity } = useGuestIdentity();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

  async function handleCreateBoard() {
    if (!identity || !configured) return;
    setCreating(true);
    setError(null);

    try {
      const board = await createBoard({ title: "Untitled review board", guestId: identity.id });
      router.push(`/boards/${board.id}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not create the board.");
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="landing-create-board"
          onClick={handleCreateBoard}
          disabled={!identity || !configured || creating}
          className="rounded-xl bg-[#ff5a36] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(255,90,54,0.25)] transition hover:-translate-y-0.5 hover:bg-[#e94929] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create a review board"}
        </button>
        <Link
          href="/demo"
          className="rounded-xl border border-[#d8d3c8] bg-white px-5 py-3 text-sm font-bold text-[#15263d] transition hover:border-[#15263d]"
        >
          Open demo board
        </Link>
        <Link
          href="/boards"
          className="px-3 py-3 text-sm font-semibold text-[#575d67] hover:text-[#171a1f]"
        >
          View all boards →
        </Link>
      </div>
      {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
