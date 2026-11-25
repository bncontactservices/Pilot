import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaisieLigne } from "~/lib/donnees";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import Zones from "./Zones";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));
// Leaflet est testé à part (CarteZones.test.tsx) : ici on vérifie ce que la page lui transmet.
vi.mock("~/components/app/zones/CarteZones", () => ({
  default: ({ points }: { points: { nom: string; contexte: string }[] }) => (
    <div data-testid="carte">{points.map((p) => `${p.nom} (${p.contexte})`).join(" | ")}</div>
  ),
}));

const localite = (id: string, nom: string, niveau: string, parent: string | null, extra = {}) => ({
  id,
  org_id: null,
  parent_id: parent,
  niveau,
  nom,
  latitude: null,
  longitude: null,
  source: "Source de test",
  created_by: null,
  created_at: "",
  updated_at: "",
  ...extra,
});

function donnees() {
  base.tables.localites = [
    localite("r", "Région de Dakar", "region", null),
    localite("d", "Département de Dakar", "departement", "r"),
    localite("y", "Commune de Yoff", "commune", "d", { latitude: 14.760358, longitude: -17.468149 }),
    localite("l", "Layène", "quartier", "y"),
    localite("t", "Tonghor", "quartier", "y"),
    localite("v", "Village de l’organisation", "village", "y", { org_id: "o1", latitude: 14.77, longitude: -17.47 }),
  ];
  base.tables.projet_localites = [
    { id: "z1", project_id: "p1", org_id: "o1", localite_id: "y", notes: "Commune d’intervention" },
    { id: "z2", project_id: "p1", org_id: "o1", localite_id: "l", notes: null },
    { id: "z3", project_id: "p-autre", org_id: "o1", localite_id: "t", notes: null },
  ];
  base.tables.realisations = [
    { id: "re1", project_id: "p1", localite_id: "y", titre: "Forage" },
    { id: "re2", project_id: "p1", localite_id: "y", titre: "Latrines" },
    { id: "re3", project_id: "p-autre", localite_id: "y", titre: "Ailleurs" },
  ];
}

const saisie = (id: string, localite_id: string | null): SaisieLigne => ({
  id,
  kpi_id: "k1",
  date: "2026-03-01",
  valeur: 1,
  commentaire: null,
  localite_id,
  created_at: "",
  updated_at: "",
});

async function ouvrirMenu(nom: string) {
  const bouton = await screen.findByRole("button", { name: nom });
  bouton.focus();
  fireEvent.keyDown(bouton, { key: "Enter" });
}

beforeEach(() => {
  base.reinitialiser();
  gererErreur.mockReset();
});

describe("Zones d'intervention", () => {
  it("liste les zones de ce projet seulement, avec niveau, origine, contexte, coordonnées et usage", async () => {
    donnees();
    monterProjet(<Zones />, { saisies: [saisie("s1", "y"), saisie("s2", "y"), saisie("s3", null)] });
    await screen.findByRole("heading", { name: "Commune de Yoff" });
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Commune de Yoff",
      "Layène",
      "Carte",
    ]);
    expect(screen.queryByRole("heading", { name: "Tonghor" })).not.toBeInTheDocument();
    expect(screen.getByText("2 zones d’intervention")).toBeInTheDocument();
    const yoff = screen.getByRole("heading", { name: "Commune de Yoff" }).closest("li")!;
    expect(within(yoff).getByText("Commune")).toBeInTheDocument();
    expect(within(yoff).getByText("Référentiel")).toBeInTheDocument();
    expect(within(yoff).getByText("Département de Dakar, Région de Dakar")).toBeInTheDocument();
    expect(within(yoff).getByText(/14,760358 N, 17,468149 O/)).toBeInTheDocument();
    expect(within(yoff).getByText("2 saisies · 2 réalisations")).toBeInTheDocument();
    expect(within(yoff).getByText("Commune d’intervention")).toBeInTheDocument();
    const layene = screen.getByRole("heading", { name: "Layène" }).closest("li")!;
    expect(within(layene).getByText("Sans coordonnées : absente de la carte")).toBeInTheDocument();
  });

  it("transmet à la carte les seules zones qui ont des coordonnées, et dit combien en manquent", async () => {
    donnees();
    monterProjet(<Zones />);
    expect(await screen.findByTestId("carte")).toHaveTextContent(
      "Commune de Yoff (Département de Dakar, Région de Dakar)",
    );
    expect(screen.getByTestId("carte")).not.toHaveTextContent("Layène");
    expect(screen.getByText("1 zone sans coordonnées n’apparaît pas sur la carte.")).toBeInTheDocument();
    expect(screen.getByText(/votre adresse IP lui est visible/)).toBeInTheDocument();
  });

  it("dit que la carte est vide quand aucune zone n'a de coordonnées, sans l'afficher", async () => {
    donnees();
    base.tables.projet_localites = [{ id: "z2", project_id: "p1", org_id: "o1", localite_id: "l", notes: null }];
    monterProjet(<Zones />);
    expect(await screen.findByText(/Aucune zone n’a de coordonnées/)).toBeInTheDocument();
    expect(screen.queryByTestId("carte")).not.toBeInTheDocument();
  });

  it("explique l'état vide et propose d'ajouter une zone", async () => {
    donnees();
    base.tables.projet_localites = [];
    monterProjet(<Zones />);
    expect(await screen.findByText("Aucune zone d’intervention")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Ajouter une zone" }).length).toBeGreaterThan(0);
  });

  it("n'offre aucune écriture à un lecteur, et le dit", async () => {
    donnees();
    monterProjet(<Zones />, { role: "lecteur" });
    await screen.findByRole("heading", { name: "Commune de Yoff" });
    expect(screen.queryByRole("button", { name: "Ajouter une zone" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Actions pour la zone/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Votre rôle est en lecture seule/)).toBeInTheDocument();
  });

  it("après la fin d'essai : lecture seule expliquée, aucune action", async () => {
    donnees();
    monterProjet(<Zones />, { essaiFini: true });
    await screen.findByRole("heading", { name: "Commune de Yoff" });
    expect(screen.queryByRole("button", { name: "Ajouter une zone" })).not.toBeInTheDocument();
    expect(screen.getByText(/L’essai est terminé/)).toBeInTheDocument();
  });

  it("propose les localités qui ne sont pas déjà des zones, retrouvées sans accents, et en ajoute une", async () => {
    donnees();
    monterProjet(<Zones />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter une zone" }));
    const dialogue = await screen.findByRole("dialog");
    // Déjà zones : Yoff et Layène. Les autres peuvent être ajoutées.
    expect(within(dialogue).getAllByText("Déjà une zone")).toHaveLength(2);
    expect(within(dialogue).getByRole("button", { name: "Ajouter : Tonghor" })).toBeInTheDocument();
    expect(within(dialogue).queryByRole("button", { name: "Ajouter : Layène" })).not.toBeInTheDocument();
    fireEvent.change(within(dialogue).getByLabelText("Rechercher une localité"), { target: { value: "TONGHOR" } });
    expect(
      within(dialogue).queryByRole("button", { name: "Ajouter : Village de l’organisation" }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter : Tonghor" }));
    await waitFor(() => {
      const appel = base.appels.find((a) => a.table === "projet_localites" && a.operation === "insert");
      expect(appel?.valeurs).toEqual({ project_id: "p1", localite_id: "t" });
    });
  });

  it("dit qu'aucune localité ne correspond à la recherche", async () => {
    donnees();
    monterProjet(<Zones />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter une zone" }));
    const dialogue = await screen.findByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText("Rechercher une localité"), { target: { value: "kolda" } });
    expect(within(dialogue).getByText("Aucune localité ne correspond à « kolda ».")).toBeInTheDocument();
  });

  it("retire une zone après confirmation, en disant que les saisies gardent leur localité", async () => {
    donnees();
    monterProjet(<Zones />);
    await ouvrirMenu("Actions pour la zone Layène");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Retirer des zones" }));
    const confirmation = await screen.findByRole("dialog");
    expect(within(confirmation).getByText(/gardent/)).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Retirer" }));
    await waitFor(() =>
      expect(base.appels.some((a) => a.table === "projet_localites" && a.operation === "delete")).toBe(true),
    );
  });

  it("crée une localité de l'organisation depuis la page, puis l'ajoute aux zones", async () => {
    donnees();
    monterProjet(<Zones />);
    fireEvent.click(await screen.findByRole("button", { name: "Créer une localité" }));
    const dialogue = await screen.findByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText("Nom"), { target: { value: "Village de Test" } });
    fireEvent.change(within(dialogue).getByLabelText(/Latitude/), { target: { value: "14,77" } });
    fireEvent.change(within(dialogue).getByLabelText(/Longitude/), { target: { value: "-17,47" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter" }));
    await waitFor(() => {
      const appel = base.appels.find((a) => a.table === "localites" && a.operation === "insert");
      expect(appel?.valeurs).toMatchObject({
        org_id: "o1",
        niveau: "village",
        nom: "Village de Test",
        latitude: 14.77,
        longitude: -17.47,
        parent_id: null,
      });
    });
    // La localité créée devient aussitôt une zone du projet.
    await waitFor(() => {
      const appel = base.appels.find((a) => a.table === "projet_localites" && a.operation === "insert");
      expect(appel?.valeurs).toEqual({ project_id: "p1", localite_id: "nouveau" });
    });
  });
});
