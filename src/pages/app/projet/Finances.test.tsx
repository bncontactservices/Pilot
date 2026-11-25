import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import Finances from "./Finances";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

const ligne = (id: string, annee: number, poste: string, montant_prevu: number) => ({
  id,
  project_id: "p1",
  org_id: "o1",
  annee,
  poste,
  montant_prevu,
  notes: null,
  created_by: null,
  created_at: "2026-02-01T08:00:00Z",
  updated_at: "",
});
const depense = (id: string, ligneId: string, libelle: string, montant: number, extra = {}) => ({
  id,
  project_id: "p1",
  org_id: "o1",
  budget_ligne_id: ligneId,
  date: "2026-05-12",
  libelle,
  montant,
  fournisseur: null,
  reference: null,
  document_id: null,
  created_by: null,
  created_at: "2026-05-12T08:00:00Z",
  updated_at: "",
  ...extra,
});

let clic: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T12:00:00"));
  vi.stubGlobal("crypto", { randomUUID: () => "uuid-test" });
  base.reinitialiser();
  gererErreur.mockReset();
  clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clic.mockRestore();
});

/** Forages 100 prévus (dépensés 100), Latrines 50 prévus (dépensés 80 : dépassement), et une ligne de 2027. */
function donnees() {
  base.tables.budget_lignes = [
    ligne("l1", 2026, "Forages", 100),
    ligne("l2", 2026, "Latrines", 50),
    ligne("l3", 2027, "Forages", 200),
  ];
  base.tables.depenses = [
    depense("e1", "l1", "Pompes et tuyauterie", 100, {
      fournisseur: "Sahel Hydraulique",
      reference: "FAC-001",
      document_id: "d1",
    }),
    depense("e2", "l2", "Dalles de latrines", 80),
  ];
  base.tables.documents = [
    {
      id: "d1",
      project_id: "p1",
      org_id: "o1",
      nom: "Facture pompes",
      categorie: "justificatif",
      description: null,
      storage_path: "o1/p1/d1-facture.pdf",
      mime_type: "application/pdf",
      taille_octets: 1000,
      realisation_id: null,
      created_by: null,
      created_at: "2026-05-12T08:00:00Z",
      updated_at: "",
    },
  ];
}

/** Radix n'ouvre pas le menu au clic sous jsdom : on l'ouvre au clavier, comme le ferait une personne. */
async function ouvrirMenu(nom: string) {
  const bouton = await screen.findByRole("button", { name: nom });
  bouton.focus();
  fireEvent.keyDown(bouton, { key: "Enter" });
}

describe("Finances : contenu", () => {
  it("affiche la synthèse : prévu, dépensé, dépassement et taux d'exécution", async () => {
    donnees();
    monterProjet(<Finances />);
    const synthese = (await screen.findByRole("heading", { name: "Synthèse financière", hidden: true })).closest(
      "section",
    )!;
    // 350 prévus (100 + 50 + 200), 180 dépensés : il reste 170, le taux est de 51 %.
    expect(within(synthese).getByText(/350\sF\sCFA/)).toBeInTheDocument();
    expect(within(synthese).getByText(/180\sF\sCFA/)).toBeInTheDocument();
    expect(within(synthese).getByText("Reste à dépenser")).toBeInTheDocument();
    expect(within(synthese).getByText("51 %")).toBeInTheDocument();
    expect(within(synthese).getByText("1 poste dépasse son budget.")).toBeInTheDocument();
  });

  it("annonce le dépassement du budget total en toutes lettres", async () => {
    base.tables.budget_lignes = [ligne("l1", 2026, "Forages", 100)];
    base.tables.depenses = [depense("e1", "l1", "Pompes", 130)];
    monterProjet(<Finances />);
    const synthese = (await screen.findByRole("heading", { name: "Synthèse financière", hidden: true })).closest(
      "section",
    )!;
    expect(within(synthese).getByText("Dépassement")).toBeInTheDocument();
    expect(within(synthese).queryByText("Reste à dépenser")).not.toBeInTheDocument();
    expect(within(synthese).getByText("130 %")).toBeInTheDocument();
  });

  it("présente chaque année avec ses postes, leur exécution et un badge sur ceux qui dépassent", async () => {
    donnees();
    monterProjet(<Finances />);
    const annee2026 = (await screen.findByRole("heading", { name: "Exercice 2026" })).closest("div")!.parentElement!;
    const latrines = within(annee2026)
      .getByRole("rowheader", { name: /Latrines/ })
      .closest("tr")!;
    expect(within(latrines).getByText("160 %")).toBeInTheDocument();
    expect(within(latrines).getByText("Dépassé")).toBeInTheDocument();
    expect(within(latrines).getByText(/−30\sF\sCFA/)).toBeInTheDocument();
    const forages = within(annee2026)
      .getByRole("rowheader", { name: /Forages/ })
      .closest("tr")!;
    expect(within(forages).getByText("100 %")).toBeInTheDocument();
    expect(within(forages).queryByText("Dépassé")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Exercice 2027" })).toBeInTheDocument();
  });

  it("liste les dépenses avec leur poste, leur fournisseur, leur pièce et leur justificatif", async () => {
    donnees();
    monterProjet(<Finances />);
    const pompes = (await screen.findByRole("heading", { name: "Pompes et tuyauterie" })).closest("li")!;
    expect(within(pompes).getByText(/2026 — Forages · Sahel Hydraulique · pièce FAC-001/)).toBeInTheDocument();
    expect(within(pompes).getByText("12 mai 2026")).toBeInTheDocument();
    expect(
      within(pompes).getByRole("button", { name: "Télécharger le justificatif : Facture pompes" }),
    ).toBeInTheDocument();
    const dalles = screen.getByRole("heading", { name: "Dalles de latrines" }).closest("li")!;
    expect(within(dalles).getByText("Sans justificatif")).toBeInTheDocument();
    expect(screen.getByText(/2 dépenses ·/)).toBeInTheDocument();
  });

  it("filtre les dépenses par ligne du budget", async () => {
    donnees();
    monterProjet(<Finances />);
    await screen.findByRole("heading", { name: "Pompes et tuyauterie" });
    fireEvent.change(screen.getByLabelText("Poste"), { target: { value: "l2" } });
    expect(screen.queryByRole("heading", { name: "Pompes et tuyauterie" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dalles de latrines" })).toBeInTheDocument();
    expect(screen.getByText(/1 dépense ·/)).toBeInTheDocument();
  });

  it("télécharge un justificatif par un lien signé d'une minute", async () => {
    donnees();
    monterProjet(<Finances />);
    fireEvent.click(await screen.findByRole("button", { name: "Télécharger le justificatif : Facture pompes" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toMatchObject({ table: "stockage:documents", operation: "signed" });
  });

  it("signale l'écart entre le budget du projet et les lignes", async () => {
    base.tables.budget_lignes = [ligne("l1", 2026, "Forages", 100)];
    monterProjet(<Finances />, {});
    expect(await screen.findByText("Exercice 2026")).toBeInTheDocument();
    // Le projet de test n'a pas de budget renseigné : aucun écart n'est affiché.
    expect(screen.queryByText(/Le budget du projet est de/)).not.toBeInTheDocument();
  });

  it("explique l'état vide et propose de commencer par une ligne", async () => {
    monterProjet(<Finances />);
    expect(await screen.findByText("Aucun budget pour ce projet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter une ligne" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enregistrer une dépense" })).not.toBeInTheDocument();
  });

  it("un budget sans dépense invite à enregistrer la première", async () => {
    base.tables.budget_lignes = [ligne("l1", 2026, "Forages", 100)];
    monterProjet(<Finances />);
    expect(await screen.findByText("Aucune dépense enregistrée")).toBeInTheDocument();
  });

  it("laisse un lecteur tout consulter sans rien écrire", async () => {
    donnees();
    monterProjet(<Finances />, { role: "lecteur" });
    await screen.findByRole("heading", { name: "Pompes et tuyauterie" });
    expect(
      screen.queryByRole("button", { name: /Ajouter une ligne|Enregistrer une dépense|Actions pour/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Votre rôle est en lecture seule/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Télécharger le justificatif : Facture pompes" })).toBeInTheDocument();
  });

  it("laisse un éditeur gérer le budget, mais pas enregistrer de dépense : elles sont réservées aux administrateurs", async () => {
    donnees();
    monterProjet(<Finances />, { role: "editeur" });
    await screen.findByRole("heading", { name: "Pompes et tuyauterie" });
    expect(screen.getByRole("button", { name: "Ajouter une ligne" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enregistrer une dépense" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Actions pour la dépense/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Les dépenses sont enregistrées par les administrateurs/)).toBeInTheDocument();
    // Il peut toujours télécharger les justificatifs.
    expect(screen.getByRole("button", { name: "Télécharger le justificatif : Facture pompes" })).toBeInTheDocument();
    // Le menu d'une ligne propose de modifier et supprimer, pas d'enregistrer une dépense.
    await ouvrirMenu("Actions pour la ligne Latrines (2026)");
    expect(await screen.findByRole("menuitem", { name: "Modifier" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Enregistrer une dépense" })).not.toBeInTheDocument();
  });

  it("dit à un éditeur que les premières dépenses viendront d'un administrateur", async () => {
    base.tables.budget_lignes = [ligne("l1", 2026, "Forages", 100)];
    monterProjet(<Finances />, { role: "editeur" });
    expect(await screen.findByText("Aucune dépense enregistrée")).toBeInTheDocument();
    expect(
      screen.getByText(/Les dépenses sont enregistrées par les administrateurs de l’organisation/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enregistrer une dépense" })).not.toBeInTheDocument();
  });

  it("passe en lecture seule à la fin de l'essai", async () => {
    donnees();
    monterProjet(<Finances />, { essaiFini: true });
    await screen.findByRole("heading", { name: "Pompes et tuyauterie" });
    expect(screen.queryByRole("button", { name: /Ajouter une ligne|Enregistrer une dépense/ })).not.toBeInTheDocument();
  });
});

describe("Finances : ligne budgétaire", () => {
  it("crée une ligne : année du projet la plus proche d'aujourd'hui, montant lu avec ses espaces et sa virgule", async () => {
    donnees();
    monterProjet(<Finances />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter une ligne" }));
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).getByLabelText("Année")).toHaveValue("2026");
    fireEvent.change(within(dialogue).getByLabelText(/Poste de dépense/), {
      target: { value: "Formation des relais" },
    });
    fireEvent.change(within(dialogue).getByLabelText(/Montant prévu/), { target: { value: "1 250 000,5" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "budget_lignes",
      operation: "insert",
      valeurs: { project_id: "p1", annee: 2026, poste: "Formation des relais", montant_prevu: 1250000.5, notes: null },
    });
  });

  it("refuse un montant négatif ou illisible, un poste vide", async () => {
    donnees();
    monterProjet(<Finances />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter une ligne" }));
    const dialogue = await screen.findByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText(/Montant prévu/), { target: { value: "-5" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Ajouter" }));
    expect(await within(dialogue).findByText(/Indiquez un montant positif/)).toBeInTheDocument();
    expect(within(dialogue).getByText("Donnez un nom de 1 à 160 caractères.")).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });

  it("modifie une ligne existante", async () => {
    donnees();
    monterProjet(<Finances />);
    await ouvrirMenu("Actions pour la ligne Latrines (2026)");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Modifier" }));
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).getByLabelText(/Poste de dépense/)).toHaveValue("Latrines");
    fireEvent.change(within(dialogue).getByLabelText(/Montant prévu/), { target: { value: "90" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "budget_lignes",
      operation: "update",
      valeurs: { annee: 2026, poste: "Latrines", montant_prevu: 90, notes: null },
    });
  });

  it("supprime une ligne après confirmation", async () => {
    donnees();
    monterProjet(<Finances />);
    await ouvrirMenu("Actions pour la ligne Forages (2027)");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
    const confirmation = await screen.findByRole("dialog");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Supprimer la ligne" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({ table: "budget_lignes", operation: "delete", valeurs: undefined });
  });
});

describe("Finances : dépense", () => {
  async function ouvrirSaisie() {
    fireEvent.click(await screen.findByRole("button", { name: "Enregistrer une dépense" }));
    return screen.findByRole("dialog");
  }

  it("enregistre une dépense sur une ligne du budget, sans justificatif", async () => {
    donnees();
    monterProjet(<Finances />, { role: "admin" });
    const dialogue = await ouvrirSaisie();
    expect(within(dialogue).getByLabelText("Date de la dépense")).toHaveValue("2026-06-15");
    fireEvent.change(within(dialogue).getByLabelText("Libellé"), { target: { value: "Carburant mission" } });
    fireEvent.change(within(dialogue).getByLabelText(/Montant \(/), { target: { value: "12,5" } });
    fireEvent.change(within(dialogue).getByLabelText("Ligne du budget"), { target: { value: "l2" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "depenses",
      operation: "insert",
      valeurs: {
        project_id: "p1",
        budget_ligne_id: "l2",
        date: "2026-06-15",
        libelle: "Carburant mission",
        montant: 12.5,
        fournisseur: null,
        reference: null,
        document_id: null,
      },
    });
  });

  it("propose les lignes du budget, la plus récente d'abord", async () => {
    donnees();
    monterProjet(<Finances />, { role: "admin" });
    const dialogue = await ouvrirSaisie();
    const options = within(within(dialogue).getByLabelText("Ligne du budget"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["Choisir une ligne", "2027 — Forages", "2026 — Forages", "2026 — Latrines"]);
  });

  it("refuse un montant nul, une ligne non choisie et une date dans le futur", async () => {
    donnees();
    monterProjet(<Finances />, { role: "admin" });
    const dialogue = await ouvrirSaisie();
    fireEvent.change(within(dialogue).getByLabelText("Date de la dépense"), { target: { value: "2026-07-01" } });
    fireEvent.change(within(dialogue).getByLabelText(/Montant \(/), { target: { value: "0" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));
    expect(await within(dialogue).findByText(/Indiquez un montant supérieur à zéro/)).toBeInTheDocument();
    expect(within(dialogue).getByText("Choisissez la ligne du budget.")).toBeInTheDocument();
    expect(within(dialogue).getByText(/Indiquez la date de la dépense/)).toBeInTheDocument();
    expect(within(dialogue).getByText("Donnez un libellé de 1 à 200 caractères.")).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });

  it("rattache une dépense à un document déjà déposé", async () => {
    donnees();
    monterProjet(<Finances />, { role: "admin" });
    const dialogue = await ouvrirSaisie();
    fireEvent.change(within(dialogue).getByLabelText("Libellé"), { target: { value: "Pompes lot 2" } });
    fireEvent.change(within(dialogue).getByLabelText(/Montant \(/), { target: { value: "5" } });
    fireEvent.change(within(dialogue).getByLabelText("Ligne du budget"), { target: { value: "l1" } });
    fireEvent.change(within(dialogue).getByLabelText(/Justificatif/), { target: { value: "d1" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toMatchObject({ table: "depenses", operation: "insert", valeurs: { document_id: "d1" } });
  });

  it("dépose un nouveau justificatif dans le dossier du projet puis rattache la dépense", async () => {
    donnees();
    monterProjet(<Finances />, { role: "admin" });
    const dialogue = await ouvrirSaisie();
    fireEvent.change(within(dialogue).getByLabelText("Libellé"), { target: { value: "Dalles" } });
    fireEvent.change(within(dialogue).getByLabelText(/Montant \(/), { target: { value: "40" } });
    fireEvent.change(within(dialogue).getByLabelText("Ligne du budget"), { target: { value: "l2" } });
    fireEvent.change(within(dialogue).getByLabelText(/Justificatif/), { target: { value: "__nouveau" } });
    const fichier = new File(["x"], "Facture dalles.pdf", { type: "application/pdf" });
    fireEvent.change(await within(dialogue).findByLabelText("Fichier du justificatif"), {
      target: { files: [fichier] },
    });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(base.appels).toHaveLength(3));
    expect(base.appels[0]).toMatchObject({
      table: "stockage:documents",
      operation: "upload",
      valeurs: { chemin: "o1/p1/uuid-test-Facture-dalles.pdf" },
    });
    expect(base.appels[1]).toMatchObject({
      table: "documents",
      operation: "insert",
      valeurs: { project_id: "p1", nom: "Justificatif — Dalles", categorie: "justificatif" },
    });
    expect(base.appels[2]).toMatchObject({
      table: "depenses",
      operation: "insert",
      valeurs: { document_id: "nouveau" },
    });
  });

  it("demande le fichier quand « nouveau fichier » est choisi sans en donner", async () => {
    donnees();
    monterProjet(<Finances />, { role: "admin" });
    const dialogue = await ouvrirSaisie();
    fireEvent.change(within(dialogue).getByLabelText("Libellé"), { target: { value: "Dalles" } });
    fireEvent.change(within(dialogue).getByLabelText(/Montant \(/), { target: { value: "40" } });
    fireEvent.change(within(dialogue).getByLabelText("Ligne du budget"), { target: { value: "l2" } });
    fireEvent.change(within(dialogue).getByLabelText(/Justificatif/), { target: { value: "__nouveau" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));
    expect(await within(dialogue).findByText("Choisissez un fichier à déposer.")).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });

  it("refuse un type de fichier non accepté", async () => {
    donnees();
    monterProjet(<Finances />, { role: "admin" });
    const dialogue = await ouvrirSaisie();
    fireEvent.change(within(dialogue).getByLabelText(/Justificatif/), { target: { value: "__nouveau" } });
    fireEvent.change(await within(dialogue).findByLabelText("Fichier du justificatif"), {
      target: { files: [new File(["<html>"], "page.html", { type: "text/html" })] },
    });
    expect(await within(dialogue).findByText(/Ce type de fichier n’est pas accepté/)).toBeInTheDocument();
  });

  it("modifie une dépense", async () => {
    donnees();
    monterProjet(<Finances />, { role: "admin" });
    await ouvrirMenu("Actions pour la dépense « Dalles de latrines »");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Modifier" }));
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).getByLabelText("Libellé")).toHaveValue("Dalles de latrines");
    expect(within(dialogue).getByLabelText("Ligne du budget")).toHaveValue("l2");
    fireEvent.change(within(dialogue).getByLabelText(/Montant \(/), { target: { value: "75,25" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toMatchObject({ table: "depenses", operation: "update", valeurs: { montant: 75.25 } });
  });

  it("supprime une dépense après confirmation", async () => {
    donnees();
    monterProjet(<Finances />, { role: "admin" });
    await ouvrirMenu("Actions pour la dépense « Dalles de latrines »");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
    const confirmation = await screen.findByRole("dialog");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Supprimer la dépense" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({ table: "depenses", operation: "delete", valeurs: undefined });
  });

  it("enregistre une dépense depuis une ligne : la ligne est présélectionnée", async () => {
    donnees();
    monterProjet(<Finances />, { role: "admin" });
    await ouvrirMenu("Actions pour la ligne Latrines (2026)");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Enregistrer une dépense" }));
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).getByLabelText("Ligne du budget")).toHaveValue("l2");
  });
});
