import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import EtatsAvancement from "./EtatsAvancement";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

const etat = (id: string, titre: string, debut: string, fin: string, extra = {}) => ({
  id,
  project_id: "p1",
  org_id: "o1",
  titre,
  periode_debut: debut,
  periode_fin: fin,
  faits_marquants: null,
  difficultes: null,
  risques: null,
  taux_resultats: null,
  taux_physique: null,
  created_by: null,
  created_at: `${fin}T18:00:00Z`,
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
  base.tables.etats_avancement = [
    etat("e1", "État du premier trimestre", "2026-01-01", "2026-03-31", {
      faits_marquants: "Trois forages réhabilités.\nLes comités sont formés.",
      difficultes: "Retard de livraison des pompes.",
      taux_resultats: 49.5,
      taux_physique: 37.5,
    }),
  ];
  base.tables.realisations = [
    { id: "r1", date: "2026-04-10" },
    { id: "r2", date: "2026-05-20" },
    { id: "r0", date: "2026-02-01" }, // avant la période proposée
  ];
  base.tables.v_avancement = [{ project_id: "p1", org_id: "o1", taux_resultats: 60, taux_physique: 41.2 }];
}

describe("États d'avancement : contenu", () => {
  it("montre la période, les taux figés et les trois rubriques", async () => {
    donnees();
    monterProjet(<EtatsAvancement />);
    const carte = (await screen.findByRole("heading", { name: "État du premier trimestre" })).closest("li")!;
    expect(within(carte).getByText(/Période : 1 janv\. 2026 – 31 mars 2026/)).toBeInTheDocument();
    expect(within(carte).getByText("50 %")).toBeInTheDocument();
    expect(within(carte).getByText("38 %")).toBeInTheDocument();
    expect(within(carte).getByText(/Trois forages réhabilités\./)).toBeInTheDocument();
    expect(within(carte).getByText("Retard de livraison des pompes.")).toBeInTheDocument();
    // Les risques n'ont pas été renseignés : on le dit au lieu de masquer la rubrique.
    expect(within(carte).getByRole("heading", { name: "Risques" })).toBeInTheDocument();
    expect(within(carte).getByText("Non renseigné.")).toBeInTheDocument();
  });

  it("n'invente pas de taux quand l'état n'en a pas", async () => {
    base.tables.etats_avancement = [etat("e2", "État sans chiffres", "2026-01-01", "2026-03-31")];
    monterProjet(<EtatsAvancement />);
    const carte = (await screen.findByRole("heading", { name: "État sans chiffres" })).closest("li")!;
    expect(within(carte).getByText("Aucune donnée")).toBeInTheDocument();
    expect(within(carte).getByText("Aucune activité planifiée")).toBeInTheDocument();
  });

  it("explique l'état vide", async () => {
    monterProjet(<EtatsAvancement />);
    expect(await screen.findByText("Aucun état d’avancement")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rédiger un état d’avancement" })).toBeInTheDocument();
  });

  it("n'offre aucune écriture à un lecteur", async () => {
    donnees();
    monterProjet(<EtatsAvancement />, { role: "lecteur" });
    await screen.findByRole("heading", { name: "État du premier trimestre" });
    expect(screen.queryByRole("button", { name: /Rédiger|Actions pour/ })).not.toBeInTheDocument();
  });
});

describe("États d'avancement : rédaction", () => {
  it("propose la période qui suit le dernier état, avec les taux du jour", async () => {
    donnees();
    monterProjet(<EtatsAvancement />);
    fireEvent.click(await screen.findByRole("button", { name: "Rédiger un état d’avancement" }));
    const tiroir = await screen.findByRole("dialog");
    expect(within(tiroir).getByLabelText("Début de la période")).toHaveValue("2026-04-01");
    expect(within(tiroir).getByLabelText("Fin de la période")).toHaveValue("2026-06-15");
    expect(within(tiroir).getByLabelText("Titre")).toHaveValue("État d’avancement · avr. 2026 – juin 2026");
    expect(within(tiroir).getByText("Taux d’avancement aujourd’hui")).toBeInTheDocument();
    // Taux physique du jour (vue SQL) ; aucun indicateur : pas de taux de résultats.
    expect(await within(tiroir).findByText("41 %")).toBeInTheDocument();
    expect(
      within(tiroir).getByText("Ces taux seront enregistrés avec l’état et ne changeront plus."),
    ).toBeInTheDocument();
    // Deux réalisations tombent dans la période, la troisième est antérieure.
    expect(within(tiroir).getByText("2 réalisations enregistrées sur cette période.")).toBeInTheDocument();
  });

  it("enregistre l'état sans jamais envoyer de taux (la base les fige elle-même)", async () => {
    donnees();
    monterProjet(<EtatsAvancement />);
    fireEvent.click(await screen.findByRole("button", { name: "Rédiger un état d’avancement" }));
    const tiroir = await screen.findByRole("dialog");
    fireEvent.change(within(tiroir).getByLabelText(/^Faits marquants/), { target: { value: "Deux forages livrés." } });
    fireEvent.click(within(tiroir).getByRole("button", { name: "Enregistrer l’état" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "etats_avancement",
      operation: "insert",
      valeurs: {
        project_id: "p1",
        titre: "État d’avancement · avr. 2026 – juin 2026",
        periode_debut: "2026-04-01",
        periode_fin: "2026-06-15",
        faits_marquants: "Deux forages livrés.",
        difficultes: null,
        risques: null,
      },
    });
  });

  it("refuse une période dont la fin précède le début", async () => {
    donnees();
    monterProjet(<EtatsAvancement />);
    fireEvent.click(await screen.findByRole("button", { name: "Rédiger un état d’avancement" }));
    const tiroir = await screen.findByRole("dialog");
    fireEvent.change(within(tiroir).getByLabelText("Fin de la période"), { target: { value: "2026-03-01" } });
    fireEvent.click(within(tiroir).getByRole("button", { name: "Enregistrer l’état" }));
    expect(
      await within(tiroir).findByText("La fin de la période doit être le même jour ou après le début."),
    ).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });

  it("montre les taux figés d'un état qu'on modifie, sans les proposer à l'édition", async () => {
    donnees();
    monterProjet(<EtatsAvancement />);
    const menu = await screen.findByRole("button", { name: "Actions pour l’état « État du premier trimestre »" });
    menu.focus();
    fireEvent.keyDown(menu, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Modifier" }));
    const tiroir = await screen.findByRole("dialog");
    expect(within(tiroir).getByText(/Taux figés le 31 mars 2026/)).toBeInTheDocument();
    expect(within(tiroir).getByText("50 %")).toBeInTheDocument();
    fireEvent.change(within(tiroir).getByLabelText(/^Risques/), { target: { value: "Saison des pluies." } });
    fireEvent.click(within(tiroir).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    const valeurs = base.appels[0]!.valeurs as Record<string, unknown>;
    expect(base.appels[0]!.operation).toBe("update");
    expect(valeurs.risques).toBe("Saison des pluies.");
    expect(valeurs).not.toHaveProperty("taux_resultats");
    expect(valeurs).not.toHaveProperty("taux_physique");
  });
});
