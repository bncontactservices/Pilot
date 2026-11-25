import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContexteOrgProvider, construireContexte } from "~/hooks/useContexteOrg";
import { creerFausseBase } from "~/test/fausse-base";
import Programmes from "./Programmes";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

function monter(role: "admin" | "editeur" | "lecteur" = "editeur") {
  const organisation = {
    id: "o1",
    nom: "ONG Eau",
    plan: "pro" as const,
    plan_souhaite: null,
    essai_fin: "2099-01-01T00:00:00Z",
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
        <MemoryRouter>
          <Programmes />
        </MemoryRouter>
      </ContexteOrgProvider>
    </QueryClientProvider>,
  );
}

const programme = (id: string, nom: string, extra = {}) => ({
  id,
  org_id: "o1",
  nom,
  description: null,
  date_debut: null,
  date_fin: null,
  created_by: null,
  created_at: "",
  updated_at: "",
  ...extra,
});

beforeEach(() => {
  base.reinitialiser();
  gererErreur.mockReset();
});

describe("Programmes : liste", () => {
  it("affiche chaque programme avec son nombre de projets et ses taux consolidés", async () => {
    base.tables.programmes = [
      programme("g1", "Eau 2026", { date_debut: "2026-01-01", date_fin: "2027-12-31" }),
      programme("g2", "Santé communautaire"),
    ];
    base.tables.v_avancement_programme = [
      {
        programme_id: "g1",
        org_id: "o1",
        nb_projets: 2,
        nb_projets_avec_resultats: 2,
        taux_resultats: 72.25,
        nb_projets_avec_pta: 1,
        taux_physique: 37.5,
        nb_projets_avec_budget: 2,
        taux_financier: 41.6,
        nb_projets_depassement: 0,
      },
      {
        programme_id: "g2",
        org_id: "o1",
        nb_projets: 0,
        nb_projets_avec_resultats: 0,
        taux_resultats: null,
        nb_projets_avec_pta: 0,
        taux_physique: null,
        nb_projets_avec_budget: 0,
        taux_financier: null,
        nb_projets_depassement: 0,
      },
    ];
    monter();
    const carteEau = (await screen.findByRole("link", { name: "Eau 2026" })).closest("article")!;
    expect(await within(carteEau).findByText("2 projets")).toBeInTheDocument();
    expect(within(carteEau).getByText("72 %")).toBeInTheDocument();
    expect(within(carteEau).getByText("38 %")).toBeInTheDocument();
    expect(within(carteEau).getByText("42 %")).toBeInTheDocument();

    const carteSante = screen.getByRole("link", { name: "Santé communautaire" }).closest("article")!;
    expect(await within(carteSante).findByText("0 projet")).toBeInTheDocument();
    expect(within(carteSante).getByText("Période non précisée")).toBeInTheDocument();
    expect(within(carteSante).queryByText("Résultats")).not.toBeInTheDocument();
  });

  it("propose de créer un premier programme à un éditeur", async () => {
    monter("editeur");
    expect(await screen.findByText("Aucun programme pour l’instant")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Nouveau programme/ }).length).toBeGreaterThan(0);
  });

  it("n'offre aucune création à un lecteur", async () => {
    monter("lecteur");
    expect(await screen.findByText("Aucun programme pour l’instant")).toBeInTheDocument();
    expect(screen.getByText("Aucun programme n’a encore été créé dans cette organisation.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nouveau programme/ })).not.toBeInTheDocument();
  });
});

describe("Programmes : création", () => {
  it("refuse un nom trop court puis enregistre un programme valide", async () => {
    monter("admin");
    fireEvent.click((await screen.findAllByRole("button", { name: /Nouveau programme/ }))[0]!);
    const dialogue = await screen.findByRole("dialog");

    fireEvent.change(within(dialogue).getByLabelText(/Nom du programme/), { target: { value: "A" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Créer le programme" }));
    expect(await within(dialogue).findByText("Saisissez un nom d’au moins 2 caractères.")).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);

    fireEvent.change(within(dialogue).getByLabelText(/Nom du programme/), { target: { value: "Programme Eau" } });
    fireEvent.change(within(dialogue).getByLabelText(/Début/), { target: { value: "2026-03-01" } });
    fireEvent.change(within(dialogue).getByLabelText(/Fin/), { target: { value: "2026-01-01" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Créer le programme" }));
    expect(await within(dialogue).findByText("La fin doit être postérieure ou égale au début.")).toBeInTheDocument();

    fireEvent.change(within(dialogue).getByLabelText(/Fin/), { target: { value: "2027-03-01" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Créer le programme" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "programmes",
      operation: "insert",
      valeurs: {
        org_id: "o1",
        nom: "Programme Eau",
        description: null,
        date_debut: "2026-03-01",
        date_fin: "2027-03-01",
      },
    });
  });
});
