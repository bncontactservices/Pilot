// Suivi courant d'un projet (Lot 2c) : prochaines étapes, états d'avancement, documents, étiquettes.
// Fonctions pures, testées dans suivi.test.ts ; les écrans ne font que les afficher.

import { enRetard, type StatutTravail } from "./avancement";
import { ajouterJours } from "./kpi";
import { nomFichierSur } from "./telechargement";

// ---------------------------------------------------------------------------
// Prochaines étapes
// ---------------------------------------------------------------------------

/** Une action est « ouverte » tant qu'elle n'est ni terminée ni annulée (une action reportée reste à faire). */
export const STATUTS_OUVERTS: StatutTravail[] = ["a_faire", "en_cours", "reporte"];
export const estOuverte = (statut: StatutTravail): boolean => STATUTS_OUVERTS.includes(statut);

type ActionSuivie = { statut: StatutTravail; echeance: string | null; created_at?: string };

export function resumeProchainesEtapes(actions: ActionSuivie[], aujourdhui: string) {
  return {
    ouvertes: actions.filter((a) => estOuverte(a.statut)).length,
    enRetard: actions.filter((a) => enRetard(a, aujourdhui)).length,
    terminees: actions.filter((a) => a.statut === "termine").length,
  };
}

/**
 * Ordre d'affichage : d'abord ce qui est en retard (le plus ancien en premier), puis les actions ouvertes par
 * échéance (celles sans échéance en dernier), enfin ce qui est terminé ou annulé.
 */
export function trierProchainesEtapes<T extends ActionSuivie>(actions: T[], aujourdhui: string): T[] {
  const rang = (a: T) => (enRetard(a, aujourdhui) ? 0 : estOuverte(a.statut) ? (a.echeance ? 1 : 2) : 3);
  return [...actions].sort(
    (a, b) =>
      rang(a) - rang(b) ||
      (a.echeance ?? "9999-12-31").localeCompare(b.echeance ?? "9999-12-31") ||
      (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  );
}

/** Responsables proposés à la saisie : membres de l'organisation puis noms déjà utilisés, sans doublon, triés. */
export function suggestionsResponsables(
  membres: { nom: string | null }[] = [],
  existants: (string | null)[] = [],
): string[] {
  const noms = new Set<string>();
  for (const m of membres) if (m.nom) noms.add(m.nom);
  for (const nom of existants) if (nom) noms.add(nom);
  return [...noms].sort((a, b) => a.localeCompare(b, "fr"));
}

// ---------------------------------------------------------------------------
// États d'avancement
// ---------------------------------------------------------------------------

/**
 * Période proposée pour un nouvel état : depuis le lendemain du dernier état (ou le début du projet) jusqu'à
 * aujourd'hui, sans dépasser la fin du projet. Toujours une période valide (fin ≥ début).
 */
export function periodeSuggeree(
  etats: { periode_fin: string }[],
  projet: { date_debut: string; date_fin: string },
  aujourdhui: string,
): { debut: string; fin: string } {
  const derniere = etats
    .map((e) => e.periode_fin)
    .sort()
    .at(-1);
  let fin = aujourdhui < projet.date_fin ? aujourdhui : projet.date_fin;
  if (fin < projet.date_debut) fin = projet.date_debut; // projet pas encore commencé
  let debut = derniere ? ajouterJours(derniere, 1) : projet.date_debut;
  if (debut > fin) debut = fin;
  return { debut, fin };
}

export function dansLaPeriode<T extends { date: string }>(elements: T[], debut: string, fin: string): T[] {
  return elements.filter((e) => e.date >= debut && e.date <= fin);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** Même plafond que le bucket « documents » (20 Mo). */
export const TAILLE_MAX_DOCUMENT = 20 * 1024 * 1024;

// Les mêmes types que ceux acceptés par le bucket (migration du Lot 2) : le refus se fait d'abord ici, avec un
// message clair, plutôt que par une erreur de stockage.
const TYPES_PAR_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
};
const TYPES_ACCEPTES = new Set(Object.values(TYPES_PAR_EXTENSION));
export const EXTENSIONS_DOCUMENTS = Object.keys(TYPES_PAR_EXTENSION).map((e) => `.${e}`);

const extensionDe = (nom: string): string => {
  const point = nom.lastIndexOf(".");
  const ext = point > 0 ? nom.slice(point + 1).toLowerCase() : "";
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "";
};

/** Type de contenu à déclarer au stockage : celui du navigateur s'il est accepté, sinon déduit de l'extension. */
export function typeDocument(fichier: { name: string; type: string }): string | null {
  if (TYPES_ACCEPTES.has(fichier.type)) return fichier.type;
  return TYPES_PAR_EXTENSION[extensionDe(fichier.name)] ?? null;
}

export type ProblemeFichier = "vide" | "trop_gros" | "type";

export function verifierFichier(fichier: { name: string; type: string; size: number }): ProblemeFichier | null {
  if (fichier.size === 0) return "vide";
  if (fichier.size > TAILLE_MAX_DOCUMENT) return "trop_gros";
  if (typeDocument(fichier) === null) return "type";
  return null;
}

/** Chemin dans le bucket : {org}/{projet}/{identifiant}-{nom sans accents ni espaces}.{extension}. */
export function cheminDocument(orgId: string, projetId: string, nomFichier: string, identifiant: string): string {
  const ext = extensionDe(nomFichier);
  const point = nomFichier.lastIndexOf(".");
  const base = ext && point > 0 ? nomFichier.slice(0, point) : nomFichier;
  return `${orgId}/${projetId}/${identifiant}-${nomFichierSur(base)}${ext ? `.${ext}` : ""}`;
}

/** Nom proposé pour un document : le nom du fichier sans son extension. */
export function nomDocumentSuggere(nomFichier: string): string {
  const ext = extensionDe(nomFichier);
  return (ext ? nomFichier.slice(0, nomFichier.length - ext.length - 1) : nomFichier).trim();
}

// ---------------------------------------------------------------------------
// Étiquettes
// ---------------------------------------------------------------------------

export const ETIQUETTES_MAX = 10;
export const ETIQUETTE_LONGUEUR_MAX = 40;

/** Même normalisation que la base : minuscules, espaces simplifiés. */
export const normaliserEtiquette = (texte: string): string => texte.replace(/\s+/g, " ").trim().toLowerCase();
