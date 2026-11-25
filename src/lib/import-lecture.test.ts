// @vitest-environment node
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { ErreurLecture } from "./import";
import { dateExcel, lireFichier } from "./import-lecture";

const tampon = (octets: Uint8Array | Buffer): ArrayBuffer =>
  octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer;
const csv = (texte: string, encodage: BufferEncoding = "utf8") => tampon(Buffer.from(texte, encodage));

function code(action: () => unknown) {
  try {
    action();
  } catch (e) {
    return e instanceof ErreurLecture ? e.code : `autre:${String(e)}`;
  }
  return null;
}

describe("lireFichier : CSV", () => {
  it("lit un CSV UTF-8 avec BOM et séparateur « ; »", () => {
    const { feuilles } = lireFichier(
      csv("﻿Indicateur;Date;Valeur\r\nForages réhabilités;31/01/2026;4,5\r\n"),
      "saisies.csv",
    );
    expect(feuilles).toHaveLength(1);
    expect(feuilles[0]!.table).toEqual([
      ["Indicateur", "Date", "Valeur"],
      ["Forages réhabilités", "31/01/2026", "4,5"],
    ]);
    expect(feuilles[0]!.numeroEntete).toBe(1);
  });

  it("devine le séparateur virgule et la tabulation", () => {
    expect(lireFichier(csv("a,b,c\n1,2,3"), "x.csv").feuilles[0]!.table[1]).toEqual(["1", "2", "3"]);
    expect(lireFichier(csv("a\tb\tc\n1\t2\t3"), "x.csv").feuilles[0]!.table[1]).toEqual(["1", "2", "3"]);
  });

  it("lit un CSV enregistré en Windows-1252 (Excel en français)", () => {
    const { feuilles } = lireFichier(
      csv("Indicateur;Date;Valeur\nÉlèves scolarisés;01/02/2026;12\n", "latin1"),
      "x.csv",
    );
    expect(feuilles[0]!.table[1]![0]).toBe("Élèves scolarisés");
  });

  it("garde les retours à la ligne et les séparateurs entre guillemets", () => {
    const { feuilles } = lireFichier(
      csv('Indicateur;Date;Valeur;Commentaire\nA;01/02/2026;1;"deux\nlignes; et un ""mot"""\n'),
      "x.csv",
    );
    expect(feuilles[0]!.table[1]![3]).toBe('deux\nlignes; et un "mot"');
  });

  it("ignore les lignes vides de tête et de queue et indique la ligne d'en-tête", () => {
    const { feuilles } = lireFichier(csv("\n\nDate;Valeur\n01/02/2026;1\n\n;\n"), "x.csv");
    expect(feuilles[0]!.table).toEqual([
      ["Date", "Valeur"],
      ["01/02/2026", "1"],
    ]);
    expect(feuilles[0]!.numeroEntete).toBe(3);
  });

  it("complète les lignes trop courtes pour avoir un tableau rectangulaire", () => {
    const { feuilles } = lireFichier(csv("a;b;c\n1\n1;2;3"), "x.csv");
    expect(feuilles[0]!.table[1]).toEqual(["1", "", ""]);
  });

  it("refuse un fichier vide, d'un type inconnu ou avec un guillemet jamais fermé", () => {
    expect(code(() => lireFichier(csv(""), "x.csv"))).toBe("vide");
    expect(code(() => lireFichier(csv("\n\n;\n"), "x.csv"))).toBe("vide");
    expect(code(() => lireFichier(csv("a;b"), "x.pdf"))).toBe("format_inconnu");
    expect(code(() => lireFichier(csv('a;b\n"jamais fermé;1'), "x.csv"))).toBe("illisible");
  });

  it("refuse un fichier de trop de lignes", () => {
    const lignes = ["Date;Valeur", ...Array.from({ length: 20_001 }, () => "01/02/2026;1")];
    expect(code(() => lireFichier(csv(lignes.join("\n")), "x.csv"))).toBe("trop_de_lignes");
  });

  it("refuse un fichier de plus de 10 Mo sans le lire", () => {
    expect(code(() => lireFichier(new ArrayBuffer(10 * 1024 * 1024 + 1), "x.csv"))).toBe("trop_gros");
  });

  it("refuse un faux .xlsx qui n'est pas un classeur", () => {
    expect(code(() => lireFichier(csv("ceci n'est pas un classeur"), "x.xlsx"))).toBe("illisible");
  });
});

function classeur(
  feuilles: Record<string, unknown[][]>,
  formats: Record<string, Record<string, string>> = {},
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [nom, lignes] of Object.entries(feuilles)) {
    const ws = XLSX.utils.aoa_to_sheet(lignes);
    for (const [adresse, format] of Object.entries(formats[nom] ?? {})) ws[adresse]!.z = format;
    XLSX.utils.book_append_sheet(wb, ws, nom);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const serie = (iso: string) => (Date.parse(iso) - Date.UTC(1899, 11, 30)) / 86_400_000;

describe("dateExcel", () => {
  it("convertit un numéro de série en date, sans décalage de fuseau", () => {
    expect(dateExcel(serie("2026-01-31"))).toBe("2026-01-31");
    expect(dateExcel(serie("2028-02-29"))).toBe("2028-02-29");
    expect(dateExcel(serie("2026-01-31") + 0.75)).toBe("2026-01-31"); // l'heure est ignorée
  });
});

describe("lireFichier : Excel", () => {
  it("lit les dates formatées comme des dates et garde les nombres tels quels", () => {
    const donnees = classeur(
      {
        Saisies: [
          ["Indicateur", "Date", "Valeur", "Commentaire"],
          ["Forages", serie("2026-01-31"), 4.5, "ok"],
          ["Forages", serie("2026-02-28"), 7, ""],
        ],
      },
      { Saisies: { B2: "dd/mm/yyyy", B3: "yyyy-mm-dd" } },
    );
    const { feuilles } = lireFichier(donnees, "saisies.xlsx");
    expect(feuilles.map((f) => f.nom)).toEqual(["Saisies"]);
    expect(feuilles[0]!.table).toEqual([
      ["Indicateur", "Date", "Valeur", "Commentaire"],
      ["Forages", "2026-01-31", "4.5", "ok"],
      ["Forages", "2026-02-28", "7", ""],
    ]);
  });

  it("garde en texte une date saisie comme texte et un nombre sans format de date", () => {
    const donnees = classeur({
      F: [
        ["Date", "Valeur"],
        ["31/01/2026", 46052],
      ],
    });
    expect(lireFichier(donnees, "x.xlsx").feuilles[0]!.table[1]).toEqual(["31/01/2026", "46052"]);
  });

  it("propose toutes les feuilles non vides et saute les feuilles vides", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Date", "Valeur"],
        ["01/02/2026", 1],
      ]),
      "Janvier",
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), "Vide");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[], ["Date", "Valeur"], ["01/03/2026", 2]]), "Mars");
    const { feuilles } = lireFichier(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer, "x.xlsx");
    expect(feuilles.map((f) => [f.nom, f.numeroEntete])).toEqual([
      ["Janvier", 1],
      ["Mars", 2],
    ]);
  });

  it("refuse un classeur sans aucune donnée", () => {
    expect(code(() => lireFichier(classeur({ Vide: [] }), "x.xlsx"))).toBe("vide");
  });

  it("n'exécute pas les formules : la valeur calculée est lue", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Date", "Valeur"],
      ["01/02/2026", 0],
    ]);
    ws.B2 = { t: "n", v: 42, f: "SUM(1,2)" };
    XLSX.utils.book_append_sheet(wb, ws, "F");
    const { feuilles } = lireFichier(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer, "x.xlsx");
    expect(feuilles[0]!.table[1]![1]).toBe("42");
  });
});
