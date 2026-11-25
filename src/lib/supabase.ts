import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { env, supabaseConfigure } from "./env";
import { creerFetchSansRetrogradation } from "./hors-ligne/fetch";
import { cleSessionStockee, lireSessionStockee } from "./hors-ligne/session";

let client: SupabaseClient<Database> | null = null;

/** Client unique, créé à la demande côté navigateur (jamais pendant le pré-rendu). */
export function getSupabase(): SupabaseClient<Database> {
  if (!supabaseConfigure) {
    throw new Error("SUPABASE_NON_CONFIGURE");
  }
  if (!client) {
    const cleSession = cleSessionStockee(env.supabaseUrl!);
    const sessionGardee = () => {
      try {
        return lireSessionStockee(cleSession, window.localStorage) !== null;
      } catch {
        return false;
      }
    };
    client = createClient<Database>(env.supabaseUrl!, env.supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
      global: { fetch: creerFetchSansRetrogradation(env.supabaseAnonKey!, sessionGardee) },
    });
  }
  return client;
}
