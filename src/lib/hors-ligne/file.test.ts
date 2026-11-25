import { describe, expect, it, vi } from "vitest";
import { creerStockageMemoire } from "~/test/stockage-memoire";
import { ErreurStockage, genererIdentifiant, MagasinFile, type NouvelleSaisie, trouverDansLaFile } from "./file";

const saisie = (id: string, extra: Partial<NouvelleSaisie> = {}): NouvelleSaisie => ({
  id,
  utilisateurId: "u1",
  orgId: "o1",
  projetId: "p1",
  kpiId: "k1",
  date: "2026-03-01",
  valeur: 12,
  commentaire: null,
  localiteId: null,
  ...extra,
});

describe("MagasinFile", () => {
  it("garde une saisie sur l'appareil et la relit avec tous ses champs", () => {
    const magasin = new MagasinFile(creerStockageMemoire(), "u1");
    magasin.ajouter(saisie("a", { commentaire: "Après la pluie", localiteId: "l1", valeur: 12.5 }));
    expect(magasin.lister()).toEqual([
      expect.objectContaining({
        id: "a",
        statut: "attente",
        valeur: 12.5,
        commentaire: "Après la pluie",
        localiteId: "l1",
        kpiId: "k1",
        date: "2026-03-01",
      }),
    ]);
  });

  it("range les saisies de la plus ancienne à la plus récente", () => {
    const magasin = new MagasinFile(creerStockageMemoire(), "u1");
    magasin.ajouter(saisie("b", { creeLe: "2026-03-02T10:00:00Z" }));
    magasin.ajouter(saisie("a", { creeLe: "2026-03-01T10:00:00Z" }));
    magasin.ajouter(saisie("c", { creeLe: "2026-03-03T10:00:00Z" }));
    expect(magasin.lister().map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("n'expose à un compte que ses propres saisies", () => {
    const stockage = creerStockageMemoire();
    new MagasinFile(stockage, "u1").ajouter(saisie("a"));
    const autre = new MagasinFile(stockage, "u2");
    expect(autre.lister()).toEqual([]);
    autre.ajouter(saisie("b", { utilisateurId: "u2" }));
    expect(new MagasinFile(stockage, "u1").lister().map((s) => s.id)).toEqual(["a"]);
    // Vider le compte u2 ne touche pas aux saisies de u1.
    autre.vider();
    expect(new MagasinFile(stockage, "u1").lister()).toHaveLength(1);
  });

  it("rend la même liste tant que rien ne change, et une nouvelle après un changement", () => {
    const magasin = new MagasinFile(creerStockageMemoire(), "u1");
    magasin.ajouter(saisie("a"));
    const premiere = magasin.lister();
    expect(magasin.lister()).toBe(premiere);
    magasin.ajouter(saisie("b"));
    expect(magasin.lister()).not.toBe(premiere);
  });

  it("prévient les abonnés à chaque changement", () => {
    const magasin = new MagasinFile(creerStockageMemoire(), "u1");
    const rappel = vi.fn();
    const arreter = magasin.abonner(rappel);
    magasin.ajouter(saisie("a"));
    magasin.modifier("a", { statut: "refusee", erreurCle: "erreurs.ESSAI_EXPIRE" });
    magasin.retirer("a");
    expect(rappel).toHaveBeenCalledTimes(3);
    arreter();
    magasin.ajouter(saisie("b"));
    expect(rappel).toHaveBeenCalledTimes(3);
  });

  it("modifie une saisie sans toucher à son identifiant ni à son compte", () => {
    const magasin = new MagasinFile(creerStockageMemoire(), "u1");
    magasin.ajouter(saisie("a"));
    magasin.modifier("a", { statut: "conflit", valeurServeur: 99, idServeur: "s1", id: "pirate", utilisateurId: "u2" });
    expect(magasin.lister()).toEqual([
      expect.objectContaining({ id: "a", utilisateurId: "u1", statut: "conflit", valeurServeur: 99, idServeur: "s1" }),
    ]);
  });

  it("ne ressuscite pas une saisie retirée entre-temps", () => {
    const magasin = new MagasinFile(creerStockageMemoire(), "u1");
    magasin.ajouter(saisie("a"));
    magasin.retirer("a");
    expect(magasin.modifier("a", { tentatives: 2 })).toBeNull();
    expect(magasin.lister()).toEqual([]);
  });

  it("ignore, sans l'effacer, une entrée abîmée ou de forme inattendue", () => {
    const stockage = creerStockageMemoire();
    stockage.setItem("pilot.file.v1.u1.x", "{pas du json");
    stockage.setItem("pilot.file.v1.u1.y", JSON.stringify({ id: "y", valeur: "douze" }));
    stockage.setItem(
      "pilot.file.v1.u1.z",
      JSON.stringify({ ...saisie("z"), creeLe: "2026-03-01T00:00:00Z", statut: "attente", date: "demain" }),
    );
    const magasin = new MagasinFile(stockage, "u1");
    magasin.ajouter(saisie("ok"));
    expect(magasin.lister().map((s) => s.id)).toEqual(["ok"]);
    expect(stockage.getItem("pilot.file.v1.u1.x")).toBe("{pas du json");
  });

  it("dit que rien n'est enregistré quand l'appareil refuse le stockage", () => {
    const sans = new MagasinFile(null, "u1");
    expect(sans.disponible).toBe(false);
    expect(() => sans.ajouter(saisie("a"))).toThrow(ErreurStockage);
    expect(sans.lister()).toEqual([]);

    const plein = creerStockageMemoire();
    plein.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
    const magasin = new MagasinFile(plein, "u1");
    expect(() => magasin.ajouter(saisie("a"))).toThrow(ErreurStockage);
    expect(magasin.lister()).toEqual([]);
  });
});

describe("trouverDansLaFile", () => {
  it("retrouve la saisie d'un indicateur à une date", () => {
    const magasin = new MagasinFile(creerStockageMemoire(), "u1");
    magasin.ajouter(saisie("a"));
    magasin.ajouter(saisie("b", { kpiId: "k2" }));
    expect(trouverDansLaFile(magasin.lister(), "k2", "2026-03-01")?.id).toBe("b");
    expect(trouverDansLaFile(magasin.lister(), "k1", "2026-03-02")).toBeUndefined();
  });
});

describe("genererIdentifiant", () => {
  it("produit un UUID v4 différent à chaque appel", () => {
    const a = genererIdentifiant();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(genererIdentifiant()).not.toBe(a);
  });

  it("retombe sur getRandomValues quand randomUUID manque", () => {
    const original = crypto.randomUUID;
    // @ts-expect-error simulation d'un navigateur sans randomUUID
    crypto.randomUUID = undefined;
    try {
      expect(genererIdentifiant()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      crypto.randomUUID = original;
    }
  });
});
