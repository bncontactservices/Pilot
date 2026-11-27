import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContexteOrgProvider, construireContexte } from "~/hooks/useContexteOrg";
import { creerFausseBase } from "~/test/fausse-base";
import Localites from "./Localites";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

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
        <MemoryRouter>
          <Localites />
        </MemoryRouter>
      </ContexteOrgProvider>
    </QueryClientProvider>,
  );
}

const localite = (id: string, nom: string, niveau: string, parent: string | null, extra = {}) => ({
  id,
  org_id: null,
  parent_id: parent,
  niveau,
  nom,
  latitude: null,
  longitude: null,
  source: "Plan communal de Yoff, § 5.3.3",
  created_by: null,
  created_at: "",
  updated_at: "",
  ...extra,
});

function donnees() {
  base.tables.localites = [
    localite("v", "Village traditionnel de Yoff", "village", "y"),
    localite("y", "Commune de Yoff", "commune", null, { latitude: 14.760358, longitude: -17.468149 }),
    localite("l", "Layène", "quartier", "v"),
    localite("p", "Village de l’organisation", "village", "y", {
      org_id: "o1",
      source: "Relevé GPS",
      latitude: 14.77,
      longitude: -17.47,
    }),
  ];
}

async function ouvrirMenu(nom: string) {
  const bouton = await screen.findByRole("button", { name: nom });
  bouton.focus();
  fireEvent.keyDown(bouton, { key: "Enter" });
}

beforeEach(() => {
  base.reinitialiser();
  gererErreur.mockReset();
});

describe("Localités de l'organisation", () => {
  it("ne charge aucune localité à la place de l'organisation : état vide, et création de la première", async () => {
    base.tables.localites = [];
    monter();
    expect(await screen.findByText("Aucune localité pour le moment")).toBeInTheDocument();
    expect(screen.queryByLabelText("Rechercher une localité")).not.toBeInTheDocument();
    expect(screen.queryByText(/vous pouvez les utiliser, pas les modifier/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Ajouter une localité" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Ajouter une localité" })[0]!);
    const dialogue = await screen.findByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText("Nom"), { target: { value: "Village de Test" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter" }));
    await waitFor(() => {
      const appel = base.appels.find((a) => a.table === "localites" && a.operation === "insert");
      expect(appel?.valeurs).toMatchObject({
        org_id: "o1",
        nom: "Village de Test",
        niveau: "village",
        parent_id: null,
      });
    });
  });

  it("à un lecteur, dit que rien n'est encore renseigné, sans bouton de création", async () => {
    base.tables.localites = [];
    monter("lecteur");
    expect(await screen.findByText("Aucune localité pour le moment")).toBeInTheDocument();
    expect(screen.getByText("Votre organisation n’a pas encore renseigné de localité.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajouter une localité" })).not.toBeInTheDocument();
  });

  it("n'explique le référentiel que s'il y en a un : des localités propres seules n'en parlent pas", async () => {
    base.tables.localites = [
      localite("p", "Village de l’organisation", "village", null, { org_id: "o1", source: null }),
    ];
    monter();
    await screen.findByRole("heading", { name: /Village de l’organisation/ });
    expect(screen.queryByText(/vous pouvez les utiliser, pas les modifier/)).not.toBeInTheDocument();
  });

  it("montre la hiérarchie, l'origine de chaque localité, ses coordonnées et sa source", async () => {
    donnees();
    monter();
    await screen.findByRole("heading", { name: /Commune de Yoff/ });
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Commune de YoffCommuneRéférentiel",
      "Village de l’organisationVillageVotre organisation",
      "Village traditionnel de YoffVillageRéférentiel",
      "LayèneQuartierRéférentiel",
    ]);
    expect(screen.getByText("4 localités")).toBeInTheDocument();
    expect(screen.getByText(/14,760358 N, 17,468149 O/)).toBeInTheDocument();
    expect(screen.getAllByText("Source : Plan communal de Yoff, § 5.3.3")).toHaveLength(3);
    expect(screen.getByText("Source : Relevé GPS")).toBeInTheDocument();
    expect(screen.getAllByText("Sans coordonnées : absente de la carte").length).toBe(2);
    expect(screen.getByText(/vous pouvez les utiliser, pas les modifier/)).toBeInTheDocument();
  });

  it("ne propose de modifier ou supprimer que les localités de l'organisation", async () => {
    donnees();
    monter();
    await screen.findByRole("heading", { name: /Commune de Yoff/ });
    expect(screen.getAllByRole("button", { name: /Actions pour la localité/ })).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Actions pour la localité Village de l’organisation" }),
    ).toBeInTheDocument();
  });

  it("retrouve une localité sans accents ni casse, avec son contexte", async () => {
    donnees();
    monter();
    fireEvent.change(await screen.findByLabelText("Rechercher une localité"), { target: { value: "LAYENE" } });
    await screen.findByText("Village traditionnel de Yoff, Commune de Yoff");
    expect(screen.getByText("1 localité")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Rechercher une localité"), { target: { value: "kolda" } });
    expect(screen.getByText("Aucune localité ne correspond à « kolda ».")).toBeInTheDocument();
  });

  it("modifie le nom et les coordonnées d'une localité de l'organisation", async () => {
    donnees();
    monter();
    await ouvrirMenu("Actions pour la localité Village de l’organisation");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Modifier" }));
    const dialogue = await screen.findByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText("Nom"), { target: { value: "Village renommé" } });
    fireEvent.change(within(dialogue).getByLabelText(/Latitude/), { target: { value: "14,8" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => {
      const appel = base.appels.find((a) => a.table === "localites" && a.operation === "update");
      expect(appel?.valeurs).toEqual({
        nom: "Village renommé",
        latitude: 14.8,
        longitude: -17.47,
        source: "Relevé GPS",
      });
    });
  });

  it("refuse une latitude hors limites et une paire de coordonnées incomplète, sans rien envoyer", async () => {
    donnees();
    monter();
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter une localité" }));
    const dialogue = await screen.findByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText("Nom"), { target: { value: "Village X" } });
    fireEvent.change(within(dialogue).getByLabelText(/Latitude/), { target: { value: "95" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter" }));
    expect(await within(dialogue).findByText("La latitude est un nombre entre −90 et 90.")).toBeInTheDocument();
    fireEvent.change(within(dialogue).getByLabelText(/Latitude/), { target: { value: "14,7" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter" }));
    expect(
      await within(dialogue).findByText("Renseignez la latitude et la longitude, ou aucune des deux."),
    ).toBeInTheDocument();
    expect(base.appels.some((a) => a.table === "localites")).toBe(false);
  });

  it("limite les parents proposés aux niveaux plus larges que celui choisi", async () => {
    donnees();
    monter();
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter une localité" }));
    const dialogue = await screen.findByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText("Niveau"), { target: { value: "commune" } });
    // Aucune localité de niveau plus large qu'une commune dans ces données : seul le choix « aucune ».
    expect(within(within(dialogue).getByLabelText(/Rattachée à/)).getAllByRole("option")).toHaveLength(1);
    fireEvent.change(within(dialogue).getByLabelText("Niveau"), { target: { value: "quartier" } });
    const options = within(within(dialogue).getByLabelText(/Rattachée à/))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toContain("Commune de Yoff (Commune)");
    expect(options).toContain("Village traditionnel de Yoff, Commune de Yoff (Village)");
    expect(options).not.toContain("Layène, Village traditionnel de Yoff (Quartier)");
  });

  it("supprime une localité de l'organisation après confirmation", async () => {
    donnees();
    monter("admin");
    await ouvrirMenu("Actions pour la localité Village de l’organisation");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
    const confirmation = await screen.findByRole("dialog");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Supprimer" }));
    await waitFor(() =>
      expect(base.appels.some((a) => a.table === "localites" && a.operation === "delete")).toBe(true),
    );
  });

  it("n'offre aucune écriture à un lecteur, ni après la fin d'essai", async () => {
    donnees();
    const { unmount } = monter("lecteur");
    await screen.findByRole("heading", { name: /Commune de Yoff/ });
    expect(screen.queryByRole("button", { name: "Ajouter une localité" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Actions pour la localité/ })).not.toBeInTheDocument();
    unmount();
    monter("editeur", true);
    await screen.findByRole("heading", { name: /Commune de Yoff/ });
    expect(screen.queryByRole("button", { name: "Ajouter une localité" })).not.toBeInTheDocument();
    expect(screen.getByText(/L’essai est terminé/)).toBeInTheDocument();
  });
});
