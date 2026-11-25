import { describe, expect, it } from "vitest";
import {
  analyserDate,
  analyserNombre,
  analyserTable,
  cleSaisie,
  construireModele,
  construireRapportErreurs,
  decouperEnLots,
  normaliser,
  proposerCorrespondance,
  type Correspondance,
  type KpiImport,
  type Table,
} from "./import";
import fr from "~/i18n/fr.json";

describe("normaliser", () => {
  it("ignore la casse, les accents et la ponctuation", () => {
    expect(normaliser("  Forages  réhabilités (nb) ")).toBe("forages rehabilites nb");
    expect(normaliser("Date de saisie")).toBe("date de saisie");
  });
});

describe("proposerCorrespondance", () => {
  it("reconnaît les en-têtes usuels, accents et casse compris", () => {
    expect(proposerCorrespondance(["Indicateur", "Date", "Valeur", "Commentaire"])).toEqual({
      indicateur: 0,
      date: 1,
      valeur: 2,
      commentaire: 3,
    });
    expect(proposerCorrespondance(["DATE", "Réalisé", "Remarques"])).toEqual({
      indicateur: null,
      date: 0,
      valeur: 1,
      commentaire: 2,
    });
  });
  it("laisse vides les champs introuvables", () => {
    expect(proposerCorrespondance(["A", "B"])).toEqual({
      indicateur: null,
      date: null,
      valeur: null,
      commentaire: null,
    });
  });
  it("n'attribue jamais deux champs à la même colonne", () => {
    const c = proposerCorrespondance(["Date", "Nom", "Valeur"]);
    expect(new Set(Object.values(c).filter((v) => v !== null)).size).toBe(3);
  });
});

describe("analyserDate", () => {
  it.each([
    ["2026-03-01", "2026-03-01"],
    ["2026-3-1", "2026-03-01"],
    ["2026-03-01T00:00:00Z", "2026-03-01"],
    ["2026-03-01 14:30", "2026-03-01"],
    ["01/03/2026", "2026-03-01"],
    ["1-3-2026", "2026-03-01"],
    ["01.03.2026", "2026-03-01"],
    ["2026/03/01", "2026-03-01"],
    ["29/02/2028", "2028-02-29"],
  ])("lit %s", (brut, iso) => {
    expect(analyserDate(brut)).toEqual({ iso });
  });

  it("lit jour d'abord quand l'année est en dernier", () => {
    expect(analyserDate("03/12/2026")).toEqual({ iso: "2026-12-03" });
  });

  it("refuse une date qui n'existe pas", () => {
    expect(analyserDate("31/02/2026")).toEqual({ erreur: "date_inexistante" });
    expect(analyserDate("29/02/2027")).toEqual({ erreur: "date_inexistante" });
    expect(analyserDate("2026-13-01")).toEqual({ erreur: "date_inexistante" });
  });

  it("refuse une année improbable", () => {
    expect(analyserDate("01/01/1899")).toEqual({ erreur: "date_improbable" });
    expect(analyserDate("2101-01-01")).toEqual({ erreur: "date_improbable" });
  });

  it("refuse les formats non pris en charge, dont l'année sur 2 chiffres", () => {
    expect(analyserDate("01/03/26")).toEqual({ erreur: "date_format" });
    expect(analyserDate("mars 2026")).toEqual({ erreur: "date_format" });
    expect(analyserDate("46082")).toEqual({ erreur: "date_format" });
  });
});

describe("analyserNombre", () => {
  it.each([
    ["12", 12],
    ["12,5", 12.5],
    ["12.5", 12.5],
    ["-3,25", -3.25],
    ["−3,25", -3.25], // signe moins typographique
    ["+7", 7],
    ["1 234,5", 1234.5],
    ["1\u00a0234,5", 1234.5], // espace insécable
    ["1\u202f234,5", 1234.5], // espace fine insécable (format fr-FR)
    ["1.234,5", 1234.5],
    ["1,234.5", 1234.5],
    ["1.234.567", 1234567],
    ["1,234,567", 1234567],
    ["45 %", 45],
    ["1E+05", 100000],
    ["1,5e3", 1500],
    [".5", 0.5],
    ["0", 0],
  ])("lit %j", (brut, valeur) => {
    expect(analyserNombre(brut)).toBe(valeur);
  });

  it("lit une virgule isolée comme séparateur décimal", () => {
    expect(analyserNombre("1,234")).toBe(1.234);
  });

  it.each(["", "abc", "12 kg", "1,2,3", "1.2.3", "1,2.3,4", "--5", "5-", "1..2", "NaN", "Infinity", "#DIV/0!"])(
    "refuse %j",
    (brut) => {
      expect(analyserNombre(brut)).toBeNull();
    },
  );
});

const kpis: KpiImport[] = [
  { id: "k1", nom: "Forages réhabilités" },
  { id: "k2", nom: "Taux de couverture" },
];
const correspondance: Correspondance = { indicateur: 0, date: 1, valeur: 2, commentaire: 3 };
const base = { kpiParDefautId: null, existantes: new Set<string>(), aujourdhui: "2026-07-02" };
const entete = ["Indicateur", "Date", "Valeur", "Commentaire"];

describe("analyserTable", () => {
  it("valide les lignes correctes et rattache l'indicateur sans tenir compte de la casse ni des accents", () => {
    const table: Table = [
      entete,
      ["Forages réhabilités", "31/01/2026", "4", "Premier lot"],
      ["forages rehabilites", "28/02/2026", "5,5", ""],
      ["TAUX DE COUVERTURE", "2026-03-31", "62 %", ""],
    ];
    const a = analyserTable(table, correspondance, kpis, base);
    expect(a.rejetees).toEqual([]);
    expect(a.total).toBe(3);
    expect(a.valides).toEqual([
      {
        ligne: 2,
        kpiId: "k1",
        kpiNom: "Forages réhabilités",
        date: "2026-01-31",
        valeur: 4,
        commentaire: "Premier lot",
        existe: false,
      },
      {
        ligne: 3,
        kpiId: "k1",
        kpiNom: "Forages réhabilités",
        date: "2026-02-28",
        valeur: 5.5,
        commentaire: null,
        existe: false,
      },
      {
        ligne: 4,
        kpiId: "k2",
        kpiNom: "Taux de couverture",
        date: "2026-03-31",
        valeur: 62,
        commentaire: null,
        existe: false,
      },
    ]);
  });

  it("rejette chaque ligne fautive avec la colonne et la raison, sans bloquer les autres", () => {
    const table: Table = [
      entete,
      ["Inconnu", "31/01/2026", "4", ""],
      ["Forages réhabilités", "31/02/2026", "4", ""],
      ["Forages réhabilités", "31/01/2026", "beaucoup", ""],
      ["", "", "", "juste un commentaire"],
      ["Forages réhabilités", "28/02/2026", "9", ""],
    ];
    const a = analyserTable(table, correspondance, kpis, base);
    expect(a.valides.map((v) => v.ligne)).toEqual([6]);
    expect(a.rejetees).toEqual([
      { ligne: 2, problemes: [{ champ: "indicateur", valeurLue: "Inconnu", raison: "indicateur_inconnu" }] },
      { ligne: 3, problemes: [{ champ: "date", valeurLue: "31/02/2026", raison: "date_inexistante" }] },
      { ligne: 4, problemes: [{ champ: "valeur", valeurLue: "beaucoup", raison: "valeur_format" }] },
      {
        ligne: 5,
        problemes: [
          { champ: "indicateur", valeurLue: "", raison: "indicateur_vide" },
          { champ: "date", valeurLue: "", raison: "date_vide" },
          { champ: "valeur", valeurLue: "", raison: "valeur_vide" },
        ],
      },
    ]);
  });

  it("ignore les lignes entièrement vides sans les compter ni décaler la numérotation", () => {
    const table: Table = [entete, ["", "", "", ""], ["Forages réhabilités", "31/01/2026", "4", ""], ["  ", "", "", ""]];
    const a = analyserTable(table, correspondance, kpis, base);
    expect(a.total).toBe(1);
    expect(a.valides[0]!.ligne).toBe(3);
  });

  it("refuse la deuxième occurrence d'un même indicateur à une même date", () => {
    const table: Table = [
      entete,
      ["Forages réhabilités", "31/01/2026", "4", ""],
      ["Forages réhabilités", "2026-01-31", "5", ""],
    ];
    const a = analyserTable(table, correspondance, kpis, base);
    expect(a.valides.map((v) => v.valeur)).toEqual([4]);
    expect(a.rejetees).toEqual([
      { ligne: 3, problemes: [{ champ: "date", valeurLue: "2026-01-31", raison: "doublon_fichier", ligneRef: 2 }] },
    ]);
  });

  it("repère les dates déjà saisies", () => {
    const table: Table = [
      entete,
      ["Forages réhabilités", "31/01/2026", "4", ""],
      ["Forages réhabilités", "28/02/2026", "9", ""],
    ];
    const a = analyserTable(table, correspondance, kpis, {
      ...base,
      existantes: new Set([cleSaisie("k1", "2026-01-31")]),
    });
    expect(a.valides.map((v) => v.existe)).toEqual([true, false]);
    expect(a.conflits).toBe(1);
  });

  it("rejette une date dans le futur, comme la saisie manuelle (aujourd'hui reste permis)", () => {
    const table: Table = [
      entete,
      ["Forages réhabilités", "02/07/2026", "4", ""],
      ["Forages réhabilités", "03/07/2026", "9", ""],
    ];
    const a = analyserTable(table, correspondance, kpis, base);
    expect(a.valides.map((v) => v.date)).toEqual(["2026-07-02"]);
    expect(a.rejetees).toEqual([
      { ligne: 3, problemes: [{ champ: "date", valeurLue: "03/07/2026", raison: "date_future" }] },
    ]);
  });

  it("sans colonne « indicateur », rattache toutes les lignes à l'indicateur choisi", () => {
    const table: Table = [
      ["Date", "Valeur"],
      ["31/01/2026", "4"],
      ["28/02/2026", "7"],
    ];
    const sansIndicateur: Correspondance = { indicateur: null, date: 0, valeur: 1, commentaire: null };
    const a = analyserTable(table, sansIndicateur, kpis, { ...base, kpiParDefautId: "k2" });
    expect(a.valides.map((v) => v.kpiId)).toEqual(["k2", "k2"]);
    const sansChoix = analyserTable(table, sansIndicateur, kpis, base);
    expect(sansChoix.valides).toEqual([]);
    expect(sansChoix.rejetees[0]!.problemes[0]).toMatchObject({ champ: "indicateur", raison: "indicateur_vide" });
  });

  it("refuse un nom d'indicateur porté par deux indicateurs du projet", () => {
    const doubles: KpiImport[] = [
      { id: "a", nom: "Visites" },
      { id: "b", nom: "visites" },
    ];
    const a = analyserTable([entete, ["Visites", "31/01/2026", "4", ""]], correspondance, doubles, base);
    expect(a.rejetees[0]!.problemes[0]!.raison).toBe("indicateur_ambigu");
  });

  it("refuse une valeur démesurée et un commentaire trop long", () => {
    const a = analyserTable(
      [
        entete,
        ["Forages réhabilités", "31/01/2026", "1e15", ""],
        ["Forages réhabilités", "28/02/2026", "4", "x".repeat(2001)],
      ],
      correspondance,
      kpis,
      base,
    );
    expect(a.rejetees.map((r) => r.problemes[0]!.raison)).toEqual(["valeur_trop_grande", "commentaire_trop_long"]);
  });

  it("accepte les valeurs négatives et nulles", () => {
    const a = analyserTable(
      [entete, ["Forages réhabilités", "31/01/2026", "-3", ""], ["Forages réhabilités", "28/02/2026", "0", ""]],
      correspondance,
      kpis,
      base,
    );
    expect(a.valides.map((v) => v.valeur)).toEqual([-3, 0]);
  });
});

describe("decouperEnLots", () => {
  it("découpe en lots de la taille demandée", () => {
    expect(decouperEnLots([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(decouperEnLots([], 2)).toEqual([]);
  });
});

// Traducteur minimal : lit fr.json et remplace {{ligne}}.
function t(cle: string, valeurs?: Record<string, unknown>): string {
  const texte = cle.split(".").reduce<unknown>((n, p) => (n as Record<string, unknown> | undefined)?.[p], fr);
  if (typeof texte !== "string") throw new Error(`clé manquante : ${cle}`);
  return texte.replace(/\{\{(\w+)\}\}/g, (_, nom: string) => String(valeurs?.[nom] ?? ""));
}

describe("fichiers produits", () => {
  it("le rapport d'erreurs donne le numéro de ligne du fichier, la colonne et le problème", () => {
    const csv = construireRapportErreurs(
      [{ ligne: 3, problemes: [{ champ: "valeur", valeurLue: "beaucoup", raison: "valeur_format" }] }],
      2,
      t,
    );
    expect(csv.startsWith("﻿")).toBe(true);
    const lignes = csv.trim().split("\r\n");
    expect(lignes[0]).toBe("Ligne;Colonne;Valeur lue;Problème");
    expect(lignes[1]!.startsWith("5;Valeur;beaucoup;")).toBe(true);
  });

  it("neutralise les cellules que le tableur lirait comme des formules", () => {
    const csv = construireRapportErreurs(
      [{ ligne: 2, problemes: [{ champ: "valeur", valeurLue: "=1+1", raison: "valeur_format" }] }],
      0,
      t,
    );
    expect(csv).toContain(";'=1+1;");
  });

  it("protège les séparateurs et les guillemets", () => {
    const csv = construireRapportErreurs(
      [{ ligne: 2, problemes: [{ champ: "indicateur", valeurLue: 'a;"b"', raison: "indicateur_inconnu" }] }],
      0,
      t,
    );
    expect(csv).toContain('"a;""b"""');
  });

  it("le modèle contient les en-têtes et une ligne d'exemple avec un indicateur du projet", () => {
    const lignes = construireModele(kpis, "2026-07-02", t).trim().split("\r\n");
    expect(lignes[0]).toBe("Indicateur;Date;Valeur;Commentaire");
    expect(lignes[1]!.startsWith("Forages réhabilités;2026-07-02;12;")).toBe(true);
    // Le modèle téléchargé est relu sans erreur par l'import.
    const a = analyserTable(
      construireModele(kpis, "2026-07-02", t)
        .replace("﻿", "")
        .trim()
        .split("\r\n")
        .map((l) => l.split(";")),
      proposerCorrespondance(lignes[0]!.split(";")),
      kpis,
      base,
    );
    expect(a.rejetees).toEqual([]);
    expect(a.valides).toHaveLength(1);
  });
});
