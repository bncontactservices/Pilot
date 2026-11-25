// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  adresseApp,
  appelerStripe,
  choixDepuisPrix,
  cleStripe,
  encoderFormulaire,
  ErreurStripe,
  normaliserEvenement,
  prixConfigures,
  prixDepuisChoix,
  secretWebhook,
  signer,
  verifierSignature,
} from "../../supabase/functions/_shared/stripe";

const env = (valeurs: Record<string, string>) => (nom: string) => valeurs[nom];
const PRIX = {
  STRIPE_PRICE_STARTER_MENSUELLE: "price_starterM",
  STRIPE_PRICE_STARTER_ANNUELLE: "price_starterA",
  STRIPE_PRICE_PRO_MENSUELLE: "price_proM",
  STRIPE_PRICE_PRO_ANNUELLE: "price_proA",
};

describe("configuration", () => {
  it("lit les quatre prix dans les secrets, et ignore ceux qui n'ont pas la forme d'un identifiant de prix", () => {
    expect(prixConfigures(env(PRIX))).toEqual([
      { plan: "starter", periodicite: "mensuelle", prixId: "price_starterM" },
      { plan: "starter", periodicite: "annuelle", prixId: "price_starterA" },
      { plan: "pro", periodicite: "mensuelle", prixId: "price_proM" },
      { plan: "pro", periodicite: "annuelle", prixId: "price_proA" },
    ]);
    expect(prixConfigures(env({ ...PRIX, STRIPE_PRICE_PRO_ANNUELLE: "prod_pasUnPrix" })).map((p) => p.prixId)).toEqual([
      "price_starterM",
      "price_starterA",
      "price_proM",
    ]);
    expect(prixConfigures(env({ STRIPE_PRICE_PRO_MENSUELLE: "  price_avecEspaces  " }))[0]!.prixId).toBe(
      "price_avecEspaces",
    );
    expect(prixConfigures(env({}))).toEqual([]);
  });

  it("retrouve le prix d'un choix, et le choix d'un prix", () => {
    expect(prixDepuisChoix(env(PRIX), "pro", "annuelle")).toBe("price_proA");
    expect(prixDepuisChoix(env({ STRIPE_PRICE_PRO_MENSUELLE: "price_proM" }), "starter", "mensuelle")).toBeNull();
    expect(choixDepuisPrix(env(PRIX), "price_starterA")).toEqual({ plan: "starter", periodicite: "annuelle" });
    expect(choixDepuisPrix(env(PRIX), "price_inconnu")).toBeNull();
  });

  it("n'accepte qu'une clé secrète ou restreinte de Stripe, et dit son mode", () => {
    expect(cleStripe(env({ STRIPE_SECRET_KEY: "sk_test_abc123" }))).toEqual({ cle: "sk_test_abc123", mode: "test" });
    expect(cleStripe(env({ STRIPE_SECRET_KEY: " rk_live_abc123 " }))).toEqual({ cle: "rk_live_abc123", mode: "live" });
    // Une clé publique ne sert à rien côté serveur : elle est refusée.
    expect(cleStripe(env({ STRIPE_SECRET_KEY: "pk_test_abc123" }))).toBeNull();
    expect(cleStripe(env({ STRIPE_SECRET_KEY: "n'importe quoi" }))).toBeNull();
    expect(cleStripe(env({}))).toBeNull();
  });

  it("n'accepte qu'un secret de webhook de la forme whsec_…", () => {
    expect(secretWebhook(env({ STRIPE_WEBHOOK_SECRET: "whsec_AbC123+/=" }))).toBe("whsec_AbC123+/=");
    expect(secretWebhook(env({ STRIPE_WEBHOOK_SECRET: "sk_test_abc" }))).toBeNull();
    expect(secretWebhook(env({}))).toBeNull();
  });

  it("n'accepte comme adresse de l'application que du https, ou du http sur la machine locale, réduite à son origine", () => {
    expect(adresseApp(env({ APP_URL: "https://app.exemple.org/" }))).toBe("https://app.exemple.org");
    expect(adresseApp(env({ APP_URL: "https://app.exemple.org/chemin?x=1" }))).toBe("https://app.exemple.org");
    expect(adresseApp(env({ APP_URL: "http://localhost:4173" }))).toBe("http://localhost:4173");
    expect(adresseApp(env({ APP_URL: "http://app.exemple.org" }))).toBeNull();
    expect(adresseApp(env({ APP_URL: "javascript:alert(1)" }))).toBeNull();
    expect(adresseApp(env({ APP_URL: "pas une adresse" }))).toBeNull();
    expect(adresseApp(env({}))).toBeNull();
  });
});

describe("signature des webhooks", () => {
  const secret = "whsec_secretDeTest";
  const corps = '{"id":"evt_1","type":"customer.subscription.updated","note":"é à ü — espaces   multiples"}';
  const maintenant = 1_800_000_000_000;
  const t = maintenant / 1000;

  it("accepte une signature produite avec le bon secret, sur le corps exact", async () => {
    expect(await verifierSignature(corps, await signer(corps, secret, t), secret, maintenant)).toBe(true);
  });

  it("refuse un autre secret, un corps modifié d'un seul caractère, et un en-tête absent ou mal formé", async () => {
    const entete = await signer(corps, secret, t);
    expect(await verifierSignature(corps, await signer(corps, "whsec_autre", t), secret, maintenant)).toBe(false);
    expect(await verifierSignature(corps + " ", entete, secret, maintenant)).toBe(false);
    expect(await verifierSignature(corps.replace("evt_1", "evt_2"), entete, secret, maintenant)).toBe(false);
    expect(await verifierSignature(corps, null, secret, maintenant)).toBe(false);
    expect(await verifierSignature(corps, "", secret, maintenant)).toBe(false);
    expect(await verifierSignature(corps, "v1=abc", secret, maintenant)).toBe(false);
    expect(await verifierSignature(corps, `t=${t}`, secret, maintenant)).toBe(false);
    expect(await verifierSignature(corps, "t=pasUnNombre,v1=abc", secret, maintenant)).toBe(false);
    expect(await verifierSignature(corps, `t=${t},v1=court`, secret, maintenant)).toBe(false);
  });

  it("refuse un horodatage trop ancien ou trop lointain (rejeu), et respecte la tolérance donnée", async () => {
    const ancien = await signer(corps, secret, t - 301);
    expect(await verifierSignature(corps, ancien, secret, maintenant)).toBe(false);
    expect(await verifierSignature(corps, ancien, secret, maintenant, 600)).toBe(true);
    expect(await verifierSignature(corps, await signer(corps, secret, t - 299), secret, maintenant)).toBe(true);
    expect(await verifierSignature(corps, await signer(corps, secret, t + 400), secret, maintenant)).toBe(false);
  });

  it("accepte l'en-tête qui porte plusieurs signatures dont une valide (rotation du secret)", async () => {
    const valide = (await signer(corps, secret, t)).split("v1=")[1]!;
    expect(await verifierSignature(corps, `t=${t},v1=${"0".repeat(64)},v1=${valide}`, secret, maintenant)).toBe(true);
    expect(await verifierSignature(corps, `t=${t},v1=${"0".repeat(64)},v1=${"1".repeat(64)}`, secret, maintenant)).toBe(
      false,
    );
  });
});

describe("encodage des paramètres Stripe", () => {
  it("encode les objets imbriqués, les tableaux et les caractères spéciaux, et omet les valeurs vides", () => {
    expect(
      encoderFormulaire({
        mode: "subscription",
        line_items: [{ price: "price_1", quantity: 1 }],
        metadata: { org_id: "o1", nom: "ONG Éau & Vie" },
        email: null,
        autre: undefined,
        actif: true,
      }),
    ).toBe(
      "mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Borg_id%5D=o1&metadata%5Bnom%5D=ONG%20%C3%89au%20%26%20Vie&actif=true",
    );
    expect(encoderFormulaire({})).toBe("");
  });
});

describe("appels à l'API", () => {
  const reponse = (statut: number, corps: unknown) => new Response(JSON.stringify(corps), { status: statut });

  it("envoie la clé en en-tête et les paramètres dans le corps d'un POST, dans la requête d'un GET", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(reponse(200, { id: "cus_1" }))
      .mockResolvedValueOnce(reponse(200, { id: "price_1" }));
    expect(
      await appelerStripe(f as unknown as typeof fetch, "sk_test_cle", "POST", "/customers", { email: "a@b.c" }),
    ).toEqual({
      id: "cus_1",
    });
    await appelerStripe(f as unknown as typeof fetch, "sk_test_cle", "GET", "/prices/price_1", { expand: ["product"] });
    const [url1, init1] = f.mock.calls[0]!;
    expect(url1).toBe("https://api.stripe.com/v1/customers");
    expect(init1.headers).toMatchObject({
      Authorization: "Bearer sk_test_cle",
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(init1.body).toBe("email=a%40b.c");
    const [url2, init2] = f.mock.calls[1]!;
    expect(url2).toBe("https://api.stripe.com/v1/prices/price_1?expand%5B0%5D=product");
    expect(init2.body).toBeUndefined();
  });

  it("transforme une réponse d'erreur en ErreurStripe, sans jamais y mettre la clé", async () => {
    const f = vi.fn().mockResolvedValue(reponse(402, { error: { code: "card_declined", message: "Carte refusée." } }));
    const erreur = await appelerStripe(f as unknown as typeof fetch, "sk_test_SECRET", "POST", "/x").catch((e) => e);
    expect(erreur).toBeInstanceOf(ErreurStripe);
    expect(erreur).toMatchObject({ statut: 402, code: "card_declined", message: "Carte refusée." });
    expect(`${erreur.message} ${erreur.code}`).not.toContain("SECRET");
    const sansCorps = await appelerStripe(
      vi.fn().mockResolvedValue(new Response("pas du json", { status: 500 })) as unknown as typeof fetch,
      "sk_test_x",
      "GET",
      "/x",
    ).catch((e) => e);
    expect(sansCorps).toMatchObject({ statut: 500, code: "inconnue" });
    const parType = await appelerStripe(
      vi
        .fn()
        .mockResolvedValue(
          reponse(400, { error: { type: "invalid_request_error", message: "m" } }),
        ) as unknown as typeof fetch,
      "sk_test_x",
      "GET",
      "/x",
    ).catch((e) => e);
    expect(parType.code).toBe("invalid_request_error");
  });
});

describe("événements d'abonnement", () => {
  const evenement = (surcharge: Record<string, unknown> = {}, objet: Record<string, unknown> = {}) => ({
    id: "evt_1",
    type: "customer.subscription.updated",
    created: 1_800_000_000,
    data: {
      object: {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        cancel_at_period_end: false,
        current_period_end: 1_802_592_000,
        items: { data: [{ price: { id: "price_proA" } }] },
        metadata: { org_id: "a1000000-0000-4000-8000-000000000001" },
        ...objet,
      },
    },
    ...surcharge,
  });

  it("extrait l'abonnement, le plan déduit du prix, la fin de période et l'organisation", () => {
    const r = normaliserEvenement(evenement(), env(PRIX));
    expect(r).toEqual({
      ok: true,
      valeur: {
        evenementId: "evt_1",
        type: "customer.subscription.updated",
        evenementLe: new Date(1_800_000_000_000),
        client: "cus_1",
        abonnement: "sub_1",
        org: "a1000000-0000-4000-8000-000000000001",
        plan: "pro",
        periodicite: "annuelle",
        statut: "active",
        periodeFin: new Date(1_802_592_000_000),
        annuleEnFinDePeriode: false,
        prixInconnu: false,
      },
    });
  });

  it("lit la fin de période sur le premier élément quand l'API la place là, et le client quand c'est un objet", () => {
    const r = normaliserEvenement(
      evenement(
        {},
        {
          current_period_end: undefined,
          customer: { id: "cus_obj" },
          cancel_at_period_end: true,
          items: { data: [{ price: { id: "price_starterM" }, current_period_end: 1_801_000_000 }] },
        },
      ),
      env(PRIX),
    );
    expect(r.ok && r.valeur).toMatchObject({
      client: "cus_obj",
      plan: "starter",
      periodicite: "mensuelle",
      periodeFin: new Date(1_801_000_000_000),
      annuleEnFinDePeriode: true,
    });
  });

  it("marque l'abonnement supprimé comme terminé, quel que soit le statut annoncé", () => {
    const r = normaliserEvenement(
      evenement({ type: "customer.subscription.deleted" }, { status: "active" }),
      env(PRIX),
    );
    expect(r.ok && r.valeur.statut).toBe("canceled");
  });

  it("signale un prix absent des secrets sans en déduire de plan, et ignore une organisation mal formée", () => {
    const r = normaliserEvenement(
      evenement({}, { items: { data: [{ price: { id: "price_inconnu" } }] }, metadata: { org_id: "pas-un-uuid" } }),
      env(PRIX),
    );
    expect(r.ok && r.valeur).toMatchObject({ plan: null, periodicite: null, prixInconnu: true, org: null });
  });

  it("ignore les événements d'un autre type et refuse ceux qui sont incomplets ou d'un statut inconnu", () => {
    expect(normaliserEvenement(evenement({ type: "invoice.paid" }), env(PRIX))).toEqual({
      ok: false,
      raison: "type_ignore",
    });
    expect(normaliserEvenement(evenement({ id: undefined }), env(PRIX))).toEqual({
      ok: false,
      raison: "evenement_invalide",
    });
    expect(normaliserEvenement(evenement({ created: "hier" }), env(PRIX))).toEqual({
      ok: false,
      raison: "evenement_invalide",
    });
    expect(normaliserEvenement(evenement({}, { customer: undefined }), env(PRIX))).toEqual({
      ok: false,
      raison: "evenement_invalide",
    });
    expect(normaliserEvenement(evenement({}, { status: "inventé" }), env(PRIX))).toEqual({
      ok: false,
      raison: "evenement_invalide",
    });
    expect(normaliserEvenement(null, env(PRIX))).toEqual({ ok: false, raison: "evenement_invalide" });
    expect(normaliserEvenement("texte", env(PRIX))).toEqual({ ok: false, raison: "evenement_invalide" });
    expect(normaliserEvenement({ type: "customer.subscription.created" }, env(PRIX))).toEqual({
      ok: false,
      raison: "evenement_invalide",
    });
  });
});
