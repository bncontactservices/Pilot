import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import type { Kpi } from "~/lib/donnees";
import CadreLogique from "./CadreLogique";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

const noeud = (
  id: string,
  type: string,
  parent_id: string | null,
  code: string,
  libelle: string,
  ordre = 1,
  extra = {},
) => ({
  id,
  type,
  parent_id,
  code,
  libelle,
  moyens_verification: null,
  hypotheses: null,
  ordre,
  created_at: "2026-01-01T00:00:00Z",
  ...extra,
});

const kpi = {
  id: "k1",
  project_id: "p1",
  org_id: "o1",
  nom: "Forages réhabilités",
  description: null,
  unite: "forages",
  cible: 40,
  valeur_base: 0,
  frequence: "mensuelle",
  sens: "croissant",
  type_agregation: "cumul",
  ordre: 1,
  epingle: true,
  noeud_id: "r11",
  created_at: "",
  updated_at: "",
} as Kpi;

beforeEach(() => {
  base.reinitialiser();
  gererErreur.mockReset();
  base.tables.cadre_logique_noeuds = [
    noeud("og", "objectif_global", null, "OG", "Améliorer la santé des populations"),
    noeud("os1", "objectif_specifique", "og", "OS1", "Améliorer l’accès à l’eau potable", 1),
    noeud("r11", "resultat", "os1", "R1.1", "Les forages fonctionnent", 1, {
      moyens_verification: "Procès-verbaux de réception",
      hypotheses: "Pièces disponibles",
    }),
    noeud("a111", "activite", "r11", "A1.1.1", "Réhabiliter les forages en panne", 1),
    noeud("os2", "objectif_specifique", "og", "OS2", "Renforcer l’hygiène", 2),
  ];
});

describe("Cadre logique : arbre", () => {
  it("affiche chaque ligne avec son code et les indicateurs reliés", async () => {
    monterProjet(<CadreLogique />, { kpis: [kpi] });
    expect(await screen.findByText("Améliorer la santé des populations")).toBeInTheDocument();
    for (const code of ["OG", "OS1", "R1.1", "A1.1.1", "OS2"])
      expect(screen.getAllByText(code).length).toBeGreaterThan(0);
    expect(screen.getByText("Forages réhabilités")).toBeInTheDocument();
    // Quatre lignes sur cinq n'ont aucun indicateur relié.
    expect(screen.getAllByText("Aucun indicateur relié")).toHaveLength(4);
  });

  it("replie une branche et masque ses descendants", async () => {
    monterProjet(<CadreLogique />);
    await screen.findByText("Les forages fonctionnent");
    fireEvent.click(screen.getByRole("button", { name: "Replier OS1" }));
    expect(screen.queryByText("Les forages fonctionnent")).not.toBeInTheDocument();
    expect(screen.queryByText("Réhabiliter les forages en panne")).not.toBeInTheDocument();
    expect(screen.getByText("Renforcer l’hygiène")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Déplier OS1" }));
    expect(screen.getByText("Les forages fonctionnent")).toBeInTheDocument();
  });

  it("propose d'ajouter le niveau suivant à un éditeur, sauf sous une activité", async () => {
    monterProjet(<CadreLogique />);
    await screen.findByText("Les forages fonctionnent");
    expect(screen.getByRole("button", { name: "Ajouter un objectif spécifique" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Ajouter un résultat" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Ajouter une activité" })).toHaveLength(1);
  });

  it("est en lecture seule pour un lecteur", async () => {
    monterProjet(<CadreLogique />, { role: "lecteur" });
    await screen.findByText("Les forages fonctionnent");
    expect(screen.queryByRole("button", { name: /Ajouter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Actions pour/ })).not.toBeInTheDocument();
    expect(
      screen.getByText("Votre rôle est en lecture seule : vous pouvez consulter, pas modifier."),
    ).toBeInTheDocument();
  });

  it("est en lecture seule après la fin d'essai", async () => {
    monterProjet(<CadreLogique />, { role: "admin", essaiFini: true });
    await screen.findByText("Les forages fonctionnent");
    expect(screen.queryByRole("button", { name: /Ajouter/ })).not.toBeInTheDocument();
    expect(screen.getByText(/L’essai est terminé/)).toBeInTheDocument();
  });
});

describe("Cadre logique : matrice", () => {
  it("présente la logique, les indicateurs, les moyens de vérification et les hypothèses", async () => {
    monterProjet(<CadreLogique />, { kpis: [kpi] });
    await screen.findByText("Les forages fonctionnent");
    fireEvent.click(screen.getByRole("button", { name: "Matrice" }));
    for (const colonne of [
      "Logique d’intervention",
      "Indicateurs",
      "Moyens de vérification",
      "Hypothèses et risques",
    ]) {
      expect(screen.getByRole("columnheader", { name: colonne })).toBeInTheDocument();
    }
    const ligne = screen.getByText("Les forages fonctionnent").closest("tr")!;
    expect(within(ligne).getByText("Procès-verbaux de réception")).toBeInTheDocument();
    expect(within(ligne).getByText("Pièces disponibles")).toBeInTheDocument();
    expect(within(ligne).getByText("Forages réhabilités")).toBeInTheDocument();
    expect(screen.getAllByText("Non renseigné").length).toBeGreaterThan(0);
  });
});

describe("Cadre logique : création", () => {
  it("invite à définir l'objectif global puis l'enregistre en première position", async () => {
    base.tables.cadre_logique_noeuds = [];
    monterProjet(<CadreLogique />);
    expect(await screen.findByText("Aucun cadre logique pour l’instant")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Définir l’objectif global" }));
    const panneau = await screen.findByRole("dialog");
    fireEvent.change(within(panneau).getByLabelText("Libellé"), { target: { value: "A" } });
    fireEvent.click(within(panneau).getByRole("button", { name: "Ajouter" }));
    expect(await within(panneau).findByText("Saisissez un libellé de 2 à 500 caractères.")).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);

    fireEvent.change(within(panneau).getByLabelText("Libellé"), {
      target: { value: "Réduire la mortalité infantile" },
    });
    fireEvent.click(within(panneau).getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "cadre_logique_noeuds",
      operation: "insert",
      valeurs: {
        project_id: "p1",
        type: "objectif_global",
        parent_id: null,
        libelle: "Réduire la mortalité infantile",
        moyens_verification: null,
        hypotheses: null,
        ordre: 1,
      },
    });
  });

  it("n'offre aucune création à un lecteur sur un cadre logique vide", async () => {
    base.tables.cadre_logique_noeuds = [];
    monterProjet(<CadreLogique />, { role: "lecteur" });
    expect(await screen.findByText("Le cadre logique de ce projet n’a pas encore été renseigné.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Définir l’objectif global" })).not.toBeInTheDocument();
  });

  it("place un nouvel objectif spécifique après ses frères et relie l'indicateur coché", async () => {
    monterProjet(<CadreLogique />, { kpis: [{ ...kpi, noeud_id: null }] });
    await screen.findByText("Les forages fonctionnent");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un objectif spécifique" }));
    const panneau = await screen.findByRole("dialog");
    fireEvent.change(within(panneau).getByLabelText("Libellé"), { target: { value: "Renforcer la gouvernance" } });
    fireEvent.click(within(panneau).getByLabelText("Forages réhabilités"));
    fireEvent.click(within(panneau).getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(base.appels).toHaveLength(2));
    expect(base.appels[0]).toMatchObject({
      table: "cadre_logique_noeuds",
      operation: "insert",
      valeurs: { type: "objectif_specifique", parent_id: "og", ordre: 3 },
    });
    expect(base.appels[1]).toEqual({ table: "kpis", operation: "update", valeurs: { noeud_id: "nouveau" } });
  });
});
