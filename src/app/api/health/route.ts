import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabasePublicKey } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = getSupabasePublicKey();
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "board-media";

  if (!url || !publicKey) {
    return NextResponse.json(
      { ok: false, database: false, storage: false, message: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const supabase = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [databaseResult, storageResult] = await Promise.all([
    supabase.from("boards").select("id", { head: true, count: "exact" }),
    supabase.storage.from(bucket).list("", { limit: 1 }),
  ]);
  const ok = !databaseResult.error && !storageResult.error;

  return NextResponse.json(
    {
      ok,
      database: !databaseResult.error,
      storage: !storageResult.error,
      message: ok ? "CodeLens Studio dependencies are available." : "A dependency check failed.",
    },
    { status: ok ? 200 : 503 },
  );
}
