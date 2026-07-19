import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "board-media";

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, database: false, storage: false, message: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const supabase = getSupabaseServerClient();
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
