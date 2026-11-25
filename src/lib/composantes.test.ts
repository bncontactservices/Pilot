import { describe, expect, it } from "vitest";
import { type ActivitePlan, type ComposantePlan, construirePlanning, dureeJours } from "./composantes";
import { graduations, positionJour, tronquer } from "./gantt";
import { numeroJour } from "./kpi";

const composante = (id: string, nom: string, extra: Partial<ComposantePlan> = {}): ComposantePlan => ({
  id,
  nom,
  responsable: null,
  date_debut: "2026-02-01",
  date_fin: "2026-08-31",
  statut: "en_cours",
  ordre: 0,
  ...extra,
});
const activite = (id: string, intitule: string, extra: Partial<ActivitePlan> = {}): ActivitePlan => ({
  id,
  intitule,
  date_debut: "2026-03-01",
  date_fin: "2026-04-30",
  statut: "en_cours",
  pct_realisation: 50,
  composante_id: null,
  ...extra,
});

describe("planning des composantes", () => {
  it("rattache les activités datées à leur composante, triées par date de début", () => {
    const p = construirePlanning(
      [composante("c1", "Eau")],
      [
        activite("a2", "Seconde", { composante_id: "c1", date_debut: "2026-05-01", date_fin: "2026-06-01" }),
        activite("a1", "Première", { composante_id: "c1" }),
      ],
      "2026-06-15",
    );
    expect(p.groupes).toHaveLength(1);
    expect(p.groupes[0]!.activitesDatees.map((a) => a.intitule)).toEqual(["Première", "Seconde"]);
    expect(p.groupes[0]!.nbActivites).toBe(2);
  });

  it("calcule l'avancement physique d'une composante : moyenne de ses activités, hors annulées", () => {
    const p = construirePlanning(
      [composante("c1", "Eau")],
      [
        activite("a1", "A", { composante_id: "c1", pct_realisation: 100, statut: "termine" }),
        activite("a2", "B", { composante_id: "c1", pct_realisation: 50 }),
        activite("a3", "C", { composante_id: "c1", pct_realisation: 0, statut: "annule" }),
      ],
      "2026-06-15",
    );
    expect(p.groupes[0]!.taux).toBe(75);
  });

  it("sans activité, pas de taux (jamais un 0 % trompeur)", () => {
    const p = construirePlanning([composante("c1", "Eau")], [], "2026-06-15");
    expect(p.groupes[0]!.taux).toBeNull();
    expect(p.groupes[0]!.nbActivites).toBe(0);
  });

  it("une composante est en retard quand sa fin est passée sans qu'elle soit terminée ou annulée", () => {
    const p = construirePlanning(
      [
        composante("c1", "En retard", { date_fin: "2026-05-31", ordre: 1 }),
        composante("c2", "Terminée", { date_fin: "2026-05-31", statut: "termine", ordre: 2 }),
        composante("c3", "Annulée", { date_fin: "2026-05-31", statut: "annule", ordre: 3 }),
        composante("c4", "À venir", { date_fin: "2026-12-31", ordre: 4 }),
      ],
      [],
      "2026-06-15",
    );
    expect(p.groupes.map((g) => [g.composante.nom, g.enRetard])).toEqual([
      ["En retard", true],
      ["Terminée", false],
      ["Annulée", false],
      ["À venir", false],
    ]);
    expect(p.nbEnRetard).toBe(1);
  });

  it("met à part les composantes sans dates et les activités sans composante", () => {
    const p = construirePlanning(
      [composante("c1", "Datée"), composante("c2", "À planifier", { date_debut: null, date_fin: null })],
      [
        activite("a1", "Orpheline"),
        activite("a2", "Sans dates", { date_debut: null, date_fin: null }),
        activite("a3", "Liée à une composante supprimée", { composante_id: "inconnue" }),
      ],
      "2026-06-15",
    );
    expect(p.groupes.map((g) => g.composante.nom)).toEqual(["Datée"]);
    expect(p.aPlanifier.map((c) => c.nom)).toEqual(["À planifier"]);
    expect(p.sansComposante.map((a) => a.intitule)).toEqual(["Liée à une composante supprimée", "Orpheline"]);
  });

  it("étend l'axe à tout ce qui est dessiné, y compris une activité qui déborde de sa composante", () => {
    const p = construirePlanning(
      [composante("c1", "Eau", { date_debut: "2026-02-01", date_fin: "2026-08-31" })],
      [activite("a1", "Débordante", { composante_id: "c1", date_debut: "2026-01-10", date_fin: "2026-10-05" })],
      "2026-06-15",
    );
    expect(p.periode).toEqual({ debut: numeroJour("2026-01-10"), fin: numeroJour("2026-10-05") });
  });

  it("pas de période quand rien n'est daté", () => {
    expect(
      construirePlanning([composante("c1", "X", { date_debut: null, date_fin: null })], [], "2026-06-15").periode,
    ).toBeNull();
  });

  it("ordonne par ordre saisi, puis par date de début", () => {
    const p = construirePlanning(
      [
        composante("c1", "Tardive", { ordre: 2, date_debut: "2026-01-01" }),
        composante("c2", "Deuxième", { ordre: 1, date_debut: "2026-06-01", date_fin: "2026-09-01" }),
        composante("c3", "Première", { ordre: 1, date_debut: "2026-03-01", date_fin: "2026-09-01" }),
      ],
      [],
      "2026-06-15",
    );
    expect(p.groupes.map((g) => g.composante.nom)).toEqual(["Première", "Deuxième", "Tardive"]);
  });

  it("compte les jours d'une barre, bornes comprises", () => {
    expect(dureeJours({ debut: numeroJour("2026-03-01"), fin: numeroJour("2026-03-31") })).toBe(31);
    expect(dureeJours({ debut: numeroJour("2026-03-01"), fin: numeroJour("2026-03-01") })).toBe(1);
  });
});

describe("échelle de temps", () => {
  it("place les jours proportionnellement dans la largeur utile", () => {
    const debut = numeroJour("2026-01-01");
    const fin = numeroJour("2026-01-10"); // dix jours
    expect(positionJour(debut, debut, fin, 12, 100)).toBe(12);
    expect(positionJour(debut + 5, debut, fin, 12, 100)).toBe(62);
    expect(positionJour(fin + 1, debut, fin, 12, 100)).toBe(112); // la fin d'une barre est le jour suivant
  });

  it("propose au plus huit repères, au premier du mois", () => {
    const marques = graduations(numeroJour("2025-11-01"), numeroJour("2027-10-31"));
    expect(marques.length).toBeLessThanOrEqual(8);
    expect(marques.every((m) => m.iso.endsWith("-01"))).toBe(true);
    expect(marques[0]!.iso).toBe("2026-01-01"); // un repère tous les trois mois, alignés sur le trimestre
  });

  it("tronque les libellés trop longs avec une ellipse", () => {
    expect(tronquer("Court", 10)).toBe("Court");
    expect(tronquer("Un libellé vraiment trop long", 12)).toBe("Un libellé…");
  });
});
