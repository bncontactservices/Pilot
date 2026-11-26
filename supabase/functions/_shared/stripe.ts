// Outils Stripe partagés par les Edge Functions de paiement (Deno) et leurs tests (Vitest, src/lib/stripe.test.ts).
// Aucune dépendance et aucun accès à Deno : tout ce qui vient de l'extérieur (variables, réseau, heure) est passé en
// paramètre. Stripe est appelé par son API REST, sans SDK : peu de code, et chaque appel est visible ici.

export const PLANS = ["starter", "pro"] as const;
export type Plan = (typeof PLANS)[number];
export const PERIODICITES = ["mensuelle", "annuelle"] as const;
export type Periodicite = (typeof PERIODICITES)[number];

/** Lecture d'une variable d'environnement (Deno.env.get côté fonction, objet de test côté Vitest). */
export type Env = (nom: string) => string | undefined;
export type Fetch = typeof fetch;

// Configuration -------------------------------------------------------------------------------------------------

/** Secrets Supabase qui portent les identifiants de prix Stripe (price_…) : ils ne sont pas secrets, mais ils se règlent là. */
export const SECRETS_PRIX: Record<Plan, Record<Periodicite, string>> = {
  starter: { mensuelle: "STRIPE_PRICE_STARTER_MENSUELLE", annuelle: "STRIPE_PRICE_STARTER_ANNUELLE" },
  pro: { mensuelle: "STRIPE_PRICE_PRO_MENSUELLE", annuelle: "STRIPE_PRICE_PRO_ANNUELLE" },
};

const MOTIF_PRIX = /^price_[A-Za-z0-9_]+$/;
const MOTIF_CLE = /^(sk|rk)_(test|live)_[A-Za-z0-9_]+$/;
const MOTIF_SECRET_WEBHOOK = /^whsec_[A-Za-z0-9_+/=]+$/;

export type PrixConfigure = { plan: Plan; periodicite: Periodicite; prixId: string };

export function prixConfigures(env: Env): PrixConfigure[] {
  const liste: PrixConfigure[] = [];
  for (const plan of PLANS) {
    for (const periodicite of PERIODICITES) {
      const valeur = env(SECRETS_PRIX[plan][periodicite])?.trim();
      if (valeur && MOTIF_PRIX.test(valeur)) liste.push({ plan, periodicite, prixId: valeur });
    }
  }
  return liste;
}

export const prixDepuisChoix = (env: Env, plan: Plan, periodicite: Periodicite): string | null =>
  prixConfigures(env).find((p) => p.plan === plan && p.periodicite === periodicite)?.prixId ?? null;

export const choixDepuisPrix = (env: Env, prixId: string): { plan: Plan; periodicite: Periodicite } | null => {
  const trouve = prixConfigures(env).find((p) => p.prixId === prixId);
  return trouve ? { plan: trouve.plan, periodicite: trouve.periodicite } : null;
};

/** Clé secrète Stripe valide (secrète ou restreinte), et le mode qu'elle indique. Une clé publique (pk_) est refusée. */
export function cleStripe(env: Env): { cle: string; mode: "test" | "live" } | null {
  const cle = env("STRIPE_SECRET_KEY")?.trim();
  if (!cle || !MOTIF_CLE.test(cle)) return null;
  return { cle, mode: cle.includes("_test_") ? "test" : "live" };
}

export function secretWebhook(env: Env): string | null {
  const valeur = env("STRIPE_WEBHOOK_SECRET")?.trim();
  return valeur && MOTIF_SECRET_WEBHOOK.test(valeur) ? valeur : null;
}

/** Adresse de l'application : sert aux redirections de Stripe. Jamais prise d'une requête (pas de redirection ouverte). */
export function adresseApp(env: Env): string | null {
  const valeur = env("APP_URL")?.trim().replace(/\/$/, "");
  if (!valeur) return null;
  try {
    const url = new URL(valeur);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return url.protocol === "https:" || (local && url.protocol === "http:") ? url.origin : null;
  } catch {
    return null;
  }
}

// Signature des webhooks ----------------------------------------------------------------------------------------

const hex = (octets: ArrayBuffer): string =>
  Array.from(new Uint8Array(octets), (o) => o.toString(16).padStart(2, "0")).join("");

async function hmacHex(secret: string, message: string): Promise<string> {
  const cle = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(message)));
}

/** Comparaison en temps constant de deux chaînes hexadécimales. */
function egalesEnTempsConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let ecart = 0;
  for (let i = 0; i < a.length; i++) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ecart === 0;
}

/** En-tête `Stripe-Signature` pour un corps donné : sert aux tests, Stripe produit le sien en production. */
export async function signer(corps: string, secret: string, horodatageS: number): Promise<string> {
  return `t=${horodatageS},v1=${await hmacHex(secret, `${horodatageS}.${corps}`)}`;
}

/**
 * Vérifie l'en-tête `Stripe-Signature` (https://docs.stripe.com/webhooks#verify-manually) : le corps doit être le texte
 * brut reçu, non réencodé. Refuse un horodatage éloigné de plus de `toleranceS` secondes (rejeu) et toute signature fausse.
 */
export async function verifierSignature(
  corps: string,
  entete: string | null,
  secret: string,
  maintenantMs: number,
  toleranceS = 300,
): Promise<boolean> {
  if (!entete) return false;
  let horodatage = "";
  const signatures: string[] = [];
  for (const morceau of entete.split(",")) {
    const [cle, ...reste] = morceau.trim().split("=");
    const valeur = reste.join("=");
    if (cle === "t") horodatage = valeur;
    else if (cle === "v1" && valeur) signatures.push(valeur);
  }
  const t = Number(horodatage);
  if (!horodatage || !Number.isFinite(t) || signatures.length === 0) return false;
  if (Math.abs(maintenantMs / 1000 - t) > toleranceS) return false;
  const attendue = await hmacHex(secret, `${horodatage}.${corps}`);
  // On compare à chaque signature fournie (Stripe peut en envoyer plusieurs pendant une rotation de secret).
  return signatures.some((s) => egalesEnTempsConstant(s, attendue));
}

// API REST -------------------------------------------------------------------------------------------------------

/** Encode un objet comme Stripe l'attend : `a[b]=c`, tableaux `a[0][b]=c`, valeurs nulles et indéfinies omises. */
export function encoderFormulaire(valeurs: Record<string, unknown>): string {
  const paires: string[] = [];
  const ajouter = (cle: string, valeur: unknown) => {
    if (valeur === null || valeur === undefined) return;
    if (Array.isArray(valeur)) valeur.forEach((v, i) => ajouter(`${cle}[${i}]`, v));
    else if (typeof valeur === "object")
      for (const [k, v] of Object.entries(valeur as Record<string, unknown>)) ajouter(`${cle}[${k}]`, v);
    else paires.push(`${encodeURIComponent(cle)}=${encodeURIComponent(String(valeur))}`);
  };
  for (const [cle, valeur] of Object.entries(valeurs)) ajouter(cle, valeur);
  return paires.join("&");
}

export class ErreurStripe extends Error {
  constructor(
    readonly statut: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ErreurStripe";
  }
}

/** Appelle l'API de Stripe. La clé ne figure jamais dans un message d'erreur. */
export async function appelerStripe<T = Record<string, unknown>>(
  f: Fetch,
  cle: string,
  methode: "GET" | "POST",
  chemin: string,
  valeurs: Record<string, unknown> = {},
): Promise<T> {
  const corps = encoderFormulaire(valeurs);
  const reponse = await f(`https://api.stripe.com/v1${chemin}${methode === "GET" && corps ? `?${corps}` : ""}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${cle}`,
      ...(methode === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: methode === "POST" ? corps : undefined,
  });
  const json = (await reponse.json().catch(() => null)) as {
    error?: { code?: string; type?: string; message?: string };
  } | null;
  if (!reponse.ok) {
    throw new ErreurStripe(
      reponse.status,
      json?.error?.code ?? json?.error?.type ?? "inconnue",
      json?.error?.message ?? `Réponse ${reponse.status} de Stripe`,
    );
  }
  return json as T;
}

// Événements d'abonnement ----------------------------------------------------------------------------------------

export const STATUTS_ABONNEMENT = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;
export type StatutAbonnement = (typeof STATUTS_ABONNEMENT)[number];

export type AbonnementNormalise = {
  evenementId: string;
  type: string;
  evenementLe: Date;
  client: string;
  abonnement: string;
  /** Organisation portée par les métadonnées de l'abonnement ; absente d'un abonnement créé hors de l'application. */
  org: string | null;
  plan: Plan | null;
  periodicite: Periodicite | null;
  statut: StatutAbonnement;
  periodeFin: Date | null;
  annuleEnFinDePeriode: boolean;
  /** Vrai quand le prix de l'abonnement n'est dans aucun secret configuré : le plan ne peut pas être déduit. */
  prixInconnu: boolean;
};

export const TYPES_ABONNEMENT = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const objet = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const texte = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export type ResultatNormalisation =
  { ok: true; valeur: AbonnementNormalise } | { ok: false; raison: "type_ignore" | "evenement_invalide" };

/** Extrait d'un événement Stripe ce que la base doit connaître. Les autres types d'événements sont ignorés. */
export function normaliserEvenement(evenement: unknown, env: Env): ResultatNormalisation {
  const e = objet(evenement);
  const type = texte(e?.type);
  if (!e || !type) return { ok: false, raison: "evenement_invalide" };
  if (!(TYPES_ABONNEMENT as readonly string[]).includes(type)) return { ok: false, raison: "type_ignore" };

  const id = texte(e.id);
  const cree = typeof e.created === "number" ? e.created : null;
  const o = objet(objet(e.data)?.object);
  const abonnement = texte(o?.id);
  const client = texte(o?.customer) ?? texte(objet(o?.customer)?.id);
  const statut = texte(o?.status);
  if (!id || cree === null || !o || !abonnement || !client || !statut)
    return { ok: false, raison: "evenement_invalide" };
  if (!(STATUTS_ABONNEMENT as readonly string[]).includes(statut)) return { ok: false, raison: "evenement_invalide" };

  const elements = Array.isArray(objet(o.items)?.data) ? (objet(o.items)!.data as unknown[]) : [];
  const premier = objet(elements[0]);
  const prixId = texte(objet(premier?.price)?.id);
  const choix = prixId ? choixDepuisPrix(env, prixId) : null;
  // Selon la version de l'API, la fin de période est sur l'abonnement ou sur son premier élément.
  const fin = typeof o.current_period_end === "number" ? o.current_period_end : premier?.current_period_end;
  const orgBrute = texte(objet(o.metadata)?.org_id);

  return {
    ok: true,
    valeur: {
      evenementId: id,
      type,
      evenementLe: new Date(cree * 1000),
      client,
      abonnement,
      org: orgBrute && UUID.test(orgBrute) ? orgBrute : null,
      plan: choix?.plan ?? null,
      periodicite: choix?.periodicite ?? null,
      statut: type === "customer.subscription.deleted" ? "canceled" : (statut as StatutAbonnement),
      periodeFin: typeof fin === "number" ? new Date(fin * 1000) : null,
      // Une résiliation planifiée s'annonce de deux façons selon la version de l'API et le chemin (portail client, tableau de
      // bord) : `cancel_at_period_end` vrai, ou une date `cancel_at` renseignée. Constaté en réel : le portail de Stripe
      // laisse `cancel_at_period_end` à faux et renseigne `cancel_at`.
      annuleEnFinDePeriode: o.cancel_at_period_end === true || typeof o.cancel_at === "number",
      prixInconnu: choix === null,
    },
  };
}
