import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DUREE_MAX_MS,
  type EnregistrementCache,
  estGardee,
  exporterCache,
  memoriserCache,
  restaurerCache,
  type StockageCache,
  VERSION_CACHE,
} from "./cache";

function stockageMemoire(
  initial?: EnregistrementCache,
): StockageCache & { contenu: () => EnregistrementCache | undefined } {
  let contenu = initial;
  return {
    contenu: () => contenu,
    lire: () => Promise.resolve(contenu),
    ecrire: (e) => {
      contenu = e;
      return Promise.resolve();
    },
    effacer: () => {
      contenu = undefined;
      return Promise.resolve();
    },
  };
}

const nouveauClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("estGardee", () => {
  it("ne garde que ce qui sert à ouvrir un projet et à saisir", () => {
    for (const racine of [
      "contexte-org",
      "projets",
      "projet",
      "kpis",
      "saisies",
      "localites",
      "zones",
      "parametres-se",
    ]) {
      expect(estGardee([racine, "x"])).toBe(true);
    }
    // Équipe, invitations, documents, logo, paiement et taux calculés par la base : jamais gardés.
    for (const racine of [
      "membres",
      "invitations",
      "documents",
      "logo",
      "abonnement",
      "etat-paiement",
      "avancements",
    ]) {
      expect(estGardee([racine, "x"])).toBe(false);
    }
  });
});

describe("exporterCache", () => {
  it("n'exporte que les requêtes réussies et gardées", () => {
    const client = nouveauClient();
    client.setQueryData(["kpis", "p1"], [{ id: "k1" }]);
    client.setQueryData(["membres", "o1"], [{ email: "a@exemple.test" }]);
    client.setQueryData(["avancements", "o1"], new Map());
    const e = exporterCache(client, "u1", 1000);
    expect(e).toMatchObject({ version: VERSION_CACHE, proprietaire: "u1", enregistreLe: 1000 });
    expect(e.requetes.map((r) => r.cle)).toEqual([["kpis", "p1"]]);
  });

  it("ne garde pas les lignes provisoires ajoutées en attendant la réponse du serveur", () => {
    const client = nouveauClient();
    client.setQueryData(["saisies", "p1"], [{ id: "vraie" }, { id: "provisoire-123" }]);
    expect(exporterCache(client, "u1").requetes[0]?.donnees).toEqual([{ id: "vraie" }]);
  });
});

describe("restaurerCache", () => {
  const enregistrement = (extra: Partial<EnregistrementCache> = {}): EnregistrementCache => ({
    version: VERSION_CACHE,
    proprietaire: "u1",
    enregistreLe: 1_000_000,
    requetes: [
      { cle: ["kpis", "p1"], donnees: [{ id: "k1" }], misAJourLe: 500 },
      { cle: ["membres", "o1"], donnees: [{ email: "a@exemple.test" }], misAJourLe: 500 },
    ],
    ...extra,
  });

  it("remet les données du compte dans le client, avec leur date d'origine (elles seront actualisées au retour du réseau)", async () => {
    const client = nouveauClient();
    const n = await restaurerCache(client, "u1", stockageMemoire(enregistrement()), 1_000_100);
    expect(n).toBe(1);
    expect(client.getQueryData(["kpis", "p1"])).toEqual([{ id: "k1" }]);
    expect(client.getQueryState(["kpis", "p1"])?.dataUpdatedAt).toBe(500);
    // Une clé non gardée présente dans un contenu ancien ou trafiqué n'est pas restaurée.
    expect(client.getQueryData(["membres", "o1"])).toBeUndefined();
  });

  it("efface et ignore le contenu d'un autre compte", async () => {
    const client = nouveauClient();
    const stockage = stockageMemoire(enregistrement({ proprietaire: "autre" }));
    expect(await restaurerCache(client, "u1", stockage, 1_000_100)).toBe(0);
    expect(client.getQueryData(["kpis", "p1"])).toBeUndefined();
    expect(stockage.contenu()).toBeUndefined();
  });

  it("efface un contenu d'une autre version ou trop ancien", async () => {
    for (const extra of [{ version: VERSION_CACHE + 1 }, { enregistreLe: 0 }]) {
      const stockage = stockageMemoire(enregistrement(extra));
      expect(await restaurerCache(nouveauClient(), "u1", stockage, DUREE_MAX_MS + 10)).toBe(0);
      expect(stockage.contenu()).toBeUndefined();
    }
  });

  it("ne remplace pas une donnée plus récente déjà en mémoire", async () => {
    const client = nouveauClient();
    client.setQueryData(["kpis", "p1"], [{ id: "recente" }]);
    await restaurerCache(client, "u1", stockageMemoire(enregistrement()), 1_000_100);
    expect(client.getQueryData(["kpis", "p1"])).toEqual([{ id: "recente" }]);
  });

  it("ne plante pas quand l'appareil ne sait pas lire son stockage", async () => {
    const casse: StockageCache = {
      lire: () => Promise.reject(new Error("IndexedDB bloquée")),
      ecrire: () => Promise.resolve(),
      effacer: () => Promise.resolve(),
    };
    expect(await restaurerCache(nouveauClient(), "u1", casse)).toBe(0);
  });
});

describe("memoriserCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("écrit sur l'appareil après les changements, regroupés en une seule écriture", async () => {
    const client = nouveauClient();
    const stockage = stockageMemoire();
    const ecrire = vi.spyOn(stockage, "ecrire");
    const arreter = memoriserCache(client, "u1", stockage, 1500);
    client.setQueryData(["kpis", "p1"], [{ id: "k1" }]);
    client.setQueryData(["saisies", "p1"], [{ id: "s1" }]);
    expect(ecrire).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1600);
    expect(ecrire).toHaveBeenCalledTimes(1);
    expect(stockage.contenu()?.requetes.map((r) => r.cle)).toEqual([
      ["kpis", "p1"],
      ["saisies", "p1"],
    ]);
    arreter();
  });

  it("ne réagit pas aux requêtes qu'on ne garde pas, ni après l'arrêt", async () => {
    const client = nouveauClient();
    const stockage = stockageMemoire();
    const ecrire = vi.spyOn(stockage, "ecrire");
    const arreter = memoriserCache(client, "u1", stockage, 1500);
    client.setQueryData(["membres", "o1"], []);
    await vi.advanceTimersByTimeAsync(2000);
    expect(ecrire).not.toHaveBeenCalled();
    arreter();
    client.setQueryData(["kpis", "p1"], []);
    await vi.advanceTimersByTimeAsync(2000);
    expect(ecrire).not.toHaveBeenCalled();
  });
});
