import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import Beneficiaires from "./Beneficiaires";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

let n = 0;
const effectif = (extra: Record<string, unknown>) => ({
  id: `e${++n}`,
  project_id: "p1",
  org_id: "o1",
  periode_debut: "2026-01-01",
  periode_fin: "2026-06-30",
  categorie: "Usagers des points d’eau",
  sexe: "femme",
  tranche_age: "25_59",
  effectif: 100,
  lieu: null,
  created_by: null,
  created_at: "",
  updated_at: "",
  ...extra,
});

/** Premier semestre : 100 femmes + 80 hommes (25-59) ; second : 150 + 90 d'usagers et 60 participants sans ventilation. */
function donnees() {
  n = 0;
  base.tables.beneficiaires_effectifs = [
    effectif({ sexe: "femme", effectif: 100 }),
    effectif({ sexe: "homme", effectif: 80 }),
    effectif({ periode_debut: "2026-07-01", periode_fin: "2026-12-31", sexe: "femme", effectif: 150, lieu: "Kolda" }),
    effectif({ periode_debut: "2026-07-01", periode_fin: "2026-12-31", sexe: "homme", effectif: 90, lieu: "Kolda" }),
    effectif({
      periode_debut: "2026-07-01",
      periode_fin: "2026-12-31",
      categorie: "Participants aux séances",
      sexe: "non_precise",
      tranche_age: "non_precise",
      effectif: 60,
    }),
  ];
}

async function ouvrirMenu(nom: string) {
  const bouton = await screen.findByRole("button", { name: nom });
  bouton.focus();
  fireEvent.keyDown(bouton, { key: "Enter" });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-31T12:00:00"));
  base.reinitialiser();
  gererErreur.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("Bénéficiaires : synthèse", () => {
  it("ouvre la période la plus récente et en donne les totaux, avec la part des femmes parmi les sexes connus", async () => {
    donnees();
    monterProjet(<Beneficiaires />);
    const synthese = (await screen.findByRole("heading", { name: "Synthèse des effectifs", hidden: true })).closest(
      "section",
    )!;
    expect(within(synthese).getByText("Total de la période")).toBeInTheDocument();
    expect(within(synthese).getByText("300")).toBeInTheDocument(); // 150 + 90 + 60
    expect(within(synthese).getByText("63 %")).toBeInTheDocument(); // 150 / (150 + 90)
    expect(
      within(synthese).getByText(/20 % des effectifs n’ont ni le sexe ni la tranche d’âge précisés/),
    ).toBeInTheDocument();
  });

  it("montre le tableau tranche d'âge × sexe, sans les tranches vides", async () => {
    donnees();
    monterProjet(<Beneficiaires />);
    const tableau = await screen.findByRole("table", { name: "Effectifs par tranche d’âge et par sexe." });
    const lignes = within(tableau).getAllByRole("row").slice(1);
    expect(lignes.map((l) => within(l).getAllByRole("rowheader")[0]!.textContent)).toEqual([
      "25 à 59 ans",
      "Non précisé",
    ]);
    expect(
      within(lignes[0]!)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["150", "90", "0", "240"]);
  });

  it("totalise par catégorie et propose de filtrer", async () => {
    donnees();
    monterProjet(<Beneficiaires />);
    const section = (await screen.findByRole("heading", { name: "Par catégorie" })).closest("section")!;
    expect(within(section).getByText("Usagers des points d’eau").parentElement).toHaveTextContent("240");
    fireEvent.change(screen.getByLabelText("Catégorie"), { target: { value: "Participants aux séances" } });
    const synthese = screen.getByRole("heading", { name: "Synthèse des effectifs", hidden: true }).closest("section")!;
    expect(within(synthese).getByText("60")).toBeInTheDocument();
    expect(within(synthese).getByText("-")).toBeInTheDocument(); // aucun sexe précisé : pas de part de femmes
  });

  it("le cumul de toutes les périodes est présenté comme tel, avec son avertissement", async () => {
    donnees();
    monterProjet(<Beneficiaires />);
    await screen.findByText("Total de la période");
    fireEvent.change(screen.getByLabelText("Période"), { target: { value: "toutes" } });
    expect(screen.getByText(/une même personne peut y être comptée plusieurs fois/)).toBeInTheDocument();
    const synthese = screen.getByRole("heading", { name: "Synthèse des effectifs", hidden: true }).closest("section")!;
    expect(within(synthese).getByText("Cumul des effectifs")).toBeInTheDocument();
    expect(within(synthese).getByText("480")).toBeInTheDocument(); // 180 + 300
  });

  it("change de période", async () => {
    donnees();
    monterProjet(<Beneficiaires />);
    await screen.findByText("Total de la période");
    const selecteur = screen.getByLabelText("Période");
    fireEvent.change(selecteur, { target: { value: "2026-01-01|2026-06-30" } });
    const synthese = screen.getByRole("heading", { name: "Synthèse des effectifs", hidden: true }).closest("section")!;
    expect(within(synthese).getByText("180")).toBeInTheDocument();
  });

  it("liste le détail saisi, avec le lieu", async () => {
    donnees();
    monterProjet(<Beneficiaires />);
    const detail = await screen.findByRole("table", { name: /Effectifs saisis/ });
    const lignes = within(detail).getAllByRole("row").slice(1);
    expect(lignes).toHaveLength(3);
    expect(within(lignes[0]!).getByText("Kolda")).toBeInTheDocument();
  });
});

describe("Bénéficiaires : états et droits", () => {
  it("explique l'état vide, sans fiche nominative", async () => {
    monterProjet(<Beneficiaires />);
    expect(await screen.findByText("Aucun effectif enregistré")).toBeInTheDocument();
    expect(screen.getByText(/Aucune fiche nominative n’est enregistrée/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter un effectif" })).toBeInTheDocument();
  });

  it("laisse un lecteur consulter sans rien écrire", async () => {
    donnees();
    monterProjet(<Beneficiaires />, { role: "lecteur" });
    await screen.findByText("Total de la période");
    expect(screen.queryByRole("button", { name: /Ajouter un effectif|Actions pour/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Votre rôle est en lecture seule/)).toBeInTheDocument();
  });

  it("passe en lecture seule à la fin de l'essai", async () => {
    donnees();
    monterProjet(<Beneficiaires />, { essaiFini: true });
    await screen.findByText("Total de la période");
    expect(screen.queryByRole("button", { name: "Ajouter un effectif" })).not.toBeInTheDocument();
  });
});

describe("Bénéficiaires : formulaire", () => {
  async function ouvrirSaisie() {
    donnees();
    monterProjet(<Beneficiaires />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter un effectif" }));
    return screen.findByRole("dialog");
  }

  it("propose la dernière période saisie et enregistre un effectif, espaces et lieu compris", async () => {
    const dialogue = await ouvrirSaisie();
    expect(within(dialogue).getByLabelText("Début de la période")).toHaveValue("2026-07-01");
    expect(within(dialogue).getByLabelText("Fin de la période")).toHaveValue("2026-12-31");
    fireEvent.change(within(dialogue).getByLabelText("Catégorie de bénéficiaires"), { target: { value: "Élèves" } });
    fireEvent.change(within(dialogue).getByLabelText("Sexe"), { target: { value: "femme" } });
    fireEvent.change(within(dialogue).getByLabelText("Tranche d’âge"), { target: { value: "5_14" } });
    fireEvent.change(within(dialogue).getByLabelText(/^Effectif/), { target: { value: "1 250" } });
    fireEvent.change(within(dialogue).getByLabelText(/^Lieu/), { target: { value: "Médina Yoro Foulah" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "beneficiaires_effectifs",
      operation: "insert",
      valeurs: {
        project_id: "p1",
        periode_debut: "2026-07-01",
        periode_fin: "2026-12-31",
        categorie: "Élèves",
        sexe: "femme",
        tranche_age: "5_14",
        effectif: 1250,
        lieu: "Médina Yoro Foulah",
      },
    });
  });

  it("refuse un effectif non entier, une catégorie vide et une période à l'envers", async () => {
    const dialogue = await ouvrirSaisie();
    fireEvent.change(within(dialogue).getByLabelText("Début de la période"), { target: { value: "2026-12-31" } });
    fireEvent.change(within(dialogue).getByLabelText("Fin de la période"), { target: { value: "2026-07-01" } });
    fireEvent.change(within(dialogue).getByLabelText(/^Effectif/), { target: { value: "12,5" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter" }));
    expect(await within(dialogue).findByText("Indiquez un nombre entier, de 0 à 100 000 000.")).toBeInTheDocument();
    expect(within(dialogue).getByText("Indiquez une catégorie de 1 à 120 caractères.")).toBeInTheDocument();
    expect(within(dialogue).getByText("La fin de la période ne peut pas précéder son début.")).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });

  it("accepte zéro comme effectif", async () => {
    const dialogue = await ouvrirSaisie();
    fireEvent.change(within(dialogue).getByLabelText("Catégorie de bénéficiaires"), { target: { value: "Élèves" } });
    fireEvent.change(within(dialogue).getByLabelText(/^Effectif/), { target: { value: "0" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toMatchObject({ valeurs: { effectif: 0 } });
  });

  it("modifie un effectif existant", async () => {
    donnees();
    monterProjet(<Beneficiaires />);
    await ouvrirMenu("Actions pour l’effectif Usagers des points d’eau, Femmes, 25 à 59 ans");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Modifier" }));
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).getByLabelText(/^Effectif/)).toHaveValue("150");
    fireEvent.change(within(dialogue).getByLabelText(/^Effectif/), { target: { value: "155" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toMatchObject({
      table: "beneficiaires_effectifs",
      operation: "update",
      valeurs: { effectif: 155 },
    });
  });

  it("supprime un effectif après confirmation", async () => {
    donnees();
    monterProjet(<Beneficiaires />);
    await ouvrirMenu("Actions pour l’effectif Usagers des points d’eau, Femmes, 25 à 59 ans");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
    const confirmation = await screen.findByRole("dialog");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Supprimer l’effectif" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({ table: "beneficiaires_effectifs", operation: "delete", valeurs: undefined });
  });
});
