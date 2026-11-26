// @vitest-environment node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import fr from "~/i18n/fr.json";
import type { Avancement, AvancementProgramme } from "../donnees";
import type { Traducteur } from "../traduction";
import { enregistrerPolices } from "./polices";
import { type EntreeRapportProgramme, preparerRapportProgramme } from "./programme";
import { RapportProgrammePdf } from "./RapportProgrammePdf";

function t(cle: string, valeurs?: Record<string, unknown>): string {
  const noeud = cle.split(".").reduce<unknown>((n, p) => (n as Record<string, unknown> | undefined)?.[p], fr);
  let texte = typeof noeud === "string" ? noeud : undefined;
  if (texte === undefined && typeof valeurs?.count === "number") {
    const parent = cle
      .split(".")
      .slice(0, -1)
      .reduce<unknown>((n, p) => (n as Record<string, unknown>)?.[p], fr) as Record<string, string>;
    texte = parent[`${cle.split(".").at(-1)}_${new Intl.PluralRules("fr").select(valeurs.count)}`];
  }
  if (texte === undefined) throw new Error(`clé manquante : ${cle}`);
  return texte.replace(/\{\{(\w+)\}\}/g, (_, nom: string) => String(valeurs?.[nom] ?? ""));
}
const traduire: Traducteur = t;

const avancement = (extra: Partial<Avancement>): Avancement =>
  ({
    project_id: "p",
    org_id: "o1",
    programme_id: "g1",
    nb_kpis: 4,
    nb_kpis_avec_donnees: 4,
    taux_resultats: 72.4,
    fraction_ecoulee: 0.5,
    statut_resultats: "ok",
    nb_activites: 3,
    nb_activites_realisees: 1,
    taux_physique: 37.5,
    nb_etapes: 4,
    nb_etapes_terminees: 2,
    nb_etapes_en_retard: 0,
    budget_total: 250_000_000,
    depenses_total: 62_100_000,
    taux_financier: 24.84,
    ...extra,
  }) as Avancement;

const consolide = {
  programme_id: "g1",
  org_id: "o1",
  nb_projets: 3,
  nb_projets_avec_resultats: 2,
  taux_resultats: 60,
  nb_projets_avec_pta: 2,
  taux_physique: 40,
  nb_projets_avec_budget: 2,
  taux_financier: 62,
  nb_projets_depassement: 1,
} as AvancementProgramme;

const entree: EntreeRapportProgramme = {
  organisation: { nom: "ONG Eau & Vie", logo: null },
  programme: {
    nom: "Eau et assainissement 2026 — Kolda",
    description: "Programme régional financé par un bailleur.",
    date_debut: "2026-01-01",
    date_fin: "2027-12-31",
  },
  consolide,
  projets: [
    {
      id: "p2",
      nom: "Zèbre — latrines",
      statut: "en_retard",
      date_debut: "2026-03-01",
      date_fin: "2027-02-28",
      devise: "XOF",
      avancement: avancement({
        project_id: "p2",
        statut_resultats: "alert",
        taux_resultats: 31,
        nb_etapes_en_retard: 2,
        taux_financier: 130,
        depenses_total: 130_000_000,
        budget_total: 100_000_000,
      }),
    },
    {
      id: "p1",
      nom: "Accès à l’eau potable",
      statut: "en_cours",
      date_debut: "2026-01-01",
      date_fin: "2026-12-31",
      devise: "XOF",
      avancement: avancement({ project_id: "p1" }),
    },
    {
      id: "p3",
      nom: "Capitalisation",
      statut: "non_demarre",
      date_debut: "2027-01-01",
      date_fin: "2027-12-31",
      devise: "EUR",
      avancement: avancement({
        project_id: "p3",
        nb_kpis: 0,
        nb_kpis_avec_donnees: 0,
        taux_resultats: null,
        statut_resultats: "none",
        taux_physique: null,
        budget_total: null,
        depenses_total: null,
        taux_financier: null,
      }),
    },
  ],
  aujourdhui: "2026-11-25",
  t: traduire,
};

const rapport = preparerRapportProgramme(entree);

describe("données du rapport de programme", () => {
  it("reprend telles quelles les valeurs consolidées de la vue, sans les recalculer", () => {
    expect(rapport.synthese).toMatchObject({ resultats: "60 %", physique: "40 %", financier: "62 %" });
  });

  it("met un tiret quand aucun projet n'a de donnée pour un taux", () => {
    const vide = preparerRapportProgramme({
      ...entree,
      consolide: { ...consolide, taux_resultats: null, taux_physique: null, taux_financier: null },
    });
    expect(vide.synthese).toMatchObject({ resultats: "-", physique: "-", financier: "-" });
    expect(preparerRapportProgramme({ ...entree, consolide: null }).synthese.financier).toBe("-");
  });

  it("explique la consolidation : moyenne simple, projets avec données, projets avec budget, dépassements", () => {
    const notes = rapport.synthese.notes.join(" | ");
    expect(notes).toContain("moyenne simple");
    expect(notes).toContain("Résultats : 2 projets sur 3 ont des données d’indicateur.");
    expect(notes).toContain("Financier : 2 projets sur 3 ont un budget défini");
    expect(notes).toContain("plafonné à 100 %");
    expect(notes).toContain("1 projet dépasse son budget.");
  });

  it("accorde « projet(s) sur » avec le nombre de projets concernés, jamais « 1 projets sur 2 ont »", () => {
    const un = preparerRapportProgramme({
      ...entree,
      consolide: { ...consolide, nb_projets: 2, nb_projets_avec_resultats: 1, nb_projets_avec_budget: 1 },
    });
    const notes = un.synthese.notes.join(" | ");
    expect(notes).toContain("Résultats : 1 projet sur 2 a des données d’indicateur.");
    expect(notes).toContain("Financier : 1 projet sur 2 a un budget défini");
    expect(notes).not.toContain("1 projets");
  });

  it("ne dit rien du budget quand aucun projet n'en a", () => {
    const sans = preparerRapportProgramme({
      ...entree,
      consolide: { ...consolide, nb_projets_avec_budget: 0, nb_projets_depassement: 0 },
    });
    expect(sans.synthese.notes.join(" ")).not.toContain("Financier :");
  });

  it("liste les projets par ordre alphabétique avec leur statut, leur période et leurs trois taux", () => {
    expect(rapport.projets.map((p) => p.nom)).toEqual(["Accès à l’eau potable", "Capitalisation", "Zèbre — latrines"]);
    const eau = rapport.projets[0]!;
    expect(eau).toMatchObject({
      statut: "En cours",
      resultats: "72 %",
      physique: "38 %",
      financier: "25 %",
      statutResultats: "ok",
    });
    expect(eau.periode).toBe("janv. 2026 – déc. 2026");
    expect(eau.budget).toMatch(/62\s100\s000\sF\sCFA sur 250\s000\s000\sF\sCFA/);
  });

  it("n'invente aucun chiffre pour un projet sans donnée", () => {
    const capitalisation = rapport.projets[1]!;
    expect(capitalisation).toMatchObject({
      resultats: "-",
      physique: "-",
      financier: "-",
      budget: null,
      statutResultats: "none",
    });
    expect(capitalisation.statut).toBe("Non démarré");
  });

  it("signale un dépassement de budget sans le plafonner", () => {
    const retard = rapport.projets[2]!;
    expect(retard).toMatchObject({ financier: "130 %", depassement: true });
  });

  it("énumère les points d'attention, projet par projet, à partir des colonnes des vues", () => {
    expect(rapport.attention).toEqual([
      "« Capitalisation » : aucune donnée d’indicateur, les résultats ne sont pas évalués.",
      "« Zèbre — latrines » : les résultats sont en retard sur la trajectoire attendue (statut rouge).",
      "« Zèbre — latrines » : le budget est dépassé (130 % du budget prévu).",
      "« Zèbre — latrines » : 2 étapes en retard.",
    ]);
  });

  it("n'a aucun point d'attention quand tout va bien", () => {
    const bien = preparerRapportProgramme({ ...entree, projets: [entree.projets[1]!] });
    expect(bien.attention).toEqual([]);
  });

  it("nomme le fichier d'après le programme et la date, sans accent ni espace", () => {
    expect(rapport.nomFichier).toBe("Programme_Eau-et-assainissement-2026-Kolda_2026-11-25.pdf");
    expect(preparerRapportProgramme({ ...entree, programme: { ...entree.programme, nom: "…" } }).nomFichier).toBe(
      "Programme_sans-nom_2026-11-25.pdf",
    );
  });

  it("décrit la période du programme, ou l'omet quand elle n'est pas précisée", () => {
    expect(rapport.programme.periode).toBe("janv. 2026 – déc. 2027");
    const libre = preparerRapportProgramme({
      ...entree,
      programme: { ...entree.programme, date_debut: null, date_fin: null },
    });
    expect(libre.programme.periode).toBeNull();
  });
});

const police = (famille: string, graisse: number, nom: string) =>
  path.resolve(__dirname, `../../../node_modules/@fontsource/${famille}/files/${nom}-latin-${graisse}-normal.woff`);

describe("RapportProgrammePdf", () => {
  enregistrerPolices({
    sans: {
      400: police("plus-jakarta-sans", 400, "plus-jakarta-sans"),
      600: police("plus-jakarta-sans", 600, "plus-jakarta-sans"),
      700: police("plus-jakarta-sans", 700, "plus-jakarta-sans"),
      800: police("plus-jakarta-sans", 800, "plus-jakarta-sans"),
    },
    mono: { 400: police("ibm-plex-mono", 400, "ibm-plex-mono"), 500: police("ibm-plex-mono", 500, "ibm-plex-mono") },
  });

  it("produit un PDF valide pour un programme complet", async () => {
    const buffer = await renderToBuffer(<RapportProgrammePdf donnees={rapport} t={traduire} produit="Pilot M&E" />);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(5_000);
    if (process.env.PDF_SORTIE_PROGRAMME) {
      mkdirSync(path.dirname(process.env.PDF_SORTIE_PROGRAMME), { recursive: true });
      writeFileSync(process.env.PDF_SORTIE_PROGRAMME, buffer);
    }
  }, 60_000);

  it("produit un PDF pour un programme sans projet ni consolidation", async () => {
    const vide = preparerRapportProgramme({ ...entree, projets: [], consolide: null });
    const buffer = await renderToBuffer(<RapportProgrammePdf donnees={vide} t={traduire} produit="Pilot M&E" />);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 60_000);

  it("produit un PDF quand il y a beaucoup de projets et de points d'attention (plusieurs pages)", async () => {
    const nombreux = preparerRapportProgramme({
      ...entree,
      projets: Array.from({ length: 40 }, (_, i) => ({
        ...entree.projets[0]!,
        id: `p${i}`,
        nom: `Projet numéro ${i + 1}`,
      })),
    });
    const buffer = await renderToBuffer(<RapportProgrammePdf donnees={nombreux} t={traduire} produit="Pilot M&E" />);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect((buffer.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  }, 60_000);
});
