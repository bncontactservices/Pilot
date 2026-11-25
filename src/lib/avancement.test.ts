import { describe, expect, it } from "vitest";
import { arrondirTaux, enRetard, moyenneTaux, resumeEtapes, tauxPhysique } from "./avancement";
import { ajouterJours, evaluerProjet, type KpiAvecId, type SaisieAvecKpi } from "./kpi";

// Mêmes cas que supabase/tests/07_lot2_regles.test.sql (vues v_kpi_atteinte et v_avancement).
// « Aujourd'hui » est fixé ; les dates de saisie sont exprimées en jours par rapport à lui, comme en SQL.
const AUJOURDHUI = "2026-06-15";
const jour = (n: number) => ajouterJours(AUJOURDHUI, n);

const projetA = { date_debut: jour(-100), date_fin: jour(100) };
const kpiA = (id: string, k: Omit<KpiAvecId, "id" | "frequence">): KpiAvecId => ({ id, frequence: "mensuelle", ...k });

const kpis: KpiAvecId[] = [
  kpiA("K1", { cible: 110, valeur_base: 10, sens: "croissant", type_agregation: "cumul" }),
  kpiA("K2", { cible: 200, valeur_base: 0, sens: "croissant", type_agregation: "dernier" }),
  kpiA("K3", { cible: 20, valeur_base: 100, sens: "decroissant", type_agregation: "moyenne" }),
  kpiA("K4", { cible: 5, valeur_base: 5, sens: "croissant", type_agregation: "dernier" }),
  kpiA("K5", { cible: 100, valeur_base: 0, sens: "croissant", type_agregation: "dernier" }),
  kpiA("K6", { cible: 50, valeur_base: 0, sens: "croissant", type_agregation: "dernier" }),
  kpiA("K7", { cible: 100, valeur_base: 0, sens: "croissant", type_agregation: "dernier" }),
];
const saisie = (kpi_id: string, jours: number, valeur: number): SaisieAvecKpi => ({
  kpi_id,
  date: jour(jours),
  valeur,
});
const saisies: SaisieAvecKpi[] = [
  saisie("K1", -50, 20),
  saisie("K1", -10, 30),
  saisie("K1", -200, 999), // avant le début du projet : ignorée
  saisie("K1", 5, 1000), // dans le futur : ignorée
  saisie("K2", -30, 80),
  saisie("K2", -5, 120),
  saisie("K3", -40, 80),
  saisie("K3", -20, 60),
  saisie("K4", -1, 7),
  saisie("K6", 0, 100),
  saisie("K7", -3, -10),
];
const contexte = (projet: { date_debut: string; date_fin: string }, seuils?: { vert: number; ambre: number }) => ({
  projet,
  periode: { debut: null, fin: AUJOURDHUI },
  aujourdhui: AUJOURDHUI,
  seuils,
});

describe("formules d'avancement (miroir des vues SQL)", () => {
  const evaluation = evaluerProjet(kpis, saisies, contexte(projetA));
  const de = (id: string) => evaluation.evaluations.find((e) => e.id === id)!;

  it("calcule chaque indicateur comme la vue v_kpi_atteinte", () => {
    expect(de("K1").valeur).toBe(60);
    expect(de("K1").pourcent).toBeCloseTo(50, 6);
    expect(de("K2").valeur).toBe(120);
    expect(de("K2").pourcent).toBeCloseTo(60, 6);
    expect(de("K3").valeur).toBeCloseTo(70, 6);
    expect(de("K3").pourcent).toBeCloseTo(37.5, 6);
    expect(de("K4").pourcent).toBeNull();
    expect(de("K5").valeur).toBeNull();
    expect(de("K6").pourcent).toBe(150);
    expect(de("K7").pourcent).toBe(0);
  });

  it("calcule le taux de résultats, la fraction écoulée et le statut", () => {
    expect(evaluation.progression).toBeCloseTo(49.5, 6);
    expect(evaluation.fraction).toBeCloseTo(0.5, 6);
    expect(evaluation.statut).toBe("ok");
  });

  it("applique les seuils de l'organisation", () => {
    expect(evaluerProjet(kpis, saisies, contexte(projetA, { vert: 100, ambre: 95 })).statut).toBe("warn");
    expect(evaluerProjet(kpis, saisies, contexte(projetA, { vert: 100, ambre: 99.5 })).statut).toBe("alert");
  });

  it("retombe sur le pourcentage seul pour un projet pas commencé", () => {
    const projetB = { date_debut: jour(10), date_fin: jour(210) };
    const resultat = evaluerProjet(
      [kpiA("KB", { cible: 100, valeur_base: 0, sens: "croissant", type_agregation: "dernier" })],
      [saisie("KB", 0, 95)],
      contexte(projetB),
    );
    expect(resultat.progression).toBe(95);
    expect(resultat.fraction).toBe(0);
    expect(resultat.statut).toBe("ok");
  });

  it("n'a pas de trajectoire pour un projet de durée nulle", () => {
    const projetC = { date_debut: jour(-5), date_fin: jour(-5) };
    const resultat = evaluerProjet(
      [kpiA("KC", { cible: 100, valeur_base: 0, sens: "croissant", type_agregation: "dernier" })],
      [saisie("KC", -1, 40)],
      contexte(projetC),
    );
    expect(resultat.fraction).toBeNull();
    expect(resultat.statut).toBe("alert");
  });

  it("annonce « aucune donnée » sans indicateur", () => {
    const resultat = evaluerProjet([], [], contexte(projetA));
    expect(resultat.progression).toBeNull();
    expect(resultat.statut).toBe("none");
  });
});

describe("taux physique du plan de travail", () => {
  it("est la moyenne des % de réalisation, hors activités annulées", () => {
    const resultat = tauxPhysique([
      { statut: "termine", pct_realisation: 100 },
      { statut: "en_cours", pct_realisation: 40 },
      { statut: "a_faire", pct_realisation: 0 },
      { statut: "annule", pct_realisation: 70 },
      { statut: "reporte", pct_realisation: 10 },
    ]);
    expect(resultat).toEqual({ taux: 37.5, nombre: 4, realisees: 1 });
  });

  it("est nul sans activité comptée", () => {
    expect(tauxPhysique([]).taux).toBeNull();
    expect(tauxPhysique([{ statut: "annule", pct_realisation: 50 }])).toEqual({ taux: null, nombre: 0, realisees: 0 });
  });
});

describe("étapes et échéances", () => {
  it("compte les étapes terminées et en retard, sans les annulées", () => {
    const resume = resumeEtapes(
      [
        { statut: "termine", date_prevue: jour(-30) },
        { statut: "en_cours", date_prevue: jour(-10) },
        { statut: "a_faire", date_prevue: jour(30) },
        { statut: "annule", date_prevue: jour(-20) },
      ],
      AUJOURDHUI,
    );
    expect(resume).toEqual({ nombre: 3, terminees: 1, enRetard: 1 });
  });

  it("ne déclare en retard ni une échéance du jour, ni une action terminée, ni une action sans date", () => {
    expect(enRetard({ statut: "a_faire", echeance: AUJOURDHUI }, AUJOURDHUI)).toBe(false);
    expect(enRetard({ statut: "termine", echeance: jour(-3) }, AUJOURDHUI)).toBe(false);
    expect(enRetard({ statut: "en_cours", echeance: null }, AUJOURDHUI)).toBe(false);
    expect(enRetard({ statut: "en_cours", echeance: jour(-1) }, AUJOURDHUI)).toBe(true);
  });
});

describe("consolidation par programme", () => {
  it("est la moyenne simple des taux des projets qui en ont un (49,5 et 95 → 72,25)", () => {
    expect(moyenneTaux([49.5, 95, null])).toBeCloseTo(72.25, 6);
    expect(moyenneTaux([null, null])).toBeNull();
    expect(moyenneTaux([])).toBeNull();
  });

  it("arrondit pour l'affichage", () => {
    expect(arrondirTaux(49.5)).toBe(50);
    expect(arrondirTaux(null)).toBeNull();
  });
});
