import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Kpi, SaisieLigne } from "~/lib/donnees";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import Saisie from "./Saisie";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

const kpi = {
  id: "k1",
  project_id: "p1",
  nom: "Points d’eau réhabilités",
  unite: "points",
  cible: 100,
  valeur_base: 0,
  frequence: "mensuelle",
  sens: "croissant",
  type_agregation: "dernier",
  ordre: 0,
  epingle: false,
} as unknown as Kpi;

const localite = (id: string, nom: string, niveau: string, parent: string | null) => ({
  id,
  org_id: null,
  parent_id: parent,
  niveau,
  nom,
  latitude: null,
  longitude: null,
  source: "Test",
  created_by: null,
  created_at: "",
  updated_at: "",
});

beforeEach(() => {
  base.reinitialiser();
  gererErreur.mockReset();
});

describe("Saisie : localité", () => {
  it("ne propose pas de localité tant que le projet n'a aucune zone d'intervention", async () => {
    monterProjet(<Saisie />, { kpis: [kpi] });
    await screen.findByRole("heading", { name: "Saisir une valeur" });
    expect(screen.queryByLabelText(/^Localité/)).not.toBeInTheDocument();
  });

  it("propose les zones du projet et enregistre la localité avec la valeur", async () => {
    base.tables.localites = [
      localite("y", "Commune de Yoff", "commune", null),
      localite("l", "Layène", "quartier", "y"),
    ];
    base.tables.projet_localites = [{ id: "z1", project_id: "p1", org_id: "o1", localite_id: "l", notes: null }];
    monterProjet(<Saisie />, { kpis: [kpi] });
    const champ = await screen.findByLabelText(/^Localité/);
    expect(
      within(champ)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Aucune localité précisée", "Layène, Commune de Yoff"]);
    fireEvent.change(champ, { target: { value: "l" } });
    fireEvent.change(screen.getByLabelText(/^Valeur/), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(base.appels.some((a) => a.table === "kpi_entries" && a.operation === "insert")).toBe(true),
    );
    expect(base.appels.find((a) => a.operation === "insert")?.valeurs).toMatchObject({
      kpi_id: "k1",
      valeur: 12,
      localite_id: "l",
    });
  });

  it("n'envoie aucune localité quand le choix est laissé vide", async () => {
    base.tables.localites = [localite("y", "Commune de Yoff", "commune", null)];
    base.tables.projet_localites = [{ id: "z1", project_id: "p1", org_id: "o1", localite_id: "y", notes: null }];
    monterProjet(<Saisie />, { kpis: [kpi] });
    await screen.findByLabelText(/^Localité/);
    fireEvent.change(screen.getByLabelText(/^Valeur/), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(base.appels.some((a) => a.operation === "insert")).toBe(true));
    expect(base.appels.find((a) => a.operation === "insert")?.valeurs).toMatchObject({ localite_id: null });
  });

  it("ajoute la colonne « Localité » à l'historique quand une saisie en a une", async () => {
    base.tables.localites = [localite("y", "Commune de Yoff", "commune", null)];
    const saisie = (id: string, date: string, localite_id: string | null): SaisieLigne => ({
      id,
      kpi_id: "k1",
      date,
      valeur: 4,
      commentaire: null,
      localite_id,
      created_at: "",
      updated_at: "",
    });
    monterProjet(<Saisie />, {
      kpis: [kpi],
      saisies: [saisie("s1", "2026-03-01", "y"), saisie("s2", "2026-02-01", null)],
    });
    const tableau = await screen.findByRole("table");
    expect(within(tableau).getByRole("columnheader", { name: "Localité" })).toBeInTheDocument();
    expect(await within(tableau).findByText("Commune de Yoff")).toBeInTheDocument();
  });

  it("n'ajoute pas cette colonne quand aucune saisie n'a de localité", async () => {
    monterProjet(<Saisie />, {
      kpis: [kpi],
      saisies: [
        { id: "s1", kpi_id: "k1", date: "2026-03-01", valeur: 4, commentaire: null, created_at: "", updated_at: "" },
      ],
    });
    const tableau = await screen.findByRole("table");
    expect(within(tableau).queryByRole("columnheader", { name: "Localité" })).not.toBeInTheDocument();
  });
});
