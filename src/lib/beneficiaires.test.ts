import { describe, expect, it } from "vitest";
import {
  categories,
  clePeriode,
  dePeriode,
  type Effectif,
  matriceAgeSexe,
  periodeDeCle,
  periodes,
  synthese,
} from "./beneficiaires";

const e = (extra: Partial<Effectif>): Effectif => ({
  periode_debut: "2026-01-01",
  periode_fin: "2026-06-30",
  categorie: "Usagers",
  sexe: "femme",
  tranche_age: "25_59",
  effectif: 100,
  ...extra,
});

describe("périodes et catégories", () => {
  const liste = [
    e({}),
    e({ sexe: "homme" }),
    e({ periode_debut: "2026-07-01", periode_fin: "2026-12-31", categorie: "Participants" }),
  ];
  it("liste chaque période une fois, la plus récente d'abord", () => {
    expect(periodes(liste)).toEqual([
      { debut: "2026-07-01", fin: "2026-12-31" },
      { debut: "2026-01-01", fin: "2026-06-30" },
    ]);
  });
  it("liste les catégories triées", () => expect(categories(liste)).toEqual(["Participants", "Usagers"]));
  it("garde la période d'une clé et la retrouve", () => {
    const p = { debut: "2026-01-01", fin: "2026-06-30" };
    expect(periodeDeCle(clePeriode(p))).toEqual(p);
    expect(dePeriode(liste, p)).toHaveLength(2);
  });
});

describe("synthèse des effectifs", () => {
  const liste = [
    e({ sexe: "femme", tranche_age: "5_14", effectif: 60 }),
    e({ sexe: "homme", tranche_age: "5_14", effectif: 40 }),
    e({ sexe: "femme", tranche_age: "25_59", effectif: 140, categorie: "Participants" }),
    e({ sexe: "non_precise", tranche_age: "non_precise", effectif: 60, categorie: "Participants" }),
  ];
  const s = synthese(liste);
  it("totalise et ventile par sexe et par tranche", () => {
    expect(s.total).toBe(300);
    expect(s.parSexe).toEqual({ femme: 200, homme: 40, non_precise: 60 });
    expect(s.parTranche["5_14"]).toBe(100);
    expect(s.parTranche["25_59"]).toBe(140);
    expect(s.parTranche.non_precise).toBe(60);
  });
  it("classe les catégories, la plus nombreuse d'abord", () => {
    expect(s.parCategorie).toEqual([
      { categorie: "Participants", total: 200 },
      { categorie: "Usagers", total: 100 },
    ]);
  });
  it("calcule la part des femmes parmi les sexes connus seulement", () => {
    expect(s.partFemmes).toBeCloseTo((200 / 240) * 100, 6);
  });
  it("dit la part de ce qui n'est pas ventilé", () => expect(s.partNonVentile).toBe(20));
  it("sans sexe précisé, pas de part de femmes (jamais 0 % trompeur)", () => {
    const sans = synthese([e({ sexe: "non_precise", effectif: 10 })]);
    expect(sans.partFemmes).toBeNull();
    expect(sans.total).toBe(10);
  });
  it("sans effectif, tout est vide", () => {
    const vide = synthese([]);
    expect(vide).toMatchObject({ total: 0, partFemmes: null, partNonVentile: null, parCategorie: [] });
  });
});

describe("tableau tranche d'âge × sexe", () => {
  it("garde l'ordre des âges et ne montre que les tranches renseignées", () => {
    const m = matriceAgeSexe([
      e({ tranche_age: "60_plus", sexe: "homme", effectif: 5 }),
      e({ tranche_age: "5_14", sexe: "femme", effectif: 7 }),
      e({ tranche_age: "5_14", sexe: "homme", effectif: 3 }),
    ]);
    expect(m.map((l) => l.tranche)).toEqual(["5_14", "60_plus"]);
    expect(m[0]).toMatchObject({ femme: 7, homme: 3, non_precise: 0, total: 10 });
  });
});
