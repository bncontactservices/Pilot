// Composantes et planning (Lot 3b) : regroupe les activités du plan de travail par composante et calcule ce que le
// diagramme de Gantt et la liste affichent. Fonctions pures, testées dans composantes.test.ts.
//
// Une composante est un axe du projet (un groupe de travaux ou de résultats) ; ses dates sont saisies, son
// avancement physique est la moyenne de ses activités (même formule que le taux physique du projet) ; elle est « en
// retard » quand sa date de fin est passée sans qu'elle soit terminée ou annulée.

import { enRetard, type StatutTravail, tauxPhysique } from "./avancement";
import { numeroJour } from "./kpi";

export type ComposantePlan = {
  id: string;
  nom: string;
  responsable: string | null;
  date_debut: string | null;
  date_fin: string | null;
  statut: StatutTravail;
  ordre: number;
  created_at?: string;
};

export type ActivitePlan = {
  id: string;
  intitule: string;
  date_debut: string | null;
  date_fin: string | null;
  statut: StatutTravail;
  pct_realisation: number;
  composante_id: string | null;
};

export type BarrePlan = { debut: number; fin: number };

export type GroupeComposante = {
  composante: ComposantePlan;
  barre: BarrePlan;
  enRetard: boolean;
  /** Avancement physique moyen de ses activités ; null sans activité comptée. */
  taux: number | null;
  /** Toutes ses activités, datées ou non. */
  nbActivites: number;
  /** Ses activités qui ont des dates : celles que le diagramme dessine. */
  activitesDatees: (ActivitePlan & { barre: BarrePlan })[];
};

export type Planning = {
  groupes: GroupeComposante[];
  /** Composantes sans dates : listées, pas dessinées. */
  aPlanifier: ComposantePlan[];
  /** Activités datées qui n'appartiennent à aucune composante. */
  sansComposante: (ActivitePlan & { barre: BarrePlan })[];
  /** Étendue de l'axe ; null quand rien n'est daté. */
  periode: BarrePlan | null;
  nbEnRetard: number;
};

const avecBarre = <T extends { date_debut: string | null; date_fin: string | null }>(
  element: T,
): (T & { barre: BarrePlan }) | null =>
  element.date_debut && element.date_fin
    ? { ...element, barre: { debut: numeroJour(element.date_debut), fin: numeroJour(element.date_fin) } }
    : null;

const parOrdre = (a: ComposantePlan, b: ComposantePlan) =>
  a.ordre - b.ordre ||
  (a.date_debut ?? "9999").localeCompare(b.date_debut ?? "9999") ||
  (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
  a.nom.localeCompare(b.nom, "fr");

/** Planning du projet : composantes datées (avec leurs activités datées), à planifier, activités sans composante. */
export function construirePlanning(
  composantes: ComposantePlan[],
  activites: ActivitePlan[],
  aujourdhui: string,
): Planning {
  const triees = [...composantes].sort(parOrdre);
  const groupes: GroupeComposante[] = [];
  const aPlanifier: ComposantePlan[] = [];

  for (const c of triees) {
    const liees = activites.filter((a) => a.composante_id === c.id);
    const barre = avecBarre(c)?.barre;
    if (!barre) {
      aPlanifier.push(c);
      continue;
    }
    groupes.push({
      composante: c,
      barre,
      enRetard: enRetard({ statut: c.statut, echeance: c.date_fin }, aujourdhui),
      taux: tauxPhysique(liees).taux,
      nbActivites: liees.length,
      activitesDatees: liees
        .map(avecBarre)
        .filter((a): a is ActivitePlan & { barre: BarrePlan } => a !== null)
        .sort((a, b) => a.barre.debut - b.barre.debut || a.intitule.localeCompare(b.intitule, "fr")),
    });
  }

  const connues = new Set(composantes.map((c) => c.id));
  const sansComposante = activites
    .filter((a) => a.composante_id === null || !connues.has(a.composante_id))
    .map(avecBarre)
    .filter((a): a is ActivitePlan & { barre: BarrePlan } => a !== null)
    .sort((a, b) => a.barre.debut - b.barre.debut || a.intitule.localeCompare(b.intitule, "fr"));

  const barres = [
    ...groupes.flatMap((g) => [g.barre, ...g.activitesDatees.map((a) => a.barre)]),
    ...sansComposante.map((a) => a.barre),
  ];
  return {
    groupes,
    aPlanifier,
    sansComposante,
    periode:
      barres.length === 0
        ? null
        : { debut: Math.min(...barres.map((b) => b.debut)), fin: Math.max(...barres.map((b) => b.fin)) },
    nbEnRetard: groupes.filter((g) => g.enRetard).length,
  };
}

/** Nombre de jours d'une barre, bornes comprises. */
export const dureeJours = (barre: BarrePlan): number => barre.fin - barre.debut + 1;
