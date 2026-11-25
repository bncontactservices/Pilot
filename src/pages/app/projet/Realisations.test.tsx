import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import Realisations from "./Realisations";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

const realisation = (id: string, date: string, titre: string, extra = {}) => ({
  id,
  project_id: "p1",
  org_id: "o1",
  date,
  titre,
  description: null,
  quantite: null,
  unite: null,
  lieu: null,
  noeud_id: null,
  pta_activite_id: null,
  created_by: null,
  created_at: `${date}T08:00:00Z`,
  updated_at: "",
  ...extra,
});

let clic: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T12:00:00"));
  base.reinitialiser();
  gererErreur.mockReset();
  // Le téléchargement clique sur un lien : jsdom ne navigue pas, on observe seulement le clic.
  clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  clic.mockRestore();
});

function donnees() {
  base.tables.realisations = [
    realisation("r1", "2026-06-10", "Forage de Médina réhabilité", {
      description: "Pompe remplacée et margelle refaite.",
      quantite: 3,
      unite: "forages",
      lieu: "Médina Gounass",
      noeud_id: "n1",
      pta_activite_id: "p1",
    }),
    realisation("r2", "2026-05-02", "Formation des comités de gestion"),
  ];
  base.tables.documents = [
    {
      id: "d1",
      project_id: "p1",
      org_id: "o1",
      nom: "Photo du forage",
      categorie: "justificatif",
      description: null,
      storage_path: "o1/p1/abc-photo.jpg",
      mime_type: "image/jpeg",
      taille_octets: 2_000_000,
      realisation_id: "r1",
      created_by: null,
      created_at: "2026-06-11T08:00:00Z",
      updated_at: "",
    },
  ];
  const noeud = (id: string, type: string, parent_id: string | null, code: string, libelle: string) => ({
    id,
    type,
    parent_id,
    code,
    libelle,
    moyens_verification: null,
    hypotheses: null,
    ordre: 1,
    created_at: "2026-01-01T00:00:00Z",
  });
  base.tables.cadre_logique_noeuds = [
    noeud("og", "objectif_global", null, "OG", "Améliorer l’accès à l’eau"),
    noeud("os", "objectif_specifique", "og", "OS1", "Réhabiliter les points d’eau"),
    noeud("r1", "resultat", "os", "R1.1", "Les forages fonctionnent"),
    noeud("n1", "activite", "r1", "A1.1.1", "Réhabiliter les forages"),
  ];
  base.tables.pta_activites = [{ id: "p1", intitule: "Réhabilitation du T2", annee: 2026 }];
}

describe("Réalisations : contenu", () => {
  it("montre chaque réalisation avec sa quantité, son lieu, ses liens et ses preuves", async () => {
    donnees();
    monterProjet(<Realisations />);
    const premiere = (await screen.findByRole("heading", { name: "Forage de Médina réhabilité" })).closest("li")!;
    expect(within(premiere).getByText("10 juin 2026")).toBeInTheDocument();
    expect(within(premiere).getByText("3")).toBeInTheDocument();
    expect(within(premiere).getByText("forages")).toBeInTheDocument();
    expect(within(premiere).getByText("Médina Gounass")).toBeInTheDocument();
    expect(within(premiere).getByText("Pompe remplacée et margelle refaite.")).toBeInTheDocument();
    expect(await within(premiere).findByText(/A1\.1\.1/)).toBeInTheDocument();
    expect(await within(premiere).findByText("Plan de travail : Réhabilitation du T2")).toBeInTheDocument();
    expect(within(premiere).getByText("1 preuve jointe")).toBeInTheDocument();
    expect(within(premiere).getByText("Photo du forage")).toBeInTheDocument();
    expect(within(premiere).getByText("1,9 Mo")).toBeInTheDocument();
  });

  it("dit honnêtement qu'une réalisation n'a pas de preuve", async () => {
    donnees();
    monterProjet(<Realisations />);
    const seconde = (await screen.findByRole("heading", { name: "Formation des comités de gestion" })).closest("li")!;
    expect(within(seconde).getByText("Aucune preuve jointe")).toBeInTheDocument();
    expect(within(seconde).getByRole("button", { name: "Joindre une preuve" })).toBeInTheDocument();
    expect(screen.getByText("2 réalisations, dont 1 avec preuve jointe")).toBeInTheDocument();
  });

  it("trie les réalisations de la plus récente à la plus ancienne", async () => {
    donnees();
    monterProjet(<Realisations />);
    await screen.findByRole("heading", { name: "Forage de Médina réhabilité" });
    const titres = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titres).toEqual(["Forage de Médina réhabilité", "Formation des comités de gestion"]);
  });

  it("n'offre aucune écriture à un lecteur, mais lui laisse télécharger la preuve", async () => {
    donnees();
    monterProjet(<Realisations />, { role: "lecteur" });
    await screen.findByRole("heading", { name: "Forage de Médina réhabilité" });
    expect(screen.queryByRole("button", { name: /Ajouter|Joindre|Actions pour/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Télécharger Photo du forage" })).toBeInTheDocument();
  });

  it("explique l'état vide", async () => {
    monterProjet(<Realisations />);
    expect(await screen.findByText("Aucune réalisation enregistrée")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter une réalisation" })).toBeInTheDocument();
  });
});

describe("Réalisations : écriture et preuves", () => {
  it("enregistre une réalisation avec sa quantité en virgule décimale", async () => {
    donnees();
    monterProjet(<Realisations />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter une réalisation" }));
    const tiroir = await screen.findByRole("dialog");
    expect(within(tiroir).getByLabelText("Date")).toHaveValue("2026-06-15");
    fireEvent.change(within(tiroir).getByLabelText("Intitulé"), {
      target: { value: "Distribution de kits d’hygiène" },
    });
    fireEvent.change(within(tiroir).getByLabelText(/^Quantité/), { target: { value: "120,5" } });
    fireEvent.change(within(tiroir).getByLabelText(/^Unité/), { target: { value: "kits" } });
    fireEvent.click(within(tiroir).getByRole("button", { name: "Enregistrer la réalisation" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "realisations",
      operation: "insert",
      valeurs: {
        project_id: "p1",
        date: "2026-06-15",
        titre: "Distribution de kits d’hygiène",
        description: null,
        quantite: 120.5,
        unite: "kits",
        lieu: null,
        localite_id: null,
        noeud_id: null,
        pta_activite_id: null,
      },
    });
  });

  it("refuse une quantité qui n'est pas un nombre", async () => {
    donnees();
    monterProjet(<Realisations />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter une réalisation" }));
    const tiroir = await screen.findByRole("dialog");
    fireEvent.change(within(tiroir).getByLabelText("Intitulé"), { target: { value: "Réunion de suivi" } });
    fireEvent.change(within(tiroir).getByLabelText(/^Quantité/), { target: { value: "beaucoup" } });
    fireEvent.click(within(tiroir).getByRole("button", { name: "Enregistrer la réalisation" }));
    expect(
      await within(tiroir).findByText("Saisissez un nombre positif (deux décimales au plus)."),
    ).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });

  it("propose seulement les résultats et activités du cadre logique", async () => {
    donnees();
    monterProjet(<Realisations />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter une réalisation" }));
    const tiroir = await screen.findByRole("dialog");
    expect(await within(tiroir).findByRole("option", { name: /A1\.1\.1/ })).toBeInTheDocument();
    expect(within(tiroir).getByRole("option", { name: /R1\.1/ })).toBeInTheDocument();
    expect(within(tiroir).queryByRole("option", { name: /^OG/ })).not.toBeInTheDocument();
    expect(within(tiroir).queryByRole("option", { name: /^OS1/ })).not.toBeInTheDocument();
  });

  it("télécharge une preuve par un lien signé d'une minute", async () => {
    donnees();
    monterProjet(<Realisations />);
    fireEvent.click(await screen.findByRole("button", { name: "Télécharger Photo du forage" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "stockage:documents",
      operation: "signed",
      valeurs: { chemin: "o1/p1/abc-photo.jpg", duree: 60, options: undefined },
    });
    await waitFor(() => expect(clic).toHaveBeenCalledTimes(1));
    expect((clic.mock.contexts[0] as HTMLAnchorElement).href).toBe(
      "https://stockage.test/o1/p1/abc-photo.jpg?jeton=abc&download=Photo%20du%20forage.jpg",
    );
  });

  it("joint une preuve en rattachant le document à la réalisation choisie", async () => {
    donnees();
    monterProjet(<Realisations />);
    const seconde = (await screen.findByRole("heading", { name: "Formation des comités de gestion" })).closest("li")!;
    fireEvent.click(within(seconde).getByRole("button", { name: "Joindre une preuve" }));
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).getByLabelText(/^Preuve de la réalisation/)).toHaveValue("r2");
  });
});

describe("Réalisations : localité", () => {
  const localite = (id: string, nom: string, niveau: string, parent: string | null) => ({
    id,
    org_id: null,
    parent_id: parent,
    niveau,
    nom,
    latitude: null,
    longitude: null,
    source: "Test",
    created_by: null,
    created_at: "",
    updated_at: "",
  });

  it("propose les zones d'intervention du projet, et enregistre la localité choisie", async () => {
    donnees();
    base.tables.localites = [
      localite("y", "Commune de Yoff", "commune", null),
      localite("l", "Layène", "quartier", "y"),
      localite("t", "Tonghor", "quartier", "y"),
    ];
    base.tables.projet_localites = [
      { id: "z1", project_id: "p1", org_id: "o1", localite_id: "l", notes: null },
      { id: "z2", project_id: "p-autre", org_id: "o1", localite_id: "t", notes: null },
    ];
    monterProjet(<Realisations />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter une réalisation" }));
    const tiroir = await screen.findByRole("dialog");
    const champ = await within(tiroir).findByLabelText(/^Localité/);
    // Seule la zone de ce projet est proposée, pas celle d'un autre projet.
    expect(
      within(champ)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Aucune localité précisée", "Layène, Commune de Yoff"]);
    fireEvent.change(within(tiroir).getByLabelText("Intitulé"), { target: { value: "Forage de Layène" } });
    fireEvent.change(champ, { target: { value: "l" } });
    fireEvent.click(within(tiroir).getByRole("button", { name: "Enregistrer la réalisation" }));
    await waitFor(() => expect(base.appels.some((a) => a.operation === "insert")).toBe(true));
    expect(base.appels.find((a) => a.operation === "insert")?.valeurs).toMatchObject({ localite_id: "l" });
  });

  it("ne montre pas le champ tant que le projet n'a aucune zone d'intervention", async () => {
    donnees();
    monterProjet(<Realisations />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter une réalisation" }));
    const tiroir = await screen.findByRole("dialog");
    await within(tiroir).findByLabelText("Intitulé");
    expect(within(tiroir).queryByLabelText(/^Localité/)).not.toBeInTheDocument();
  });
});
