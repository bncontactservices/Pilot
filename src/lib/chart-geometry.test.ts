import { describe, expect, it } from "vitest";
import {
  cheminAire,
  cheminLigne,
  geometrieGraphique,
  graduationsNettes,
  pointsCourbe,
  ticksMois,
} from "./chart-geometry";

describe("pointsCourbe", () => {
  it("répartit les points sur la largeur et inverse l'axe vertical", () => {
    const points = pointsCourbe([0, 5, 10], 106, 56, 3);
    expect(points).toEqual([
      { x: 3, y: 53 },
      { x: 53, y: 28 },
      { x: 103, y: 3 },
    ]);
  });
  it("trace une courbe plate au milieu", () => {
    expect(pointsCourbe([7, 7, 7], 100, 40, 0).map((p) => p.y)).toEqual([20, 20, 20]);
  });
  it("centre un point unique", () => {
    expect(pointsCourbe([4], 100, 40)).toEqual([{ x: 50, y: 20 }]);
  });
  it("renvoie une liste vide sans valeur", () => {
    expect(pointsCourbe([], 100, 40)).toEqual([]);
  });
});

describe("chemins SVG", () => {
  const points = [
    { x: 0, y: 10 },
    { x: 5, y: 4 },
  ];
  it("construit la ligne", () => {
    expect(cheminLigne(points)).toBe("M0 10 L5 4");
  });
  it("ferme l'aire sous la courbe", () => {
    expect(cheminAire(points, 20)).toBe("M0 10 L5 4 L5 20 L0 20 Z");
    expect(cheminAire([], 20)).toBe("");
  });
});

describe("ticksMois", () => {
  const jour = (iso: string) => Date.parse(iso) / 86_400_000;

  it("donne les débuts de mois situés après le début et jusqu'à la fin", () => {
    expect(ticksMois(jour("2026-01-15"), jour("2026-04-10"))).toEqual([
      jour("2026-02-01"),
      jour("2026-03-01"),
      jour("2026-04-01"),
    ]);
  });
  it("ne compte pas un début de mois égal au début du domaine", () => {
    expect(ticksMois(jour("2026-01-01"), jour("2026-02-15"))).toEqual([jour("2026-02-01")]);
  });
  it("espace les repères au-delà de huit mois", () => {
    const ticks = ticksMois(jour("2026-01-01"), jour("2027-12-31"));
    expect(ticks.length).toBeLessThanOrEqual(8);
    expect(ticks.length).toBeGreaterThan(3);
  });
  it("ne renvoie rien sur un domaine plus court qu'un mois sans début de mois", () => {
    expect(ticksMois(jour("2026-03-03"), jour("2026-03-20"))).toEqual([]);
  });
});

describe("graduationsNettes", () => {
  it("choisit des valeurs rondes dans le domaine", () => {
    expect(graduationsNettes(0, 100)).toEqual([0, 25, 50, 75, 100]);
    expect(graduationsNettes(3, 97)).toEqual([25, 50, 75]);
    expect(graduationsNettes(0, 1)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(graduationsNettes(-10, 10, 4)).toEqual([-10, -5, 0, 5, 10]);
  });
  it("gère un domaine nul", () => {
    expect(graduationsNettes(5, 5)).toEqual([5]);
  });
});

describe("geometrieGraphique", () => {
  const jour = (iso: string) => Date.parse(iso) / 86_400_000;
  const entree = {
    largeur: 400,
    hauteur: 200,
    marges: { haut: 10, droite: 20, bas: 30, gauche: 40 },
    domaineX: [jour("2026-01-01"), jour("2026-12-31")] as [number, number],
    serie: [
      { x: jour("2026-01-01"), valeur: 0 },
      { x: jour("2026-12-31"), valeur: 100 },
    ],
    cible: 100,
    base: 0,
    trajectoire: [
      { x: jour("2026-01-01"), valeur: 0 },
      { x: jour("2026-12-31"), valeur: 100 },
    ] as [{ x: number; valeur: number }, { x: number; valeur: number }],
  };

  it("place la courbe dans la zone de tracé, l'origine en bas à gauche et la cible en haut", () => {
    const g = geometrieGraphique(entree);
    expect(g.zone).toEqual({ gauche: 40, droite: 380, haut: 10, bas: 170 });
    expect(g.points[0]!.x).toBe(40);
    expect(g.points[1]!.x).toBe(380);
    expect(g.points[0]!.y).toBeGreaterThan(g.points[1]!.y); // y croît vers le bas
    expect(g.yCible).toBe(g.points[1]!.y);
    expect(g.courbe.startsWith("M40 ")).toBe(true);
  });

  it("garde toutes les valeurs dans la zone, y compris au-delà de la cible", () => {
    const g = geometrieGraphique({ ...entree, serie: [...entree.serie, { x: jour("2026-06-01"), valeur: 140 }] });
    for (const p of g.points) {
      expect(p.y).toBeGreaterThanOrEqual(g.zone.haut);
      expect(p.y).toBeLessThanOrEqual(g.zone.bas);
    }
  });

  it("repère les mois et les valeurs rondes", () => {
    const g = geometrieGraphique(entree);
    expect(g.axeX).toHaveLength(6); // 11 débuts de mois, un sur deux gardé
    expect(g.axeX.every((t) => t.x > g.zone.gauche && t.x < g.zone.droite)).toBe(true);
    expect(g.axeY.map((t) => t.valeur)).toEqual([0, 50, 100]);
  });

  it("trace une courbe plate au milieu quand toutes les valeurs sont égales", () => {
    const g = geometrieGraphique({
      ...entree,
      cible: 5,
      base: 5,
      serie: [{ x: jour("2026-03-01"), valeur: 5 }],
      trajectoire: [
        { x: jour("2026-01-01"), valeur: 5 },
        { x: jour("2026-12-31"), valeur: 5 },
      ],
    });
    expect(Number.isFinite(g.points[0]!.y)).toBe(true);
    expect(g.yCible).toBe(g.points[0]!.y);
  });
});
