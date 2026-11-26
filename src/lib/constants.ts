import type { Enums } from "./database.types";

export const NOM_PRODUIT = "Pilot M&E";
export const BASELINE = "Pilotez vos projets avec des données fiables, en temps réel.";

/** Durée de l'essai (variable {{TRIAL_DAYS}}). À garder égale à private.duree_essai_jours(). */
export const DUREE_ESSAI_JOURS = 14;
/** Bandeau de compte à rebours affiché à partir de J-3. */
export const ALERTE_FIN_ESSAI_JOURS = 3;

type Ressource = "projects" | "kpis" | "users";

/** Miroir de private.limite_plan() ; null = illimité. */
export const LIMITES_PLAN: Record<Enums<"plan_org">, Record<Ressource, number | null>> = {
  essai: { projects: 3, kpis: 20, users: 5 },
  starter: { projects: 1, kpis: 5, users: 1 },
  pro: { projects: 3, kpis: 20, users: 5 },
  enterprise: { projects: null, kpis: null, users: null },
};

/** Seuils de statut KPI (paramétrables au Lot 2). */
export const SEUIL_VERT = 90;
export const SEUIL_AMBRE = 60;

/**
 * Prix mensuels en euros : la devise de Stripe (compte en France, DECISIONS.md section 25), donc celle de la landing, du
 * diaporama et des conditions. Les montants sont provisoires (PLACEHOLDERS.md) et doivent rester ceux des prix créés dans Stripe.
 * Le franc CFA (XOF) est arrimé à l'euro par une parité fixe officielle : 1 € = 655,957 FCFA. Ce n'est pas un taux de change
 * à tenir à jour, seulement un équivalent indicatif affiché.
 */
export const PRIX_MENSUEL_EUR = { starter: 25, pro: 50 } as const;
export const TAUX_EUR_XOF = 655.957;
export const REMISE_ANNUELLE = 0.2;

/** Durée d'une période de saisie, en jours, selon la fréquence d'un indicateur. */
export const PERIODE_FREQUENCE_JOURS: Record<Enums<"frequence_kpi">, number> = {
  hebdomadaire: 7,
  mensuelle: 30,
  trimestrielle: 91,
  annuelle: 365,
};

/** Badge « Saisie en retard » : dernière saisie plus ancienne que ce multiple de la période. */
export const RETARD_SAISIE_FACTEUR = 1.5;

/** Valeur aberrante : seuils de la règle (brief 9.5). */
export const ABERRANT_MIN_HISTORIQUE = 5;
export const ABERRANT_ECARTS_TYPES = 3;
export const ABERRANT_ECART_RELATIF = 0.5;

/** Un tableau de bord épingle au plus ce nombre d'indicateurs (miroir de la contrainte SQL). */
export const MAX_KPI_EPINGLES = 4;

/** Import de fichiers : limites de taille et taille d'un lot envoyé à la base (la fonction SQL refuse plus de 500). */
export const IMPORT_MAX_OCTETS = 10 * 1024 * 1024;
export const IMPORT_MAX_LIGNES = 20_000;
export const IMPORT_MAX_COLONNES = 60;
export const IMPORT_TAILLE_LOT = 500;
/** Lignes de l'aperçu affiché avant l'import. */
export const IMPORT_LIGNES_APERCU = 10;
