import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { env, supabaseConfigure } from "./env";

let client: SupabaseClient<Database> | null = null;

/** Client unique, créé à la demande côté navigateur (jamais pendant le pré-rendu). */
export function getSupabase(): SupabaseClient<Database> {
  if (!supabaseConfigure) {
    throw new Error("SUPABASE_NON_CONFIGURE");
  }
  if (!client) {
    client = createClient<Database>(env.supabaseUrl!, env.supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    });
  }
  return client;
}
