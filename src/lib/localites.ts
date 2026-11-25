// Localités (Lot 3d) : hiérarchie, recherche, coordonnées, cadrage de la carte. Fonctions pures, testées dans
// localites.test.ts. Le référentiel de la plateforme (org_id nul) et les localités d'une organisation sont dans la même
// liste : on les distingue par `estReferentiel`.

import type { Enums } from "./database.types";

export type NiveauLocalite = Enums<"niveau_localite">;

/** Du plus large au plus fin : un enfant a toujours un niveau plus fin que son parent. */
export const NIVEAUX: NiveauLocalite[] = ["region", "departement", "arrondissement", "commune", "village", "quartier"];

export type LocaliteListe = {
  id: string;
  org_id: string | null;
  parent_id: string | null;
  niveau: NiveauLocalite;
  nom: string;
  latitude: number | null;
  longitude: number | null;
};

/** Sans accents ni majuscules : « Layene » trouve « Layène ». */
export const normaliser = (texte: string): string =>
  texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Une ligne du référentiel de la plateforme : lisible par tous, modifiable par personne depuis l'application. */
export const estReferentiel = (l: Pick<LocaliteListe, "org_id">): boolean => l.org_id === null;

export function indexer<T extends LocaliteListe>(localites: T[]): Map<string, T> {
  return new Map(localites.map((l) => [l.id, l]));
}

/** De la racine à la localité elle-même ; s'arrête sur un parent absent de la liste (non visible) et sur un cycle. */
export function chemin<T extends LocaliteListe>(index: Map<string, T>, id: string): T[] {
  const resultat: T[] = [];
  const vus = new Set<string>();
  let courant = index.get(id);
  while (courant && !vus.has(courant.id)) {
    vus.add(courant.id);
    resultat.unshift(courant);
    courant = courant.parent_id ? index.get(courant.parent_id) : undefined;
  }
  return resultat;
}

/** Les ancêtres les plus proches d'abord, au plus `max` : de quoi situer une localité sans réécrire toute la hiérarchie. */
export function contexte<T extends LocaliteListe>(index: Map<string, T>, id: string, max = 3): string[] {
  return chemin(index, id)
    .slice(0, -1)
    .reverse()
    .slice(0, max)
    .map((l) => l.nom);
}

/** « Layène, Village traditionnel de Yoff, Commune de Yoff » : la localité, puis son contexte. */
export function libelleLieu<T extends LocaliteListe>(index: Map<string, T>, id: string, max = 2): string {
  const l = index.get(id);
  if (!l) return "";
  return [l.nom, ...contexte(index, id, max)].join(", ");
}

export const aDesCoordonnees = (l: Pick<LocaliteListe, "latitude" | "longitude">): boolean =>
  typeof l.latitude === "number" && typeof l.longitude === "number";

/** Niveaux qu'on peut donner à un enfant de ce parent : strictement plus fins (tous, sans parent). */
export function niveauxPossibles(parent: Pick<LocaliteListe, "niveau"> | null | undefined): NiveauLocalite[] {
  if (!parent) return NIVEAUX;
  return NIVEAUX.slice(NIVEAUX.indexOf(parent.niveau) + 1);
}

/** Les localités qui peuvent servir de parent à un niveau donné : plus larges que lui. */
export function parentsPossibles<T extends LocaliteListe>(localites: T[], niveau: NiveauLocalite): T[] {
  const rang = NIVEAUX.indexOf(niveau);
  return localites.filter((l) => NIVEAUX.indexOf(l.niveau) < rang);
}

export type LigneArbre<T> = { localite: T; profondeur: number };

/** Parcours en profondeur : chaque localité sous son parent, les frères par ordre alphabétique. Les orphelines sont des racines. */
export function aplatir<T extends LocaliteListe>(localites: T[]): LigneArbre<T>[] {
  const ids = new Set(localites.map((l) => l.id));
  const enfants = new Map<string | null, T[]>();
  for (const l of localites) {
    const cle = l.parent_id && ids.has(l.parent_id) ? l.parent_id : null;
    enfants.set(cle, [...(enfants.get(cle) ?? []), l]);
  }
  for (const liste of enfants.values()) liste.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const lignes: LigneArbre<T>[] = [];
  const visiter = (cle: string | null, profondeur: number) => {
    for (const l of enfants.get(cle) ?? []) {
      lignes.push({ localite: l, profondeur });
      visiter(l.id, profondeur + 1);
    }
  };
  visiter(null, 0);
  return lignes;
}

/** Localités dont le nom, ou celui d'un ancêtre, contient la recherche (sans accents ni casse). */
export function rechercher<T extends LocaliteListe>(localites: T[], texte: string): T[] {
  const recherche = normaliser(texte);
  if (recherche === "") return localites;
  const index = indexer(localites);
  return localites.filter((l) => chemin(index, l.id).some((ancetre) => normaliser(ancetre.nom).includes(recherche)));
}

// Coordonnées ---------------------------------------------------------------------------------------------------

export type Degres = { etat: "absent" } | { etat: "invalide" } | { etat: "ok"; valeur: number };

/**
 * Lit une latitude ou une longitude en degrés décimaux. Accepte la virgule décimale (« 14,7603 »), les espaces
 * et le vrai signe moins. Vide : absent. Hors de [min, max] ou pas un nombre : invalide. Six décimales (≈ 10 cm).
 */
export function lireDegres(texte: string, min: number, max: number): Degres {
  const net = texte.trim().replace(/\s/g, "").replace("−", "-").replace(",", ".");
  if (net === "") return { etat: "absent" };
  if (!/^-?\d+(\.\d+)?$/.test(net)) return { etat: "invalide" };
  const valeur = Math.round(Number(net) * 1e6) / 1e6;
  return valeur < min || valeur > max ? { etat: "invalide" } : { etat: "ok", valeur };
}

export const lireLatitude = (texte: string) => lireDegres(texte, -90, 90);
export const lireLongitude = (texte: string) => lireDegres(texte, -180, 180);

/** « 14,760358 N, 17,468149 O » : lisible, sans dépendre d'un format de carte. */
export function formaterCoordonnees(latitude: number, longitude: number): string {
  const f = (v: number) => Math.abs(v).toLocaleString("fr-FR", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  return `${f(latitude)} ${latitude >= 0 ? "N" : "S"}, ${f(longitude)} ${longitude >= 0 ? "E" : "O"}`;
}

// Carte ---------------------------------------------------------------------------------------------------------

export type Limites = { sud: number; ouest: number; nord: number; est: number };

/** Rectangle qui contient tous les points, ou null s'il n'y en a aucun. */
export function limites(points: { latitude: number; longitude: number }[]): Limites | null {
  if (points.length === 0) return null;
  return {
    sud: Math.min(...points.map((p) => p.latitude)),
    nord: Math.max(...points.map((p) => p.latitude)),
    ouest: Math.min(...points.map((p) => p.longitude)),
    est: Math.max(...points.map((p) => p.longitude)),
  };
}
