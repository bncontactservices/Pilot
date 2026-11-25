// Données de démonstration de la landing : un projet fictif et ses indicateurs, évalués par kpi.ts
// (la même source de calcul que l'application). Elles sont étiquetées « données de démonstration »
// partout où elles s'affichent. La date de référence est fixe : la page est pré-rendue, et un « aujourd'hui »
// variable donnerait un HTML différent à chaque construction et à chaque chargement.

import { geometrieGraphique, type GeometrieGraphique } from "./chart-geometry";
import type { Kpi } from "./donnees";
import {
  type Evaluation,
  evaluerKpi,
  isoDepuisJour,
  numeroJour,
  type PointSerie,
  serieEvolution,
  valeurAttendue,
} from "./kpi";

export const PROJET_DEMO = { date_debut: "2026-01-01", date_fin: "2026-12-31" };
export const DATE_DEMO = "2026-07-02";

const base = {
  project_id: "demo",
  org_id: "demo",
  description: null,
  valeur_base: 0,
  epingle: true,
  noeud_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

export const KPIS_DEMO: Kpi[] = [
  {
    ...base,
    id: "d1",
    nom: "Forages réhabilités",
    unite: "forages",
    cible: 40,
    frequence: "mensuelle",
    sens: "croissant",
    type_agregation: "cumul",
    ordre: 1,
  },
  {
    ...base,
    id: "d2",
    nom: "Ménages avec accès à l’eau potable",
    unite: "%",
    cible: 80,
    valeur_base: 35,
    frequence: "trimestrielle",
    sens: "croissant",
    type_agregation: "dernier",
    ordre: 2,
  },
  {
    ...base,
    id: "d3",
    nom: "Personnes sensibilisées à l’hygiène",
    unite: "personnes",
    cible: 12000,
    frequence: "mensuelle",
    sens: "croissant",
    type_agregation: "cumul",
    ordre: 3,
  },
  {
    ...base,
    id: "d4",
    nom: "Latrines familiales construites",
    unite: "latrines",
    cible: 1500,
    frequence: "mensuelle",
    sens: "croissant",
    type_agregation: "cumul",
    ordre: 4,
  },
];

const mensuelles = (valeurs: number[]) => valeurs.map((valeur, i) => ({ date: `2026-0${i + 1}-28`, valeur }));
const SAISIES_DEMO: Record<string, { date: string; valeur: number }[]> = {
  d1: mensuelles([3, 4, 5, 6, 5, 4]),
  d2: [
    { date: "2026-03-28", valeur: 41 },
    { date: "2026-06-28", valeur: 52 },
  ],
  d3: mensuelles([900, 1100, 1400, 1300, 1500, 1600]),
  d4: mensuelles([40, 60, 70, 80, 70, 60]),
};

export type KpiDemo = { kpi: Kpi; evaluation: Evaluation; serie: PointSerie[] };

export const INDICATEURS_DEMO: KpiDemo[] = KPIS_DEMO.map((kpi) => {
  const saisies = SAISIES_DEMO[kpi.id]!;
  return {
    kpi,
    serie: serieEvolution(kpi, saisies, PROJET_DEMO.date_debut),
    evaluation: evaluerKpi(kpi, saisies, {
      projet: PROJET_DEMO,
      periode: { debut: null, fin: DATE_DEMO },
      aujourdhui: DATE_DEMO,
    }),
  };
});

export const LARGEUR_COURBE = 560;
export const HAUTEUR_COURBE = 190;

/** Tracés du graphique d'évolution du premier indicateur, calculés par la géométrie partagée avec le PDF. */
export function courbeDemo(): GeometrieGraphique & { etiquettesX: string[]; etiquettesY: string[] } {
  const { kpi, serie } = INDICATEURS_DEMO[0]!;
  const debut = numeroJour(PROJET_DEMO.date_debut);
  const fin = numeroJour(PROJET_DEMO.date_fin);
  const attendue = (x: number) => valeurAttendue(kpi, (x - debut) / (fin - debut));
  const geometrie = geometrieGraphique({
    largeur: LARGEUR_COURBE,
    hauteur: HAUTEUR_COURBE,
    marges: { haut: 12, droite: 14, bas: 26, gauche: 40 },
    domaineX: [debut, fin],
    serie: serie.map((p) => ({ x: numeroJour(p.date), valeur: p.valeur })),
    cible: kpi.cible,
    base: kpi.valeur_base,
    trajectoire: [
      { x: debut, valeur: attendue(debut) },
      { x: fin, valeur: attendue(fin) },
    ],
  });
  const mois = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });
  return {
    ...geometrie,
    etiquettesX: geometrie.axeX.map((t) => mois.format(new Date(isoDepuisJour(t.jour)))),
    etiquettesY: geometrie.axeY.map((t) => String(Math.round(t.valeur))),
  };
}
