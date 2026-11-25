import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Kpi, SaisieLigne } from "~/lib/donnees";
import { MagasinFile } from "~/lib/hors-ligne/file";
import { type ClientSaisiesDeTest, creerClientSaisies, simulerReseau } from "~/test/client-saisies";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import { creerStockageMemoire } from "~/test/stockage-memoire";
import Saisie from "./Saisie";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

const kpi = {
  id: "k1",
  project_id: "p1",
  nom: "Points d’eau réhabilités",
  unite: "points",
  cible: 100,
  valeur_base: 0,
  frequence: "mensuelle",
  sens: "croissant",
  type_agregation: "dernier",
  ordre: 0,
  epingle: false,
} as unknown as Kpi;

const ligne = (id: string, date: string, valeur: number): SaisieLigne => ({
  id,
  kpi_id: "k1",
  date,
  valeur,
  commentaire: null,
  created_at: "",
  updated_at: "",
});

const reseau = { name: "TypeError", message: "TypeError: Failed to fetch" };

function monter(
  options: Omit<NonNullable<Parameters<typeof monterProjet>[1]>, "client"> & { client?: ClientSaisiesDeTest } = {},
) {
  const magasin = options.magasin ?? new MagasinFile(creerStockageMemoire(), "u");
  const client = options.client ?? creerClientSaisies();
  const rendu = monterProjet(<Saisie />, { kpis: [kpi], ...options, magasin, client });
  return { magasin, client, ...rendu };
}

async function saisir(valeur: string, date?: string) {
  await screen.findByRole("heading", { name: "Saisir une valeur" });
  if (date) fireEvent.change(screen.getByLabelText("Date"), { target: { value: date } });
  fireEvent.change(screen.getByLabelText(/^Valeur/), { target: { value: valeur } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
}

beforeEach(() => {
  base.reinitialiser();
  gererErreur.mockReset();
  simulerReseau(true);
});
afterEach(() => vi.restoreAllMocks());

describe("Saisie hors ligne", () => {
  it("garde la saisie sur l'appareil sans tenter le réseau, et la montre en attente d'envoi", async () => {
    simulerReseau(false);
    const { magasin, client } = monter();
    await saisir("12");
    const carte = await screen.findByTestId("saisies-en-attente");
    expect(within(carte).getByText("Points d’eau réhabilités")).toBeInTheDocument();
    // Le titre de la carte et l'étiquette de la saisie.
    expect(within(carte).getAllByText("En attente d’envoi")).toHaveLength(2);
    expect(client.inserer).not.toHaveBeenCalled();
    expect(magasin.lister()).toEqual([
      expect.objectContaining({
        kpiId: "k1",
        valeur: 12,
        projetId: "p1",
        orgId: "o1",
        utilisateurId: "u",
        statut: "attente",
      }),
    ]);
    // Le formulaire est prêt pour la valeur suivante.
    expect(screen.getByLabelText(/^Valeur/)).toHaveValue("");
  });

  it("n'ajoute pas la saisie à l'historique de la base tant qu'elle n'est pas envoyée", async () => {
    simulerReseau(false);
    monter({ saisies: [ligne("s1", "2026-02-01", 4)] });
    await saisir("5", "2026-03-01");
    await screen.findByTestId("saisies-en-attente");
    const historique = screen.getByRole("table");
    expect(within(historique).getAllByRole("row")).toHaveLength(2); // en-tête + la seule ligne de la base
  });

  it("envoie la saisie avec un identifiant tiré sur l'appareil quand le réseau marche, et ne laisse rien en attente", async () => {
    const { magasin, client } = monter();
    await saisir("12");
    await waitFor(() => expect(client.inserer).toHaveBeenCalledTimes(1));
    expect(client.inserer.mock.calls[0]![0]).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      kpiId: "k1",
      valeur: 12,
    });
    await waitFor(() => expect(magasin.lister()).toEqual([]));
    expect(screen.queryByTestId("saisies-en-attente")).not.toBeInTheDocument();
  });

  it("n'envoie qu'une fois une saisie en ligne, même quand la réponse tarde (l'envoi automatique ne la double pas)", async () => {
    let terminer!: () => void;
    const client = creerClientSaisies({
      inserer: vi.fn(() => new Promise<null>((resolve) => (terminer = () => resolve(null)))),
    });
    const { magasin } = monter({ client });
    await saisir("12");
    await waitFor(() => expect(client.inserer).toHaveBeenCalledTimes(1));
    // Le temps que la file se réaffiche : l'envoi automatique ne doit pas repartir pour la même saisie.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(client.inserer).toHaveBeenCalledTimes(1);
    await act(async () => terminer());
    await waitFor(() => expect(magasin.lister()).toEqual([]));
    expect(client.inserer).toHaveBeenCalledTimes(1);
  });

  it("garde la saisie quand la requête échoue faute de réseau alors que le navigateur se croit en ligne", async () => {
    const client = creerClientSaisies({ inserer: vi.fn(() => Promise.resolve(reseau)) });
    const { magasin } = monter({ client });
    await saisir("12");
    expect(await screen.findByTestId("saisies-en-attente")).toBeInTheDocument();
    expect(magasin.lister()).toHaveLength(1);
    expect(gererErreur).not.toHaveBeenCalled();
  });

  it("ne garde pas une saisie que la base refuse : l'erreur s'affiche comme avant", async () => {
    const erreur = { code: "P0001", message: "ESSAI_EXPIRE" };
    const client = creerClientSaisies({ inserer: vi.fn(() => Promise.resolve(erreur)) });
    const { magasin } = monter({ client });
    await saisir("12");
    await waitFor(() => expect(gererErreur).toHaveBeenCalledWith(erreur));
    expect(magasin.lister()).toEqual([]);
    expect(screen.queryByTestId("saisies-en-attente")).not.toBeInTheDocument();
  });

  it("ne garde pas non plus une saisie en conflit avec la valeur d'un autre", async () => {
    const client = creerClientSaisies({
      inserer: vi.fn(() => Promise.resolve({ code: "23505", message: "doublon" })),
      lireParDate: vi.fn(() => Promise.resolve({ ligne: { id: "autre", valeur: 99 }, erreur: null })),
    });
    const { magasin } = monter({ client });
    await saisir("12");
    await waitFor(() => expect(client.lireParDate).toHaveBeenCalled());
    await waitFor(() => expect(magasin.lister()).toEqual([]));
    expect(gererErreur).not.toHaveBeenCalled();
  });

  it("ne promet rien quand l'appareil refuse de garder la saisie", async () => {
    simulerReseau(false);
    const { client } = monter({ magasin: new MagasinFile(null, "u") });
    await saisir("12");
    await waitFor(() => expect(screen.getByLabelText(/^Valeur/)).toBeInTheDocument());
    expect(client.inserer).not.toHaveBeenCalled();
    expect(screen.queryByTestId("saisies-en-attente")).not.toBeInTheDocument();
    // Les valeurs tapées restent dans le formulaire : rien n'a été perdu.
    expect(screen.getByLabelText(/^Valeur/)).toHaveValue("12");
  });

  it("envoie les saisies en attente au retour du réseau", async () => {
    simulerReseau(false);
    const { magasin, client } = monter();
    await saisir("12");
    await screen.findByTestId("saisies-en-attente");
    expect(client.inserer).not.toHaveBeenCalled();
    await act(async () => simulerReseau(true));
    await waitFor(() => expect(client.inserer).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(magasin.lister()).toEqual([]));
    await waitFor(() => expect(screen.queryByTestId("saisies-en-attente")).not.toBeInTheDocument());
  });

  it("remplacer une valeur déjà envoyée demande une connexion", async () => {
    simulerReseau(false);
    const { client } = monter({ saisies: [ligne("s1", "2026-03-01", 4)] });
    await saisir("12", "2026-03-01");
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).getByText(/la remplacer demande une connexion/i)).toBeInTheDocument();
    expect(within(dialogue).getByRole("button", { name: "Remplacer" })).toBeDisabled();
    expect(client.inserer).not.toHaveBeenCalled();
  });

  it("désactive la correction et la suppression des valeurs déjà envoyées, en le disant", async () => {
    simulerReseau(false);
    monter({ saisies: [ligne("s1", "2026-03-01", 4)] });
    await screen.findByRole("table");
    const modifier = screen.getByRole("button", { name: /^Modifier la saisie/ });
    expect(modifier).toBeDisabled();
    expect(modifier).toHaveAttribute("title", expect.stringMatching(/demande une connexion/));
    expect(screen.getByRole("button", { name: /^Supprimer la saisie/ })).toBeDisabled();
  });

  it("signale une saisie déjà en attente à la même date et la remplace sur confirmation", async () => {
    simulerReseau(false);
    const { magasin } = monter();
    await saisir("12", "2026-03-01");
    await screen.findByTestId("saisies-en-attente");
    fireEvent.change(screen.getByLabelText(/^Valeur/), { target: { value: "20" } });
    expect(screen.getByText(/déjà en attente d’envoi pour cette date/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).getByText(/Une saisie en attente d’envoi existe déjà/)).toBeInTheDocument();
    fireEvent.click(within(dialogue).getByRole("button", { name: "Remplacer" }));
    await waitFor(() => expect(magasin.lister().map((s) => s.valeur)).toEqual([20]));
  });

  it("permet de supprimer une saisie en attente", async () => {
    simulerReseau(false);
    const { magasin } = monter();
    await saisir("12");
    const carte = await screen.findByTestId("saisies-en-attente");
    fireEvent.click(within(carte).getByRole("button", { name: /^Supprimer la saisie du/ }));
    await waitFor(() => expect(magasin.lister()).toEqual([]));
  });
});

describe("Saisie hors ligne : conflits et refus trouvés à l'envoi", () => {
  const conflit = (magasin: MagasinFile) => {
    magasin.ajouter({
      id: "c1",
      utilisateurId: "u",
      orgId: "o1",
      projetId: "p1",
      kpiId: "k1",
      date: "2026-03-01",
      valeur: 12,
      commentaire: null,
      localiteId: null,
    });
    magasin.modifier("c1", { statut: "conflit", valeurServeur: 99, idServeur: "s9" });
  };

  it("montre la valeur déjà en place et laisse choisir : remplacer par la sienne", async () => {
    const magasin = new MagasinFile(creerStockageMemoire(), "u");
    conflit(magasin);
    const { client } = monter({ magasin });
    const carte = await screen.findByTestId("saisies-en-attente");
    expect(within(carte).getByText(/Une autre valeur existe déjà à cette date : 99/)).toBeInTheDocument();
    fireEvent.click(within(carte).getByRole("button", { name: "Remplacer par ma valeur" }));
    await waitFor(() =>
      expect(client.remplacer).toHaveBeenCalledWith(
        "s9",
        { valeur: 12, commentaire: null, localite_id: null },
        expect.anything(),
      ),
    );
    await waitFor(() => expect(magasin.lister()).toEqual([]));
  });

  it("ou garder la valeur en place : la saisie de l'appareil est abandonnée", async () => {
    const magasin = new MagasinFile(creerStockageMemoire(), "u");
    conflit(magasin);
    const { client } = monter({ magasin });
    const carte = await screen.findByTestId("saisies-en-attente");
    fireEvent.click(within(carte).getByRole("button", { name: "Garder la valeur en place" }));
    await waitFor(() => expect(magasin.lister()).toEqual([]));
    expect(client.remplacer).not.toHaveBeenCalled();
  });

  it("explique le motif d'un refus", async () => {
    const magasin = new MagasinFile(creerStockageMemoire(), "u");
    magasin.ajouter({
      id: "r1",
      utilisateurId: "u",
      orgId: "o1",
      projetId: "p1",
      kpiId: "k1",
      date: "2026-03-01",
      valeur: 12,
      commentaire: "Relevé au forage 3",
      localiteId: null,
    });
    magasin.modifier("r1", { statut: "refusee", erreurCle: "erreurs.ESSAI_EXPIRE" });
    monter({ magasin });
    const carte = await screen.findByTestId("saisies-en-attente");
    expect(within(carte).getByText(/Refusée : /)).toBeInTheDocument();
    expect(within(carte).getByText("Relevé au forage 3")).toBeInTheDocument();
    expect(within(carte).getByRole("button", { name: /Supprimer la saisie du/ })).toBeInTheDocument();
  });
});
