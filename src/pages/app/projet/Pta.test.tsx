import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import Pta from "./Pta";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

const activite = (id: string, intitule: string, annee: number, extra = {}) => ({
  id,
  project_id: "p1",
  org_id: "o1",
  annee,
  trimestre: 1,
  date_debut: null,
  date_fin: null,
  intitule,
  description: null,
  responsable: null,
  budget_prevu: null,
  statut: "a_faire",
  pct_realisation: 0,
  noeud_id: null,
  phase_id: null,
  created_by: null,
  created_at: "",
  updated_at: "",
  ...extra,
});

beforeEach(() => {
  // Seule la date est simulée : les minuteries réelles restent utilisables par Testing Library.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T12:00:00"));
  base.reinitialiser();
  gererErreur.mockReset();
  base.tables.pta_activites = [
    activite("a1", "Diagnostic des forages", 2026, {
      trimestre: 1,
      statut: "termine",
      pct_realisation: 100,
      responsable: "Awa Diop",
      budget_prevu: 2_000_000,
    }),
    activite("a2", "Formation des artisans", 2026, {
      trimestre: 2,
      statut: "en_cours",
      pct_realisation: 40,
      budget_prevu: 3_000_000,
    }),
    activite("a3", "Enquête de base", 2026, { trimestre: 4, statut: "a_faire" }),
    activite("a4", "Activité annulée", 2026, {
      trimestre: 3,
      statut: "annule",
      pct_realisation: 70,
      budget_prevu: 9_000_000,
    }),
    activite("a5", "Évaluation à mi-parcours", 2027, { trimestre: 1 }),
  ];
  base.tables.parametres_se = [
    {
      org_id: "o1",
      seuil_vert: 90,
      seuil_ambre: 60,
      frequence_defaut: "mensuelle",
      unites_perso: [],
      mois_debut_annee_fiscale: 1,
      updated_at: "",
    },
  ];
  base.tables.profiles = [{ nom: "Moussa Ba", email: "m@exemple.test" }];
});
afterEach(() => vi.useRealTimers());

const resume = (libelle: string) =>
  within(screen.getByText(libelle).closest("div")!).getAllByText(/./).at(-1)!.textContent;

describe("Plan de travail annuel", () => {
  it("ouvre l'année courante et résume ses activités (les annulées ne comptent pas)", async () => {
    monterProjet(<Pta />);
    expect(await screen.findByLabelText("Année fiscale")).toHaveValue("2026");
    expect(await screen.findByText("Diagnostic des forages")).toBeInTheDocument();
    expect(screen.queryByText("Évaluation à mi-parcours")).not.toBeInTheDocument();
    expect(resume("Activités")).toBe("3");
    expect(resume("Terminées")).toBe("1 / 3");
    expect(resume("Avancement de l’année")).toBe("47 %");
    expect(resume("Budget prévu")).toMatch(/5\s?000\s?000/);
  });

  it("propose les années du projet et celles déjà planifiées", async () => {
    monterProjet(<Pta />);
    const annee = await screen.findByLabelText("Année fiscale");
    const options = within(annee)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["Année 2026", "Année 2027"]);
  });

  it("change d'année, et annonce une année sans activité", async () => {
    monterProjet(<Pta />);
    const annee = await screen.findByLabelText("Année fiscale");
    fireEvent.change(annee, { target: { value: "2027" } });
    expect(await screen.findByText("Évaluation à mi-parcours")).toBeInTheDocument();
    expect(screen.queryByText("Diagnostic des forages")).not.toBeInTheDocument();
  });

  it("affiche un état vide invitant à planifier quand l'année n'a aucune activité", async () => {
    base.tables.pta_activites = [];
    monterProjet(<Pta />);
    expect(await screen.findByText("Aucune activité planifiée pour cette année")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Planifier une activité" }).length).toBeGreaterThan(0);
  });

  it("montre le calendrier par défaut, avec période, statut et avancement en texte", async () => {
    monterProjet(<Pta />);
    const ligne = (await screen.findByText("Formation des artisans")).closest("li")!;
    expect(within(ligne).getByText("En cours")).toBeInTheDocument();
    expect(within(ligne).getByText(/40 %/)).toBeInTheDocument();
    expect(within(ligne).getByText(/1 avr\. 2026 – 30 juin 2026/)).toBeInTheDocument();
    // Aucune activité n'est en retard à la mi-juin : seule la deuxième est en cours.
    expect(screen.queryByText("En retard")).not.toBeInTheDocument();
  });

  it("signale en retard une activité dont la période est dépassée sans être terminée", async () => {
    base.tables.pta_activites = [
      activite("a6", "Réhabilitation lot 1", 2026, { trimestre: 1, statut: "en_cours", pct_realisation: 60 }),
    ];
    monterProjet(<Pta />);
    const ligne = (await screen.findByText("Réhabilitation lot 1")).closest("li")!;
    expect(within(ligne).getByText("En retard")).toBeInTheDocument();
  });

  it("bascule en liste avec les colonnes et un statut modifiable pour un éditeur", async () => {
    monterProjet(<Pta />);
    await screen.findByText("Formation des artisans");
    fireEvent.click(screen.getByRole("button", { name: "Liste" }));
    for (const colonne of ["Activité", "Responsable", "Période", "Statut", "Avancement", "Budget prévu"]) {
      expect(screen.getByRole("columnheader", { name: colonne })).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Statut de l’activité Formation des artisans")).toHaveValue("en_cours");
    expect(screen.getByText("Awa Diop")).toBeInTheDocument();
  });

  it("est en lecture seule pour un lecteur : pas de création, statut en texte", async () => {
    monterProjet(<Pta />, { role: "lecteur" });
    await screen.findByText("Formation des artisans");
    expect(screen.queryByRole("button", { name: "Planifier une activité" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Liste" }));
    expect(screen.queryByLabelText("Statut de l’activité Formation des artisans")).not.toBeInTheDocument();
    expect(screen.getAllByText("En cours").length).toBeGreaterThan(0);
  });

  it("refuse une activité sans intitulé, puis enregistre un trimestre avec son statut et son pourcentage cohérents", async () => {
    monterProjet(<Pta />);
    await screen.findByText("Formation des artisans");
    fireEvent.click(screen.getAllByRole("button", { name: "Planifier une activité" })[0]!);
    const panneau = await screen.findByRole("dialog");
    fireEvent.click(within(panneau).getByRole("button", { name: "Planifier l’activité" }));
    expect(await within(panneau).findByText("Saisissez un intitulé de 2 à 200 caractères.")).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);

    fireEvent.change(within(panneau).getByLabelText("Intitulé"), { target: { value: "Atelier de restitution" } });
    fireEvent.change(within(panneau).getByLabelText("Trimestre"), { target: { value: "3" } });
    fireEvent.change(within(panneau).getByLabelText("Statut"), { target: { value: "termine" } });
    // Terminée = 100 % : le champ suit le statut.
    expect(within(panneau).getByLabelText("Réalisation (en %)")).toHaveValue("100");
    fireEvent.click(within(panneau).getByRole("button", { name: "Planifier l’activité" }));
    await vi.waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toMatchObject({
      table: "pta_activites",
      operation: "insert",
      valeurs: {
        project_id: "p1",
        intitule: "Atelier de restitution",
        annee: 2026,
        trimestre: 3,
        date_debut: null,
        date_fin: null,
        statut: "termine",
        pct_realisation: 100,
      },
    });
  });

  it("ne propose pas de composante quand le projet n'en a aucune", async () => {
    monterProjet(<Pta />);
    await screen.findByText("Formation des artisans");
    fireEvent.click(screen.getAllByRole("button", { name: "Planifier une activité" })[0]!);
    const panneau = await screen.findByRole("dialog");
    expect(within(panneau).queryByLabelText(/^Composante/)).not.toBeInTheDocument();
  });

  it("rattache l'activité à une composante du projet", async () => {
    base.tables.composantes = [{ id: "c1", nom: "Accès à l’eau potable" }];
    monterProjet(<Pta />);
    await screen.findByText("Formation des artisans");
    fireEvent.click(screen.getAllByRole("button", { name: "Planifier une activité" })[0]!);
    const panneau = await screen.findByRole("dialog");
    fireEvent.change(await within(panneau).findByLabelText(/^Composante/), { target: { value: "c1" } });
    fireEvent.change(within(panneau).getByLabelText("Intitulé"), { target: { value: "Atelier" } });
    fireEvent.click(within(panneau).getByRole("button", { name: "Planifier l’activité" }));
    await vi.waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toMatchObject({
      table: "pta_activites",
      operation: "insert",
      valeurs: { composante_id: "c1" },
    });
  });
});
