// Calculs des indicateurs (KPI). Fonctions pures, seule source de calcul au Lot 1 :
// tableau de bord, cartes projet, projet exemple et rapports PDF les utilisent toutes.
// Règles : brief v3, section 6.4, et DECISIONS.md section 8 (statut = écart à la trajectoire).

import {
  ABERRANT_ECART_RELATIF,
  ABERRANT_ECARTS_TYPES,
  ABERRANT_MIN_HISTORIQUE,
  PERIODE_FREQUENCE_JOURS,
  RETARD_SAISIE_FACTEUR,
  SEUIL_AMBRE,
  SEUIL_VERT,
} from "./constants";
import type { Enums } from "./database.types";

export type Sens = Enums<"sens_kpi">;
export type Agregation = Enums<"agregation_kpi">;
export type Frequence = Enums<"frequence_kpi">;
/** ok = vert, warn = ambre, alert = rouge, none = aucune donnée. */
export type StatutKpi = "ok" | "warn" | "alert" | "none";

export type KpiDef = {
  cible: number;
  valeur_base: number;
  sens: Sens;
  type_agregation: Agregation;
  frequence: Frequence;
};
/** Date au format ISO « aaaa-mm-jj ». */
export type Saisie = { date: string; valeur: number };
/** Fin incluse ; `debut` nul = depuis le début du projet. */
export type Periode = { debut: string | null; fin: string };
export type ProjetDates = { date_debut: string; date_fin: string };
export type Seuils = { vert: number; ambre: number };

export const SEUILS_PAR_DEFAUT: Seuils = { vert: SEUIL_VERT, ambre: SEUIL_AMBRE };

// -----------------------------------------------------------------------------
// Dates (jours entiers en UTC : aucun décalage de fuseau ni d'heure d'été)
// -----------------------------------------------------------------------------

const MS_PAR_JOUR = 86_400_000;

export function numeroJour(iso: string): number {
  const [annee, mois, jour] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(annee!, mois! - 1, jour!) / MS_PAR_JOUR);
}

export function isoDepuisJour(numero: number): string {
  return new Date(numero * MS_PAR_JOUR).toISOString().slice(0, 10);
}

export function ajouterJours(iso: string, jours: number): string {
  return isoDepuisJour(numeroJour(iso) + jours);
}

/** Date du jour, dans le fuseau de l'utilisateur, au format ISO. */
export function aujourdhuiIso(maintenant = new Date()): string {
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${maintenant.getFullYear()}-${deux(maintenant.getMonth() + 1)}-${deux(maintenant.getDate())}`;
}

// -----------------------------------------------------------------------------
// Valeur, pourcentage d'atteinte, trajectoire
// -----------------------------------------------------------------------------

const somme = (saisies: Saisie[]) => saisies.reduce((total, s) => total + s.valeur, 0);

export function derniereSaisie<T extends Saisie>(saisies: T[]): T | null {
  let derniere: T | null = null;
  for (const s of saisies) if (!derniere || s.date > derniere.date) derniere = s;
  return derniere;
}

/**
 * Valeur actuelle d'un indicateur sur la période filtrée, ou null s'il n'y a aucune donnée.
 * - cumul : valeur de base + somme des saisies du début du projet jusqu'à la fin de la période ;
 * - dernier : dernière saisie à la date de fin, même antérieure au début de la période ;
 * - moyenne : moyenne des saisies de la période.
 */
export function valeurActuelle(kpi: KpiDef, saisies: Saisie[], periode: Periode, debutProjet: string): number | null {
  switch (kpi.type_agregation) {
    case "cumul": {
      const lot = saisies.filter((s) => s.date >= debutProjet && s.date <= periode.fin);
      return lot.length === 0 ? null : kpi.valeur_base + somme(lot);
    }
    case "dernier":
      return derniereSaisie(saisies.filter((s) => s.date <= periode.fin))?.valeur ?? null;
    case "moyenne": {
      const lot = saisies.filter((s) => s.date >= (periode.debut ?? debutProjet) && s.date <= periode.fin);
      return lot.length === 0 ? null : somme(lot) / lot.length;
    }
  }
}

/** Pourcentage d'atteinte de la cible finale, borné à [0 ; 150]. Nul si la cible égale la base ou sans valeur. */
export function pourcentAtteinte(
  kpi: Pick<KpiDef, "cible" | "valeur_base" | "sens">,
  valeur: number | null,
): number | null {
  if (valeur === null || kpi.cible === kpi.valeur_base) return null;
  const brut =
    kpi.sens === "croissant"
      ? ((valeur - kpi.valeur_base) / (kpi.cible - kpi.valeur_base)) * 100
      : ((kpi.valeur_base - valeur) / (kpi.valeur_base - kpi.cible)) * 100;
  return Math.max(0, Math.min(150, brut));
}

/** Part de la durée du projet écoulée à `dateRef`, bornée à [0 ; 1]. Nulle si la durée du projet est nulle. */
export function fractionTrajectoire(projet: ProjetDates, dateRef: string): number | null {
  const debut = numeroJour(projet.date_debut);
  const fin = numeroJour(projet.date_fin);
  if (fin <= debut) return null;
  return Math.min(1, Math.max(0, (numeroJour(dateRef) - debut) / (fin - debut)));
}

/** Valeur attendue si la progression est linéaire entre la base et la cible. */
export function valeurAttendue(kpi: Pick<KpiDef, "cible" | "valeur_base">, fraction: number): number {
  return kpi.valeur_base + (kpi.cible - kpi.valeur_base) * fraction;
}

export type EcartTrajectoire = { attendue: number; ecart: number; enAvance: boolean };

export function ecartTrajectoire(kpi: KpiDef, valeur: number | null, fraction: number | null): EcartTrajectoire | null {
  if (valeur === null || fraction === null) return null;
  const attendue = valeurAttendue(kpi, fraction);
  const ecart = valeur - attendue;
  return { attendue, ecart, enAvance: kpi.sens === "croissant" ? ecart >= 0 : ecart <= 0 };
}

/**
 * Statut de couleur. On compare l'avancement à la trajectoire : ratio = pourcentage d'atteinte ÷ part
 * de la durée écoulée, puis seuils (vert ≥ 90, ambre ≥ 60 par défaut). Sans trajectoire exploitable
 * (projet pas commencé, durée nulle), on retombe sur le pourcentage d'atteinte seul.
 */
export function statutKpi(
  kpi: Pick<KpiDef, "cible" | "valeur_base" | "sens">,
  valeur: number | null,
  fraction: number | null,
  seuils: Seuils = SEUILS_PAR_DEFAUT,
): StatutKpi {
  const pct = pourcentAtteinte(kpi, valeur);
  if (pct === null) return "none";
  const ratio = fraction !== null && fraction > 0 ? pct / fraction : pct;
  if (ratio >= seuils.vert) return "ok";
  if (ratio >= seuils.ambre) return "warn";
  return "alert";
}

/** Dernière saisie trop ancienne pour la fréquence de l'indicateur. */
export function retardSaisie(frequence: Frequence, derniere: string | null, aujourdhui: string): boolean {
  if (derniere === null) return false;
  return numeroJour(aujourdhui) - numeroJour(derniere) > RETARD_SAISIE_FACTEUR * PERIODE_FREQUENCE_JOURS[frequence];
}

// -----------------------------------------------------------------------------
// Variation par rapport à la période précédente
// -----------------------------------------------------------------------------

export type Delta = { valeur: number; pourcent: number | null };

/** Compare la période filtrée à la précédente, de même durée. Nul pour « depuis le début » ou sans données. */
export function deltaKpi(kpi: KpiDef, saisies: Saisie[], periode: Periode): Delta | null {
  if (periode.debut === null) return null;
  const duree = numeroJour(periode.fin) - numeroJour(periode.debut) + 1;
  const finPrecedente = ajouterJours(periode.debut, -1);
  const debutPrecedente = ajouterJours(finPrecedente, -(duree - 1));
  const dans = (debut: string, fin: string) => saisies.filter((s) => s.date >= debut && s.date <= fin);

  let courant: number | null;
  let precedent: number | null;
  if (kpi.type_agregation === "dernier") {
    courant = derniereSaisie(saisies.filter((s) => s.date <= periode.fin))?.valeur ?? null;
    precedent = derniereSaisie(saisies.filter((s) => s.date <= finPrecedente))?.valeur ?? null;
  } else {
    const lotCourant = dans(periode.debut, periode.fin);
    const lotPrecedent = dans(debutPrecedente, finPrecedente);
    const agreger = (lot: Saisie[]) =>
      lot.length === 0 ? null : kpi.type_agregation === "cumul" ? somme(lot) : somme(lot) / lot.length;
    courant = agreger(lotCourant);
    precedent = agreger(lotPrecedent);
  }
  if (courant === null || precedent === null) return null;
  return {
    valeur: courant - precedent,
    pourcent: precedent === 0 ? null : ((courant - precedent) / Math.abs(precedent)) * 100,
  };
}

// -----------------------------------------------------------------------------
// Évaluation complète d'un indicateur
// -----------------------------------------------------------------------------

export type Evaluation = {
  valeur: number | null;
  pourcent: number | null;
  statut: StatutKpi;
  fraction: number | null;
  attendue: number | null;
  ecart: number | null;
  enAvance: boolean | null;
  derniereSaisie: string | null;
  retardSaisie: boolean;
  delta: Delta | null;
  nbSaisies: number;
};

export function evaluerKpi(
  kpi: KpiDef,
  saisies: Saisie[],
  contexte: { projet: ProjetDates; periode: Periode; aujourdhui: string; seuils?: Seuils },
): Evaluation {
  const { projet, periode, aujourdhui, seuils } = contexte;
  const dateRef = periode.fin < aujourdhui ? periode.fin : aujourdhui;
  const valeur = valeurActuelle(kpi, saisies, periode, projet.date_debut);
  const fraction = fractionTrajectoire(projet, dateRef);
  const trajectoire = ecartTrajectoire(kpi, valeur, fraction);
  const derniere = derniereSaisie(saisies)?.date ?? null;
  return {
    valeur,
    pourcent: pourcentAtteinte(kpi, valeur),
    statut: statutKpi(kpi, valeur, fraction, seuils),
    fraction,
    attendue: trajectoire?.attendue ?? null,
    ecart: trajectoire?.ecart ?? null,
    enAvance: trajectoire?.enAvance ?? null,
    derniereSaisie: derniere,
    retardSaisie: retardSaisie(kpi.frequence, derniere, aujourdhui),
    delta: deltaKpi(kpi, saisies, periode),
    nbSaisies: saisies.length,
  };
}

/** Progression globale : moyenne des pourcentages d'atteinte (plafonnés à 100) des indicateurs ayant des données. */
export function progressionProjet(evaluations: Pick<Evaluation, "pourcent" | "valeur">[]): number | null {
  const valides = evaluations.filter((e) => e.valeur !== null && e.pourcent !== null);
  if (valides.length === 0) return null;
  return valides.reduce((total, e) => total + Math.min(100, e.pourcent!), 0) / valides.length;
}

export function compterStatuts(evaluations: Pick<Evaluation, "statut">[]): Record<StatutKpi, number> {
  const compte: Record<StatutKpi, number> = { ok: 0, warn: 0, alert: 0, none: 0 };
  for (const e of evaluations) compte[e.statut] += 1;
  return compte;
}

// -----------------------------------------------------------------------------
// Valeur aberrante (alerte non bloquante à la saisie)
// -----------------------------------------------------------------------------

/**
 * `historique` : valeurs déjà saisies pour l'indicateur, dans l'ordre chronologique.
 * - 5 saisies ou plus : écart de plus de 3 écarts-types à la moyenne (si l'écart-type est non nul) ;
 * - moins de 5 : écart de plus de 50 % avec la dernière valeur (aucun contrôle si elle vaut 0).
 */
export function detecterAberrant(historique: number[], nouvelle: number): boolean {
  const n = historique.length;
  if (n === 0) return false;
  if (n >= ABERRANT_MIN_HISTORIQUE) {
    const moyenne = historique.reduce((a, b) => a + b, 0) / n;
    const variance = historique.reduce((a, v) => a + (v - moyenne) ** 2, 0) / (n - 1);
    const ecartType = Math.sqrt(variance);
    return ecartType > 0 && Math.abs(nouvelle - moyenne) > ABERRANT_ECARTS_TYPES * ecartType;
  }
  const derniere = historique[n - 1]!;
  return derniere !== 0 && Math.abs(nouvelle - derniere) / Math.abs(derniere) > ABERRANT_ECART_RELATIF;
}

// -----------------------------------------------------------------------------
// Périodes prédéfinies du tableau de bord
// -----------------------------------------------------------------------------

export type ClePeriode = "tout" | "12m" | "6m" | "3m" | "perso";

export function periodePredefinie(cle: Exclude<ClePeriode, "perso">, aujourdhui: string): Periode {
  const mois = { tout: 0, "12m": 12, "6m": 6, "3m": 3 }[cle];
  if (mois === 0) return { debut: null, fin: aujourdhui };
  const [annee, m, jour] = aujourdhui.split("-").map(Number);
  // Le jour est ramené à la fin du mois visé (31 août − 6 mois = 28 février, pas le 3 mars).
  const dernierJour = new Date(Date.UTC(annee!, m! - 1 - mois + 1, 0)).getUTCDate();
  const debut = new Date(Date.UTC(annee!, m! - 1 - mois, Math.min(jour!, dernierJour)));
  // « 12 derniers mois » = 12 mois glissants, le lendemain inclus pour ne pas compter un jour de trop.
  return { debut: ajouterJours(debut.toISOString().slice(0, 10), 1), fin: aujourdhui };
}

// -----------------------------------------------------------------------------
// Série d'évolution (graphique, sparklines) et statut du projet
// -----------------------------------------------------------------------------

export type PointSerie = { date: string; valeur: number; commentaire?: string | null };

/**
 * Valeurs à tracer : pour un cumul, le total courant (base + saisies jusqu'à la date, dès le début du projet) ;
 * pour « dernier » et « moyenne », les valeurs saisies telles quelles. Triées par date.
 */
export function serieEvolution<T extends Saisie & { commentaire?: string | null }>(
  kpi: KpiDef,
  saisies: T[],
  debutProjet: string,
): PointSerie[] {
  const triees = [...saisies].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (kpi.type_agregation !== "cumul")
    return triees.map((s) => ({ date: s.date, valeur: s.valeur, commentaire: s.commentaire }));
  let total = kpi.valeur_base;
  const points: PointSerie[] = [];
  for (const s of triees) {
    if (s.date < debutProjet) continue;
    total += s.valeur;
    points.push({ date: s.date, valeur: total, commentaire: s.commentaire });
  }
  return points;
}

/** Statut global d'un projet : sa progression comparée à la trajectoire, avec les mêmes seuils que les indicateurs. */
export function statutProjet(
  progression: number | null,
  fraction: number | null,
  seuils: Seuils = SEUILS_PAR_DEFAUT,
): StatutKpi {
  if (progression === null) return "none";
  return statutKpi({ cible: 100, valeur_base: 0, sens: "croissant" }, progression, fraction, seuils);
}

// -----------------------------------------------------------------------------
// Évaluation d'un projet entier
// -----------------------------------------------------------------------------

export type KpiAvecId = KpiDef & { id: string };
export type SaisieAvecKpi = Saisie & { kpi_id: string };
export type EvaluationAvecId = Evaluation & { id: string };

export type EvaluationProjet = {
  evaluations: EvaluationAvecId[];
  progression: number | null;
  fraction: number | null;
  statut: StatutKpi;
  comptes: Record<StatutKpi, number>;
};

export function evaluerProjet(
  kpis: KpiAvecId[],
  saisies: SaisieAvecKpi[],
  contexte: { projet: ProjetDates; periode: Periode; aujourdhui: string; seuils?: Seuils },
): EvaluationProjet {
  const parKpi = new Map<string, SaisieAvecKpi[]>();
  for (const saisie of saisies) {
    const lot = parKpi.get(saisie.kpi_id);
    if (lot) lot.push(saisie);
    else parKpi.set(saisie.kpi_id, [saisie]);
  }
  const evaluations = kpis.map((k) => ({ id: k.id, ...evaluerKpi(k, parKpi.get(k.id) ?? [], contexte) }));
  const progression = progressionProjet(evaluations);
  const dateRef = contexte.periode.fin < contexte.aujourdhui ? contexte.periode.fin : contexte.aujourdhui;
  const fraction = fractionTrajectoire(contexte.projet, dateRef);
  return {
    evaluations,
    progression,
    fraction,
    statut: statutProjet(progression, fraction, contexte.seuils),
    comptes: compterStatuts(evaluations),
  };
}
