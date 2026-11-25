import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import Phases from "./Phases";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

const phase = (id: string, nom: string, ordre: number, extra = {}) => ({
  id,
  project_id: "p1",
  org_id: "o1",
  nom,
  description: null,
  date_debut: null,
  date_fin: null,
  ordre,
  created_at: "",
  updated_at: "",
  ...extra,
});
const etape = (id: string, nom: string, phase_id: string | null, date_prevue: string, extra = {}) => ({
  id,
  project_id: "p1",
  org_id: "o1",
  phase_id,
  nom,
  description: null,
  type: "jalon",
  date_prevue,
  date_reelle: null,
  statut: "a_faire",
  created_at: "",
  updated_at: "",
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T12:00:00"));
  base.reinitialiser();
  gererErreur.mockReset();
});
afterEach(() => vi.useRealTimers());

function donnees() {
  base.tables.phases = [
    phase("ph1", "Démarrage", 1, { date_debut: "2026-01-01", date_fin: "2026-03-31" }),
    phase("ph2", "Mise en œuvre", 2, { date_debut: "2026-04-01", date_fin: "2027-03-31" }),
    phase("ph3", "Clôture", 3),
  ];
  base.tables.etapes = [
    etape("e1", "Lancement officiel", "ph1", "2026-02-01", { statut: "termine", date_reelle: "2026-02-03" }),
    etape("e2", "Rapport de base", "ph1", "2026-03-15", { type: "livrable", statut: "en_cours" }),
    etape("e3", "Revue à mi-parcours", "ph2", "2026-12-01"),
    etape("e4", "Étape orpheline", null, "2026-09-01"),
  ];
}

describe("Phases et étapes : contenu", () => {
  it("affiche chaque phase avec ses étapes, ses dates et son avancement", async () => {
    donnees();
    monterProjet(<Phases />);
    const demarrage = (await screen.findByRole("heading", { name: "Démarrage" })).closest("li")!;
    expect(within(demarrage).getByText("1 sur 2 étapes terminées")).toBeInTheDocument();
    expect(within(demarrage).getByText("Lancement officiel")).toBeInTheDocument();
    expect(within(demarrage).getByText("Atteinte le 3 févr. 2026")).toBeInTheDocument();
    expect(within(demarrage).getByText(/Prévue le 15 mars 2026/)).toBeInTheDocument();
    expect(within(demarrage).getAllByText(/Jalon|Livrable/).length).toBe(2);

    const cloture = screen.getByRole("heading", { name: "Clôture" }).closest("li")!;
    expect(within(cloture).getByText("Dates à préciser")).toBeInTheDocument();
    expect(within(cloture).getByText("Aucune étape dans cette phase.")).toBeInTheDocument();
  });

  it("signale en retard une étape dépassée et non terminée, avec le nombre de jours", async () => {
    donnees();
    monterProjet(<Phases />);
    const ligne = (await screen.findByText("Rapport de base")).closest("li")!;
    // Prévue le 15 mars, aujourd'hui le 15 juin : 92 jours.
    expect(within(ligne).getByText(/92 jours de retard/)).toBeInTheDocument();
    expect(within(ligne).getByText("En retard")).toBeInTheDocument();
    const terminee = screen.getByText("Lancement officiel").closest("li")!;
    expect(within(terminee).queryByText("En retard")).not.toBeInTheDocument();
  });

  it("range les étapes sans phase à part et dessine la chronologie", async () => {
    donnees();
    monterProjet(<Phases />);
    expect(await screen.findByRole("heading", { name: "Étapes sans phase" })).toBeInTheDocument();
    expect(screen.getByText("Étape orpheline")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Chronologie des phases et des étapes/ })).toBeInTheDocument();
    expect(screen.getByText("Les phases sans dates n’apparaissent pas sur la chronologie.")).toBeInTheDocument();
  });

  it("n'offre aucune modification à un lecteur", async () => {
    donnees();
    monterProjet(<Phases />, { role: "lecteur" });
    await screen.findByRole("heading", { name: "Démarrage" });
    expect(screen.queryByRole("button", { name: /Ajouter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Actions pour/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Statut de l’étape/)).not.toBeInTheDocument();
  });

  it("permet à un éditeur de changer le statut d'une étape et date sa réalisation du jour", async () => {
    donnees();
    monterProjet(<Phases />);
    const choix = await screen.findByLabelText("Statut de l’étape Revue à mi-parcours");
    fireEvent.change(choix, { target: { value: "termine" } });
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "etapes",
      operation: "update",
      valeurs: { statut: "termine", date_reelle: "2026-06-15" },
    });
  });
});

describe("Phases et étapes : premier usage", () => {
  it("propose les cinq phases types à un éditeur", async () => {
    monterProjet(<Phases />);
    expect(await screen.findByText("Aucune phase définie")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter les 5 phases types" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]!.table).toBe("phases");
    expect((base.appels[0]!.valeurs as { nom: string; ordre: number }[]).map((p) => [p.ordre, p.nom])).toEqual([
      [1, "Conception"],
      [2, "Démarrage"],
      [3, "Mise en œuvre"],
      [4, "Suivi-évaluation"],
      [5, "Clôture"],
    ]);
  });

  it("n'offre rien à un lecteur quand aucune phase n'est définie", async () => {
    monterProjet(<Phases />, { role: "lecteur" });
    expect(await screen.findByText("Les phases de ce projet n’ont pas encore été définies.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /phases types|Ajouter/ })).not.toBeInTheDocument();
  });

  it("refuse une phase dont la fin précède le début", async () => {
    donnees();
    monterProjet(<Phases />);
    fireEvent.click((await screen.findAllByRole("button", { name: "Ajouter une phase" }))[0]!);
    const dialogue = await screen.findByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText("Nom de la phase"), { target: { value: "Évaluation finale" } });
    fireEvent.change(within(dialogue).getByLabelText(/Début/), { target: { value: "2027-05-01" } });
    fireEvent.change(within(dialogue).getByLabelText(/Fin/), { target: { value: "2027-04-01" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter la phase" }));
    expect(await within(dialogue).findByText("La fin doit être postérieure ou égale au début.")).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });
});
