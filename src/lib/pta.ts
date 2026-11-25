// Plan de travail annuel (Lot 2b) : années fiscales, trimestres, position sur le calendrier. Fonctions pures.
// L'année fiscale est identifiée par l'année où elle commence : avec un début en juillet, l'année 2026
// va du 1er juillet 2026 au 30 juin 2027. Avec un début en janvier, c'est l'année civile.

import type { StatutTravail } from "./avancement";
import { ajouterJours, numeroJour } from "./kpi";

const deux = (n: number) => String(n).padStart(2, "0");
const premierDuMois = (annee: number, mois: number) =>
  `${annee + Math.floor((mois - 1) / 12)}-${deux(((mois - 1) % 12) + 1)}-01`;

/** Année fiscale (celle où elle commence) qui contient cette date. */
export function anneeFiscale(dateIso: string, moisDebut: number): number {
  const annee = Number(dateIso.slice(0, 4));
  const mois = Number(dateIso.slice(5, 7));
  return mois >= moisDebut ? annee : annee - 1;
}

/** Du premier jour au dernier jour de l'année fiscale. */
export function bornesAnneeFiscale(annee: number, moisDebut: number): { debut: string; fin: string } {
  const debut = premierDuMois(annee, moisDebut);
  return { debut, fin: ajouterJours(premierDuMois(annee, moisDebut + 12), -1) };
}

export type MoisFiscal = { annee: number; mois: number; debut: string; fin: string };

/** Les douze mois de l'année fiscale, dans l'ordre. */
export function moisFiscaux(annee: number, moisDebut: number): MoisFiscal[] {
  return Array.from({ length: 12 }, (_, i) => {
    const absolu = moisDebut + i;
    const debut = premierDuMois(annee, absolu);
    return {
      annee: Number(debut.slice(0, 4)),
      mois: Number(debut.slice(5, 7)),
      debut,
      fin: ajouterJours(premierDuMois(annee, absolu + 1), -1),
    };
  });
}

export type Periode = { debut: string; fin: string };

/** Les quatre trimestres de l'année fiscale : le premier commence au mois de début. */
export function trimestresFiscaux(annee: number, moisDebut: number): (Periode & { numero: 1 | 2 | 3 | 4 })[] {
  return ([1, 2, 3, 4] as const).map((numero) => ({
    numero,
    debut: premierDuMois(annee, moisDebut + 3 * (numero - 1)),
    fin: ajouterJours(premierDuMois(annee, moisDebut + 3 * numero), -1),
  }));
}

type PeriodeActivite = { annee: number; trimestre: number | null; date_debut: string | null; date_fin: string | null };

/** Dates réelles de l'activité : ses dates si elle en a, sinon son trimestre dans l'année fiscale. */
export function periodeActivite(activite: PeriodeActivite, moisDebut: number): Periode {
  if (activite.date_debut && activite.date_fin) return { debut: activite.date_debut, fin: activite.date_fin };
  const trimestre = trimestresFiscaux(activite.annee, moisDebut)[(activite.trimestre ?? 1) - 1]!;
  return { debut: trimestre.debut, fin: trimestre.fin };
}

/** Position d'une période sur une année fiscale, en fractions de l'année (0 à 1) ; null si elle n'y touche pas. */
export function positionDansAnnee(
  periode: Periode,
  annee: number,
  moisDebut: number,
): { gauche: number; largeur: number } | null {
  const bornes = bornesAnneeFiscale(annee, moisDebut);
  const debutAnnee = numeroJour(bornes.debut);
  const duree = numeroJour(bornes.fin) - debutAnnee + 1;
  const debut = Math.max(numeroJour(periode.debut), debutAnnee);
  const fin = Math.min(numeroJour(periode.fin), debutAnnee + duree - 1);
  if (fin < debut) return null;
  return { gauche: (debut - debutAnnee) / duree, largeur: (fin - debut + 1) / duree };
}

/** Position d'un jour (date ISO) sur l'année fiscale, de 0 à 1 ; null hors de l'année. */
export function positionDuJour(dateIso: string, annee: number, moisDebut: number): number | null {
  const bornes = bornesAnneeFiscale(annee, moisDebut);
  const debut = numeroJour(bornes.debut);
  const fin = numeroJour(bornes.fin);
  const jour = numeroJour(dateIso);
  return jour < debut || jour > fin ? null : (jour - debut + 0.5) / (fin - debut + 1);
}

/** Années fiscales à proposer : celles du projet, celles des activités déjà planifiées, et la courante. */
export function anneesProposees(
  projet: { date_debut: string; date_fin: string },
  activites: { annee: number }[],
  moisDebut: number,
  aujourdhui: string,
): number[] {
  const annees = new Set<number>([
    anneeFiscale(projet.date_debut, moisDebut),
    anneeFiscale(projet.date_fin, moisDebut),
  ]);
  for (let a = anneeFiscale(projet.date_debut, moisDebut); a <= anneeFiscale(projet.date_fin, moisDebut); a += 1)
    annees.add(a);
  for (const a of activites) annees.add(a.annee);
  annees.add(anneeFiscale(aujourdhui, moisDebut));
  return [...annees].sort((a, b) => a - b);
}

/** Année à afficher d'abord : l'année fiscale courante si elle existe dans la liste, sinon la plus proche. */
export function anneeParDefaut(annees: number[], aujourdhui: string, moisDebut: number): number {
  const courante = anneeFiscale(aujourdhui, moisDebut);
  if (annees.includes(courante)) return courante;
  return annees.reduce(
    (meilleure, a) => (Math.abs(a - courante) < Math.abs(meilleure - courante) ? a : meilleure),
    annees[0] ?? courante,
  );
}

/**
 * Pourcentage cohérent avec le statut (la base refuse « terminée à moins de 100 % » et « à faire avancée ») :
 * terminer une activité la met à 100 %, la remettre à faire la remet à 0 %, les autres statuts gardent leur valeur.
 */
export function pourcentSelonStatut(statut: StatutTravail, pourcent: number): number {
  if (statut === "termine") return 100;
  if (statut === "a_faire") return 0;
  return pourcent;
}
