// Lecture d'un fichier CSV ou Excel en tableau de texte. Appelée dans un Web Worker (voir
// import-client.ts) pour ne pas figer l'écran sur un gros fichier ; testable telle quelle.

import Papa from "papaparse";
import * as XLSX from "xlsx";
import { IMPORT_MAX_COLONNES, IMPORT_MAX_LIGNES, IMPORT_MAX_OCTETS } from "./constants";
import { type Classeur, ErreurLecture, type Feuille, type Table } from "./import";

const estZip = (o: Uint8Array) => o[0] === 0x50 && o[1] === 0x4b; // « PK » : .xlsx
const estOle = (o: Uint8Array) => o[0] === 0xd0 && o[1] === 0xcf; // ancien .xls

/** UTF-8 d'abord ; à défaut, Windows-1252 (CSV enregistrés par un Excel en français). */
function decoderTexte(octets: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(octets);
  } catch {
    return new TextDecoder("windows-1252").decode(octets);
  }
}

/** Retire les lignes vides de tête et de queue ; l'en-tête est la première ligne non vide. */
function recadrer(lignes: string[][], nom: string): Feuille | null {
  const vide = (l: string[]) => l.every((c) => c === "");
  let debut = 0;
  while (debut < lignes.length && vide(lignes[debut]!)) debut += 1;
  let fin = lignes.length;
  while (fin > debut && vide(lignes[fin - 1]!)) fin -= 1;
  if (debut >= fin) return null;
  const table = lignes.slice(debut, fin);
  if (table.length - 1 > IMPORT_MAX_LIGNES) throw new ErreurLecture("trop_de_lignes");
  const largeur = Math.min(IMPORT_MAX_COLONNES, Math.max(...table.map((l) => l.length)));
  const normalisee: Table = table.map((l) => Array.from({ length: largeur }, (_, i) => l[i] ?? ""));
  return { nom, table: normalisee, numeroEntete: debut + 1 };
}

const SEPARATEURS = [";", ",", "\t", "|"] as const;

/**
 * Séparateur le plus fréquent (hors guillemets) sur les premières lignes non vides.
 * La détection automatique de PapaParse échoue quand des lignes vides précèdent l'en-tête.
 */
function devinerSeparateur(texte: string): string {
  const compte = new Map<string, number>(SEPARATEURS.map((s) => [s, 0]));
  let lignes = 0;
  let entreGuillemets = false;
  let ligneVide = true;
  for (const c of texte) {
    if (c === '"') entreGuillemets = !entreGuillemets;
    if (!entreGuillemets && (c === "\n" || c === "\r")) {
      if (!ligneVide && ++lignes >= 10) break;
      ligneVide = true;
      continue;
    }
    if (!/\s/.test(c) || SEPARATEURS.includes(c as (typeof SEPARATEURS)[number])) ligneVide = false;
    if (!entreGuillemets && compte.has(c)) compte.set(c, compte.get(c)! + 1);
  }
  let meilleur = ",";
  let max = 0;
  for (const s of SEPARATEURS) {
    if (compte.get(s)! > max) {
      meilleur = s;
      max = compte.get(s)!;
    }
  }
  return meilleur;
}

function lireCsv(octets: Uint8Array): Classeur {
  const texte = decoderTexte(octets);
  const resultat = Papa.parse<string[]>(texte, { delimiter: devinerSeparateur(texte), skipEmptyLines: false });
  if (resultat.errors.some((e) => e.type === "Quotes")) throw new ErreurLecture("illisible");
  const lignes = resultat.data.map((l) => l.map((c) => String(c ?? "").trim()));
  const feuille = recadrer(lignes, "CSV");
  if (!feuille) throw new ErreurLecture("vide");
  return { feuilles: [feuille] };
}

// Excel compte les jours depuis le 30 décembre 1899 (le « 29 février 1900 » inexistant est sans objet après mars 1900).
const ORIGINE_EXCEL = Date.UTC(1899, 11, 30);

export function dateExcel(numero: number): string {
  return new Date(ORIGINE_EXCEL + Math.floor(numero) * 86_400_000).toISOString().slice(0, 10);
}

function texteCellule(cellule: XLSX.CellObject | undefined): string {
  if (!cellule) return "";
  switch (cellule.t) {
    case "n":
      // Une cellule au format date est un numéro de série : on le convertit sans passer par un objet Date (fuseau).
      return typeof cellule.v === "number" && cellule.z && XLSX.SSF.is_date(String(cellule.z))
        ? dateExcel(cellule.v)
        : String(cellule.v ?? "");
    case "d":
      return cellule.v instanceof Date ? cellule.v.toISOString().slice(0, 10) : String(cellule.v ?? "");
    case "e":
      return cellule.w ?? "#ERREUR";
    default:
      return String(cellule.v ?? "").trim();
  }
}

function lireXlsx(donnees: ArrayBuffer): Classeur {
  let classeur: XLSX.WorkBook;
  try {
    classeur = XLSX.read(donnees, {
      type: "array",
      cellNF: true,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
    });
  } catch {
    throw new ErreurLecture("illisible");
  }
  const feuilles: Feuille[] = [];
  classeur.SheetNames.forEach((nom, i) => {
    if (classeur.Workbook?.Sheets?.[i]?.Hidden) return;
    const feuille = classeur.Sheets[nom];
    if (!feuille?.["!ref"]) return;
    const plage = XLSX.utils.decode_range(feuille["!ref"]);
    if (plage.e.r - plage.s.r > IMPORT_MAX_LIGNES + 1000) throw new ErreurLecture("trop_de_lignes");
    const colonnes = Math.min(plage.e.c, plage.s.c + IMPORT_MAX_COLONNES - 1);
    const lignes: string[][] = [];
    for (let r = plage.s.r; r <= plage.e.r; r++) {
      const ligne: string[] = [];
      for (let c = plage.s.c; c <= colonnes; c++) ligne.push(texteCellule(feuille[XLSX.utils.encode_cell({ r, c })]));
      lignes.push(ligne);
    }
    const lue = recadrer(lignes, nom);
    if (lue) feuilles.push(lue);
  });
  if (feuilles.length === 0) throw new ErreurLecture("vide");
  return { feuilles };
}

export function lireFichier(donnees: ArrayBuffer, nom: string): Classeur {
  if (donnees.byteLength > IMPORT_MAX_OCTETS) throw new ErreurLecture("trop_gros");
  if (donnees.byteLength === 0) throw new ErreurLecture("vide");
  const octets = new Uint8Array(donnees);
  if (estZip(octets) || estOle(octets)) return lireXlsx(donnees);
  if (/\.(xlsx|xlsm|xls)$/i.test(nom)) throw new ErreurLecture("illisible");
  if (!/\.(csv|txt|tsv)$/i.test(nom)) throw new ErreurLecture("format_inconnu");
  return lireCsv(octets);
}
