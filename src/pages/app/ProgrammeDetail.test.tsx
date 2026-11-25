import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContexteOrgProvider, construireContexte } from "~/hooks/useContexteOrg";
import { creerFausseBase } from "~/test/fausse-base";
import ProgrammeDetail from "./ProgrammeDetail";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const exporter = vi.fn();
vi.mock("~/hooks/useExportRapportProgramme", () => ({
  useExportRapportProgramme: () => ({ exporter, enCours: false }),
}));

function monter(role: "admin" | "editeur" | "lecteur" = "editeur", essaiFini = false) {
  const organisation = {
    id: "o1",
    nom: "ONG Eau",
    plan: essaiFini ? ("essai" as const) : ("pro" as const),
    plan_souhaite: null,
    essai_fin: essaiFini ? "2020-01-01T00:00:00Z" : "2099-01-01T00:00:00Z",
    devise_defaut: "XOF",
    pays: "SN",
    logo_path: null,
  };
  const contexte = construireContexte(role, organisation, {
    id: "u",
    nom: "A",
    email: "a@exemple.test",
    telephone: null,
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ContexteOrgProvider valeur={contexte}>
        <MemoryRouter initialEntries={["/app/programmes/g1"]}>
          <Routes>
            <Route path="/app/programmes/:programmeId" element={<ProgrammeDetail />} />
          </Routes>
        </MemoryRouter>
      </ContexteOrgProvider>
    </QueryClientProvider>,
  );
}

const programme = {
  id: "g1",
  org_id: "o1",
  nom: "Eau 2026",
  description: "Programme régional",
  date_debut: "2026-01-01",
  date_fin: "2027-12-31",
  created_by: null,
  created_at: "",
  updated_at: "",
};
const projet = (id: string, nom: string) => ({
  id,
  nom,
  statut: "en_cours",
  date_debut: "2026-01-01",
  date_fin: "2026-12-31",
  devise: "XOF",
});
const consolide = {
  programme_id: "g1",
  org_id: "o1",
  nb_projets: 2,
  nb_projets_avec_resultats: 2,
  taux_resultats: 72,
  nb_projets_avec_pta: 1,
  taux_physique: 38,
  nb_projets_avec_budget: 1,
  taux_financier: 25,
  nb_projets_depassement: 0,
};

function donnees() {
  base.tables.programmes = [programme];
  base.tables.projects = [projet("p1", "Eau Kolda"), projet("p2", "Latrines")];
  base.tables.v_avancement = [
    {
      project_id: "p1",
      org_id: "o1",
      taux_resultats: 80,
      taux_physique: 40,
      taux_financier: 25,
      statut_resultats: "ok",
    },
    {
      project_id: "p2",
      org_id: "o1",
      taux_resultats: 64,
      taux_physique: null,
      taux_financier: null,
      statut_resultats: "warn",
    },
  ];
  base.tables.v_avancement_programme = [consolide];
}

beforeEach(() => {
  base.reinitialiser();
  exporter.mockReset();
});

describe("Programme : rapport PDF consolidé", () => {
  it("propose le rapport PDF et lui transmet le programme, sa consolidation et l'avancement de chaque projet", async () => {
    donnees();
    monter("editeur");
    fireEvent.click(await screen.findByRole("button", { name: "Rapport PDF du programme" }));
    await waitFor(() => expect(exporter).toHaveBeenCalledTimes(1));
    const envoi = exporter.mock.calls[0]![0];
    expect(envoi.programme).toEqual({
      nom: "Eau 2026",
      description: "Programme régional",
      date_debut: "2026-01-01",
      date_fin: "2027-12-31",
    });
    expect(envoi.consolide).toMatchObject({ taux_resultats: 72, taux_financier: 25 });
    expect(
      envoi.projets.map((p: { nom: string; avancement: { taux_resultats: number } }) => [
        p.nom,
        p.avancement.taux_resultats,
      ]),
    ).toEqual([
      ["Eau Kolda", 80],
      ["Latrines", 64],
    ]);
    expect(envoi.projets[0].devise).toBe("XOF");
  });

  it("reste disponible pour un lecteur et après la fin de l'essai : c'est une lecture", async () => {
    donnees();
    monter("lecteur", true);
    expect(await screen.findByRole("button", { name: "Rapport PDF du programme" })).toBeInTheDocument();
  });

  it("accorde le décompte des projets avec leur nombre : « 1 projet sur 2 a un budget », jamais « 1 projets »", async () => {
    donnees();
    monter("editeur");
    expect(await screen.findByText("1 projet sur 2 a un budget défini.", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/1 projets/)).not.toBeInTheDocument();
  });

  it("ne le propose pas quand le programme n'a aucun projet : il serait vide", async () => {
    base.tables.programmes = [programme];
    base.tables.v_avancement_programme = [{ ...consolide, nb_projets: 0 }];
    monter("editeur");
    await screen.findByRole("heading", { name: "Eau 2026" });
    expect(screen.queryByRole("button", { name: "Rapport PDF du programme" })).not.toBeInTheDocument();
  });
});
