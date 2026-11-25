// Cadre logique : arbre OG > OS > résultat > activité (Lot 2b). Fonctions pures.
// La hiérarchie et les codes (OG, OS1, R1.1, A1.1.1) sont appliqués par la base ; ici on ne fait que
// présenter l'arbre, proposer les bons rattachements et calculer les réordonnancements.

import type { Enums, Tables } from "./database.types";

export type TypeNoeud = Enums<"type_noeud">;
export const TYPES_NOEUD: TypeNoeud[] = ["objectif_global", "objectif_specifique", "resultat", "activite"];

export type Noeud = Pick<
  Tables<"cadre_logique_noeuds">,
  "id" | "type" | "parent_id" | "code" | "libelle" | "moyens_verification" | "hypotheses" | "ordre" | "created_at"
>;
export type NoeudArbre = Noeud & { enfants: NoeudArbre[]; profondeur: number };

/** Niveau d'une ligne : 0 pour l'objectif global, 3 pour une activité. */
export const niveau = (type: TypeNoeud): number => TYPES_NOEUD.indexOf(type);

/** Type des lignes que l'on peut ajouter sous une ligne de ce type ; null pour une activité. */
export function typeEnfant(type: TypeNoeud): TypeNoeud | null {
  return TYPES_NOEUD[niveau(type) + 1] ?? null;
}

/** Type du parent attendu ; null pour l'objectif global. */
export function typeParent(type: TypeNoeud): TypeNoeud | null {
  return niveau(type) === 0 ? null : TYPES_NOEUD[niveau(type) - 1]!;
}

/** Ordre d'affichage entre frères, le même que celui qui sert au calcul des codes en base. */
export function comparerNoeuds(
  a: Pick<Noeud, "ordre" | "created_at" | "id">,
  b: Pick<Noeud, "ordre" | "created_at" | "id">,
): number {
  if (a.ordre !== b.ordre) return a.ordre - b.ordre;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Racines de l'arbre (l'objectif global, normalement unique), enfants triés. Les lignes orphelines sont ignorées. */
export function construireArbre(noeuds: Noeud[]): NoeudArbre[] {
  const parId = new Map<string, NoeudArbre>();
  for (const n of noeuds) parId.set(n.id, { ...n, enfants: [], profondeur: 0 });
  const racines: NoeudArbre[] = [];
  for (const n of parId.values()) {
    if (n.parent_id === null) racines.push(n);
    else parId.get(n.parent_id)?.enfants.push(n);
  }
  const trier = (liste: NoeudArbre[], profondeur: number) => {
    liste.sort(comparerNoeuds);
    for (const n of liste) {
      n.profondeur = profondeur;
      trier(n.enfants, profondeur + 1);
    }
  };
  trier(racines, 0);
  return racines;
}

/** Ordre de lecture (parcours en profondeur) ; les branches repliées ne montrent pas leurs descendants. */
export function aplatir(racines: NoeudArbre[], repliees: ReadonlySet<string> = new Set()): NoeudArbre[] {
  const sortie: NoeudArbre[] = [];
  const parcourir = (liste: NoeudArbre[]) => {
    for (const n of liste) {
      sortie.push(n);
      if (!repliees.has(n.id)) parcourir(n.enfants);
    }
  };
  parcourir(racines);
  return sortie;
}

/** Nombre de lignes sous celle-ci (ce que supprimer cette ligne emporte avec elle). */
export function compterDescendants(noeud: NoeudArbre): number {
  return noeud.enfants.reduce((total, e) => total + 1 + compterDescendants(e), 0);
}

/** Lignes auxquelles on peut rattacher une ligne de ce type (le niveau juste au-dessus). */
export function parentsPossibles(noeuds: Noeud[], type: TypeNoeud): Noeud[] {
  const attendu = typeParent(type);
  return attendu === null
    ? []
    : noeuds.filter((n) => n.type === attendu).sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }));
}

/** Rang à donner à une nouvelle ligne placée à la fin de ses frères. */
export function prochainOrdre(freres: Pick<Noeud, "ordre">[]): number {
  return freres.reduce((max, f) => Math.max(max, f.ordre), 0) + 1;
}

export type ChangementOrdre = { id: string; ordre: number };

/**
 * Monter (-1) ou descendre (+1) une ligne (ou une phase) parmi ses frères. Renvoie les nouveaux rangs (1, 2, 3…) des seules
 * lignes qui changent, ou null si le déplacement est impossible (déjà en tête ou en queue).
 */
export function deplacer<T extends Pick<Noeud, "id" | "ordre" | "created_at">>(
  freres: T[],
  id: string,
  sens: -1 | 1,
): ChangementOrdre[] | null {
  const triees = [...freres].sort(comparerNoeuds);
  const position = triees.findIndex((n) => n.id === id);
  const cible = position + sens;
  if (position < 0 || cible < 0 || cible >= triees.length) return null;
  [triees[position], triees[cible]] = [triees[cible]!, triees[position]!];
  return triees
    .map((n, i) => ({ id: n.id, ordre: i + 1 }))
    .filter((c) => freres.find((f) => f.id === c.id)!.ordre !== c.ordre);
}
