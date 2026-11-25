// Envoi d'une demande de contact à l'Edge Function `submit-lead`. Pas de supabase-js : la landing n'en embarque pas,
// un simple `fetch` suffit pour une fonction publique.

import type { ChampLead, CodeErreurLead, LeadValide } from "../../supabase/functions/submit-lead/lead";
import { env, supabaseConfigure } from "./env";

export type ResultatEnvoi =
  | { ok: true }
  | { ok: false; raison: "non_configure" | "reseau" | "serveur" | "debit" | "captcha" }
  | {
      ok: false;
      raison: "validation";
      champs: Partial<Record<ChampLead | "type_demande", CodeErreurLead | "inconnu">>;
    };

export async function envoyerLead(
  lead: LeadValide,
  options: { turnstile?: string; piege?: string; signal?: AbortSignal } = {},
): Promise<ResultatEnvoi> {
  if (!supabaseConfigure) return { ok: false, raison: "non_configure" };
  let reponse: Response;
  try {
    reponse = await fetch(`${env.supabaseUrl}/functions/v1/submit-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: env.supabaseAnonKey! },
      body: JSON.stringify({ ...lead, turnstile: options.turnstile, site_web: options.piege ?? "" }),
      signal: options.signal,
    });
  } catch {
    return { ok: false, raison: "reseau" };
  }
  if (reponse.ok) return { ok: true };
  const corps = (await reponse.json().catch(() => ({}))) as { error?: string; champs?: Record<string, string> };
  if (reponse.status === 422 && corps.champs) return { ok: false, raison: "validation", champs: corps.champs as never };
  if (reponse.status === 429) return { ok: false, raison: "debit" };
  if (reponse.status === 403 && corps.error === "CAPTCHA") return { ok: false, raison: "captcha" };
  return { ok: false, raison: "serveur" };
}
