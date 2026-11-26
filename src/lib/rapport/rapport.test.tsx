// @vitest-environment node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import fr from "~/i18n/fr.json";
import type { Kpi, Projet, SaisieLigne } from "../donnees";
import type { Traducteur } from "../traduction";
import { preparerRapport } from "./donnees";
import { enregistrerPolices } from "./polices";
import { RapportPdf } from "./RapportPdf";

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

const projet = {
  id: "p1",
  org_id: "o1",
  nom: "Accès à l’eau potable — Région de Kolda",
  description: "Réhabilitation de forages et sensibilisation des comités de gestion.",
  date_debut: "2026-01-01",
  date_fin: "2026-12-31",
  budget: 125000000,
  devise: "XOF",
  statut: "en_cours",
  secteur_id: null,
  is_demo: false,
  secteur: { libelle: "Eau, hygiène et assainissement" },
} as unknown as Projet;

const base = {
  project_id: "p1",
  org_id: "o1",
  description: null,
  valeur_base: 0,
  ordre: 1,
  epingle: true,
  noeud_id: null,
  created_at: "",
  updated_at: "",
};
const kpis: Kpi[] = [
  {
    ...base,
    id: "k1",
    nom: "Forages réhabilités",
    unite: "forages",
    cible: 40,
    frequence: "mensuelle",
    sens: "croissant",
    type_agregation: "cumul",
  },
  {
    ...base,
    id: "k2",
    nom: "Ménages ayant accès à l’eau potable",
    unite: "%",
    cible: 85,
    valeur_base: 40,
    frequence: "mensuelle",
    sens: "croissant",
    type_agregation: "dernier",
    ordre: 2,
  },
  {
    ...base,
    id: "k3",
    nom: "Délai moyen de réparation d’une panne",
    unite: "jours",
    cible: 3,
    valeur_base: 12,
    frequence: "mensuelle",
    sens: "decroissant",
    type_agregation: "moyenne",
    ordre: 3,
  },
  {
    ...base,
    id: "k4",
    nom: "Comités de gestion formés",
    unite: "comités",
    cible: 25,
    frequence: "trimestrielle",
    sens: "croissant",
    type_agregation: "cumul",
    ordre: 4,
  },
];
let n = 0;
const saisie = (kpi_id: string, date: string, valeur: number, commentaire: string | null = null): SaisieLigne => ({
  id: `s${++n}`,
  kpi_id,
  date,
  valeur,
  commentaire,
  created_at: "",
  updated_at: "",
});
const saisies: SaisieLigne[] = [
  saisie("k1", "2026-01-31", 3),
  saisie("k1", "2026-02-28", 4, "Premier lot terminé à Dabo"),
  saisie("k1", "2026-03-31", 5),
  saisie("k1", "2026-04-30", 6, "Retard de livraison des pièces"),
  saisie("k1", "2026-05-31", 5),
  saisie("k1", "2026-06-30", 4, "Saison des pluies : accès difficile"),
  saisie("k2", "2026-02-28", 44),
  saisie("k2", "2026-04-30", 52),
  saisie("k2", "2026-06-30", 61),
  saisie("k3", "2026-03-31", 9),
  saisie("k3", "2026-05-31", 7),
];

const entree = {
  organisation: { nom: "ONG Eau & Vie", logo: null },
  projet,
  kpis,
  saisies,
  periode: { debut: null, fin: "2026-07-02" },
  aujourdhui: "2026-07-02",
  t: traduire,
};

describe("preparerRapport", () => {
  const rapport = preparerRapport(entree);

  it("nomme le fichier d'après le projet et la période, sans accent ni espace", () => {
    expect(rapport.nomFichier).toBe("Acces-a-l-eau-potable-Region-de-Kolda_2026-01-01_2026-07-02.pdf");
    const filtre = preparerRapport({ ...entree, periode: { debut: "2026-04-01", fin: "2026-06-30" } });
    expect(filtre.nomFichier).toBe("Acces-a-l-eau-potable-Region-de-Kolda_2026-04-01_2026-06-30.pdf");
  });

  it("décrit la période et le projet", () => {
    expect(rapport.periode).toBe("Depuis le début du projet jusqu’au 2 juillet 2026");
    expect(preparerRapport({ ...entree, periode: { debut: "2026-04-01", fin: "2026-06-30" } }).periode).toBe(
      "Du 1 avril 2026 au 30 juin 2026",
    );
    expect(rapport.projet.meta).toContain("Eau, hygiène et assainissement");
    expect(rapport.projet.meta).toContain("En cours");
    expect(rapport.projet.estExemple).toBe(false);
  });

  it("reprend exactement l'évaluation de l'application (une seule source de calcul)", () => {
    const forages = rapport.kpis[0]!;
    expect(forages.valeur).toBe("27 forages"); // 3+4+5+6+5+4
    expect(forages.cible).toBe("40 forages");
    expect(forages.atteint).toBe("68 %");
    expect(forages.statut).toBe("ok");
    expect(rapport.kpis[1]!.valeur).toBe("61 %");
    expect(rapport.kpis[2]!.valeur).toBe("8 jours"); // moyenne de 9 et 7
    expect(rapport.kpis[3]!.valeur).toBe("-");
    expect(rapport.kpis[3]!.statut).toBe("none");
    expect(rapport.comptes.reduce((somme, c) => somme + c.nombre, 0)).toBe(4);
  });

  it("garde les commentaires de la période, du plus récent au plus ancien", () => {
    expect(rapport.kpis[0]!.commentaires.map((c) => c.texte)).toEqual([
      "Saison des pluies : accès difficile",
      "Retard de livraison des pièces",
      "Premier lot terminé à Dabo",
    ]);
    const avril = preparerRapport({ ...entree, periode: { debut: "2026-04-01", fin: "2026-06-30" } });
    expect(avril.kpis[0]!.commentaires).toHaveLength(2);
  });

  it("n'a pas de graphique sans saisie dans la période, et un point isolé reste tracé", () => {
    expect(rapport.kpis[3]!.graphique).toBeNull(); // aucune saisie du tout
    const juillet = preparerRapport({ ...entree, periode: { debut: "2026-07-01", fin: "2026-07-02" } });
    expect(juillet.kpis.every((k) => k.graphique === null)).toBe(true);
    const avril = preparerRapport({ ...entree, periode: { debut: "2026-04-01", fin: "2026-06-30" } });
    expect(avril.kpis[2]!.nbSaisies).toBe(1);
    expect(avril.kpis[2]!.graphique?.points).toHaveLength(1);
  });

  it("trace chaque courbe dans le cadre du graphique", () => {
    for (const k of rapport.kpis) {
      if (!k.graphique) continue;
      for (const p of k.graphique.points) {
        expect(p.x).toBeGreaterThanOrEqual(k.graphique.zone.gauche);
        expect(p.x).toBeLessThanOrEqual(k.graphique.zone.droite);
        expect(p.y).toBeGreaterThanOrEqual(k.graphique.zone.haut);
        expect(p.y).toBeLessThanOrEqual(k.graphique.zone.bas);
      }
    }
  });

  it("signale le projet exemple", () => {
    expect(preparerRapport({ ...entree, projet: { ...projet, is_demo: true } }).projet.estExemple).toBe(true);
  });
});

const police = (famille: string, graisse: number, nom: string) =>
  path.resolve(__dirname, `../../../node_modules/@fontsource/${famille}/files/${nom}-latin-${graisse}-normal.woff`);

describe("RapportPdf", () => {
  enregistrerPolices({
    sans: {
      400: police("plus-jakarta-sans", 400, "plus-jakarta-sans"),
      600: police("plus-jakarta-sans", 600, "plus-jakarta-sans"),
      700: police("plus-jakarta-sans", 700, "plus-jakarta-sans"),
      800: police("plus-jakarta-sans", 800, "plus-jakarta-sans"),
    },
    mono: { 400: police("ibm-plex-mono", 400, "ibm-plex-mono"), 500: police("ibm-plex-mono", 500, "ibm-plex-mono") },
  });

  it("produit un PDF valide pour un projet complet", async () => {
    const buffer = await renderToBuffer(
      <RapportPdf donnees={preparerRapport(entree)} t={traduire} produit="Pilot M&E" />,
    );
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(10_000);
    if (process.env.PDF_SORTIE) {
      mkdirSync(path.dirname(process.env.PDF_SORTIE), { recursive: true });
      writeFileSync(process.env.PDF_SORTIE, buffer);
    }
  }, 60_000);

  it("affiche le logo de l'organisation quand il existe", async () => {
    const logo = {
      src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAAAwCAIAAAAZy+Y5AAAAu0lEQVR4nO3ZwQmAQAwAwftbh6VYg71YvTUcHKjrQN5Dwj4ztv2Ym+ucG/6j/vj6AXyBf+0LHPcFjvsCx32B477AcV/guC9w3Bc47gsc9wWO+wLHfYHjvsBxf7xtIf5aX+C4L3DcFzjuCxz3BY77Asd9geO+wHFf4LgvcNwXOO4LHPcFjvsCx32B476Hf9wXOO4LHPcFjvsCx32B477AcV/guC9w3Bc47gsc9wWO+wLHfYHjvsBxX+C4fwNMV8AevCXThAAAAABJRU5ErkJggg==",
      largeur: 160,
      hauteur: 48,
    };
    const donnees = preparerRapport({ ...entree, organisation: { nom: "ONG Eau & Vie", logo } });
    const buffer = await renderToBuffer(<RapportPdf donnees={donnees} t={traduire} produit="Pilot M&E" />);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.includes(Buffer.from("/Subtype /Image"))).toBe(true);
    if (process.env.PDF_SORTIE_LOGO) writeFileSync(process.env.PDF_SORTIE_LOGO, buffer);
  }, 60_000);

  it("produit un PDF pour un projet sans indicateur ni saisie", async () => {
    const vide = preparerRapport({ ...entree, kpis: [], saisies: [], projet: { ...projet, is_demo: true } });
    const buffer = await renderToBuffer(<RapportPdf donnees={vide} t={traduire} produit="Pilot M&E" />);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 60_000);
});
