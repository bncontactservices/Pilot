import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import Composantes from "./Composantes";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

const composante = (id: string, nom: string, extra = {}) => ({
  id,
  project_id: "p1",
  org_id: "o1",
  nom,
  description: null,
  responsable: null,
  date_debut: "2026-02-01",
  date_fin: "2026-08-31",
  statut: "en_cours",
  ordre: 1,
  created_by: null,
  created_at: "2026-01-10T08:00:00Z",
  updated_at: "",
  ...extra,
});
const activite = (id: string, intitule: string, extra = {}) => ({
  id,
  project_id: "p1",
  org_id: "o1",
  annee: 2026,
  trimestre: null,
  date_debut: "2026-03-01",
  date_fin: "2026-04-30",
  intitule,
  description: null,
  responsable: null,
  budget_prevu: null,
  statut: "en_cours",
  pct_realisation: 50,
  noeud_id: null,
  phase_id: null,
  composante_id: null,
  created_by: null,
  created_at: "2026-01-10T08:00:00Z",
  updated_at: "",
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T12:00:00"));
  base.reinitialiser();
  gererErreur.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Eau (en retard : fin passée, encore en cours) avec deux activités, Gouvernance terminée, une composante sans dates. */
function donnees() {
  base.tables.composantes = [
    composante("c1", "Accès à l’eau potable", {
      ordre: 1,
      date_fin: "2026-05-31",
      responsable: "Ingénieur hydraulicien",
    }),
    composante("c2", "Gouvernance", { ordre: 2, statut: "termine", date_debut: "2026-01-10", date_fin: "2026-04-30" }),
    composante("c3", "Capitalisation", { ordre: 3, statut: "a_faire", date_debut: null, date_fin: null }),
  ];
  base.tables.pta_activites = [
    activite("a1", "Réhabilitation des forages", { composante_id: "c1", pct_realisation: 100, statut: "termine" }),
    activite("a2", "Formation des artisans", { composante_id: "c1", pct_realisation: 50 }),
    activite("a3", "Enquête de satisfaction", { composante_id: null }),
  ];
}

describe("Composantes : planning", () => {
  it("dessine le planning avec un résumé accessible et signale les composantes en retard", async () => {
    donnees();
    monterProjet(<Composantes />);
    const figure = await screen.findByRole("img", { name: /Planning de 2 composantes datées, 1 en retard/ });
    expect(figure).toBeInTheDocument();
    expect(screen.getByText(/3 composantes/)).toBeInTheDocument();
    expect(screen.getByText("1 en retard")).toBeInTheDocument();
    // La légende dit les statuts avec des mots : la couleur ne porte pas seule le sens.
    const legende = screen.getByRole("list", { name: "Légende du planning" });
    for (const mot of ["Terminé", "En cours", "À faire", "Reporté", "Annulé", "En retard"]) {
      expect(within(legende).getByText(mot)).toBeInTheDocument();
    }
  });

  it("montre l'avancement de la composante dans la barre et ses activités dessous", async () => {
    donnees();
    monterProjet(<Composantes />);
    const figure = await screen.findByRole("img", { name: /Planning de/ });
    expect(within(figure).getByText("75 %")).toBeInTheDocument(); // (100 + 50) / 2
    expect(within(figure).getAllByText("Réhabilitation des forages").length).toBeGreaterThan(0);
    expect(within(figure).getAllByText("Sans composante").length).toBeGreaterThan(0);
    expect(within(figure).getAllByText("Enquête de satisfaction").length).toBeGreaterThan(0);
  });

  it("annonce les composantes sans dates, absentes du planning", async () => {
    donnees();
    monterProjet(<Composantes />);
    expect(await screen.findByText(/Sans dates, absente du planning : Capitalisation/)).toBeInTheDocument();
  });

  it("dit quoi faire quand aucune composante n'a de dates", async () => {
    base.tables.composantes = [composante("c1", "À planifier", { date_debut: null, date_fin: null })];
    monterProjet(<Composantes />);
    expect(await screen.findByText(/Aucune composante n’a encore de dates/)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Planning de/ })).not.toBeInTheDocument();
  });
});

describe("Composantes : liste", () => {
  async function ouvrirListe() {
    donnees();
    monterProjet(<Composantes />);
    fireEvent.click(await screen.findByRole("button", { name: "Liste" }));
  }

  it("détaille chaque composante : statut, retard, période, responsable, avancement, activités", async () => {
    await ouvrirListe();
    const eau = (await screen.findByRole("heading", { name: "Accès à l’eau potable" })).closest("li")!;
    expect(within(eau).getByText("En retard")).toBeInTheDocument();
    expect(within(eau).getByText(/Du 1 févr\. 2026 au 31 mai 2026 · Ingénieur hydraulicien/)).toBeInTheDocument();
    expect(within(eau).getByText("75 %")).toBeInTheDocument();
    expect(within(eau).getByText("2 activités rattachées")).toBeInTheDocument();
    expect(within(eau).getByText("Réhabilitation des forages")).toBeInTheDocument();
    const gouvernance = screen.getByRole("heading", { name: "Gouvernance" }).closest("li")!;
    expect(within(gouvernance).queryByText("En retard")).not.toBeInTheDocument();
    expect(
      within(gouvernance).getByText("Aucune activité du plan de travail rattachée", { exact: false }),
    ).toBeInTheDocument();
    const aPlanifier = screen.getByRole("heading", { name: "Capitalisation" }).closest("li")!;
    expect(within(aPlanifier).getByText("Sans dates : à planifier")).toBeInTheDocument();
  });

  it("liste les activités qui n'appartiennent à aucune composante", async () => {
    await ouvrirListe();
    const section = (await screen.findByRole("heading", { name: "Activités sans composante" })).closest("section")!;
    expect(within(section).getByText("Enquête de satisfaction")).toBeInTheDocument();
  });
});

describe("Composantes : états et droits", () => {
  it("explique ce qu'est une composante et propose d'en créer une", async () => {
    monterProjet(<Composantes />);
    expect(await screen.findByText("Aucune composante pour ce projet")).toBeInTheDocument();
    expect(screen.getByText(/Une composante est un axe du projet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter une composante" })).toBeInTheDocument();
  });

  it("laisse un lecteur consulter sans rien écrire", async () => {
    donnees();
    monterProjet(<Composantes />, { role: "lecteur" });
    await screen.findByRole("img", { name: /Planning de/ });
    expect(screen.queryByRole("button", { name: /Ajouter une composante/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Votre rôle est en lecture seule/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Liste" }));
    await screen.findByRole("heading", { name: "Gouvernance" });
    expect(screen.queryByRole("button", { name: /Actions pour la composante/ })).not.toBeInTheDocument();
  });

  it("passe en lecture seule à la fin de l'essai", async () => {
    donnees();
    monterProjet(<Composantes />, { essaiFini: true });
    await screen.findByRole("img", { name: /Planning de/ });
    expect(screen.queryByRole("button", { name: "Ajouter une composante" })).not.toBeInTheDocument();
  });
});

describe("Composantes : formulaire", () => {
  async function ouvrirCreation() {
    donnees();
    monterProjet(<Composantes />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter une composante" }));
    return screen.findByRole("dialog");
  }

  it("crée une composante, à la suite des autres", async () => {
    const dialogue = await ouvrirCreation();
    fireEvent.change(within(dialogue).getByLabelText("Nom de la composante"), {
      target: { value: "Hygiène et assainissement" },
    });
    fireEvent.change(within(dialogue).getByLabelText(/^Début/), { target: { value: "2026-03-01" } });
    fireEvent.change(within(dialogue).getByLabelText(/^Fin/), { target: { value: "2026-11-30" } });
    fireEvent.change(within(dialogue).getByLabelText("Statut"), { target: { value: "en_cours" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "composantes",
      operation: "insert",
      valeurs: {
        project_id: "p1",
        ordre: 4,
        nom: "Hygiène et assainissement",
        description: null,
        responsable: null,
        date_debut: "2026-03-01",
        date_fin: "2026-11-30",
        statut: "en_cours",
      },
    });
  });

  it("crée une composante à planifier, sans dates", async () => {
    const dialogue = await ouvrirCreation();
    fireEvent.change(within(dialogue).getByLabelText("Nom de la composante"), { target: { value: "Plaidoyer" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toMatchObject({
      valeurs: { nom: "Plaidoyer", date_debut: null, date_fin: null, statut: "a_faire" },
    });
  });

  it("refuse une seule date, une fin avant le début et un nom trop court", async () => {
    const dialogue = await ouvrirCreation();
    fireEvent.change(within(dialogue).getByLabelText("Nom de la composante"), { target: { value: "X" } });
    fireEvent.change(within(dialogue).getByLabelText(/^Début/), { target: { value: "2026-03-01" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter" }));
    expect(await within(dialogue).findByText("Indiquez les deux dates, ou aucune.")).toBeInTheDocument();
    expect(within(dialogue).getByText("Donnez un nom de 2 à 160 caractères.")).toBeInTheDocument();
    fireEvent.change(within(dialogue).getByLabelText(/^Fin/), { target: { value: "2026-02-01" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter" }));
    expect(await within(dialogue).findByText("La fin ne peut pas précéder le début.")).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });

  it("modifie une composante existante", async () => {
    donnees();
    monterProjet(<Composantes />);
    fireEvent.click(await screen.findByRole("button", { name: "Liste" }));
    const bouton = await screen.findByRole("button", { name: "Actions pour la composante Gouvernance" });
    bouton.focus();
    fireEvent.keyDown(bouton, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Modifier" }));
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).getByLabelText("Nom de la composante")).toHaveValue("Gouvernance");
    expect(within(dialogue).getByLabelText("Statut")).toHaveValue("termine");
    fireEvent.change(within(dialogue).getByLabelText(/^Responsable/), { target: { value: "Animateur social" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toMatchObject({
      table: "composantes",
      operation: "update",
      valeurs: { nom: "Gouvernance", responsable: "Animateur social", statut: "termine" },
    });
  });

  it("supprime une composante après confirmation, en disant que ses activités restent", async () => {
    donnees();
    monterProjet(<Composantes />);
    fireEvent.click(await screen.findByRole("button", { name: "Liste" }));
    const bouton = await screen.findByRole("button", { name: "Actions pour la composante Gouvernance" });
    bouton.focus();
    fireEvent.keyDown(bouton, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
    const confirmation = await screen.findByRole("dialog");
    expect(
      within(confirmation).getByText(/Ses activités du plan de travail ne sont pas supprimées/),
    ).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Supprimer la composante" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({ table: "composantes", operation: "delete", valeurs: undefined });
  });
});
