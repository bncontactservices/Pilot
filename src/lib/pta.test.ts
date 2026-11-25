import { describe, expect, it } from "vitest";
import {
  anneeFiscale,
  anneeParDefaut,
  anneesProposees,
  bornesAnneeFiscale,
  moisFiscaux,
  periodeActivite,
  positionDansAnnee,
  positionDuJour,
  pourcentSelonStatut,
  trimestresFiscaux,
} from "./pta";

describe("année fiscale", () => {
  it("est l'année civile quand elle commence en janvier", () => {
    expect(anneeFiscale("2026-03-15", 1)).toBe(2026);
    expect(anneeFiscale("2026-12-31", 1)).toBe(2026);
    expect(bornesAnneeFiscale(2026, 1)).toEqual({ debut: "2026-01-01", fin: "2026-12-31" });
  });

  it("est identifiée par l'année où elle commence quand elle démarre en juillet", () => {
    expect(anneeFiscale("2026-07-01", 7)).toBe(2026);
    expect(anneeFiscale("2027-06-30", 7)).toBe(2026);
    expect(anneeFiscale("2026-06-30", 7)).toBe(2025);
    expect(bornesAnneeFiscale(2026, 7)).toEqual({ debut: "2026-07-01", fin: "2027-06-30" });
  });

  it("gère une année bissextile", () => {
    expect(bornesAnneeFiscale(2027, 3)).toEqual({ debut: "2027-03-01", fin: "2028-02-29" });
  });
});

describe("mois et trimestres", () => {
  it("liste douze mois consécutifs à cheval sur deux années", () => {
    const mois = moisFiscaux(2026, 10);
    expect(mois).toHaveLength(12);
    expect(mois[0]).toMatchObject({ annee: 2026, mois: 10, debut: "2026-10-01", fin: "2026-10-31" });
    expect(mois[3]).toMatchObject({ annee: 2027, mois: 1, debut: "2027-01-01" });
    expect(mois[11]).toMatchObject({ annee: 2027, mois: 9, fin: "2027-09-30" });
  });

  it("découpe l'année fiscale en quatre trimestres à partir du mois de début", () => {
    const trimestres = trimestresFiscaux(2026, 7);
    expect(trimestres.map((t) => [t.numero, t.debut, t.fin])).toEqual([
      [1, "2026-07-01", "2026-09-30"],
      [2, "2026-10-01", "2026-12-31"],
      [3, "2027-01-01", "2027-03-31"],
      [4, "2027-04-01", "2027-06-30"],
    ]);
  });
});

describe("période et position d'une activité", () => {
  it("préfère les dates au trimestre", () => {
    expect(periodeActivite({ annee: 2026, trimestre: 1, date_debut: "2026-02-10", date_fin: "2026-03-05" }, 1)).toEqual(
      {
        debut: "2026-02-10",
        fin: "2026-03-05",
      },
    );
  });

  it("déduit les dates du trimestre dans l'année fiscale", () => {
    expect(periodeActivite({ annee: 2026, trimestre: 2, date_debut: null, date_fin: null }, 1)).toEqual({
      debut: "2026-04-01",
      fin: "2026-06-30",
    });
    expect(periodeActivite({ annee: 2026, trimestre: 2, date_debut: null, date_fin: null }, 7)).toEqual({
      debut: "2026-10-01",
      fin: "2026-12-31",
    });
  });

  it("place une période en fractions de l'année", () => {
    const position = positionDansAnnee({ debut: "2026-04-01", fin: "2026-06-30" }, 2026, 1)!;
    expect(position.gauche).toBeCloseTo(90 / 365, 6);
    expect(position.largeur).toBeCloseTo(91 / 365, 6);
  });

  it("coupe une période qui déborde de l'année et ignore celle qui n'y touche pas", () => {
    const debordante = positionDansAnnee({ debut: "2025-11-01", fin: "2026-02-28" }, 2026, 1)!;
    expect(debordante.gauche).toBe(0);
    expect(debordante.largeur).toBeCloseTo(59 / 365, 6);
    expect(positionDansAnnee({ debut: "2027-01-01", fin: "2027-02-01" }, 2026, 1)).toBeNull();
    expect(positionDansAnnee({ debut: "2025-01-01", fin: "2025-12-31" }, 2026, 1)).toBeNull();
  });

  it("place un jour sur l'année, ou nulle part", () => {
    expect(positionDuJour("2026-07-02", 2026, 1)).toBeCloseTo(182.5 / 365, 6);
    expect(positionDuJour("2027-01-01", 2026, 1)).toBeNull();
  });
});

describe("années proposées", () => {
  const projet = { date_debut: "2025-11-01", date_fin: "2027-10-31" };

  it("couvre la durée du projet, les années déjà planifiées et l'année courante", () => {
    expect(anneesProposees(projet, [{ annee: 2030 }], 1, "2026-06-15")).toEqual([2025, 2026, 2027, 2030]);
    expect(anneesProposees({ date_debut: "2026-02-01", date_fin: "2026-09-01" }, [], 1, "2024-01-01")).toEqual([
      2024, 2026,
    ]);
  });

  it("choisit l'année courante, sinon la plus proche", () => {
    expect(anneeParDefaut([2025, 2026, 2027], "2026-06-15", 1)).toBe(2026);
    expect(anneeParDefaut([2025, 2027], "2026-06-15", 1)).toBe(2025);
    expect(anneeParDefaut([2024], "2026-06-15", 1)).toBe(2024);
  });
});

describe("pourcentage et statut", () => {
  it("met une activité terminée à 100 % et une activité à faire à 0 %", () => {
    expect(pourcentSelonStatut("termine", 40)).toBe(100);
    expect(pourcentSelonStatut("a_faire", 40)).toBe(0);
    expect(pourcentSelonStatut("en_cours", 40)).toBe(40);
    expect(pourcentSelonStatut("reporte", 10)).toBe(10);
    expect(pourcentSelonStatut("annule", 70)).toBe(70);
  });
});
