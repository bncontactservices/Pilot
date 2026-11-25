// Taux d'avancement d'un projet et d'un programme (Lot 2).
//
// Le taux de RÉSULTATS vient de kpi.ts (progressionProjet / statutProjet) ; le taux PHYSIQUE est calculé
// ici à partir du plan de travail annuel. Les vues SQL v_avancement et v_avancement_programme appliquent
// les mêmes formules ; avancement.test.ts et supabase/tests/07_lot2_regles.test.sql vérifient les mêmes cas.
// Le taux financier arrive avec le Lot 3.

import type { Enums } from "./database.types";
import { numeroJour } from "./kpi";

export type StatutTravail = Enums<"statut_travail">;

export const STATUTS_TRAVAIL: StatutTravail[] = ["a_faire", "en_cours", "termine", "reporte", "annule"];

export type ActivitePta = { statut: StatutTravail; pct_realisation: number };

export type TauxPhysique = {
  /** Moyenne du % de réalisation des activités non annulées ; null sans activité. */
  taux: number | null;
  /** Activités comptées (hors annulées). */
  nombre: number;
  /** Activités terminées. */
  realisees: number;
};

/**
 * Taux physique = moyenne des pourcentages de réalisation des activités du plan de travail, hors activités
 * annulées. Une activité reportée compte à son pourcentage actuel.
 */
export function tauxPhysique(activites: ActivitePta[]): TauxPhysique {
  const comptees = activites.filter((a) => a.statut !== "annule");
  if (comptees.length === 0) return { taux: null, nombre: 0, realisees: 0 };
  return {
    taux: comptees.reduce((total, a) => total + a.pct_realisation, 0) / comptees.length,
    nombre: comptees.length,
    realisees: comptees.filter((a) => a.statut === "termine").length,
  };
}

/** Moyenne simple des taux disponibles (consolidation d'un programme) ; null si aucun. */
export function moyenneTaux(taux: (number | null)[]): number | null {
  const valides = taux.filter((t): t is number => t !== null);
  return valides.length === 0 ? null : valides.reduce((a, b) => a + b, 0) / valides.length;
}

/** Une échéance dépassée et non réalisée. Les éléments terminés ou annulés ne sont jamais en retard. */
export function enRetard(element: { statut: StatutTravail; echeance: string | null }, aujourdhui: string): boolean {
  if (element.echeance === null || element.statut === "termine" || element.statut === "annule") return false;
  return numeroJour(element.echeance) < numeroJour(aujourdhui);
}

export type EtapeSuivie = { statut: StatutTravail; date_prevue: string };

export function resumeEtapes(etapes: EtapeSuivie[], aujourdhui: string) {
  const comptees = etapes.filter((e) => e.statut !== "annule");
  return {
    nombre: comptees.length,
    terminees: comptees.filter((e) => e.statut === "termine").length,
    enRetard: comptees.filter((e) => enRetard({ statut: e.statut, echeance: e.date_prevue }, aujourdhui)).length,
  };
}

/** Pourcentage arrondi pour l'affichage (« 49 % »), ou null. */
export function arrondirTaux(taux: number | null): number | null {
  return taux === null ? null : Math.round(taux);
}
