import { describe, expect, it } from "vitest";
import { anneesProposees, arrondirMontant, ecartBudgetProjet, syntheseBudget, tauxFinancier } from "./finances";

describe("taux financier", () => {
  // Les mêmes cas que supabase/tests/10_lot3a_finances.test.sql.
  it("30 dépensés sur 150 prévus = 20 %", () => expect(tauxFinancier(150, 30)).toBe(20));
  it("un dépassement n'est pas plafonné : 120 sur 100 = 120 %", () => expect(tauxFinancier(100, 120)).toBe(120));
  it("un budget sans dépense = 0 %", () => expect(tauxFinancier(80, 0)).toBe(0));
  it("sans budget, ou avec un budget nul, pas de taux (pas de division par zéro)", () => {
    expect(tauxFinancier(0, 0)).toBeNull();
    expect(tauxFinancier(0, 10)).toBeNull();
  });
});

describe("arrondi au centime", () => {
  it("n'affiche pas les erreurs de la virgule flottante", () => expect(arrondirMontant(0.1 + 0.2)).toBe(0.3));
  it("garde deux décimales", () => expect(arrondirMontant(12.345)).toBe(12.35));
});

const lignes = [
  { id: "l1", annee: 2026, poste: "Forages", montant_prevu: 100 },
  { id: "l2", annee: 2026, poste: "Latrines", montant_prevu: 50 },
  { id: "l3", annee: 2027, poste: "Forages", montant_prevu: 100 },
  { id: "l4", annee: 2027, poste: "Pilotage", montant_prevu: 0 },
];

describe("synthèse du budget", () => {
  it("cumule les dépenses par ligne et calcule reste et taux", () => {
    const s = syntheseBudget(lignes, [
      { budget_ligne_id: "l1", montant: 30 },
      { budget_ligne_id: "l1", montant: 12.5 },
      { budget_ligne_id: "l2", montant: 10 },
    ]);
    const l1 = s.lignes.find((l) => l.id === "l1")!;
    expect(l1).toMatchObject({ depense: 42.5, reste: 57.5, taux: 42.5, depassement: false, nbDepenses: 2 });
    expect(s.lignes.find((l) => l.id === "l3")).toMatchObject({ depense: 0, reste: 100, taux: 0, nbDepenses: 0 });
  });

  it("signale un dépassement, et le reste devient négatif", () => {
    const s = syntheseBudget(lignes, [{ budget_ligne_id: "l2", montant: 80 }]);
    expect(s.lignes.find((l) => l.id === "l2")).toMatchObject({ reste: -30, taux: 160, depassement: true });
    expect(s.depassements).toBe(1);
  });

  it("une dépense sur une ligne à zéro est un dépassement sans taux", () => {
    const s = syntheseBudget(lignes, [{ budget_ligne_id: "l4", montant: 5 }]);
    expect(s.lignes.find((l) => l.id === "l4")).toMatchObject({ taux: null, depassement: true, reste: -5 });
  });

  it("regroupe par année, la plus récente d'abord, postes triés", () => {
    const s = syntheseBudget(lignes, [{ budget_ligne_id: "l1", montant: 30 }]);
    expect(s.annees.map((a) => a.annee)).toEqual([2027, 2026]);
    expect(s.annees[1]!.lignes.map((l) => l.poste)).toEqual(["Forages", "Latrines"]);
    expect(s.annees[1]).toMatchObject({ prevu: 150, depense: 30, taux: 20 });
  });

  it("totalise tout le projet", () => {
    const s = syntheseBudget(lignes, [
      { budget_ligne_id: "l1", montant: 30 },
      { budget_ligne_id: "l3", montant: 120 },
    ]);
    expect(s).toMatchObject({ prevu: 250, depense: 150, reste: 100, taux: 60, depassements: 1 });
  });

  it("sans ligne budgétaire : tout à zéro, aucun taux", () => {
    expect(syntheseBudget([], [])).toMatchObject({
      prevu: 0,
      depense: 0,
      reste: 0,
      taux: null,
      depassements: 0,
      annees: [],
    });
  });

  it("accepte des montants renvoyés en texte par la base", () => {
    const s = syntheseBudget(
      [{ id: "a", annee: 2026, poste: "X", montant_prevu: "100.50" as unknown as number }],
      [{ budget_ligne_id: "a", montant: "20.25" as unknown as number }],
    );
    expect(s).toMatchObject({ prevu: 100.5, depense: 20.25 });
  });
});

describe("écart avec le budget du projet", () => {
  it("rien à signaler quand les deux concordent", () => expect(ecartBudgetProjet(250, 250)).toBeNull());
  it("rien à signaler quand le budget du projet ou les lignes manquent", () => {
    expect(ecartBudgetProjet(null, 250)).toBeNull();
    expect(ecartBudgetProjet(250, 0)).toBeNull();
  });
  it("indique l'écart signé : lignes moins budget du projet", () => {
    expect(ecartBudgetProjet(250, 240)).toBe(-10);
    expect(ecartBudgetProjet(250, 260.5)).toBe(10.5);
  });
});

describe("années proposées", () => {
  it("toutes les années du projet, la plus proche d'aujourd'hui d'abord", () => {
    expect(anneesProposees("2025-11-01", "2027-10-31", "2026-11-25")).toEqual([2026, 2027, 2025]);
  });
  it("une seule année pour un projet court", () =>
    expect(anneesProposees("2026-02-01", "2026-09-30", "2026-11-25")).toEqual([2026]));
});
