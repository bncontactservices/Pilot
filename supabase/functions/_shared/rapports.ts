// Logique de l'Edge Function « rapports-programmes » (Lot 4b) : l'envoi du rapport de suivi par e-mail, programmé ou à la
// demande d'un membre. Ce fichier ne dépend ni de Deno ni de supabase-js : la base, le réseau, les variables et l'heure arrivent
// par `Deps`, ce qui permet de tout tester (src/lib/rapports.test.ts) avec une fausse base et une fausse API Resend.
//
// Trois actions :
//   - « cron » : appelée toutes les heures par le planificateur (pg_cron et pg_net) avec le jeton de private.rapports_config.
//     Elle réserve les envois dus, les envoie un par un, et marque le résultat. Sans Resend configuré, elle ne réserve RIEN :
//     les échéances restent dues.
//   - « exemple » : un membre connecté reçoit le rapport MAINTENANT, à sa propre adresse seulement. Au plus un message par
//     membre et par tranche de cinq minutes (clé d'idempotence de Resend).
//   - « etat » : un membre connecté demande si l'envoi est configuré (l'écran n'affiche rien sinon).
// Garde-fous : le destinataire est toujours l'adresse du compte, jamais une adresse reçue ; la clé Resend ne figure ni dans
// une réponse ni dans le journal ; le journal ne contient aucune adresse e-mail.

import { type Cadence, composerRapport, type ContenuRapport } from "./rapport-email.ts";
import { adresseApp, type Env, type Fetch } from "./stripe.ts";

export type Abonne = {
  user_id: string;
  org_id: string;
  email: string;
  nom: string | null;
  org_nom: string;
  frequence: "hebdomadaire" | "mensuelle";
};

export type MembreRapport = { orgId: string; nom: string | null };

export type BaseRapports = {
  verifierJeton(jeton: string): Promise<boolean>;
  utilisateur(jwt: string): Promise<{ id: string; email: string | null } | null>;
  membre(userId: string): Promise<MembreRapport | null>;
  reserver(limite: number): Promise<Abonne[]>;
  marquer(userId: string, envoye: boolean): Promise<void>;
  contenu(orgId: string): Promise<ContenuRapport>;
};

export type DepsRapports = {
  env: Env;
  fetch: Fetch;
  base: BaseRapports;
  maintenant: () => number;
  /** Journal : jamais de clé, de secret ni d'adresse e-mail dans ce qu'on lui passe. */
  journal: (...elements: unknown[]) => void;
};

const ENTETES_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function repondre(statut: number, corps: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...ENTETES_CORS, "Content-Type": "application/json" },
  });
}

export const LIMITE_PAR_PASSAGE = 50;
const CONCURRENCE = 4;
const MOTIF_CLE_RESEND = /^re_[A-Za-z0-9_]+$/;

export type ConfigRapports = { cle: string; expediteur: string; appUrl: string };

/** Resend n'est configuré que si la clé, l'expéditeur et l'adresse de l'application sont valides. */
export function configRapports(env: Env): ConfigRapports | null {
  const cle = env("RESEND_API_KEY")?.trim();
  const expediteur = env("EMAIL_FROM")?.trim();
  const appUrl = adresseApp(env);
  if (!cle || !MOTIF_CLE_RESEND.test(cle)) return null;
  if (!expediteur || expediteur.length > 200 || /[\r\n]/.test(expediteur)) return null;
  if (!appUrl) return null;
  return { cle, expediteur, appUrl };
}

type ResultatEnvoi = { ok: true } | { ok: false; statut: number };

async function envoyer(
  deps: DepsRapports,
  config: ConfigRapports,
  destinataire: string,
  message: { sujet: string; html: string; texte: string },
  cleIdempotence: string,
): Promise<ResultatEnvoi> {
  try {
    const reponse = await deps.fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.cle}`,
        "Content-Type": "application/json",
        "Idempotency-Key": cleIdempotence,
      },
      body: JSON.stringify({
        from: config.expediteur,
        to: [destinataire],
        subject: message.sujet,
        html: message.html,
        text: message.texte,
        headers: { "List-Unsubscribe": `<${new URL("/app/parametres", `${config.appUrl}/`).href}>` },
      }),
    });
    return reponse.ok ? { ok: true } : { ok: false, statut: reponse.status };
  } catch {
    return { ok: false, statut: 0 };
  }
}

const jour = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Le contenu d'une organisation est lu une seule fois par passage, quel que soit le nombre de ses abonnés. */
function lecteurContenu(deps: DepsRapports) {
  const lus = new Map<string, Promise<ContenuRapport>>();
  return (orgId: string) => {
    let promesse = lus.get(orgId);
    if (!promesse) {
      promesse = deps.base.contenu(orgId);
      lus.set(orgId, promesse);
    }
    return promesse;
  };
}

export async function traiterRapports(requete: Request, deps: DepsRapports): Promise<Response> {
  if (requete.method === "OPTIONS") return new Response("ok", { headers: ENTETES_CORS });
  if (requete.method !== "POST") return repondre(405, { erreur: "METHODE_NON_AUTORISEE" });

  let corps: { action?: unknown };
  try {
    corps = await requete.json();
  } catch {
    return repondre(400, { erreur: "REQUETE_INVALIDE" });
  }
  const config = configRapports(deps.env);
  const maintenant = deps.maintenant();

  // --- Planificateur -------------------------------------------------------------------------------------------
  if (corps.action === "cron") {
    const jeton = requete.headers.get("X-Cron-Jeton") ?? "";
    let reconnu = false;
    try {
      reconnu = await deps.base.verifierJeton(jeton);
    } catch (erreur) {
      deps.journal("rapports:jeton", String(erreur));
      return repondre(500, { erreur: "RAPPORTS_INDISPONIBLES" });
    }
    if (!reconnu) return repondre(401, { erreur: "NON_AUTHENTIFIE" });
    // Sans Resend, on ne réserve rien : les échéances restent dues et partiront dès que la configuration sera posée.
    if (!config) return repondre(503, { erreur: "RAPPORTS_NON_CONFIGURES" });

    let abonnes: Abonne[];
    try {
      abonnes = await deps.base.reserver(LIMITE_PAR_PASSAGE);
    } catch (erreur) {
      deps.journal("rapports:reservation", String(erreur));
      return repondre(500, { erreur: "RAPPORTS_INDISPONIBLES" });
    }
    const contenu = lecteurContenu(deps);
    const bilan = { reserves: abonnes.length, envoyes: 0, echecs: 0, abandonnes: 0 };
    let limiteAtteinte = false;
    const file = [...abonnes];

    const traiter = async () => {
      for (let a = file.shift(); a; a = file.shift()) {
        // Resend limite le débit : on s'arrête, les envois non traités restent dus (réservés pour une heure seulement).
        if (limiteAtteinte) {
          bilan.abandonnes += 1;
          continue;
        }
        try {
          const message = composerRapport({
            contenu: await contenu(a.org_id),
            destinataire: a.nom,
            cadence: a.frequence,
            appUrl: config.appUrl,
            date: new Date(maintenant),
          });
          const resultat = await envoyer(deps, config, a.email, message, `rapport-${a.user_id}-${jour(maintenant)}`);
          if (resultat.ok) {
            await deps.base.marquer(a.user_id, true);
            bilan.envoyes += 1;
          } else if (resultat.statut === 429) {
            limiteAtteinte = true;
            bilan.abandonnes += 1;
            deps.journal("rapports:debit_limite");
          } else {
            await deps.base.marquer(a.user_id, false);
            bilan.echecs += 1;
            deps.journal("rapports:envoi_refuse", resultat.statut);
          }
        } catch (erreur) {
          bilan.echecs += 1;
          deps.journal("rapports:traitement", String(erreur));
          await deps.base.marquer(a.user_id, false).catch(() => undefined);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCE, Math.max(1, abonnes.length)) }, traiter));
    deps.journal(
      "rapports:passage",
      `reserves=${bilan.reserves}`,
      `envoyes=${bilan.envoyes}`,
      `echecs=${bilan.echecs}`,
      `abandonnes=${bilan.abandonnes}`,
    );
    return repondre(200, bilan);
  }

  // --- Membre connecté -------------------------------------------------------------------------------------------
  if (corps.action === "etat" || corps.action === "exemple") {
    const jwt = requete.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!jwt) return repondre(401, { erreur: "NON_AUTHENTIFIE" });
    try {
      const utilisateur = await deps.base.utilisateur(jwt);
      if (!utilisateur) return repondre(401, { erreur: "NON_AUTHENTIFIE" });
      if (corps.action === "etat") return repondre(200, { disponible: config !== null });
      if (!config) return repondre(503, { erreur: "RAPPORTS_NON_CONFIGURES" });
      // Le destinataire est l'adresse du compte, jamais une adresse reçue dans la requête.
      if (!utilisateur.email) return repondre(409, { erreur: "ADRESSE_ABSENTE" });
      const membre = await deps.base.membre(utilisateur.id);
      if (!membre) return repondre(403, { erreur: "ACCES_REFUSE" });
      const message = composerRapport({
        contenu: await deps.base.contenu(membre.orgId),
        destinataire: membre.nom,
        cadence: "exemple" as Cadence,
        appUrl: config.appUrl,
        date: new Date(maintenant),
      });
      const tranche = Math.floor(maintenant / (5 * 60 * 1000));
      const resultat = await envoyer(deps, config, utilisateur.email, message, `exemple-${utilisateur.id}-${tranche}`);
      if (!resultat.ok) {
        deps.journal("rapports:exemple_refuse", resultat.statut);
        return repondre(502, { erreur: "ENVOI_IMPOSSIBLE" });
      }
      return repondre(200, { envoye: true });
    } catch (erreur) {
      deps.journal("rapports:membre", String(erreur));
      return repondre(500, { erreur: "RAPPORTS_INDISPONIBLES" });
    }
  }

  return repondre(400, { erreur: "REQUETE_INVALIDE" });
}
