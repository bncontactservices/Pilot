import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import ActeursProjet from "./ActeursProjet";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

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
    acteur("a1", "Fondation pour l’eau", "bailleur", { email: "fondation@exemple.test" }),
    acteur("a2", "Entreprise de forage", "prestataire"),
    acteur("a3", "Mairie de Kolda", "autorite_locale"),
  ];
  base.tables.projet_acteurs = [
    { id: "r1", project_id: "p1", org_id: "o1", acteur_id: "a2", role: "Prestataire des travaux", notes: "Lot 1" },
    { id: "r2", project_id: "p1", org_id: "o1", acteur_id: "a1", role: "Bailleur principal", notes: null },
    { id: "r3", project_id: "p-autre", org_id: "o1", acteur_id: "a3", role: "Autorité locale", notes: null },
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

describe("Acteurs du projet", () => {
  it("liste les acteurs de ce projet seulement, financeurs d'abord, avec leur rôle", async () => {
    donnees();
    monterProjet(<ActeursProjet />);
    await screen.findByRole("heading", { name: "Fondation pour l’eau" });
    const titres = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titres).toEqual(["Fondation pour l’eau", "Entreprise de forage"]);
    expect(screen.queryByRole("heading", { name: "Mairie de Kolda" })).not.toBeInTheDocument();
    const prestataire = screen.getByRole("heading", { name: "Entreprise de forage" }).closest("li")!;
    expect(within(prestataire).getByText("Prestataire des travaux")).toBeInTheDocument();
    expect(within(prestataire).getByText("Lot 1")).toBeInTheDocument();
    expect(screen.getByText("2 acteurs dans ce projet")).toBeInTheDocument();
  });

  it("explique l'état vide et propose de créer un acteur quand l'annuaire est vide", async () => {
    monterProjet(<ActeursProjet />);
    expect(await screen.findByText("Aucun acteur rattaché à ce projet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Créer un acteur" }).length).toBeGreaterThan(0);
  });

  it("rattache un acteur de l'annuaire qui n'a pas encore de rôle ici, avec son rôle", async () => {
    donnees();
    monterProjet(<ActeursProjet />);
    fireEvent.click(await screen.findByRole("button", { name: "Rattacher un acteur" }));
    const dialogue = await screen.findByRole("dialog");
    // Seul « Mairie de Kolda » n'a pas de rôle dans ce projet.
    const options = within(within(dialogue).getByLabelText("Acteur"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["Choisir un acteur", "Mairie de Kolda — Autorité locale"]);
    fireEvent.change(within(dialogue).getByLabelText("Acteur"), { target: { value: "a3" } });
    fireEvent.change(within(dialogue).getByLabelText(/^Rôle dans le projet/), { target: { value: "Autorité locale" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Rattacher" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "projet_acteurs",
      operation: "insert",
      valeurs: { project_id: "p1", acteur_id: "a3", role: "Autorité locale", notes: null },
    });
  });

  it("dit pourquoi il n'y a rien à rattacher quand tous les acteurs de l'annuaire le sont déjà (bouton non grisé)", async () => {
    base.tables.acteurs = [acteur("a1", "Fondation pour l’eau", "bailleur")];
    base.tables.projet_acteurs = [
      { id: "r1", project_id: "p1", org_id: "o1", acteur_id: "a1", role: "Bailleur principal", notes: null },
    ];
    monterProjet(<ActeursProjet />);
    const bouton = await screen.findByRole("button", { name: "Rattacher un acteur" });
    expect(bouton).toBeEnabled();
    fireEvent.click(bouton);
    const dialogue = await screen.findByRole("dialog");
    expect(
      within(dialogue).getByText("Tous les acteurs de l’annuaire sont déjà rattachés à ce projet."),
    ).toBeInTheDocument();
  });

  it("exige un acteur et un rôle", async () => {
    donnees();
    monterProjet(<ActeursProjet />);
    fireEvent.click(await screen.findByRole("button", { name: "Rattacher un acteur" }));
    const dialogue = await screen.findByRole("dialog");
    fireEvent.click(within(dialogue).getByRole("button", { name: "Rattacher" }));
    expect(await within(dialogue).findByText("Choisissez un acteur.")).toBeInTheDocument();
    expect(within(dialogue).getByText("Indiquez un rôle de 1 à 120 caractères.")).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });

  it("modifie le rôle sans pouvoir changer l'acteur", async () => {
    donnees();
    monterProjet(<ActeursProjet />);
    await ouvrirMenu("Actions pour l’acteur Fondation pour l’eau dans ce projet");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Modifier le rôle" }));
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).queryByLabelText("Acteur")).not.toBeInTheDocument();
    fireEvent.change(within(dialogue).getByLabelText(/^Rôle dans le projet/), { target: { value: "Cofinanceur" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "projet_acteurs",
      operation: "update",
      valeurs: { role: "Cofinanceur", notes: null },
    });
  });

  it("retire un acteur du projet sans le supprimer de l'annuaire", async () => {
    donnees();
    monterProjet(<ActeursProjet />);
    await ouvrirMenu("Actions pour l’acteur Entreprise de forage dans ce projet");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Retirer du projet" }));
    const confirmation = await screen.findByRole("dialog");
    expect(within(confirmation).getByText(/il reste dans l’annuaire/)).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Retirer du projet" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({ table: "projet_acteurs", operation: "delete", valeurs: undefined });
  });

  it("laisse un lecteur consulter sans rien écrire", async () => {
    donnees();
    monterProjet(<ActeursProjet />, { role: "lecteur" });
    await screen.findByRole("heading", { name: "Fondation pour l’eau" });
    expect(
      screen.queryByRole("button", { name: /Rattacher un acteur|Créer un acteur|Actions pour/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Votre rôle est en lecture seule/)).toBeInTheDocument();
  });
});
