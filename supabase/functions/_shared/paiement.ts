// Logique des trois Edge Functions de paiement : stripe-checkout (état du paiement en ligne et début d'une souscription),
// stripe-portal (portail client de Stripe) et stripe-webhook (événements d'abonnement). Ce fichier ne dépend ni de Deno ni
// de supabase-js : la base, le réseau, les variables et l'heure arrivent par `Deps`, ce qui permet de tout tester
// (src/lib/paiement.test.ts) avec une fausse API Stripe. Les fichiers index.ts des fonctions ne font que le branchement.
//
// Garde-fous : le paiement en ligne n'est « disponible » que si la clé, l'adresse de l'application et au moins un prix valide
// sont configurés, et que Stripe confirme ce prix ; sinon l'application n'en montre rien. Seul un administrateur de
// l'organisation peut souscrire ou ouvrir le portail. Les redirections ne reposent que sur APP_URL (jamais sur la requête).

import { entetesCors } from "./cors.ts";
import {
  type AbonnementNormalise,
  adresseApp,
  appelerStripe,
  cleStripe,
  ErreurStripe,
  type Env,
  type Fetch,
  normaliserEvenement,
  PERIODICITES,
  type Periodicite,
  PLANS,
  type Plan,
  prixConfigures,
  prixDepuisChoix,
  secretWebhook,
  verifierSignature,
} from "./stripe.ts";

export type Membre = { orgId: string; role: string; orgNom: string; plan: string };
export type EtatAbonnement = { client: string; abonnement: string | null; statut: string };

/** Ce que les fonctions demandent à la base ; l'implémentation (supabase-js) est dans _shared/base.ts. */
export type Base = {
  utilisateur(jwt: string): Promise<{ id: string; email: string | null } | null>;
  membre(userId: string): Promise<Membre | null>;
  abonnement(orgId: string): Promise<EtatAbonnement | null>;
  /** Lie un client Stripe à l'organisation ; renvoie le client retenu (le premier lié l'emporte). */
  lierClient(orgId: string, client: string): Promise<string>;
  appliquer(abonnement: AbonnementNormalise): Promise<string>;
};

export type Deps = {
  env: Env;
  fetch: Fetch;
  base: Base;
  maintenant: () => number;
  /** Journal des erreurs : jamais de clé ni de secret dans ce qu'on lui passe. */
  journal: (...elements: unknown[]) => void;
};

/** Réponse JSON ; `cors` vient de entetesCors (_shared/cors.ts), et reste vide pour le webhook, qu'aucun navigateur n'appelle. */
function repondreAvec(statut: number, corps: Record<string, unknown>, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

type Authentification = { ok: true; email: string | null; membre: Membre } | { ok: false; reponse: Response };

/** L'appelant doit être un utilisateur connecté, administrateur de son organisation. */
async function authentifierAdmin(requete: Request, deps: Deps): Promise<Authentification> {
  const cors = entetesCors(requete, deps.env);
  const repondre = (statut: number, corps: Record<string, unknown>) => repondreAvec(statut, corps, cors);
  const jwt = requete.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return { ok: false, reponse: repondre(401, { erreur: "NON_AUTHENTIFIE" }) };
  try {
    const utilisateur = await deps.base.utilisateur(jwt);
    if (!utilisateur) return { ok: false, reponse: repondre(401, { erreur: "NON_AUTHENTIFIE" }) };
    const membre = await deps.base.membre(utilisateur.id);
    // Une panne de base ne doit jamais passer pour un refus de droits : elle lève, et on répond 500 plus bas.
    if (!membre || membre.role !== "admin") return { ok: false, reponse: repondre(403, { erreur: "ACCES_REFUSE" }) };
    return { ok: true, email: utilisateur.email, membre };
  } catch (erreur) {
    deps.journal("paiement:authentification", String(erreur));
    return { ok: false, reponse: repondre(500, { erreur: "PAIEMENT_INDISPONIBLE" }) };
  }
}

const estUrlStripe = (valeur: unknown): valeur is string => {
  if (typeof valeur !== "string") return false;
  try {
    const url = new URL(valeur);
    return url.protocol === "https:" && (url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com"));
  } catch {
    return false;
  }
};

// stripe-checkout ----------------------------------------------------------------------------------------------

export type PlanProposable = { plan: Plan; periodicite: Periodicite; montant: number; devise: string };

type PrixStripe = {
  active?: boolean;
  type?: string;
  unit_amount?: number | null;
  currency?: string;
  recurring?: { interval?: string; interval_count?: number } | null;
};

/** Un prix n'est proposé que si Stripe le confirme : actif, récurrent, à la bonne période, avec un montant. */
async function lirePrix(deps: Deps, cle: string, plan: Plan, periodicite: Periodicite, prixId: string) {
  try {
    const prix = await appelerStripe<PrixStripe>(deps.fetch, cle, "GET", `/prices/${prixId}`);
    const intervalle = periodicite === "mensuelle" ? "month" : "year";
    const valide =
      prix.active === true &&
      prix.type === "recurring" &&
      prix.recurring?.interval === intervalle &&
      (prix.recurring?.interval_count ?? 1) === 1 &&
      Number.isInteger(prix.unit_amount) &&
      (prix.unit_amount as number) > 0 &&
      typeof prix.currency === "string";
    if (!valide) {
      deps.journal("paiement:prix_invalide", plan, periodicite);
      return null;
    }
    return { plan, periodicite, montant: prix.unit_amount as number, devise: (prix.currency as string).toUpperCase() };
  } catch (erreur) {
    deps.journal(
      "paiement:prix_illisible",
      plan,
      periodicite,
      erreur instanceof ErreurStripe ? erreur.code : String(erreur),
    );
    return null;
  }
}

export async function traiterPaiement(requete: Request, deps: Deps): Promise<Response> {
  const cors = entetesCors(requete, deps.env);
  const repondre = (statut: number, corps: Record<string, unknown>) => repondreAvec(statut, corps, cors);
  if (requete.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (requete.method !== "POST") return repondre(405, { erreur: "METHODE_NON_AUTORISEE" });
  const auth = await authentifierAdmin(requete, deps);
  if (!auth.ok) return auth.reponse;

  let corps: { action?: unknown; plan?: unknown; periodicite?: unknown };
  try {
    corps = await requete.json();
  } catch {
    return repondre(400, { erreur: "REQUETE_INVALIDE" });
  }

  const cle = cleStripe(deps.env);
  const app = adresseApp(deps.env);

  if (corps.action === "etat") {
    const prix = prixConfigures(deps.env);
    if (!cle || !app || prix.length === 0) return repondre(200, { disponible: false });
    const lus = await Promise.all(prix.map((p) => lirePrix(deps, cle.cle, p.plan, p.periodicite, p.prixId)));
    const plans = lus.filter((p): p is PlanProposable => p !== null);
    if (plans.length === 0) return repondre(200, { disponible: false });
    return repondre(200, { disponible: true, mode: cle.mode, plans });
  }

  if (corps.action !== "souscrire") return repondre(400, { erreur: "REQUETE_INVALIDE" });
  const plan = (PLANS as readonly unknown[]).includes(corps.plan) ? (corps.plan as Plan) : null;
  const periodicite = (PERIODICITES as readonly unknown[]).includes(corps.periodicite)
    ? (corps.periodicite as Periodicite)
    : null;
  if (!plan || !periodicite) return repondre(400, { erreur: "REQUETE_INVALIDE" });
  const prixId = prixDepuisChoix(deps.env, plan, periodicite);
  if (!cle || !app || !prixId) return repondre(503, { erreur: "PAIEMENT_NON_CONFIGURE" });
  const { membre } = auth;
  // Un plan activé à la main (enterprise) ne se remplace pas par un abonnement en ligne.
  if (membre.plan === "enterprise") return repondre(409, { erreur: "PLAN_ENTERPRISE" });

  try {
    const existant = await deps.base.abonnement(membre.orgId);
    if (existant && ["active", "trialing", "past_due"].includes(existant.statut)) {
      return repondre(409, { erreur: "ABONNEMENT_EXISTE" });
    }
    let client = existant?.client;
    if (!client) {
      const cree = await appelerStripe<{ id?: string }>(deps.fetch, cle.cle, "POST", "/customers", {
        email: auth.email,
        name: membre.orgNom,
        metadata: { org_id: membre.orgId },
      });
      if (!cree.id) throw new Error("Client Stripe sans identifiant");
      client = await deps.base.lierClient(membre.orgId, cree.id);
    }
    const session = await appelerStripe<{ url?: string }>(deps.fetch, cle.cle, "POST", "/checkout/sessions", {
      mode: "subscription",
      customer: client,
      client_reference_id: membre.orgId,
      line_items: [{ price: prixId, quantity: 1 }],
      success_url: `${app}/app/parametres?paiement=succes`,
      cancel_url: `${app}/app/parametres?paiement=annule`,
      locale: "fr",
      billing_address_collection: "auto",
      metadata: { org_id: membre.orgId },
      subscription_data: { metadata: { org_id: membre.orgId, plan, periodicite } },
    });
    if (!estUrlStripe(session.url)) throw new Error("Adresse de paiement inattendue");
    return repondre(200, { url: session.url });
  } catch (erreur) {
    deps.journal(
      "paiement:souscrire",
      erreur instanceof ErreurStripe ? `${erreur.statut} ${erreur.code}` : String(erreur),
    );
    return repondre(502, { erreur: "PAIEMENT_INDISPONIBLE" });
  }
}

// stripe-portal ------------------------------------------------------------------------------------------------

export async function traiterPortail(requete: Request, deps: Deps): Promise<Response> {
  const cors = entetesCors(requete, deps.env);
  const repondre = (statut: number, corps: Record<string, unknown>) => repondreAvec(statut, corps, cors);
  if (requete.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (requete.method !== "POST") return repondre(405, { erreur: "METHODE_NON_AUTORISEE" });
  const auth = await authentifierAdmin(requete, deps);
  if (!auth.ok) return auth.reponse;

  const cle = cleStripe(deps.env);
  const app = adresseApp(deps.env);
  if (!cle || !app) return repondre(503, { erreur: "PAIEMENT_NON_CONFIGURE" });

  try {
    const abonnement = await deps.base.abonnement(auth.membre.orgId);
    if (!abonnement) return repondre(404, { erreur: "ABONNEMENT_INTROUVABLE" });
    const session = await appelerStripe<{ url?: string }>(deps.fetch, cle.cle, "POST", "/billing_portal/sessions", {
      customer: abonnement.client,
      return_url: `${app}/app/parametres`,
    });
    if (!estUrlStripe(session.url)) throw new Error("Adresse du portail inattendue");
    return repondre(200, { url: session.url });
  } catch (erreur) {
    deps.journal(
      "paiement:portail",
      erreur instanceof ErreurStripe ? `${erreur.statut} ${erreur.code}` : String(erreur),
    );
    // Tant que les réglages du portail ne sont pas enregistrés dans Stripe, il refuse de créer une session.
    if (erreur instanceof ErreurStripe && erreur.statut === 400 && /portal/i.test(erreur.message)) {
      return repondre(409, { erreur: "PORTAIL_NON_CONFIGURE" });
    }
    return repondre(502, { erreur: "PAIEMENT_INDISPONIBLE" });
  }
}

// stripe-webhook -----------------------------------------------------------------------------------------------

export async function traiterWebhook(requete: Request, deps: Deps): Promise<Response> {
  // Appelé par Stripe, jamais par un navigateur : aucun en-tête CORS.
  const repondre = (statut: number, corps: Record<string, unknown>) => repondreAvec(statut, corps);
  if (requete.method !== "POST") return repondre(405, { erreur: "METHODE_NON_AUTORISEE" });
  const secret = secretWebhook(deps.env);
  if (!secret) return repondre(503, { erreur: "PAIEMENT_NON_CONFIGURE" });

  // Le corps brut, tel que reçu : la signature porte sur ces octets exacts.
  const brut = await requete.text();
  const valide = await verifierSignature(brut, requete.headers.get("stripe-signature"), secret, deps.maintenant());
  if (!valide) return repondre(400, { erreur: "SIGNATURE_INVALIDE" });

  let evenement: unknown;
  try {
    evenement = JSON.parse(brut);
  } catch {
    return repondre(400, { erreur: "REQUETE_INVALIDE" });
  }
  const normalise = normaliserEvenement(evenement, deps.env);
  // Un type d'événement qui ne nous concerne pas est acquitté : Stripe n'a pas à le renvoyer.
  if (!normalise.ok) {
    if (normalise.raison === "evenement_invalide") deps.journal("webhook:evenement_invalide");
    return repondre(200, { recu: true, traite: false, raison: normalise.raison });
  }
  const abonnement = normalise.valeur;
  if (abonnement.prixInconnu && ["active", "trialing", "past_due"].includes(abonnement.statut)) {
    // Abonnement valide dont le prix n'est dans aucun secret : le plan ne peut pas être déduit, on le dit dans le journal.
    deps.journal("webhook:prix_inconnu", abonnement.abonnement);
  }
  try {
    const resultat = await deps.base.appliquer(abonnement);
    // Trace sans donnée personnelle ni secret : de quoi suivre un abonnement dans les journaux.
    deps.journal(
      "webhook:abonnement",
      abonnement.type,
      abonnement.statut,
      `fin_planifiee=${abonnement.annuleEnFinDePeriode}`,
      String(resultat),
    );
    return repondre(200, { recu: true, traite: true, resultat });
  } catch (erreur) {
    // Une panne de base : on répond 500 pour que Stripe renvoie l'événement.
    deps.journal("webhook:application", String(erreur));
    return repondre(500, { erreur: "TRAITEMENT_IMPOSSIBLE" });
  }
}
