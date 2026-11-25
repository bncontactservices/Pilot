// Import de saisies depuis un fichier CSV ou Excel : mise en correspondance des colonnes et
// validation ligne par ligne. Fonctions pures, sans réseau ni DOM ; la lecture du fichier
// est dans import-lecture.ts et l'écriture en base dans la page d'import.

import type { Traducteur } from "./traduction";

/** Tableau lu dans un fichier : première ligne = en-têtes, cellules en texte. */
export type Table = string[][];

export type Feuille = {
  nom: string;
  table: Table;
  /** Numéro, dans le fichier, de la ligne d'en-têtes (les lignes de données suivent). */
  numeroEntete: number;
};
export type Classeur = { feuilles: Feuille[] };

export type CodeErreurLecture = "format_inconnu" | "vide" | "trop_gros" | "trop_de_lignes" | "illisible";

export class ErreurLecture extends Error {
  readonly code: CodeErreurLecture;
  constructor(code: CodeErreurLecture) {
    super(code);
    this.name = "ErreurLecture";
    this.code = code;
  }
}

export type Champ = "indicateur" | "date" | "valeur" | "commentaire";
export const CHAMPS: readonly Champ[] = ["indicateur", "date", "valeur", "commentaire"];
/** Indice de colonne dans le tableau, ou null si le champ n'est pas fourni par le fichier. */
export type Correspondance = Record<Champ, number | null>;

// -----------------------------------------------------------------------------
// Texte
// -----------------------------------------------------------------------------

/** Minuscules, sans accents ni ponctuation, espaces réduits : sert à comparer des noms et des en-têtes. */
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SYNONYMES: Record<Champ, string[]> = {
  indicateur: ["indicateur", "indicateurs", "kpi", "indicator", "nom indicateur", "nom de l indicateur", "nom"],
  date: ["date", "jour", "date de saisie", "date saisie", "periode", "date de releve", "date releve", "date de mesure"],
  valeur: ["valeur", "value", "quantite", "resultat", "realise", "realisation", "mesure", "valeur realisee"],
  commentaire: [
    "commentaire",
    "commentaires",
    "comment",
    "remarque",
    "remarques",
    "observation",
    "observations",
    "note",
    "notes",
  ],
};

/** Propose une colonne pour chaque champ d'après le nom des en-têtes ; une colonne ne sert qu'une fois. */
export function proposerCorrespondance(entetes: string[]): Correspondance {
  const normalises = entetes.map(normaliser);
  const prises = new Set<number>();
  const resultat: Correspondance = { indicateur: null, date: null, valeur: null, commentaire: null };
  // Ordre de priorité : « date » et « valeur » avant « indicateur » (dont le synonyme « nom » est large).
  for (const champ of ["date", "valeur", "commentaire", "indicateur"] as const) {
    const index = normalises.findIndex((e, i) => !prises.has(i) && SYNONYMES[champ].includes(e));
    if (index >= 0) {
      resultat[champ] = index;
      prises.add(index);
    }
  }
  return resultat;
}

// -----------------------------------------------------------------------------
// Dates et nombres
// -----------------------------------------------------------------------------

export const ANNEE_MIN = 2000;
export const ANNEE_MAX = 2100;
export const VALEUR_ABSOLUE_MAX = 1e12;

export type ResultatDate = { iso: string } | { erreur: "date_format" | "date_inexistante" | "date_improbable" };

function construireDate(annee: number, mois: number, jour: number): ResultatDate {
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  if (date.getUTCFullYear() !== annee || date.getUTCMonth() !== mois - 1 || date.getUTCDate() !== jour) {
    return { erreur: "date_inexistante" };
  }
  if (annee < ANNEE_MIN || annee > ANNEE_MAX) return { erreur: "date_improbable" };
  return { iso: date.toISOString().slice(0, 10) };
}

/**
 * Formats lus : aaaa-mm-jj (avec heure éventuelle), jj/mm/aaaa, jj-mm-aaaa, jj.mm.aaaa et aaaa/mm/jj.
 * Une date écrite avec des séparateurs « / », « - » ou « . » et l'année en dernier est lue
 * jour d'abord (3/12/2026 = 3 décembre), comme en Afrique de l'Ouest. L'année doit avoir 4 chiffres.
 */
export function analyserDate(brut: string): ResultatDate {
  const texte = brut.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(texte);
  if (m) return construireDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(texte);
  if (m) return construireDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(texte);
  if (m) return construireDate(Number(m[1]), Number(m[2]), Number(m[3]));
  return { erreur: "date_format" };
}

/**
 * Nombres lus : espaces (y compris insécables) ignorés, virgule ou point décimal, séparateurs de
 * milliers (« 1 234,5 », « 1.234,5 », « 1,234.5 »), signe moins typographique, « % » final, notation « 1E+05 ».
 * Une virgule ou un point isolé est un séparateur décimal (« 1,234 » vaut 1,234).
 * Renvoie null si le texte n'est pas un nombre.
 */
export function analyserNombre(brut: string): number | null {
  let t = brut
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/[−–]/g, "-")
    .replace(/%$/, "");
  if (t === "") return null;
  if (/^[+-]?\d+([.,]\d+)?[eE][+-]?\d+$/.test(t)) {
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  const virgules = (t.match(/,/g) ?? []).length;
  const points = (t.match(/\./g) ?? []).length;
  if (virgules > 0 && points > 0) {
    // Les deux séparateurs : le dernier est décimal, l'autre sépare les milliers.
    const decimal = t.lastIndexOf(",") > t.lastIndexOf(".") ? "," : ".";
    const milliers = decimal === "," ? "." : ",";
    if (t.split(decimal).length > 2 || t.lastIndexOf(milliers) > t.lastIndexOf(decimal)) return null;
    t = t.split(milliers).join("").replace(decimal, ".");
  } else if (virgules > 1 || points > 1) {
    // Un séparateur répété ne peut être que celui des milliers : « 1.234.567 ».
    if (!/^[+-]?\d{1,3}([.,]\d{3})+$/.test(t)) return null;
    t = t.replace(/[.,]/g, "");
  } else {
    t = t.replace(",", ".");
  }
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// -----------------------------------------------------------------------------
// Validation ligne par ligne
// -----------------------------------------------------------------------------

export type RaisonRejet =
  | "indicateur_vide"
  | "indicateur_inconnu"
  | "indicateur_ambigu"
  | "date_vide"
  | "date_format"
  | "date_inexistante"
  | "date_improbable"
  | "date_future"
  | "valeur_vide"
  | "valeur_format"
  | "valeur_trop_grande"
  | "commentaire_trop_long"
  | "doublon_fichier";

export type Probleme = {
  champ: Champ;
  valeurLue: string;
  raison: RaisonRejet;
  /** Ligne d'origine, pour un doublon. */ ligneRef?: number;
};
export type LigneRejetee = { ligne: number; problemes: Probleme[] };
export type LigneValide = {
  ligne: number;
  kpiId: string;
  kpiNom: string;
  date: string;
  valeur: number;
  commentaire: string | null;
  /** Une saisie existe déjà pour cet indicateur à cette date. */
  existe: boolean;
};

export type KpiImport = { id: string; nom: string };

export type AnalyseImport = {
  valides: LigneValide[];
  rejetees: LigneRejetee[];
  /** Lignes valides qui visent une date déjà saisie. */
  conflits: number;
  /** Lignes de données lues, hors lignes vides. */
  total: number;
};

export const COMMENTAIRE_MAX = 2000;

export type OptionsAnalyse = {
  /** Indicateur de toutes les lignes quand le fichier n'a pas de colonne « indicateur ». */
  kpiParDefautId: string | null;
  /** Clés « kpiId|date » des saisies déjà en base. */
  existantes: ReadonlySet<string>;
  aujourdhui: string;
};

export const cleSaisie = (kpiId: string, date: string) => `${kpiId}|${date}`;

export function analyserTable(
  table: Table,
  correspondance: Correspondance,
  kpis: KpiImport[],
  options: OptionsAnalyse,
): AnalyseImport {
  const parNom = new Map<string, KpiImport | "ambigu">();
  for (const kpi of kpis) {
    const cle = normaliser(kpi.nom);
    parNom.set(cle, parNom.has(cle) ? "ambigu" : kpi);
  }
  const kpiDefaut = options.kpiParDefautId ? (kpis.find((k) => k.id === options.kpiParDefautId) ?? null) : null;

  const valides: LigneValide[] = [];
  const rejetees: LigneRejetee[] = [];
  const vues = new Map<string, number>();
  let conflits = 0;
  let total = 0;

  const lire = (ligne: string[], champ: Champ) => {
    const index = correspondance[champ];
    return index === null ? "" : (ligne[index] ?? "").trim();
  };

  for (let i = 1; i < table.length; i++) {
    const cellules = table[i]!;
    if (cellules.every((c) => c.trim() === "")) continue;
    total += 1;
    const numero = i + 1; // numéro relatif à l'en-tête ; la page ajoute le décalage du fichier
    const problemes: Probleme[] = [];

    // Indicateur
    let kpi: KpiImport | null = null;
    if (correspondance.indicateur === null) {
      kpi = kpiDefaut;
      if (!kpi) problemes.push({ champ: "indicateur", valeurLue: "", raison: "indicateur_vide" });
    } else {
      const nom = lire(cellules, "indicateur");
      if (nom === "") problemes.push({ champ: "indicateur", valeurLue: nom, raison: "indicateur_vide" });
      else {
        const trouve = parNom.get(normaliser(nom));
        if (trouve === undefined) problemes.push({ champ: "indicateur", valeurLue: nom, raison: "indicateur_inconnu" });
        else if (trouve === "ambigu")
          problemes.push({ champ: "indicateur", valeurLue: nom, raison: "indicateur_ambigu" });
        else kpi = trouve;
      }
    }

    // Date
    let date: string | null = null;
    const texteDate = lire(cellules, "date");
    if (texteDate === "") problemes.push({ champ: "date", valeurLue: texteDate, raison: "date_vide" });
    else {
      const resultat = analyserDate(texteDate);
      if ("iso" in resultat) {
        // Comme à la saisie manuelle : pas de valeur datée dans le futur (une inversion jour/mois en produit souvent une).
        if (resultat.iso > options.aujourdhui)
          problemes.push({ champ: "date", valeurLue: texteDate, raison: "date_future" });
        else date = resultat.iso;
      } else problemes.push({ champ: "date", valeurLue: texteDate, raison: resultat.erreur });
    }

    // Valeur
    let valeur: number | null = null;
    const texteValeur = lire(cellules, "valeur");
    if (texteValeur === "") problemes.push({ champ: "valeur", valeurLue: texteValeur, raison: "valeur_vide" });
    else {
      const n = analyserNombre(texteValeur);
      if (n === null) problemes.push({ champ: "valeur", valeurLue: texteValeur, raison: "valeur_format" });
      else if (Math.abs(n) >= VALEUR_ABSOLUE_MAX)
        problemes.push({ champ: "valeur", valeurLue: texteValeur, raison: "valeur_trop_grande" });
      else valeur = n;
    }

    // Commentaire (facultatif)
    const commentaire = lire(cellules, "commentaire");
    if (commentaire.length > COMMENTAIRE_MAX) {
      problemes.push({
        champ: "commentaire",
        valeurLue: `${commentaire.slice(0, 40)}…`,
        raison: "commentaire_trop_long",
      });
    }

    // Doublon dans le fichier : la première occurrence est retenue.
    if (kpi && date && problemes.length === 0) {
      const cle = cleSaisie(kpi.id, date);
      const premiere = vues.get(cle);
      if (premiere !== undefined)
        problemes.push({ champ: "date", valeurLue: texteDate, raison: "doublon_fichier", ligneRef: premiere });
      else vues.set(cle, numero);
    }

    if (problemes.length > 0 || !kpi || !date || valeur === null) {
      rejetees.push({ ligne: numero, problemes });
      continue;
    }
    const existe = options.existantes.has(cleSaisie(kpi.id, date));
    if (existe) conflits += 1;
    valides.push({
      ligne: numero,
      kpiId: kpi.id,
      kpiNom: kpi.nom,
      date,
      valeur,
      commentaire: commentaire === "" ? null : commentaire,
      existe,
    });
  }
  return { valides, rejetees, conflits, total };
}

export function decouperEnLots<T>(elements: T[], taille: number): T[][] {
  const lots: T[][] = [];
  for (let i = 0; i < elements.length; i += taille) lots.push(elements.slice(i, i + taille));
  return lots;
}

// -----------------------------------------------------------------------------
// Fichiers produits : rapport d'erreurs et modèle
// -----------------------------------------------------------------------------

// Excel interprète comme formule toute cellule qui commence par ces caractères.
function neutraliser(texte: string): string {
  return /^[=+\-@\t\r]/.test(texte) ? `'${texte}` : texte;
}

function celluleCsv(texte: string): string {
  return /[";\n\r]/.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte;
}

/** CSV à séparateur « ; » avec BOM : s'ouvre correctement, accents compris, dans Excel en français. */
export function versCsv(lignes: string[][]): string {
  return `\uFEFF${lignes.map((l) => l.map(celluleCsv).join(";")).join("\r\n")}\r\n`;
}

export type { Traducteur };

/**
 * Rapport des lignes rejetées : un enregistrement par problème. `decalage` convertit le numéro
 * relatif à l'en-tête en numéro de ligne du fichier.
 */
export function construireRapportErreurs(rejetees: LigneRejetee[], decalage: number, t: Traducteur): string {
  const lignes: string[][] = [
    [
      t("import.rapport.ligne"),
      t("import.rapport.colonne"),
      t("import.rapport.valeur_lue"),
      t("import.rapport.probleme"),
    ],
  ];
  for (const rejet of rejetees) {
    for (const p of rejet.problemes) {
      lignes.push([
        String(rejet.ligne + decalage),
        t(`import.champs.${p.champ}`),
        neutraliser(p.valeurLue),
        t(`import.raisons.${p.raison}`, { ligne: p.ligneRef === undefined ? undefined : p.ligneRef + decalage }),
      ]);
    }
  }
  return versCsv(lignes);
}

/** Modèle à remplir : en-têtes attendus et une ligne d'exemple. */
export function construireModele(kpis: KpiImport[], aujourdhui: string, t: Traducteur): string {
  const exemple = kpis[0]?.nom ?? "";
  return versCsv([
    [t("import.champs.indicateur"), t("import.champs.date"), t("import.champs.valeur"), t("import.champs.commentaire")],
    [exemple, aujourdhui, "12", t("import.modele.commentaire_exemple")],
  ]);
}
