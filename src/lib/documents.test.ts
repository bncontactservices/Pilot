import { beforeEach, describe, expect, it, vi } from "vitest";
import { nomTelechargement, retirerFichiersOrphelins, supprimerDocument, telechargerDocument } from "./documents";

const createSignedUrl = vi.fn();
const remove = vi.fn();
const rpc = vi.fn();
const supprimerLigne = vi.fn();
vi.mock("./supabase", () => ({
  getSupabase: () => ({
    rpc,
    from: () => ({ delete: () => ({ eq: supprimerLigne }) }),
    storage: { from: () => ({ createSignedUrl, remove }) },
  }),
}));

let clic: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  createSignedUrl.mockReset();
  remove.mockReset();
  rpc.mockReset();
  supprimerLigne.mockReset();
  clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

describe("nom du fichier téléchargé", () => {
  it("garde le nom du document et reprend l'extension du fichier d'origine", () => {
    expect(nomTelechargement({ nom: "Bon de réception", storage_path: "o/p/id-Bon-de-reception.pdf" })).toBe(
      "Bon de réception.pdf",
    );
  });
  it("n'ajoute pas l'extension si le nom la porte déjà, quelle que soit la casse", () => {
    expect(nomTelechargement({ nom: "Budget.XLSX", storage_path: "o/p/id-Budget.xlsx" })).toBe("Budget.XLSX");
  });
  it("laisse le nom tel quel quand le fichier n'a pas d'extension", () => {
    expect(nomTelechargement({ nom: "Notes", storage_path: "o/p/id-Notes" })).toBe("Notes");
  });
});

describe("téléchargement par lien signé", () => {
  it("demande un lien d'une minute, sans l'option download de supabase-js", async () => {
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://s.test/object/sign/documents/o/p/f.pdf?token=t" },
      error: null,
    });
    await telechargerDocument({ nom: "Rapport", storage_path: "o/p/f.pdf" });
    expect(createSignedUrl).toHaveBeenCalledExactlyOnceWith("o/p/f.pdf", 60);
  });

  // Défaut constaté en réel : supabase-js encode deux fois le nom, le navigateur enregistrait « Bon de r%C3%A9ception.pdf ».
  it("ajoute le nom encodé une seule fois : les accents arrivent intacts au navigateur", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://s.test/sign/o/p/f.pdf?token=t" }, error: null });
    await telechargerDocument({ nom: "Rapport d’étape — T2", storage_path: "o/p/f.pdf" });
    const lien = clic.mock.contexts[0] as HTMLAnchorElement;
    const adresse = new URL(lien.href);
    expect(adresse.searchParams.get("token")).toBe("t");
    expect(adresse.searchParams.get("download")).toBe("Rapport d’étape — T2.pdf"); // décodé une fois = le vrai nom
    expect(lien.href).not.toContain("%25"); // jamais de pourcentage encodé deux fois
  });

  it("ajoute le paramètre avec « ? » si le lien n'en a pas déjà", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://s.test/sign/o/p/f.pdf" }, error: null });
    await telechargerDocument({ nom: "A", storage_path: "o/p/f.pdf" });
    expect((clic.mock.contexts[0] as HTMLAnchorElement).href).toBe("https://s.test/sign/o/p/f.pdf?download=A.pdf");
  });

  it("remonte l'erreur du stockage sans rien télécharger", async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: new Error("introuvable") });
    await expect(telechargerDocument({ nom: "A", storage_path: "o/p/f.pdf" })).rejects.toThrow("introuvable");
    expect(clic).not.toHaveBeenCalled();
  });
});

describe("suppression d'un document", () => {
  it("retire le fichier puis sort son chemin de la file de la base", async () => {
    supprimerLigne.mockResolvedValue({ error: null });
    remove.mockResolvedValue({ data: [], error: null });
    rpc.mockResolvedValue({ data: 1, error: null });
    await expect(supprimerDocument({ id: "d1", storage_path: "o/p/f.pdf" })).resolves.toBe(true);
    expect(remove).toHaveBeenCalledExactlyOnceWith(["o/p/f.pdf"]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("fichiers_retires", { p_chemins: ["o/p/f.pdf"] });
  });

  it("garde le chemin en file quand le fichier n'a pas pu être retiré : il le sera plus tard", async () => {
    supprimerLigne.mockResolvedValue({ error: null });
    remove.mockResolvedValue({ data: null, error: new Error("réseau") });
    await expect(supprimerDocument({ id: "d1", storage_path: "o/p/f.pdf" })).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ne touche pas au stockage quand la ligne n'a pas pu être supprimée", async () => {
    supprimerLigne.mockResolvedValue({ error: new Error("refusé") });
    await expect(supprimerDocument({ id: "d1", storage_path: "o/p/f.pdf" })).rejects.toThrow("refusé");
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("retrait des fichiers de documents supprimés", () => {
  /** La base renvoie successivement les lots donnés, puis une liste vide ; le vidage répond avec la taille du lot. */
  function file(...lots: string[][]) {
    rpc.mockImplementation((nom: string, args?: { p_chemins: string[] }) =>
      Promise.resolve(
        nom === "fichiers_a_retirer"
          ? { data: lots.shift() ?? [], error: null }
          : { data: args?.p_chemins.length ?? 0, error: null },
      ),
    );
  }

  it("ne fait rien quand la file est vide", async () => {
    file();
    await expect(retirerFichiersOrphelins()).resolves.toBe(0);
    expect(remove).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("fichiers_a_retirer");
  });

  it("retire les fichiers du stockage, puis vide la file de ces chemins", async () => {
    file(["o/p1/a.pdf", "o/p1/b.pdf"]);
    remove.mockResolvedValue({ data: [], error: null });
    await expect(retirerFichiersOrphelins()).resolves.toBe(2);
    expect(remove).toHaveBeenCalledExactlyOnceWith(["o/p1/a.pdf", "o/p1/b.pdf"]);
    expect(rpc).toHaveBeenLastCalledWith("fichiers_retires", { p_chemins: ["o/p1/a.pdf", "o/p1/b.pdf"] });
  });

  it("ne vide pas la file quand le stockage refuse : les chemins seront retentés à la prochaine session", async () => {
    file(["o/p1/a.pdf"]);
    remove.mockResolvedValue({ data: null, error: new Error("réseau") });
    await expect(retirerFichiersOrphelins()).resolves.toBe(0);
    expect(rpc).not.toHaveBeenCalledWith("fichiers_retires", expect.anything());
  });

  it("traite plusieurs lots tant que la base en renvoie de pleins", async () => {
    const plein = Array.from({ length: 200 }, (_, i) => `o/p/${i}.pdf`);
    file(plein, ["o/p/reste.pdf"]);
    remove.mockResolvedValue({ data: [], error: null });
    await expect(retirerFichiersOrphelins()).resolves.toBe(201);
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it("s'arrête quand la base refuse de donner la liste", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("refusé") });
    await expect(retirerFichiersOrphelins()).resolves.toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });

  it("ne lève jamais d'erreur : une panne ne doit pas gêner l'application", async () => {
    rpc.mockRejectedValue(new Error("hors ligne"));
    await expect(retirerFichiersOrphelins()).resolves.toBe(0);
  });
});
