import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TauxAvancement } from "./TauxAvancement";

describe("TauxAvancement : les trois taux", () => {
  it("affiche résultats, physique et financier arrondis", () => {
    render(<TauxAvancement resultats={72.4} physique={37.5} financier={41.6} />);
    expect(screen.getByText("72 %")).toBeInTheDocument();
    expect(screen.getByText("38 %")).toBeInTheDocument();
    expect(screen.getByText("42 %")).toBeInTheDocument();
  });

  it("dit pourquoi un taux manque, pour chacun des trois", () => {
    render(<TauxAvancement resultats={null} physique={null} financier={null} />);
    expect(screen.getByText("Aucune donnée")).toBeInTheDocument();
    expect(screen.getByText("Aucune activité planifiée")).toBeInTheDocument();
    expect(screen.getByText("Aucun budget défini")).toBeInTheDocument();
  });

  it("annonce un budget dépassé en toutes lettres, pas seulement par la valeur", () => {
    render(<TauxAvancement resultats={50} physique={50} financier={130} />);
    const financier = screen.getByText("Financier").closest("div")!;
    expect(within(financier).getByText("130 %")).toBeInTheDocument();
    expect(within(financier).getByText("Budget dépassé")).toBeInTheDocument();
  });

  it("n'ajoute aucun avertissement à 100 % pile", () => {
    render(<TauxAvancement resultats={50} physique={50} financier={100} />);
    expect(screen.queryByText("Budget dépassé")).not.toBeInTheDocument();
  });
});
