import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TAILLE_MAX_DOCUMENT } from "~/lib/suivi";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import Documents from "./Documents";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

const document_ = (id: string, nom: string, categorie: string, extra = {}) => ({
  id,
  project_id: "p1",
  org_id: "o1",
  nom,
  categorie,
  description: null,
  storage_path: `o1/p1/${id}-fichier.pdf`,
  mime_type: "application/pdf",
  taille_octets: 200_000,
  realisation_id: null,
  created_by: null,
  created_at: "2026-06-11T08:00:00Z",
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

function donnees() {
  base.tables.documents = [
    document_("d1", "Rapport T2", "rapport", { taille_octets: 2_000_000, description: "Rapport trimestriel signé." }),
    document_("d2", "Contrat de forage", "contrat", { realisation_id: "r1" }),
  ];
  base.tables.realisations = [{ id: "r1", date: "2026-06-10", titre: "Forage de Médina réhabilité" }];
}

function fichier(nom: string, type: string, taille = 1000) {
  const f = new File(["x"], nom, { type });
  Object.defineProperty(f, "size", { value: taille });
  return f;
}

async function ouvrirDepot() {
  fireEvent.click(await screen.findByRole("button", { name: "Déposer un document" }));
  return screen.findByRole("dialog");
}

describe("Documents : contenu", () => {
  it("liste les documents avec leur catégorie, leur taille et la réalisation qu'ils prouvent", async () => {
    donnees();
    monterProjet(<Documents />);
    const rapport = (await screen.findByRole("heading", { name: "Rapport T2" })).closest("li")!;
    expect(within(rapport).getByText("Rapport")).toBeInTheDocument();
    expect(within(rapport).getByText(/1,9 Mo/)).toBeInTheDocument();
    expect(within(rapport).getByText(/déposé le 11 juin 2026/)).toBeInTheDocument();
    expect(within(rapport).getByText("Rapport trimestriel signé.")).toBeInTheDocument();
    const contrat = screen.getByRole("heading", { name: "Contrat de forage" }).closest("li")!;
    expect(
      await within(contrat).findByText("Preuve de la réalisation « Forage de Médina réhabilité »"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 documents · 2,1 Mo")).toBeInTheDocument();
  });

  it("filtre par catégorie", async () => {
    donnees();
    monterProjet(<Documents />);
    await screen.findByRole("heading", { name: "Rapport T2" });
    fireEvent.change(screen.getByLabelText("Catégorie"), { target: { value: "contrat" } });
    expect(screen.queryByRole("heading", { name: "Rapport T2" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Contrat de forage" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Catégorie"), { target: { value: "justificatif" } });
    expect(screen.getByText("Aucun document dans cette catégorie.")).toBeInTheDocument();
  });

  it("explique l'état vide", async () => {
    monterProjet(<Documents />);
    expect(await screen.findByText("Aucun document déposé")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Déposer un document" })).toBeInTheDocument();
  });

  it("laisse un lecteur télécharger sans rien déposer ni supprimer", async () => {
    donnees();
    monterProjet(<Documents />, { role: "lecteur" });
    await screen.findByRole("heading", { name: "Rapport T2" });
    expect(screen.queryByRole("button", { name: /Déposer|Actions pour/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Télécharger Rapport T2" })).toBeInTheDocument();
  });

  it("télécharge par un lien signé d'une minute, avec l'extension d'origine", async () => {
    donnees();
    monterProjet(<Documents />);
    fireEvent.click(await screen.findByRole("button", { name: "Télécharger Rapport T2" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "stockage:documents",
      operation: "signed",
      valeurs: { chemin: "o1/p1/d1-fichier.pdf", duree: 60, options: undefined },
    });
    await waitFor(() => expect(clic).toHaveBeenCalledTimes(1));
    expect((clic.mock.contexts[0] as HTMLAnchorElement).href).toBe(
      "https://stockage.test/o1/p1/d1-fichier.pdf?jeton=abc&download=Rapport%20T2.pdf",
    );
  });
});

describe("Documents : dépôt", () => {
  it("dépose le fichier dans le dossier de l'organisation et du projet, puis enregistre sa ligne", async () => {
    donnees();
    monterProjet(<Documents />);
    const dialogue = await ouvrirDepot();
    fireEvent.change(within(dialogue).getByLabelText("Fichier"), {
      target: { files: [fichier("Rapport d’étape T3.pdf", "application/pdf", 54_321)] },
    });
    expect(await within(dialogue).findByDisplayValue("Rapport d’étape T3")).toBeInTheDocument();
    fireEvent.change(within(dialogue).getByLabelText("Catégorie"), { target: { value: "rapport" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Déposer" }));
    await waitFor(() => expect(base.appels).toHaveLength(2));
    expect(base.appels[0]).toEqual({
      table: "stockage:documents",
      operation: "upload",
      valeurs: {
        chemin: "o1/p1/uuid-test-Rapport-d-etape-T3.pdf",
        options: { contentType: "application/pdf", upsert: false },
      },
    });
    expect(base.appels[1]).toEqual({
      table: "documents",
      operation: "insert",
      valeurs: {
        project_id: "p1",
        nom: "Rapport d’étape T3",
        categorie: "rapport",
        description: null,
        storage_path: "o1/p1/uuid-test-Rapport-d-etape-T3.pdf",
        mime_type: "application/pdf",
        taille_octets: 54_321,
        realisation_id: null,
      },
    });
  });

  it("refuse un fichier d'un type non accepté, sans rien envoyer", async () => {
    donnees();
    monterProjet(<Documents />);
    const dialogue = await ouvrirDepot();
    fireEvent.change(within(dialogue).getByLabelText("Fichier"), {
      target: { files: [fichier("page.html", "text/html")] },
    });
    expect(await within(dialogue).findByText(/Ce type de fichier n’est pas accepté/)).toBeInTheDocument();
    fireEvent.click(within(dialogue).getByRole("button", { name: "Déposer" }));
    expect(await within(dialogue).findByText(/Ce type de fichier n’est pas accepté/)).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });

  it("refuse un fichier de plus de 20 Mo", async () => {
    donnees();
    monterProjet(<Documents />);
    const dialogue = await ouvrirDepot();
    fireEvent.change(within(dialogue).getByLabelText("Fichier"), {
      target: { files: [fichier("video.zip", "application/zip", TAILLE_MAX_DOCUMENT + 1)] },
    });
    expect(await within(dialogue).findByText("Ce fichier dépasse 20 Mo.")).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });

  it("demande un fichier avant d'envoyer", async () => {
    donnees();
    monterProjet(<Documents />);
    const dialogue = await ouvrirDepot();
    fireEvent.change(within(dialogue).getByLabelText("Nom du document"), { target: { value: "Sans fichier" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Déposer" }));
    expect(await within(dialogue).findByText("Choisissez un fichier à déposer.")).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });

  it("modifie le nom et la catégorie sans toucher au fichier", async () => {
    donnees();
    monterProjet(<Documents />);
    const menu = await screen.findByRole("button", { name: "Actions pour le document « Rapport T2 »" });
    menu.focus();
    fireEvent.keyDown(menu, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Modifier" }));
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).queryByLabelText("Fichier")).not.toBeInTheDocument();
    fireEvent.change(within(dialogue).getByLabelText("Nom du document"), { target: { value: "Rapport T2 signé" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "documents",
      operation: "update",
      valeurs: {
        nom: "Rapport T2 signé",
        categorie: "rapport",
        description: "Rapport trimestriel signé.",
        realisation_id: null,
      },
    });
  });

  it("supprime la ligne, retire le fichier du stockage puis sort son chemin de la file de la base", async () => {
    donnees();
    monterProjet(<Documents />);
    const menu = await screen.findByRole("button", { name: "Actions pour le document « Contrat de forage »" });
    menu.focus();
    fireEvent.keyDown(menu, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
    const confirmation = await screen.findByRole("dialog");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Supprimer le document" }));
    await waitFor(() => expect(base.appels).toHaveLength(3));
    expect(base.appels[0]).toEqual({ table: "documents", operation: "delete", valeurs: undefined });
    expect(base.appels[1]).toEqual({
      table: "stockage:documents",
      operation: "remove",
      valeurs: ["o1/p1/d2-fichier.pdf"],
    });
    expect(base.appels[2]).toEqual({
      table: "rpc:fichiers_retires",
      operation: "rpc",
      valeurs: { p_chemins: ["o1/p1/d2-fichier.pdf"] },
    });
  });
});
