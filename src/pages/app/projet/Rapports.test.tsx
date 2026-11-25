import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Kpi, Projet } from "~/lib/donnees";
import Rapports from "./Rapports";

const exporter = vi.fn();
vi.mock("~/hooks/useExportPdf", () => ({ useExportPdf: () => ({ exporter, enCours: false }) }));

const projet = { id: "p1", nom: "Eau Kolda", date_debut: "2026-01-01", date_fin: "2026-12-31" } as unknown as Projet;
const kpi = { id: "k1", nom: "Forages", unite: "", cible: 10, valeur_base: 0 } as unknown as Kpi;

function monter(kpis: Kpi[]) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={{ projet, kpis, saisies: [] }} />}>
          <Route index element={<Rapports />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => exporter.mockReset());

describe("Rapports", () => {
  it("génère le rapport du projet sur la période choisie", () => {
    monter([kpi]);
    fireEvent.change(screen.getByLabelText("Période"), { target: { value: "6m" } });
    fireEvent.click(screen.getByRole("button", { name: "Générer le PDF" }));
    expect(exporter).toHaveBeenCalledTimes(1);
    const arg = exporter.mock.calls[0]![0];
    expect(arg.projet).toBe(projet);
    expect(arg.periode.debut).toMatch(/^\d{4}-\d{2}-\d{2}$/); // « 6 derniers mois » : début renseigné
  });

  it("sur « tout le projet », la période n'a pas de début", () => {
    monter([kpi]);
    fireEvent.click(screen.getByRole("button", { name: "Générer le PDF" }));
    expect(exporter.mock.calls[0]![0].periode.debut).toBeNull();
  });

  it("refuse de générer un rapport vide quand le projet n'a pas d'indicateur", () => {
    monter([]);
    expect(screen.getByText(/le rapport serait vide/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Générer le PDF" })).toBeDisabled();
  });

  it("empêche la génération sur une période personnalisée inversée", () => {
    monter([kpi]);
    fireEvent.change(screen.getByLabelText("Période"), { target: { value: "perso" } });
    fireEvent.change(screen.getByLabelText("Du"), { target: { value: "2026-06-01" } });
    fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2026-03-01" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Générer le PDF" })).toBeDisabled();
  });
});
