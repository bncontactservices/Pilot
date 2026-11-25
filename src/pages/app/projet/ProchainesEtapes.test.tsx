import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogueProchaineEtape } from "~/components/app/suivi/DialogueProchaineEtape";
import type { Kpi } from "~/lib/donnees";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import ProchainesEtapes from "./ProchainesEtapes";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

const KPI = { id: "k1", nom: "Forages réhabilités" } as Kpi;
const action = (n: number, libelle: string, statut: string, echeance: string | null, extra = {}) => ({
  id: `a${n}`,
  project_id: "p1",
  org_id: "o1",
  libelle,
  responsable: null,
  echeance,
  statut,
  kpi_id: null,
  created_by: null,
  created_at: `2026-06-0${n}T00:00:00Z`,
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
  base.tables.prochaines_etapes = [
    action(4, "Préparer la visite du bailleur", "a_faire", null),
    action(3, "Envoyer le rapport T2", "termine", "2026-05-30"),
    action(2, "Former les relais communautaires", "en_cours", "2026-07-10", { responsable: "Moussa" }),
    action(1, "Relancer le comité de gestion", "a_faire", "2026-06-01", { responsable: "Awa Diop", kpi_id: "k1" }),
  ];
}

describe("Prochaines étapes : contenu", () => {
  it("met le retard en premier, avec les jours de retard, le responsable et l'indicateur d'origine", async () => {
    donnees();
    monterProjet(<ProchainesEtapes />, { kpis: [KPI] });
    await screen.findByText("Relancer le comité de gestion");
    const lignes = screen.getAllByRole("listitem");
    expect(lignes).toHaveLength(3); // les terminées sont masquées par défaut
    expect(lignes[0]).toHaveTextContent("Relancer le comité de gestion");
    expect(lignes[1]).toHaveTextContent("Former les relais communautaires");
    expect(lignes[2]).toHaveTextContent("Préparer la visite du bailleur");
    // Échéance le 1er juin, aujourd'hui le 15 : 14 jours.
    expect(within(lignes[0]!).getByText(/14 jours de retard/)).toBeInTheDocument();
    expect(within(lignes[0]!).getByText("En retard")).toBeInTheDocument();
    expect(within(lignes[0]!).getByText("Awa Diop")).toBeInTheDocument();
    expect(within(lignes[0]!).getByText("Indicateur : Forages réhabilités")).toBeInTheDocument();
    expect(within(lignes[2]!).getByText("Sans échéance")).toBeInTheDocument();
    expect(within(lignes[1]!).queryByText("En retard")).not.toBeInTheDocument();
  });

  it("résume les ouvertes et les retards, et filtre les terminées", async () => {
    donnees();
    monterProjet(<ProchainesEtapes />, { kpis: [KPI] });
    expect(await screen.findByText("Ouvertes : 3 · en retard : 1")).toBeInTheDocument();
    expect(screen.queryByText("Envoyer le rapport T2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Terminées" }));
    expect(screen.getByText("Envoyer le rapport T2")).toBeInTheDocument();
    expect(screen.queryByText("Relancer le comité de gestion")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Toutes" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("dit que tout est à jour quand rien n'est ouvert", async () => {
    base.tables.prochaines_etapes = [action(3, "Envoyer le rapport T2", "termine", "2026-05-30")];
    monterProjet(<ProchainesEtapes />);
    expect(await screen.findByText("Aucune prochaine étape ouverte : tout est à jour.")).toBeInTheDocument();
  });

  it("explique l'état vide, avec l'action d'ajout pour un éditeur seulement", async () => {
    monterProjet(<ProchainesEtapes />);
    expect(await screen.findByText("Aucune prochaine étape")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter une prochaine étape" })).toBeInTheDocument();
  });

  it("n'offre aucune modification à un lecteur mais montre les statuts", async () => {
    donnees();
    monterProjet(<ProchainesEtapes />, { role: "lecteur", kpis: [KPI] });
    await screen.findByText("Relancer le comité de gestion");
    expect(screen.queryByRole("button", { name: /Ajouter/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Statut de la prochaine étape/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Actions pour/ })).not.toBeInTheDocument();
    expect(screen.getByText("En cours")).toBeInTheDocument();
    expect(screen.getByText(/lecture seule/)).toBeInTheDocument();
  });

  it("annonce la fin d'essai", async () => {
    donnees();
    monterProjet(<ProchainesEtapes />, { essaiFini: true, kpis: [KPI] });
    await screen.findByText("Relancer le comité de gestion");
    expect(screen.getByText(/L’essai est terminé/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ajouter/ })).not.toBeInTheDocument();
  });
});

describe("Prochaines étapes : écriture", () => {
  it("change le statut en place", async () => {
    donnees();
    monterProjet(<ProchainesEtapes />, { kpis: [KPI] });
    const choix = await screen.findByLabelText("Statut de la prochaine étape « Former les relais communautaires »");
    fireEvent.change(choix, { target: { value: "termine" } });
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({ table: "prochaines_etapes", operation: "update", valeurs: { statut: "termine" } });
  });

  it("crée une prochaine étape", async () => {
    donnees();
    monterProjet(<ProchainesEtapes />, { kpis: [KPI] });
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter une prochaine étape" }));
    const dialogue = await screen.findByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText("Action à mener"), {
      target: { value: "Valider le budget avec le comptable" },
    });
    fireEvent.change(within(dialogue).getByLabelText(/^Responsable/), { target: { value: "Moussa" } });
    fireEvent.change(within(dialogue).getByLabelText(/^Échéance/), { target: { value: "2026-07-01" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Créer la prochaine étape" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "prochaines_etapes",
      operation: "insert",
      valeurs: {
        project_id: "p1",
        libelle: "Valider le budget avec le comptable",
        responsable: "Moussa",
        echeance: "2026-07-01",
        statut: "a_faire",
        kpi_id: null,
      },
    });
  });

  it("refuse une action trop courte sans rien écrire", async () => {
    donnees();
    monterProjet(<ProchainesEtapes />, { kpis: [KPI] });
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter une prochaine étape" }));
    const dialogue = await screen.findByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText("Action à mener"), { target: { value: "x" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Créer la prochaine étape" }));
    expect(await within(dialogue).findByText(/Décrivez l’action en 2 caractères au moins/)).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });

  it("supprime après confirmation", async () => {
    donnees();
    monterProjet(<ProchainesEtapes />, { kpis: [KPI] });
    const menu = await screen.findByRole("button", {
      name: "Actions pour la prochaine étape « Relancer le comité de gestion »",
    });
    menu.focus();
    fireEvent.keyDown(menu, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
    const confirmation = await screen.findByRole("dialog");
    expect(within(confirmation).getByText(/« Relancer le comité de gestion » sera supprimée/)).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Supprimer la prochaine étape" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({ table: "prochaines_etapes", operation: "delete", valeurs: undefined });
  });
});

describe("Prochaine étape créée depuis l'alerte d'un indicateur", () => {
  it("part du texte suggéré et de l'indicateur, puis les enregistre", async () => {
    monterProjet(
      <DialogueProchaineEtape
        ouvert
        onFermer={() => {}}
        projetId="p1"
        depart={{ libelle: "Corriger l’écart de l’indicateur « Forages réhabilités »", kpiId: "k1" }}
        kpis={[KPI]}
      />,
    );
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).getByText(/Créée depuis l’alerte d’un indicateur/)).toBeInTheDocument();
    expect(within(dialogue).getByLabelText("Action à mener")).toHaveValue(
      "Corriger l’écart de l’indicateur « Forages réhabilités »",
    );
    expect(within(dialogue).getByLabelText(/^Indicateur concerné/)).toHaveValue("k1");
    fireEvent.click(within(dialogue).getByRole("button", { name: "Créer la prochaine étape" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]!.valeurs).toMatchObject({ project_id: "p1", kpi_id: "k1", statut: "a_faire" });
  });
});
