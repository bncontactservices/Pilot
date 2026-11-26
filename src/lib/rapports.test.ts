// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContenuRapport } from "../../supabase/functions/_shared/rapport-email";
import {
  type Abonne,
  type BaseRapports,
  configRapports,
  type DepsRapports,
  traiterRapports,
} from "../../supabase/functions/_shared/rapports";

const CLE = "re_CLE_SECRETE_DE_TEST";
const MAINTENANT = Date.parse("2026-11-30T07:05:00Z");
const ENV: Record<string, string> = {
  RESEND_API_KEY: CLE,
  EMAIL_FROM: "Pilot M&E <rapports@exemple.org>",
  APP_URL: "https://app.exemple.org",
};
const CONTENU: ContenuRapport = {
  organisation: { nom: "ONG Eau", devise: "XOF" },
  seuils: { vert: 90, ambre: 60 },
  programmes: [],
  projets: [
    {
      id: "p1",
      nom: "Forages Kolda",
      statut: "en_cours",
      programme_id: null,
      date_fin: "2027-12-31",
      statut_resultats: "alert",
      taux_resultats: 30,
      taux_physique: 20,
      taux_financier: 10,
      nb_etapes_en_retard: 0,
      nb_kpis: 2,
      nb_kpis_avec_donnees: 2,
    },
  ],
};
const abonne = (extra: Partial<Abonne> = {}): Abonne => ({
  user_id: "u1",
  org_id: "o1",
  email: "awa@exemple.org",
  nom: "Awa",
  org_nom: "ONG Eau",
  frequence: "hebdomadaire",
  ...extra,
});

function creer(surcharge: Partial<BaseRapports> = {}, env: Record<string, string> = ENV) {
  const base: BaseRapports = {
    verifierJeton: vi.fn(async (jeton: string) => jeton === "bon-jeton"),
    utilisateur: vi.fn(async (jwt: string) => (jwt === "jwt-awa" ? { id: "u1", email: "awa@exemple.org" } : null)),
    membre: vi.fn(async () => ({ orgId: "o1", nom: "Awa" })),
    reserver: vi.fn(async () => [abonne()]),
    marquer: vi.fn(async () => undefined),
    contenu: vi.fn(async () => CONTENU),
    ...surcharge,
  };
  const envoyes: { url: string; entetes: Record<string, string>; corps: Record<string, unknown> }[] = [];
  const fetchResend = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    envoyes.push({
      url: String(url),
      entetes: (init?.headers ?? {}) as Record<string, string>,
      corps: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
  });
  const journal = vi.fn();
  const deps: DepsRapports = {
    env: (nom) => env[nom],
    fetch: fetchResend as unknown as typeof fetch,
    base,
    maintenant: () => MAINTENANT,
    journal,
  };
  return { base, deps, envoyes, fetchResend, journal };
}

const appeler = (deps: DepsRapports, corps: unknown, entetes: Record<string, string> = {}, methode = "POST") =>
  traiterRapports(
    new Request("https://f.supabase.co/functions/v1/rapports-programmes", {
      method: methode,
      headers: { "Content-Type": "application/json", ...entetes },
      body: methode === "POST" ? JSON.stringify(corps) : undefined,
    }),
    deps,
  );
const cron = (deps: DepsRapports, jeton = "bon-jeton") => appeler(deps, { action: "cron" }, { "X-Cron-Jeton": jeton });

describe("configRapports", () => {
  it("n'est configurée que si la clé, l'expéditeur et l'adresse de l'application sont valides", () => {
    expect(configRapports((n) => ENV[n])).toMatchObject({
      expediteur: "Pilot M&E <rapports@exemple.org>",
      appUrl: "https://app.exemple.org",
    });
    for (const manquant of Object.keys(ENV))
      expect(configRapports((n) => (n === manquant ? undefined : ENV[n]))).toBeNull();
    expect(configRapports((n) => (n === "RESEND_API_KEY" ? "pas-une-cle" : ENV[n]))).toBeNull();
    expect(configRapports((n) => (n === "EMAIL_FROM" ? "a@b.c\nBcc: x@y.z" : ENV[n]))).toBeNull();
    expect(configRapports((n) => (n === "APP_URL" ? "http://pas-en-https.exemple.org" : ENV[n]))).toBeNull();
  });
});

describe("passage planifié", () => {
  let c: ReturnType<typeof creer>;
  beforeEach(() => {
    c = creer();
  });

  it("refuse un appel sans jeton ou avec un mauvais jeton, sans rien réserver", async () => {
    expect((await appeler(c.deps, { action: "cron" })).status).toBe(401);
    expect((await cron(c.deps, "mauvais")).status).toBe(401);
    expect(c.base.reserver).not.toHaveBeenCalled();
    expect(c.fetchResend).not.toHaveBeenCalled();
  });

  it("sans Resend configuré, ne réserve rien : les échéances restent dues", async () => {
    const sans = creer({}, { APP_URL: ENV.APP_URL! });
    const r = await cron(sans.deps);
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ erreur: "RAPPORTS_NON_CONFIGURES" });
    expect(sans.base.reserver).not.toHaveBeenCalled();
  });

  it("envoie le rapport à l'adresse du compte, avec le contenu de l'organisation, puis marque l'envoi", async () => {
    const r = await cron(c.deps);
    expect(await r.json()).toEqual({ reserves: 1, envoyes: 1, echecs: 0, abandonnes: 0 });
    expect(c.envoyes).toHaveLength(1);
    const e = c.envoyes[0]!;
    expect(e.url).toBe("https://api.resend.com/emails");
    expect(e.entetes.Authorization).toBe(`Bearer ${CLE}`);
    expect(e.corps).toMatchObject({ from: ENV.EMAIL_FROM, to: ["awa@exemple.org"] });
    expect(String(e.corps.subject)).toBe("Rapport de suivi hebdomadaire — ONG Eau · 30 novembre 2026");
    expect(String(e.corps.html)).toContain("Forages Kolda");
    expect(String(e.corps.text)).toContain("Bonjour Awa,");
    expect((e.corps.headers as Record<string, string>)["List-Unsubscribe"]).toBe(
      "<https://app.exemple.org/app/parametres>",
    );
    expect(c.base.marquer).toHaveBeenCalledWith("u1", true);
  });

  it("pose une clé d'idempotence par membre et par jour : un nouvel essai le même jour ne double pas le message", async () => {
    await cron(c.deps);
    expect(c.envoyes[0]!.entetes["Idempotency-Key"]).toBe("rapport-u1-2026-11-30");
  });

  it("lit une seule fois le contenu d'une organisation, quel que soit le nombre de ses abonnés", async () => {
    const deux = creer({
      reserver: vi.fn(async () => [abonne(), abonne({ user_id: "u2", email: "moussa@exemple.org", nom: null })]),
    });
    await cron(deux.deps);
    expect(deux.base.contenu).toHaveBeenCalledTimes(1);
    expect(deux.envoyes.map((e) => (e.corps.to as string[])[0]).sort()).toEqual([
      "awa@exemple.org",
      "moussa@exemple.org",
    ]);
  });

  it("marque un échec quand Resend refuse, et en garde la trace sans adresse ni clé dans le journal", async () => {
    c.fetchResend.mockResolvedValueOnce(new Response("{}", { status: 422 }));
    const r = await cron(c.deps);
    expect(await r.json()).toMatchObject({ envoyes: 0, echecs: 1 });
    expect(c.base.marquer).toHaveBeenCalledWith("u1", false);
    const trace = JSON.stringify(c.journal.mock.calls);
    expect(trace).not.toContain("@");
    expect(trace).not.toContain(CLE);
  });

  it("marque un échec quand le réseau tombe", async () => {
    c.fetchResend.mockRejectedValueOnce(new TypeError("fetch failed"));
    const r = await cron(c.deps);
    expect(await r.json()).toMatchObject({ envoyes: 0, echecs: 1 });
    expect(c.base.marquer).toHaveBeenCalledWith("u1", false);
  });

  it("s'arrête quand Resend limite le débit : les envois restants ne sont pas comptés en échec (ils restent dus)", async () => {
    const trois = creer({
      reserver: vi.fn(async () => [abonne({ user_id: "a" }), abonne({ user_id: "b" }), abonne({ user_id: "c" })]),
    });
    trois.fetchResend.mockImplementation(async () => new Response("{}", { status: 429 }));
    const r = await cron(trois.deps);
    const bilan = (await r.json()) as { envoyes: number; echecs: number; abandonnes: number };
    expect(bilan.envoyes).toBe(0);
    expect(bilan.echecs).toBe(0);
    expect(bilan.abandonnes).toBe(3);
    expect(trois.base.marquer).not.toHaveBeenCalled();
  });

  it("un abonné dont le traitement plante n'empêche pas les autres", async () => {
    const deux = creer({
      reserver: vi.fn(async () => [abonne({ user_id: "a" }), abonne({ user_id: "b", email: "b@exemple.org" })]),
      contenu: vi.fn().mockRejectedValueOnce(new Error("panne de base")).mockResolvedValue(CONTENU),
    });
    const r = await cron(deux.deps);
    const bilan = (await r.json()) as { envoyes: number; echecs: number };
    expect(bilan.echecs + bilan.envoyes).toBe(2);
    expect(deux.base.marquer).toHaveBeenCalledTimes(2);
  });

  it("répond 500 quand la réservation échoue (pas d'envoi à l'aveugle)", async () => {
    const panne = creer({ reserver: vi.fn(async () => Promise.reject(new Error("panne"))) });
    expect((await cron(panne.deps)).status).toBe(500);
    expect(panne.fetchResend).not.toHaveBeenCalled();
  });

  it("sans abonné dû, ne fait rien", async () => {
    const vide = creer({ reserver: vi.fn(async () => []) });
    expect(await (await cron(vide.deps)).json()).toEqual({ reserves: 0, envoyes: 0, echecs: 0, abandonnes: 0 });
    expect(vide.fetchResend).not.toHaveBeenCalled();
  });
});

describe("exemple à la demande d'un membre", () => {
  const exemple = (deps: DepsRapports, corps: unknown = { action: "exemple" }, jwt = "jwt-awa") =>
    appeler(deps, corps, jwt ? { Authorization: `Bearer ${jwt}` } : {});

  it("exige une session valide", async () => {
    const c = creer();
    expect((await exemple(c.deps, { action: "exemple" }, "")).status).toBe(401);
    expect((await exemple(c.deps, { action: "exemple" }, "jwt-inconnu")).status).toBe(401);
    expect(c.fetchResend).not.toHaveBeenCalled();
  });

  it("envoie à l'adresse du compte, JAMAIS à une adresse donnée dans la requête", async () => {
    const c = creer();
    const r = await exemple(c.deps, {
      action: "exemple",
      to: "victime@exemple.org",
      email: "victime@exemple.org",
      destinataire: "victime@exemple.org",
    });
    expect(await r.json()).toEqual({ envoye: true });
    expect(c.envoyes).toHaveLength(1);
    expect(c.envoyes[0]!.corps.to).toEqual(["awa@exemple.org"]);
    expect(String(c.envoyes[0]!.corps.subject)).toBe("Exemple de rapport de suivi — ONG Eau");
    expect(c.base.contenu).toHaveBeenCalledWith("o1");
  });

  it("n'envoie qu'un message par membre et par tranche de cinq minutes (même clé d'idempotence)", async () => {
    const c = creer();
    await exemple(c.deps);
    await exemple(c.deps);
    expect(c.envoyes[0]!.entetes["Idempotency-Key"]).toBe(c.envoyes[1]!.entetes["Idempotency-Key"]);
    expect(c.envoyes[0]!.entetes["Idempotency-Key"]).toMatch(/^exemple-u1-\d+$/);
  });

  it("répond « non configuré » sans rien envoyer quand Resend n'est pas réglé", async () => {
    const c = creer({}, {});
    const r = await exemple(c.deps);
    expect(r.status).toBe(503);
    expect(c.fetchResend).not.toHaveBeenCalled();
  });

  it("refuse un compte sans organisation, et un compte sans adresse", async () => {
    expect((await exemple(creer({ membre: vi.fn(async () => null) }).deps)).status).toBe(403);
    expect((await exemple(creer({ utilisateur: vi.fn(async () => ({ id: "u1", email: null })) }).deps)).status).toBe(
      409,
    );
  });

  it("répond 502 quand Resend refuse, sans exposer la clé", async () => {
    const c = creer();
    c.fetchResend.mockResolvedValueOnce(new Response("{}", { status: 403 }));
    const r = await exemple(c.deps);
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain(CLE);
  });

  it("dit si l'envoi est configuré, sans en dire plus", async () => {
    expect(await (await exemple(creer().deps, { action: "etat" })).json()).toEqual({ disponible: true });
    expect(await (await exemple(creer({}, {}).deps, { action: "etat" })).json()).toEqual({ disponible: false });
  });
});

describe("requêtes invalides", () => {
  it("refuse les autres méthodes, un corps illisible et une action inconnue", async () => {
    const c = creer();
    expect((await appeler(c.deps, null, {}, "GET")).status).toBe(405);
    expect(
      (await traiterRapports(new Request("https://f.test", { method: "POST", body: "pas du json" }), c.deps)).status,
    ).toBe(400);
    expect((await appeler(c.deps, { action: "autre" })).status).toBe(400);
  });

  it("répond à la requête préalable CORS (l'appel du navigateur)", async () => {
    const c = creer();
    const r = await traiterRapports(
      new Request("https://f.test", { method: "OPTIONS", headers: { Origin: "https://app.exemple.org" } }),
      c.deps,
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("https://app.exemple.org");
    const etrangere = await traiterRapports(
      new Request("https://f.test", { method: "OPTIONS", headers: { Origin: "https://pirate.example" } }),
      c.deps,
    );
    expect(etrangere.headers.get("Access-Control-Allow-Origin")).toBe("https://app.exemple.org");
  });
});
