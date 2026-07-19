import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicKey, SupabaseConfigurationError } from "@/lib/supabase/client";

export function getSupabaseServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = getSupabasePublicKey();

  if (!url || !publicKey) {
    throw new SupabaseConfigurationError();
  }

  return createClient(url, publicKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
