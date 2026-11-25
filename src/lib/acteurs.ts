// Annuaire d'acteurs (Lot 3c) : types, recherche, rôles par projet. Fonctions pures, testées dans acteurs.test.ts.

import type { Enums } from "./database.types";

export type TypeActeur = Enums<"type_acteur">;

/** Dans l'ordre d'affichage : financeurs d'abord, « autre » en dernier. */
export const TYPES_ACTEUR: TypeActeur[] = ["bailleur", "partenaire", "prestataire", "autorite_locale", "autre"];

export type ActeurListe = {
  id: string;
  nom: string;
  type: TypeActeur;
  description?: string | null;
  contact?: string | null;
  email?: string | null;
  telephone?: string | null;
};

/** Sans accents ni majuscules : « Mairie » trouve « mairie », « Éducation » trouve « education ». */
export const normaliser = (texte: string): string =>
  texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Acteurs d'un type donné (ou de tous) dont le nom, le contact ou la description contient la recherche. */
export function filtrerActeurs<T extends ActeurListe>(
  acteurs: T[],
  filtre: { type?: TypeActeur | ""; recherche?: string },
): T[] {
  const recherche = normaliser(filtre.recherche ?? "");
  return acteurs.filter(
    (a) =>
      (!filtre.type || a.type === filtre.type) &&
      (recherche === "" || normaliser([a.nom, a.contact ?? "", a.description ?? ""].join(" ")).includes(recherche)),
  );
}

export type RoleSuivi = { acteur_id: string; project_id: string; role: string };

/** Rôles regroupés par acteur : l'annuaire dit dans quels projets chacun intervient, et à quel titre. */
export function rolesParActeur<T extends RoleSuivi>(roles: T[]): Map<string, T[]> {
  const groupes = new Map<string, T[]>();
  for (const r of roles) groupes.set(r.acteur_id, [...(groupes.get(r.acteur_id) ?? []), r]);
  return groupes;
}

/** Acteurs de l'annuaire qui n'ont pas encore de rôle dans un projet : ceux qu'on peut lui rattacher. */
export function acteursRattachables<T extends { id: string }>(
  acteurs: T[],
  rolesDuProjet: { acteur_id: string }[],
): T[] {
  const deja = new Set(rolesDuProjet.map((r) => r.acteur_id));
  return acteurs.filter((a) => !deja.has(a.id));
}
