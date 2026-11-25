// Effectifs de bénéficiaires (Lot 3c) : totaux et ventilations par sexe et tranche d'âge. Fonctions pures, testées
// dans beneficiaires.test.ts. Il n'existe aucune fiche nominative : une ligne est un effectif agrégé.
//
// Les effectifs de périodes différentes ne s'additionnent pas toujours (une même personne peut être comptée à chaque
// période) : la synthèse se calcule donc pour UNE période à la fois ; le cumul de toutes les périodes est un autre
// calcul, présenté comme tel.

import type { Enums } from "./database.types";

export type Sexe = Enums<"sexe_beneficiaire">;
export type TrancheAge = Enums<"tranche_age">;

export const SEXES: Sexe[] = ["femme", "homme", "non_precise"];
export const TRANCHES_AGE: TrancheAge[] = ["0_4", "5_14", "15_24", "25_59", "60_plus", "non_precise"];

export type Effectif = {
  periode_debut: string;
  periode_fin: string;
  categorie: string;
  sexe: Sexe;
  tranche_age: TrancheAge;
  effectif: number;
};

export type Periode = { debut: string; fin: string };
export const clePeriode = (p: Periode): string => `${p.debut}|${p.fin}`;
export const periodeDeCle = (cle: string): Periode => {
  const [debut = "", fin = ""] = cle.split("|");
  return { debut, fin };
};

/** Périodes saisies, la plus récente d'abord (par fin, puis par début). */
export function periodes(effectifs: Pick<Effectif, "periode_debut" | "periode_fin">[]): Periode[] {
  const vues = new Map<string, Periode>();
  for (const e of effectifs)
    vues.set(clePeriode({ debut: e.periode_debut, fin: e.periode_fin }), {
      debut: e.periode_debut,
      fin: e.periode_fin,
    });
  return [...vues.values()].sort((a, b) => b.fin.localeCompare(a.fin) || b.debut.localeCompare(a.debut));
}

/** Catégories saisies, triées. */
export const categories = (effectifs: Pick<Effectif, "categorie">[]): string[] =>
  [...new Set(effectifs.map((e) => e.categorie))].sort((a, b) => a.localeCompare(b, "fr"));

export type Synthese = {
  total: number;
  parSexe: Record<Sexe, number>;
  parTranche: Record<TrancheAge, number>;
  /** Total par catégorie, la plus nombreuse d'abord. */
  parCategorie: { categorie: string; total: number }[];
  /** Part des femmes parmi les effectifs dont le sexe est connu, en % ; null si aucun sexe n'est précisé. */
  partFemmes: number | null;
  /** Part des effectifs dont le sexe ou l'âge n'est pas précisé, en % : dit la qualité de la ventilation. */
  partNonVentile: number | null;
};

const zeroSexe = (): Record<Sexe, number> => ({ femme: 0, homme: 0, non_precise: 0 });
const zeroTranche = (): Record<TrancheAge, number> => ({
  "0_4": 0,
  "5_14": 0,
  "15_24": 0,
  "25_59": 0,
  "60_plus": 0,
  non_precise: 0,
});

/** Synthèse d'un ensemble d'effectifs (déjà filtré sur une période et, au besoin, une catégorie). */
export function synthese(effectifs: Effectif[]): Synthese {
  const parSexe = zeroSexe();
  const parTranche = zeroTranche();
  const categoriesTotal = new Map<string, number>();
  let total = 0;
  let nonVentile = 0;
  for (const e of effectifs) {
    total += e.effectif;
    parSexe[e.sexe] += e.effectif;
    parTranche[e.tranche_age] += e.effectif;
    categoriesTotal.set(e.categorie, (categoriesTotal.get(e.categorie) ?? 0) + e.effectif);
    if (e.sexe === "non_precise" || e.tranche_age === "non_precise") nonVentile += e.effectif;
  }
  const sexesConnus = parSexe.femme + parSexe.homme;
  return {
    total,
    parSexe,
    parTranche,
    parCategorie: [...categoriesTotal.entries()]
      .map(([categorie, t]) => ({ categorie, total: t }))
      .sort((a, b) => b.total - a.total || a.categorie.localeCompare(b.categorie, "fr")),
    partFemmes: sexesConnus === 0 ? null : (parSexe.femme / sexesConnus) * 100,
    partNonVentile: total === 0 ? null : (nonVentile / total) * 100,
  };
}

/** Effectifs d'une période exacte. */
export const dePeriode = <T extends Pick<Effectif, "periode_debut" | "periode_fin">>(effectifs: T[], p: Periode): T[] =>
  effectifs.filter((e) => e.periode_debut === p.debut && e.periode_fin === p.fin);

/** Tableau tranche d'âge × sexe d'un ensemble d'effectifs : une ligne par tranche, dans l'ordre des âges. */
export function matriceAgeSexe(
  effectifs: Effectif[],
): { tranche: TrancheAge; femme: number; homme: number; non_precise: number; total: number }[] {
  const lignes = new Map<TrancheAge, Record<Sexe, number>>(TRANCHES_AGE.map((t) => [t, zeroSexe()]));
  for (const e of effectifs) lignes.get(e.tranche_age)![e.sexe] += e.effectif;
  return TRANCHES_AGE.map((tranche) => {
    const l = lignes.get(tranche)!;
    return { tranche, ...l, total: l.femme + l.homme + l.non_precise };
  }).filter((l) => l.total > 0);
}
