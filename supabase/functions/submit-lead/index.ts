// Edge Function « submit-lead » : reçoit les demandes de la landing (démo, client pilote, Enterprise).
//
// Ordre des contrôles : méthode et taille → validation (mêmes règles que le formulaire, voir lead.ts)
// → champ piège (honeypot) → Turnstile si TURNSTILE_SECRET_KEY est posé → limitation de débit par
// adresse IP → insertion avec la clé service → notification e-mail si RESEND_API_KEY, EMAIL_FROM et
// CONTACT_EMAIL sont posés (sinon l'enregistrement en base suffit).
//
// L'adresse IP n'est jamais stockée en clair : seule une empreinte HMAC-SHA256 est conservée. La clé de
// l'empreinte est IP_HASH_SALT ; à défaut, la clé service (secrète elle aussi), pour qu'une base sans
// sel configuré ne stocke jamais d'empreinte devinable.
//
// Déployée avec verify_jwt désactivé : le formulaire est public (visiteurs sans compte).
//
// Secrets : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (injectés par Supabase) ;
// IP_HASH_SALT, TURNSTILE_SECRET_KEY, RESEND_API_KEY, EMAIL_FROM, CONTACT_EMAIL (facultatifs).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { validerLead } from "./lead.ts";

const ENTETES_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const TAILLE_MAX_CORPS = 10_000;
const DEMANDES_MAX_PAR_HEURE = 5;
const DEMANDES_MAX_PAR_JOUR = 15;

function repondre(statut: number, corps: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...ENTETES_CORS, "Content-Type": "application/json" },
  });
}

function echapperHtml(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function empreinteIp(ip: string, cle: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(cle), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(signature), (o) => o.toString(16).padStart(2, "0")).join("");
}

function adresseIp(requete: Request): string {
  const transmise = requete.headers.get("cf-connecting-ip") ?? requete.headers.get("x-forwarded-for") ?? "";
  return transmise.split(",")[0]?.trim() || "inconnue";
}

async function verifierTurnstile(jeton: unknown, ip: string, secret: string): Promise<boolean> {
  if (typeof jeton !== "string" || jeton === "" || jeton.length > 2048) return false;
  try {
    const reponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: jeton, ...(ip !== "inconnue" ? { remoteip: ip } : {}) }),
    });
    const donnees = (await reponse.json()) as { success?: boolean };
    return donnees.success === true;
  } catch {
    return false;
  }
}

const LIBELLES_TYPE: Record<string, string> = { demo: "Demande de démo", pilote: "Client pilote", enterprise: "Offre Enterprise" };

async function notifier(lead: { type_demande: string; nom: string | null; organisation: string | null; email: string; besoin: string | null }): Promise<void> {
  const cle = Deno.env.get("RESEND_API_KEY");
  const expediteur = Deno.env.get("EMAIL_FROM");
  const destinataire = Deno.env.get("CONTACT_EMAIL");
  if (!cle || !expediteur || !destinataire) return;
  const ligne = (libelle: string, valeur: string | null) =>
    valeur ? `<p style="margin:0 0 8px"><strong>${libelle} :</strong> ${echapperHtml(valeur).replace(/\n/g, "<br>")}</p>` : "";
  try {
    const reponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: expediteur,
        to: [destinataire],
        reply_to: lead.email,
        subject: `${LIBELLES_TYPE[lead.type_demande] ?? "Nouvelle demande"} — ${lead.organisation ?? lead.email}`,
        html: `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#1f2933">${ligne("Type", LIBELLES_TYPE[lead.type_demande] ?? lead.type_demande)}${ligne("Nom", lead.nom)}${ligne("Organisation", lead.organisation)}${ligne("E-mail", lead.email)}${ligne("Besoin", lead.besoin)}</div>`,
      }),
    });
    if (!reponse.ok) console.error("Notification Resend refusée", reponse.status, await reponse.text());
  } catch (erreur) {
    console.error("Notification Resend impossible", erreur);
  }
}

Deno.serve(async (requete) => {
  if (requete.method === "OPTIONS") return new Response("ok", { headers: ENTETES_CORS });
  if (requete.method !== "POST") return repondre(405, { error: "METHODE" });

  const texte = await requete.text();
  if (texte.length > TAILLE_MAX_CORPS) return repondre(413, { error: "TROP_GROS" });
  let corps: Record<string, unknown>;
  try {
    corps = JSON.parse(texte);
    if (typeof corps !== "object" || corps === null || Array.isArray(corps)) throw new Error("objet attendu");
  } catch {
    return repondre(400, { error: "JSON_INVALIDE" });
  }

  const validation = validerLead(corps);
  if (!validation.ok) return repondre(422, { error: "VALIDATION", champs: validation.erreurs });

  // Champ piège : invisible pour une personne, rempli par la plupart des robots. Réponse de succès,
  // sans rien enregistrer, pour ne pas leur apprendre qu'ils ont été repérés.
  if (typeof corps.site_web === "string" && corps.site_web.trim() !== "") return repondre(200, { ok: true });

  const ip = adresseIp(requete);
  const secretTurnstile = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (secretTurnstile && !(await verifierTurnstile(corps.turnstile, ip, secretTurnstile))) {
    return repondre(403, { error: "CAPTCHA" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const cleService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !cleService) {
    console.error("Configuration Supabase manquante");
    return repondre(500, { error: "CONFIGURATION" });
  }
  const supabase = createClient(url, cleService, { auth: { persistSession: false } });
  const ipHash = await empreinteIp(ip, Deno.env.get("IP_HASH_SALT") || cleService);

  const depuis = (heures: number) => new Date(Date.now() - heures * 3_600_000).toISOString();
  const [parHeure, parJour] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", depuis(1)),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", depuis(24)),
  ]);
  if (parHeure.error || parJour.error) {
    console.error("Lecture de la limite de débit impossible", parHeure.error ?? parJour.error);
    return repondre(500, { error: "ENREGISTREMENT" });
  }
  if ((parHeure.count ?? 0) >= DEMANDES_MAX_PAR_HEURE || (parJour.count ?? 0) >= DEMANDES_MAX_PAR_JOUR) {
    return repondre(429, { error: "TROP_DE_DEMANDES" });
  }

  const { error } = await supabase.from("leads").insert({ ...validation.valeur, ip_hash: ipHash });
  if (error) {
    console.error("Enregistrement de la demande impossible", error);
    return repondre(500, { error: "ENREGISTREMENT" });
  }

  await notifier(validation.valeur);
  return repondre(200, { ok: true });
});
