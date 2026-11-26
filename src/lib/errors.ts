// Traduit les erreurs (base, Auth, réseau, Edge Functions) en clés i18n « erreurs.* ».

export type RessourceQuota = "projects" | "kpis" | "users";
export type ErreurApp = { cle: string; quota?: RessourceQuota };

const CODES_METIER = new Set([
  "ESSAI_EXPIRE",
  "DEMO_READONLY",
  "DEMO_EXISTE",
  "KPI_EPINGLES_MAX",
  "DERNIER_ADMIN",
  "PROJET_INTROUVABLE",
  "KPI_INTROUVABLE",
  "INVITATION_RECENTE",
  "REQUETE_INVALIDE",
  "TROP_D_INVITATIONS",
  "DEJA_MEMBRE",
  "EMAIL_INVALIDE",
  "ACCES_REFUSE",
  "NON_AUTHENTIFIE",
  "INVITATION_IMPOSSIBLE",
  "IMPORT_INVALIDE",
  "IMPORT_LOT_TROP_GRAND",
  "CADRE_PARENT_INVALIDE",
  "RATTACHEMENT_INVALIDE",
  "PROGRAMME_INTROUVABLE",
  "ETIQUETTES_MAX",
  "DOCUMENT_CHEMIN_INVALIDE",
  "LOCALITE_EXISTE",
  "LOCALITE_PARENT_INVALIDE",
  "LOCALITE_NIVEAU_INVALIDE",
  "LOCALITE_INTROUVABLE",
  "LOCALITE_HORS_PROJET",
  "PAIEMENT_NON_CONFIGURE",
  "PAIEMENT_INDISPONIBLE",
  "ABONNEMENT_EXISTE",
  "ABONNEMENT_INTROUVABLE",
  "PLAN_ENTERPRISE",
  "PORTAIL_NON_CONFIGURE",
  "RAPPORTS_NON_CONFIGURES",
  "RAPPORTS_INDISPONIBLES",
  "ENVOI_IMPOSSIBLE",
  "ADRESSE_ABSENTE",
]);

const CODES_AUTH: Record<string, string> = {
  invalid_credentials: "erreurs.auth.identifiants",
  email_not_confirmed: "erreurs.auth.non_confirme",
  user_already_exists: "erreurs.auth.existe",
  email_exists: "erreurs.auth.existe",
  weak_password: "erreurs.auth.mot_de_passe_faible",
  same_password: "erreurs.auth.meme_mot_de_passe",
  over_email_send_rate_limit: "erreurs.auth.trop_de_tentatives",
  over_request_rate_limit: "erreurs.auth.trop_de_tentatives",
  signup_disabled: "erreurs.auth.inscription_fermee",
  otp_expired: "erreurs.auth.lien_expire",
  flow_state_expired: "erreurs.auth.lien_expire",
  flow_state_not_found: "erreurs.auth.lien_expire",
};

const CODES_POSTGRES: Record<string, string> = {
  "23503": "erreurs.element_utilise",
  "23505": "erreurs.doublon",
  "23514": "erreurs.donnees_invalides",
  "42501": "erreurs.acces_refuse",
};

export function analyserErreur(erreur: unknown): ErreurApp {
  const e = (erreur ?? {}) as { code?: string; message?: string; name?: string };
  const message = e.message ?? "";

  if (
    erreur instanceof TypeError ||
    e.name === "AuthRetryableFetchError" ||
    e.name === "FunctionsFetchError" ||
    // Délai dépassé (AbortSignal.timeout) : pour la saisie hors ligne, une requête sans réponse vaut une connexion perdue.
    e.name === "AbortError" ||
    e.name === "TimeoutError" ||
    /failed to fetch|networkerror|load failed|aborterror|timeouterror|signal timed out|fetch failed|network request failed/i.test(
      message,
    )
  ) {
    return { cle: "erreurs.reseau" };
  }
  if (message === "SUPABASE_NON_CONFIGURE") return { cle: "erreurs.configuration" };

  const quota = /^PLAN_LIMIT:(projects|kpis|users)$/.exec(message);
  if (quota) {
    const ressource = quota[1] as RessourceQuota;
    return { cle: `erreurs.PLAN_LIMIT.${ressource}`, quota: ressource };
  }
  if (CODES_METIER.has(message)) return { cle: `erreurs.${message}` };
  if (e.code && CODES_AUTH[e.code]) return { cle: CODES_AUTH[e.code]! };
  if (e.code && CODES_POSTGRES[e.code]) return { cle: CODES_POSTGRES[e.code]! };
  // Erreurs du stockage de fichiers : pas de code Postgres, seulement un message.
  if (/exceeded the maximum allowed size|payload too large/i.test(message))
    return { cle: "erreurs.stockage_trop_gros" };
  if (/mime type .*not supported|invalid_mime_type/i.test(message)) return { cle: "erreurs.stockage_type" };
  if (/row-level security|unauthorized/i.test(message)) return { cle: "erreurs.stockage_refuse" };
  return { cle: "erreurs.inconnue" };
}
