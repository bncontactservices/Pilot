// Échelle de temps commune aux diagrammes (chronologie des phases, planning des composantes).
// Les jours sont des numéros de jour (voir numeroJour dans kpi.ts) : aucune dépendance au fuseau horaire.

import { numeroJour } from "./kpi";

/** Repères de l'axe : le premier jour d'un mois sur n, au plus huit repères. */
export function graduations(debut: number, fin: number): { jour: number; iso: string }[] {
  const d = new Date(debut * 86_400_000);
  const nbMois =
    (new Date(fin * 86_400_000).getUTCFullYear() - d.getUTCFullYear()) * 12 +
    new Date(fin * 86_400_000).getUTCMonth() -
    d.getUTCMonth() +
    1;
  const pas = [1, 2, 3, 6, 12, 24].find((p) => nbMois / p <= 8) ?? 24;
  const sortie: { jour: number; iso: string }[] = [];
  let annee = d.getUTCFullYear();
  let mois = d.getUTCMonth();
  for (let i = 0; i < 400; i += 1) {
    const iso = `${annee}-${String(mois + 1).padStart(2, "0")}-01`;
    const jour = numeroJour(iso);
    if (jour > fin) break;
    if (jour >= debut && (annee * 12 + mois) % pas === 0) sortie.push({ jour, iso });
    mois += 1;
    if (mois > 11) {
      mois = 0;
      annee += 1;
    }
  }
  return sortie;
}

/** Abscisse d'un jour sur un axe qui va de `debut` à `fin` (inclus), dans une largeur utile donnée. */
export function positionJour(jour: number, debut: number, fin: number, marge: number, largeurUtile: number): number {
  return marge + ((jour - debut) / Math.max(1, fin - debut + 1)) * largeurUtile;
}

/** Texte tronqué à `max` caractères, avec une ellipse : les libellés d'un diagramme ne peuvent pas passer à la ligne. */
export function tronquer(texte: string, max: number): string {
  return texte.length <= max ? texte : `${texte.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}
