import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContexteOrgProvider, construireContexte } from "~/hooks/useContexteOrg";
import { creerFausseBase } from "~/test/fausse-base";
import Acteurs from "./Acteurs";

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
          <Acteurs />
        </MemoryRouter>
      </ContexteOrgProvider>
    </QueryClientProvider>,
  );
}

const acteur = (id: string, nom: string, type: string, extra = {}) => ({
  id,
  org_id: "o1",
  nom,
  type,
  description: null,
  contact: null,
  email: null,
  telephone: null,
  notes: null,
  exemple: false,
  created_by: null,
  created_at: "",
  updated_at: "",
  ...extra,
});

function donnees() {
  base.tables.acteurs = [
    acteur("a1", "Fondation pour l’eau", "bailleur", {
      contact: "Chargée de programme",
      email: "fondation@exemple.test",
    }),
    acteur("a2", "Mairie de Kolda", "autorite_locale", { telephone: "+221 77 000 00 00", exemple: true }),
    acteur("a3", "Entreprise de forage", "prestataire", { description: "Travaux de réhabilitation" }),
  ];
  base.tables.projects = [{ id: "p1", nom: "Eau Kolda" }];
  base.tables.projet_acteurs = [
    { id: "r1", project_id: "p1", org_id: "o1", acteur_id: "a1", role: "Bailleur principal", notes: null },
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

describe("Acteurs : annuaire", () => {
  it("liste les acteurs avec leur type, leurs coordonnées et les projets où ils interviennent", async () => {
    donnees();
    monter();
    const fondation = (await screen.findByRole("heading", { name: "Fondation pour l’eau" })).closest("li")!;
    expect(within(fondation).getByText("Bailleur")).toBeInTheDocument();
    expect(within(fondation).getByText("Chargée de programme")).toBeInTheDocument();
    expect(within(fondation).getByRole("link", { name: "fondation@exemple.test" })).toHaveAttribute(
      "href",
      "mailto:fondation@exemple.test",
    );
    expect(within(fondation).getByText("Intervient dans 1 projet")).toBeInTheDocument();
    expect(within(fondation).getByRole("link", { name: "Eau Kolda" })).toHaveAttribute(
      "href",
      "/app/projets/p1/acteurs",
    );
    expect(within(fondation).getByText(/Bailleur principal/)).toBeInTheDocument();
    const mairie = screen.getByRole("heading", { name: "Mairie de Kolda" }).closest("li")!;
    expect(within(mairie).getByText("Exemple")).toBeInTheDocument();
    expect(within(mairie).getByText("Aucun projet pour l’instant")).toBeInTheDocument();
    expect(screen.getByText("3 acteurs")).toBeInTheDocument();
  });

  it("filtre par type et cherche sans tenir compte des accents", async () => {
    donnees();
    monter();
    await screen.findByRole("heading", { name: "Fondation pour l’eau" });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "prestataire" } });
    expect(screen.queryByRole("heading", { name: "Fondation pour l’eau" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Entreprise de forage" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Rechercher un acteur"), { target: { value: "REHABILITATION" } });
    expect(screen.getByRole("heading", { name: "Entreprise de forage" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Mairie de Kolda" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Rechercher un acteur"), { target: { value: "zzz" } });
    expect(screen.getByText("Aucun acteur ne correspond à cette recherche.")).toBeInTheDocument();
  });

  it("explique l'état vide", async () => {
    monter();
    expect(await screen.findByText("Aucun acteur dans l’annuaire")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter un acteur" })).toBeInTheDocument();
  });

  it("laisse un lecteur consulter sans rien écrire", async () => {
    donnees();
    monter("lecteur");
    await screen.findByRole("heading", { name: "Fondation pour l’eau" });
    expect(screen.queryByRole("button", { name: /Ajouter un acteur|Actions pour/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Votre rôle est en lecture seule/)).toBeInTheDocument();
  });

  it("ne propose la suppression qu'aux administrateurs", async () => {
    donnees();
    monter("editeur");
    await ouvrirMenu("Actions pour l’acteur Mairie de Kolda");
    expect(await screen.findByRole("menuitem", { name: "Modifier" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Supprimer" })).not.toBeInTheDocument();
  });
});

describe("Acteurs : formulaire", () => {
  it("crée un acteur avec ses coordonnées", async () => {
    donnees();
    monter("editeur");
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter un acteur" }));
    const dialogue = await screen.findByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText("Nom de l’acteur"), { target: { value: "ONG partenaire" } });
    fireEvent.change(within(dialogue).getByLabelText("Type"), { target: { value: "partenaire" } });
    fireEvent.change(within(dialogue).getByLabelText(/^Adresse e-mail/), { target: { value: "contact@ong.test" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "acteurs",
      operation: "insert",
      valeurs: {
        org_id: "o1",
        nom: "ONG partenaire",
        type: "partenaire",
        description: null,
        contact: null,
        email: "contact@ong.test",
        telephone: null,
        notes: null,
      },
    });
  });

  it("refuse un nom trop court et une adresse e-mail mal formée", async () => {
    donnees();
    monter("editeur");
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter un acteur" }));
    const dialogue = await screen.findByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText("Nom de l’acteur"), { target: { value: "X" } });
    fireEvent.change(within(dialogue).getByLabelText(/^Adresse e-mail/), { target: { value: "pas-un-email" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter" }));
    expect(await within(dialogue).findByText("Donnez un nom de 2 à 160 caractères.")).toBeInTheDocument();
    expect(within(dialogue).getByText("Cette adresse e-mail n’est pas valide.")).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });

  it("modifie un acteur", async () => {
    donnees();
    monter("editeur");
    await ouvrirMenu("Actions pour l’acteur Entreprise de forage");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Modifier" }));
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).getByLabelText("Nom de l’acteur")).toHaveValue("Entreprise de forage");
    fireEvent.change(within(dialogue).getByLabelText(/^Téléphone/), { target: { value: "+221 70 111 22 33" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toMatchObject({
      table: "acteurs",
      operation: "update",
      valeurs: { telephone: "+221 70 111 22 33" },
    });
  });

  it("supprime un acteur après confirmation, en disant que ses rôles partent avec lui", async () => {
    donnees();
    monter("admin");
    await ouvrirMenu("Actions pour l’acteur Entreprise de forage");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
    const confirmation = await screen.findByRole("dialog");
    expect(within(confirmation).getByText(/retiré de l’annuaire et de tous les projets/)).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Supprimer l’acteur" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({ table: "acteurs", operation: "delete", valeurs: undefined });
  });
});
