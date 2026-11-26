// @vitest-environment node
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  type Base,
  type Deps,
  traiterPaiement,
  traiterPortail,
  traiterWebhook,
} from "../../supabase/functions/_shared/paiement";
import { signer } from "../../supabase/functions/_shared/stripe";

const ORG = "a1000000-0000-4000-8000-000000000001";
const CLE = "sk_test_CLE_SECRETE_DE_TEST";
const SECRET_WEBHOOK = "whsec_secretDeTest";
const MAINTENANT = 1_800_000_000_000;

const ENV_COMPLET: Record<string, string> = {
  STRIPE_SECRET_KEY: CLE,
  STRIPE_WEBHOOK_SECRET: SECRET_WEBHOOK,
  APP_URL: "https://app.exemple.org",
  STRIPE_PRICE_STARTER_MENSUELLE: "price_starterM",
  STRIPE_PRICE_STARTER_ANNUELLE: "price_starterA",
  STRIPE_PRICE_PRO_MENSUELLE: "price_proM",
  STRIPE_PRICE_PRO_ANNUELLE: "price_proA",
};

type Appel = { methode: string; chemin: string; corps: URLSearchParams; cle: string };

/** Fausse API Stripe : répond d'après `reponses` (clé « METHODE /chemin ») et enregistre chaque appel. */
function creerStripe(reponses: Record<string, unknown | (() => Response)> = {}) {
  const appels: Appel[] = [];
  const f = vi.fn(async (url: string, init: RequestInit & { headers: Record<string, string> }) => {
    const chemin = url.replace("https://api.stripe.com/v1", "").split("?")[0]!;
    const methode = init.method ?? "GET";
    appels.push({
      methode,
      chemin,
      corps: new URLSearchParams(typeof init.body === "string" ? init.body : ""),
      cle: init.headers.Authorization!.replace("Bearer ", ""),
    });
    const r = reponses[`${methode} ${chemin}`];
    if (typeof r === "function") return (r as () => Response)();
    if (r === undefined)
      return new Response(JSON.stringify({ error: { code: "resource_missing", message: "absent" } }), { status: 404 });
    return new Response(JSON.stringify(r), { status: 200 });
  });
  return { f: f as unknown as typeof fetch, appels };
}

const prixValide = (intervalle: "month" | "year", montant = 2500) => ({
  active: true,
  type: "recurring",
  unit_amount: montant,
  currency: "eur",
  recurring: { interval: intervalle, interval_count: 1 },
});
const PRIX_STRIPE = {
  "GET /prices/price_starterM": prixValide("month", 2500),
  "GET /prices/price_starterA": prixValide("year", 24000),
  "GET /prices/price_proM": prixValide("month", 5000),
  "GET /prices/price_proA": prixValide("year", 48000),
};

function creerBase(surcharge: Partial<Base> = {}): Base & { lies: [string, string][]; appliques: unknown[] } {
  const lies: [string, string][] = [];
  const appliques: unknown[] = [];
  return {
    lies,
    appliques,
    utilisateur: async (jwt) => (jwt === "jeton-valide" ? { id: "u1", email: "admin@exemple.test" } : null),
    membre: async () => ({ orgId: ORG, role: "admin", orgNom: "ONG Eau & Vie", plan: "essai" }),
    abonnement: async () => null,
    lierClient: async (org, client) => {
      lies.push([org, client]);
      return client;
    },
    appliquer: async (a) => {
      appliques.push(a);
      return "applique";
    },
    ...surcharge,
  };
}

let journal: Mock<(...elements: unknown[]) => void>;
beforeEach(() => {
  journal = vi.fn<(...elements: unknown[]) => void>();
});

function deps(base: Base, stripe: { f: typeof fetch }, env: Record<string, string> = ENV_COMPLET): Deps {
  return { env: (nom) => env[nom], fetch: stripe.f, base, maintenant: () => MAINTENANT, journal };
}

const requete = (
  corps: unknown,
  entetes: Record<string, string> = { Authorization: "Bearer jeton-valide" },
  methode = "POST",
) =>
  new Request("https://exemple.supabase.co/functions/v1/x", {
    method: methode,
    headers: { "Content-Type": "application/json", ...entetes },
    body: methode === "GET" || methode === "OPTIONS" ? undefined : JSON.stringify(corps),
  });
const json = async (r: Response) => (await r.json()) as Record<string, unknown>;

describe("stripe-checkout : droits", () => {
  it("répond à la requête préalable CORS et refuse les autres méthodes", async () => {
    const d = deps(creerBase(), creerStripe());
    const options = await traiterPaiement(requete(null, { Origin: "https://app.exemple.org" }, "OPTIONS"), d);
    expect(options.status).toBe(200);
    expect(options.headers.get("Access-Control-Allow-Origin")).toBe("https://app.exemple.org");
    expect((await traiterPaiement(requete(null, {}, "GET"), d)).status).toBe(405);
  });

  it("n'admet que l'origine de l'application : jamais de joker, pour les réponses comme pour le refus", async () => {
    const d = deps(creerBase(), creerStripe());
    const etrangere = await traiterPaiement(
      requete({ action: "etat" }, { Authorization: "Bearer faux", Origin: "https://pirate.example" }),
      d,
    );
    expect(etrangere.status).toBe(401);
    expect(etrangere.headers.get("Access-Control-Allow-Origin")).toBe("https://app.exemple.org");
    const portail = await traiterPortail(requete(null, { Origin: "https://pirate.example" }, "OPTIONS"), d);
    expect(portail.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
    expect(portail.headers.get("Access-Control-Allow-Origin")).not.toBe("https://pirate.example");
    // Sans APP_URL ni ALLOWED_ORIGINS, aucune origine n'est admise.
    const sans = await traiterPaiement(
      requete(null, { Origin: "https://app.exemple.org" }, "OPTIONS"),
      deps(creerBase(), creerStripe(), {}),
    );
    expect(sans.headers.get("Access-Control-Allow-Origin")).toBe("null");
  });

  it("refuse sans jeton, avec un jeton invalide, et à tout autre rôle que l'administrateur", async () => {
    const stripe = creerStripe(PRIX_STRIPE);
    expect((await traiterPaiement(requete({ action: "etat" }, {}), deps(creerBase(), stripe))).status).toBe(401);
    expect(
      (await traiterPaiement(requete({ action: "etat" }, { Authorization: "Bearer faux" }), deps(creerBase(), stripe)))
        .status,
    ).toBe(401);
    for (const role of ["editeur", "lecteur"]) {
      const base = creerBase({ membre: async () => ({ orgId: ORG, role, orgNom: "ONG", plan: "essai" }) });
      const r = await traiterPaiement(requete({ action: "etat" }), deps(base, stripe));
      expect(r.status, role).toBe(403);
      expect(await json(r)).toEqual({ erreur: "ACCES_REFUSE" });
    }
    const sansOrg = creerBase({ membre: async () => null });
    expect((await traiterPaiement(requete({ action: "etat" }), deps(sansOrg, stripe))).status).toBe(403);
    expect(stripe.appels).toHaveLength(0);
  });

  it("répond 500, et non 403, quand la base est en panne", async () => {
    const base = creerBase({
      membre: async () => {
        throw new Error("connexion refusée");
      },
    });
    const r = await traiterPaiement(requete({ action: "etat" }), deps(base, creerStripe()));
    expect(r.status).toBe(500);
    expect(await json(r)).toEqual({ erreur: "PAIEMENT_INDISPONIBLE" });
  });

  it("refuse un corps illisible ou une action inconnue", async () => {
    const d = deps(creerBase(), creerStripe());
    expect((await traiterPaiement(requete({ action: "n'importe quoi" }), d)).status).toBe(400);
    const illisible = new Request("https://x", {
      method: "POST",
      headers: { Authorization: "Bearer jeton-valide" },
      body: "pas du json",
    });
    expect((await traiterPaiement(illisible, d)).status).toBe(400);
  });
});

describe("stripe-checkout : état du paiement en ligne", () => {
  it("n'est pas disponible tant que la clé, l'adresse de l'application ou les prix manquent, sans appeler Stripe", async () => {
    for (const manque of ["STRIPE_SECRET_KEY", "APP_URL"]) {
      const stripe = creerStripe(PRIX_STRIPE);
      const env = { ...ENV_COMPLET };
      delete env[manque];
      const r = await traiterPaiement(requete({ action: "etat" }), deps(creerBase(), stripe, env));
      expect(await json(r), manque).toEqual({ disponible: false });
      expect(stripe.appels, manque).toHaveLength(0);
    }
    const sansPrix = { STRIPE_SECRET_KEY: CLE, APP_URL: "https://app.exemple.org" };
    expect(
      await json(await traiterPaiement(requete({ action: "etat" }), deps(creerBase(), creerStripe(), sansPrix))),
    ).toEqual({
      disponible: false,
    });
  });

  it("propose les prix que Stripe confirme, avec leur montant, leur devise et le mode de la clé", async () => {
    const stripe = creerStripe(PRIX_STRIPE);
    const r = await json(await traiterPaiement(requete({ action: "etat" }), deps(creerBase(), stripe)));
    expect(r).toEqual({
      disponible: true,
      mode: "test",
      plans: [
        { plan: "starter", periodicite: "mensuelle", montant: 2500, devise: "EUR" },
        { plan: "starter", periodicite: "annuelle", montant: 24000, devise: "EUR" },
        { plan: "pro", periodicite: "mensuelle", montant: 5000, devise: "EUR" },
        { plan: "pro", periodicite: "annuelle", montant: 48000, devise: "EUR" },
      ],
    });
    expect(stripe.appels.every((a) => a.methode === "GET" && a.cle === CLE)).toBe(true);
  });

  it("écarte un prix inactif, d'une autre période, sans montant ou que Stripe ne trouve pas, et le dit au journal", async () => {
    const stripe = creerStripe({
      "GET /prices/price_starterM": { ...prixValide("month"), active: false },
      "GET /prices/price_starterA": prixValide("month", 24000), // période annuelle attendue
      "GET /prices/price_proM": { ...prixValide("month"), unit_amount: 0 },
      "GET /prices/price_proA": prixValide("year", 48000),
    });
    const r = await json(await traiterPaiement(requete({ action: "etat" }), deps(creerBase(), stripe)));
    expect(r).toMatchObject({ disponible: true, plans: [{ plan: "pro", periodicite: "annuelle" }] });
    expect(journal).toHaveBeenCalledWith("paiement:prix_invalide", "starter", "mensuelle");
    const aucun = creerStripe({});
    expect(await json(await traiterPaiement(requete({ action: "etat" }), deps(creerBase(), aucun)))).toEqual({
      disponible: false,
    });
  });

  it("annonce le mode réel quand la clé est une clé de production", async () => {
    const stripe = creerStripe(PRIX_STRIPE);
    const r = await json(
      await traiterPaiement(
        requete({ action: "etat" }),
        deps(creerBase(), stripe, { ...ENV_COMPLET, STRIPE_SECRET_KEY: "sk_live_abc" }),
      ),
    );
    expect(r.mode).toBe("live");
  });
});

describe("stripe-checkout : souscrire", () => {
  const souscrire = (plan = "pro", periodicite = "annuelle") => requete({ action: "souscrire", plan, periodicite });
  const reponsesOk = {
    "POST /customers": { id: "cus_neuf" },
    "POST /checkout/sessions": { url: "https://checkout.stripe.com/c/pay/cs_test_1" },
  };

  it("crée le client Stripe, le lie à l'organisation, puis une session de paiement aux paramètres exacts", async () => {
    const stripe = creerStripe(reponsesOk);
    const base = creerBase();
    // L'origine annoncée par le navigateur n'est jamais utilisée : pas de redirection ouverte.
    const r = await traiterPaiement(
      requete(
        { action: "souscrire", plan: "pro", periodicite: "annuelle" },
        { Authorization: "Bearer jeton-valide", Origin: "https://pirate.example" },
      ),
      deps(base, stripe),
    );
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    expect(base.lies).toEqual([[ORG, "cus_neuf"]]);
    const [client, session] = stripe.appels;
    expect(client).toMatchObject({ methode: "POST", chemin: "/customers", cle: CLE });
    expect(client!.corps.get("email")).toBe("admin@exemple.test");
    expect(client!.corps.get("name")).toBe("ONG Eau & Vie");
    expect(client!.corps.get("metadata[org_id]")).toBe(ORG);
    expect(session!.chemin).toBe("/checkout/sessions");
    const p = Object.fromEntries(session!.corps);
    expect(p).toMatchObject({
      mode: "subscription",
      customer: "cus_neuf",
      client_reference_id: ORG,
      "line_items[0][price]": "price_proA",
      "line_items[0][quantity]": "1",
      success_url: "https://app.exemple.org/app/parametres?paiement=succes",
      cancel_url: "https://app.exemple.org/app/parametres?paiement=annule",
      locale: "fr",
      "metadata[org_id]": ORG,
      "subscription_data[metadata][org_id]": ORG,
      "subscription_data[metadata][plan]": "pro",
      "subscription_data[metadata][periodicite]": "annuelle",
    });
    expect(JSON.stringify(p)).not.toContain("pirate");
  });

  it("réutilise le client déjà lié et ne crée pas de doublon", async () => {
    const stripe = creerStripe(reponsesOk);
    const base = creerBase({
      abonnement: async () => ({ client: "cus_existant", abonnement: null, statut: "incomplete" }),
    });
    const r = await traiterPaiement(souscrire("starter", "mensuelle"), deps(base, stripe));
    expect(r.status).toBe(200);
    expect(stripe.appels.map((a) => a.chemin)).toEqual(["/checkout/sessions"]);
    expect(stripe.appels[0]!.corps.get("customer")).toBe("cus_existant");
    expect(stripe.appels[0]!.corps.get("line_items[0][price]")).toBe("price_starterM");
    expect(base.lies).toEqual([]);
  });

  it("permet de souscrire de nouveau après une résiliation", async () => {
    const base = creerBase({ abonnement: async () => ({ client: "cus_1", abonnement: "sub_1", statut: "canceled" }) });
    expect((await traiterPaiement(souscrire(), deps(base, creerStripe(reponsesOk)))).status).toBe(200);
  });

  it("refuse quand un abonnement est déjà en cours, et renvoie alors vers le portail", async () => {
    for (const statut of ["active", "trialing", "past_due"]) {
      const stripe = creerStripe(reponsesOk);
      const base = creerBase({ abonnement: async () => ({ client: "cus_1", abonnement: "sub_1", statut }) });
      const r = await traiterPaiement(souscrire(), deps(base, stripe));
      expect(r.status, statut).toBe(409);
      expect(await json(r)).toEqual({ erreur: "ABONNEMENT_EXISTE" });
      expect(stripe.appels, statut).toHaveLength(0);
    }
  });

  it("ne remplace pas un plan enterprise activé à la main", async () => {
    const base = creerBase({
      membre: async () => ({ orgId: ORG, role: "admin", orgNom: "Grande ONG", plan: "enterprise" }),
    });
    const r = await traiterPaiement(souscrire(), deps(base, creerStripe(reponsesOk)));
    expect(r.status).toBe(409);
    expect(await json(r)).toEqual({ erreur: "PLAN_ENTERPRISE" });
  });

  it("refuse un plan ou une périodicité inconnus, avant tout appel à Stripe", async () => {
    const stripe = creerStripe(reponsesOk);
    for (const [plan, periodicite] of [
      ["or", "annuelle"],
      ["pro", "hebdomadaire"],
      [undefined, "annuelle"],
      ["pro", undefined],
    ]) {
      const r = await traiterPaiement(requete({ action: "souscrire", plan, periodicite }), deps(creerBase(), stripe));
      expect(r.status).toBe(400);
    }
    expect(stripe.appels).toHaveLength(0);
  });

  it("répond 503 quand le paiement n'est pas configuré ou que le prix choisi n'est pas réglé", async () => {
    const stripe = creerStripe(reponsesOk);
    const sansCle = { ...ENV_COMPLET };
    delete sansCle.STRIPE_SECRET_KEY;
    expect((await traiterPaiement(souscrire(), deps(creerBase(), stripe, sansCle))).status).toBe(503);
    const sansApp = { ...ENV_COMPLET };
    delete sansApp.APP_URL;
    expect((await traiterPaiement(souscrire(), deps(creerBase(), stripe, sansApp))).status).toBe(503);
    const sansPrix = { ...ENV_COMPLET };
    delete sansPrix.STRIPE_PRICE_PRO_ANNUELLE;
    const r = await traiterPaiement(souscrire("pro", "annuelle"), deps(creerBase(), stripe, sansPrix));
    expect(r.status).toBe(503);
    expect(await json(r)).toEqual({ erreur: "PAIEMENT_NON_CONFIGURE" });
    expect(stripe.appels).toHaveLength(0);
  });

  it("répond 502 si Stripe échoue, sans jamais écrire la clé dans le journal ni dans la réponse", async () => {
    const stripe = creerStripe({
      "POST /customers": () =>
        new Response(JSON.stringify({ error: { code: "api_error", message: `clé ${CLE} refusée` } }), { status: 500 }),
    });
    const r = await traiterPaiement(souscrire(), deps(creerBase(), stripe));
    expect(r.status).toBe(502);
    expect(await json(r)).toEqual({ erreur: "PAIEMENT_INDISPONIBLE" });
    expect(JSON.stringify(journal.mock.calls)).not.toContain("CLE_SECRETE");
  });

  it("ne renvoie jamais une adresse de paiement qui ne vient pas de Stripe", async () => {
    for (const url of [
      "https://pirate.example/paiement",
      "http://checkout.stripe.com/x",
      "javascript:alert(1)",
      undefined,
    ]) {
      const stripe = creerStripe({ ...reponsesOk, "POST /checkout/sessions": { url } });
      const r = await traiterPaiement(souscrire(), deps(creerBase(), stripe));
      expect(r.status, String(url)).toBe(502);
    }
  });
});

describe("stripe-portal", () => {
  const abonne = { abonnement: async () => ({ client: "cus_1", abonnement: "sub_1", statut: "active" }) };

  it("ouvre le portail du client de l'organisation, avec un retour vers l'application", async () => {
    const stripe = creerStripe({ "POST /billing_portal/sessions": { url: "https://billing.stripe.com/p/session/x" } });
    const r = await traiterPortail(requete({}), deps(creerBase(abonne), stripe));
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ url: "https://billing.stripe.com/p/session/x" });
    expect(Object.fromEntries(stripe.appels[0]!.corps)).toEqual({
      customer: "cus_1",
      return_url: "https://app.exemple.org/app/parametres",
    });
  });

  it("refuse sans jeton et à un non-administrateur", async () => {
    const stripe = creerStripe({});
    expect((await traiterPortail(requete({}, {}), deps(creerBase(abonne), stripe))).status).toBe(401);
    const lecteur = creerBase({
      ...abonne,
      membre: async () => ({ orgId: ORG, role: "lecteur", orgNom: "ONG", plan: "pro" }),
    });
    expect((await traiterPortail(requete({}), deps(lecteur, stripe))).status).toBe(403);
    expect(stripe.appels).toHaveLength(0);
  });

  it("répond 404 sans abonnement, 503 sans configuration", async () => {
    const stripe = creerStripe({});
    const r = await traiterPortail(requete({}), deps(creerBase(), stripe));
    expect(r.status).toBe(404);
    expect(await json(r)).toEqual({ erreur: "ABONNEMENT_INTROUVABLE" });
    const sansCle = { ...ENV_COMPLET };
    delete sansCle.STRIPE_SECRET_KEY;
    expect((await traiterPortail(requete({}), deps(creerBase(abonne), stripe, sansCle))).status).toBe(503);
  });

  it("dit que le portail n'est pas réglé dans Stripe, plutôt qu'une panne", async () => {
    const stripe = creerStripe({
      "POST /billing_portal/sessions": () =>
        new Response(
          JSON.stringify({
            error: {
              type: "invalid_request_error",
              message:
                "You can’t create a portal session in test mode until you save your customer portal settings in test mode.",
            },
          }),
          { status: 400 },
        ),
    });
    const r = await traiterPortail(requete({}), deps(creerBase(abonne), stripe));
    expect(r.status).toBe(409);
    expect(await json(r)).toEqual({ erreur: "PORTAIL_NON_CONFIGURE" });
  });

  it("n'ouvre pas une adresse qui ne vient pas de Stripe", async () => {
    const stripe = creerStripe({ "POST /billing_portal/sessions": { url: "https://pirate.example" } });
    expect((await traiterPortail(requete({}), deps(creerBase(abonne), stripe))).status).toBe(502);
  });
});

describe("stripe-webhook", () => {
  const evenement = (type = "customer.subscription.updated", objet: Record<string, unknown> = {}) => ({
    id: "evt_test_1",
    type,
    created: MAINTENANT / 1000 - 5,
    data: {
      object: {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        cancel_at_period_end: false,
        current_period_end: MAINTENANT / 1000 + 86400 * 30,
        items: { data: [{ price: { id: "price_proM" } }] },
        metadata: { org_id: ORG },
        ...objet,
      },
    },
  });
  const envoyer = async (corps: string, entete?: string | null, base = creerBase(), env = ENV_COMPLET) => {
    const signature = entete === undefined ? await signer(corps, SECRET_WEBHOOK, MAINTENANT / 1000) : entete;
    const r = new Request("https://exemple.supabase.co/functions/v1/stripe-webhook", {
      method: "POST",
      headers: signature === null ? {} : { "stripe-signature": signature },
      body: corps,
    });
    return { reponse: await traiterWebhook(r, deps(base, creerStripe(), env)), base };
  };

  it("applique un événement d'abonnement correctement signé, avec ce que la base doit connaître", async () => {
    const { reponse, base } = await envoyer(JSON.stringify(evenement()));
    expect(reponse.status).toBe(200);
    expect(await json(reponse)).toEqual({ recu: true, traite: true, resultat: "applique" });
    expect(base.appliques).toEqual([
      expect.objectContaining({
        evenementId: "evt_test_1",
        client: "cus_1",
        abonnement: "sub_1",
        org: ORG,
        plan: "pro",
        periodicite: "mensuelle",
        statut: "active",
        prixInconnu: false,
      }),
    ]);
  });

  it("vérifie la signature sur le corps brut, y compris avec des caractères non ASCII", async () => {
    const corps = JSON.stringify(
      evenement("customer.subscription.updated", { metadata: { org_id: ORG, note: "é à — ü" } }),
    );
    const { reponse } = await envoyer(corps);
    expect(reponse.status).toBe(200);
  });

  it("refuse une signature absente, fausse, ou calculée sur un autre corps, sans toucher à la base", async () => {
    const corps = JSON.stringify(evenement());
    for (const entete of [
      null,
      "",
      "t=1,v1=abc",
      await signer(corps + " ", SECRET_WEBHOOK, MAINTENANT / 1000),
      await signer(corps, "whsec_autre", MAINTENANT / 1000),
    ]) {
      const { reponse, base } = await envoyer(corps, entete);
      expect(reponse.status, String(entete)).toBe(400);
      expect(await json(reponse)).toEqual({ erreur: "SIGNATURE_INVALIDE" });
      expect(base.appliques).toHaveLength(0);
    }
  });

  it("refuse un événement rejoué trop tard", async () => {
    const corps = JSON.stringify(evenement());
    const { reponse, base } = await envoyer(corps, await signer(corps, SECRET_WEBHOOK, MAINTENANT / 1000 - 3600));
    expect(reponse.status).toBe(400);
    expect(base.appliques).toHaveLength(0);
  });

  it("répond 503 tant que le secret du webhook n'est pas configuré, et 405 à toute autre méthode", async () => {
    const sans = { ...ENV_COMPLET };
    delete sans.STRIPE_WEBHOOK_SECRET;
    expect((await envoyer(JSON.stringify(evenement()), undefined, creerBase(), sans)).reponse.status).toBe(503);
    const get = await traiterWebhook(new Request("https://x", { method: "GET" }), deps(creerBase(), creerStripe()));
    expect(get.status).toBe(405);
  });

  it("acquitte sans rien écrire les événements qui ne concernent pas les abonnements", async () => {
    const { reponse, base } = await envoyer(
      JSON.stringify({ id: "evt_x", type: "invoice.paid", created: MAINTENANT / 1000, data: { object: {} } }),
    );
    expect(reponse.status).toBe(200);
    expect(await json(reponse)).toEqual({ recu: true, traite: false, raison: "type_ignore" });
    expect(base.appliques).toHaveLength(0);
  });

  it("acquitte et journalise un événement d'abonnement incomplet, sans le laisser en erreur chez Stripe", async () => {
    const { reponse, base } = await envoyer(
      JSON.stringify({ id: "evt_y", type: "customer.subscription.updated", created: 1, data: { object: {} } }),
    );
    expect(reponse.status).toBe(200);
    expect(base.appliques).toHaveLength(0);
    expect(journal).toHaveBeenCalledWith("webhook:evenement_invalide");
  });

  it("refuse un corps qui n'est pas du JSON, même correctement signé", async () => {
    const { reponse } = await envoyer("ceci n'est pas du json");
    expect(reponse.status).toBe(400);
  });

  it("répond 500 quand la base échoue, pour que Stripe renvoie l'événement", async () => {
    const base = creerBase({
      appliquer: async () => {
        throw new Error("base indisponible");
      },
    });
    const { reponse } = await envoyer(JSON.stringify(evenement()), undefined, base);
    expect(reponse.status).toBe(500);
    expect(await json(reponse)).toEqual({ erreur: "TRAITEMENT_IMPOSSIBLE" });
  });

  it("transmet le résultat de la base (événement déjà traité, plus ancien…) sans le transformer", async () => {
    const base = creerBase({ appliquer: async () => "deja_traite" });
    const { reponse } = await envoyer(JSON.stringify(evenement()), undefined, base);
    expect(await json(reponse)).toEqual({ recu: true, traite: true, resultat: "deja_traite" });
  });

  it("journalise un abonnement actif dont le prix n'est dans aucun secret : le plan ne peut pas être déduit", async () => {
    const corps = JSON.stringify(
      evenement("customer.subscription.created", { items: { data: [{ price: { id: "price_inconnu" } }] } }),
    );
    const { reponse, base } = await envoyer(corps);
    expect(reponse.status).toBe(200);
    expect(journal).toHaveBeenCalledWith("webhook:prix_inconnu", "sub_1");
    expect(base.appliques[0]).toMatchObject({ plan: null, prixInconnu: true });
  });

  it("répond sans en-têtes CORS : seul Stripe l'appelle", async () => {
    const { reponse } = await envoyer(JSON.stringify(evenement()));
    expect(reponse.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
