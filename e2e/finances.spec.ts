// Parcours finances et budgets (Lot 3a), contre le build servi (npm run apercu) et le vrai Supabase : un budget par
// poste, des dépenses avec justificatif, le taux financier dans l'en-tête du projet et dans l'état d'avancement,
// puis la suppression du projet avec ses fichiers. Mêmes comptes de test que parcours.spec.ts (voir e2e/README.md).
//
// Il crée « Projet E2E finances » et le supprime à la fin : il demande une place libre dans le quota de trois projets
// de l'essai ; sans place, il le dit et s'arrête.

import { expect, type APIRequestContext, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { COMPTES, COMPTES_ABSENTS, connecter, ouvrirPageProjet, ouvrirSession, PHASE } from "./aide";

const NOM = "Projet E2E finances";
const URL_SUPABASE = process.env.VITE_SUPABASE_URL;
const CLE = process.env.VITE_SUPABASE_ANON_KEY;
const ANNEE = new Date().getFullYear();
// Un PDF minimal mais valide : le stockage vérifie le type annoncé, pas le contenu.
const PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

test.skip(COMPTES_ABSENTS || !URL_SUPABASE || !CLE, "comptes de test ou projet Supabase absents");
test.skip(({ isMobile }) => isMobile || PHASE !== "1");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const echapper = (texte: string) => new RegExp(texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
/** Les montants sont écrits avec des espaces insécables : on compare chiffres et espaces sans les distinguer. */
const montant = (chiffres: string) => new RegExp(chiffres.replace(/ /g, "\\s"));
const taux = (page: Page) => page.locator("dl").filter({ hasText: "Physique" }).first();

async function ouvrirSessionApi(request: APIRequestContext, role: keyof typeof COMPTES) {
  const reponse = await request.post(`${URL_SUPABASE}/auth/v1/token?grant_type=password`, {
    headers: { apikey: CLE! },
    data: { email: COMPTES[role].email, password: COMPTES[role].mdp },
  });
  expect(reponse.ok(), `connexion ${role}`).toBe(true);
  const { access_token } = (await reponse.json()) as { access_token: string };
  const entetes = {
    apikey: CLE!,
    Authorization: `Bearer ${access_token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  return {
    lire: async <T>(chemin: string) =>
      (await (await request.get(`${URL_SUPABASE}/rest/v1/${chemin}`, { headers: entetes })).json()) as T,
    ecrire: (methode: "post" | "patch" | "delete", chemin: string, data?: unknown) =>
      request[methode](`${URL_SUPABASE}/rest/v1/${chemin}`, { headers: entetes, data }),
    rpc: async <T>(nom: string) =>
      (await (await request.post(`${URL_SUPABASE}/rest/v1/rpc/${nom}`, { headers: entetes, data: {} })).json()) as T,
    retirer: (chemin: string) =>
      request.delete(`${URL_SUPABASE}/storage/v1/object/documents/${chemin}`, {
        headers: { apikey: CLE!, Authorization: `Bearer ${access_token}` },
      }),
    lister: async (dossier: string) => {
      const r = await request.post(`${URL_SUPABASE}/storage/v1/object/list/documents`, {
        headers: { apikey: CLE!, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        data: { prefix: dossier, limit: 100, offset: 0 },
      });
      return ((await r.json()) as { name: string }[]).map((o) => o.name);
    },
  };
}

let projetId = "";
let orgId = "";
let quotaPlein = false;

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  try {
    const admin = await ouvrirSessionApi(request, "admin");
    const existants = await admin.lire<{ id: string }[]>("projects?select=id&is_demo=eq.false");
    if (existants.length >= 3) {
      quotaPlein = true;
      return;
    }
    orgId = (await admin.lire<{ id: string }[]>("organisations?select=id"))[0]!.id;
    const creation = await admin.ecrire("post", "projects", {
      org_id: orgId,
      nom: NOM,
      date_debut: `${ANNEE}-01-01`,
      date_fin: `${ANNEE + 1}-12-31`,
      budget: 1_500_000,
      devise: "XOF",
    });
    expect(creation.ok(), await creation.text()).toBe(true);
    projetId = ((await creation.json()) as { id: string }[])[0]!.id;
  } finally {
    await request.dispose();
  }
});

// Quoi qu'il arrive, le projet de test ne reste pas (ses dépenses partent avec lui) ni les fichiers sous son dossier.
test.afterAll(async ({ playwright }) => {
  if (!projetId) return;
  const request = await playwright.request.newContext();
  try {
    const admin = await ouvrirSessionApi(request, "admin");
    await admin.ecrire("delete", `projects?id=eq.${projetId}`);
    for (const nom of await admin.lister(`${orgId}/${projetId}`)) await admin.retirer(`${orgId}/${projetId}/${nom}`);
  } finally {
    await request.dispose();
  }
});

async function ouvrirFinances(page: Page) {
  await page.goto("/app");
  await page
    .getByRole("link", { name: echapper(NOM) })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: NOM })).toBeVisible();
  await ouvrirPageProjet(page, "Mise en œuvre", "Finances");
  await expect(page.getByRole("heading", { level: 1, name: "Budget et dépenses" })).toBeVisible();
}

test.describe("finances d'un projet", () => {
  test("budget par poste (éditeur), puis dépenses avec justificatif (administrateur) et dépassement", async ({
    browser,
  }) => {
    test.skip(quotaPlein, "quota de projets plein : supprimer les projets de test (e2e/README.md)");
    const { contexte, page } = await ouvrirSession(browser, "editeur");
    await ouvrirFinances(page);
    await expect(page.getByText("Aucun budget pour ce projet")).toBeVisible();

    for (const [poste, prevu] of [
      ["Forages", "1 000 000"],
      ["Latrines", "500 000"],
    ] as const) {
      await page.getByRole("button", { name: "Ajouter une ligne" }).first().click();
      const tiroir = page.getByRole("dialog");
      await tiroir.getByLabel(/^Poste de dépense/).fill(poste);
      await tiroir.getByLabel(/^Montant prévu/).fill(prevu);
      await tiroir.getByRole("button", { name: "Ajouter" }).click();
      await expect(page.getByText("Ligne budgétaire ajoutée.").first()).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    const synthese = page.getByRole("region", { name: "Synthèse financière" });
    await expect(synthese).toContainText(montant("1 500 000"));
    await expect(synthese).toContainText("0 %");

    // Un doublon (même poste, même année) est refusé en le disant.
    await page.getByRole("button", { name: "Ajouter une ligne" }).first().click();
    const doublon = page.getByRole("dialog");
    await doublon.getByLabel(/^Poste de dépense/).fill("forages");
    await doublon.getByLabel(/^Montant prévu/).fill("10");
    await doublon.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText("Ce poste existe déjà pour cette année").first()).toBeVisible();
    await doublon.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Les dépenses sont réservées aux administrateurs : l'éditeur gère le budget, rien de plus.
    await expect(page.getByRole("button", { name: "Enregistrer une dépense" })).toHaveCount(0);
    await expect(page.getByText("Aucune dépense enregistrée")).toBeVisible();
    await expect(page.getByText(/Les dépenses sont enregistrées par les administrateurs/).first()).toBeVisible();
    await contexte.close();

    // L'administrateur enregistre la première dépense, avec un vrai PDF comme justificatif.
    const { contexte: contexteAdmin, page: pageAdmin } = await ouvrirSession(browser, "admin");
    await ouvrirFinances(pageAdmin);
    const syntheseAdmin = pageAdmin.getByRole("region", { name: "Synthèse financière" });
    await pageAdmin.getByRole("button", { name: "Enregistrer une dépense" }).first().click();
    const saisie = pageAdmin.getByRole("dialog");
    await saisie.getByLabel("Libellé").fill("Pompes et tuyauterie");
    await saisie.getByLabel(/^Montant \(/).fill("400 000");
    await saisie.getByLabel("Ligne du budget").selectOption({ label: `${ANNEE} - Forages` });
    await saisie.getByLabel("Fournisseur").fill("Sahel Hydraulique");
    await saisie.getByLabel("Numéro de pièce").fill("FAC-001");
    await saisie.getByLabel(/^Justificatif/).selectOption({ label: "Déposer un nouveau fichier…" });
    await saisie
      .getByLabel("Fichier du justificatif")
      .setInputFiles({ name: "Facture pompes.pdf", mimeType: "application/pdf", buffer: PDF });
    await saisie.getByRole("button", { name: "Enregistrer" }).click();
    await expect(pageAdmin.getByText("Dépense enregistrée.").first()).toBeVisible();
    await expect(pageAdmin.getByRole("dialog")).toHaveCount(0);
    const pompes = pageAdmin
      .getByRole("heading", { level: 3, name: "Pompes et tuyauterie" })
      .locator("xpath=ancestor::li[1]");
    await expect(pompes).toContainText("Sahel Hydraulique");
    await expect(pompes).toContainText("FAC-001");
    const [telechargement] = await Promise.all([
      pageAdmin.waitForEvent("download"),
      pompes.getByRole("button", { name: /Télécharger le justificatif/ }).click(),
    ]);
    expect(
      readFileSync((await telechargement.path())!)
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");

    // Deuxième dépense, sans justificatif, au-delà du budget de « Latrines » (500 000).
    await pageAdmin.getByRole("button", { name: "Enregistrer une dépense" }).first().click();
    const seconde = pageAdmin.getByRole("dialog");
    await seconde.getByLabel("Libellé").fill("Dalles de latrines");
    await seconde.getByLabel(/^Montant \(/).fill("650 000,5");
    await seconde.getByLabel("Ligne du budget").selectOption({ label: `${ANNEE} - Latrines` });
    await seconde.getByRole("button", { name: "Enregistrer" }).click();
    await expect(pageAdmin.getByText("Dépense enregistrée.").first()).toBeVisible();
    await expect(pageAdmin.getByRole("dialog")).toHaveCount(0);
    const dalles = pageAdmin
      .getByRole("heading", { level: 3, name: "Dalles de latrines" })
      .locator("xpath=ancestor::li[1]");
    await expect(dalles).toContainText("Sans justificatif");
    await expect(dalles).toContainText(montant("650 000,50")); // les centimes sont conservés

    // 1 050 000,5 dépensés sur 1 500 000 : 70 % ; « Latrines » dépasse son budget.
    await expect(syntheseAdmin).toContainText(montant("1 050 001"));
    await expect(syntheseAdmin).toContainText("70 %");
    await expect(syntheseAdmin).toContainText("1 poste dépasse son budget.");
    const latrines = pageAdmin.getByRole("rowheader", { name: /Latrines/ }).locator("xpath=ancestor::tr[1]");
    await expect(latrines).toContainText("130 %");
    await expect(latrines).toContainText("Dépassé");
    // Le taux financier est aussi dans l'en-tête du projet.
    await expect(taux(pageAdmin)).toContainText("Financier");
    await expect(taux(pageAdmin)).toContainText("70 %");

    // Une ligne qui a des dépenses ne peut pas être supprimée : la base refuse, l'écran le dit.
    await pageAdmin.getByRole("button", { name: `Actions pour la ligne Latrines (${ANNEE})` }).click();
    await pageAdmin.getByRole("menuitem", { name: "Supprimer" }).click();
    await pageAdmin.getByRole("dialog").getByRole("button", { name: "Supprimer la ligne" }).click();
    await expect(pageAdmin.getByText(/ne peut pas être supprimé/).first()).toBeVisible();
    await expect(pageAdmin.getByRole("rowheader", { name: /Latrines/ })).toBeVisible();
    await contexteAdmin.close();
  });

  test("état d'avancement : le taux financier est figé à la rédaction", async ({ page, request }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    await connecter(page, "admin");
    await ouvrirFinances(page);
    await ouvrirPageProjet(page, "Mise en œuvre", "États d’avancement");
    await page.getByRole("button", { name: "Rédiger un état d’avancement" }).first().click();
    const tiroir = page.getByRole("dialog");
    await expect(tiroir.getByText("Financier")).toBeVisible();
    await tiroir.getByLabel(/^Faits marquants/).fill("Pompes livrées.");
    await tiroir.getByRole("button", { name: "Enregistrer l’état" }).click();
    await expect(page.getByText("État d’avancement enregistré.").first()).toBeVisible();
    const carte = page
      .getByRole("heading", { level: 2, name: /^État d’avancement ·/ })
      .locator("xpath=ancestor::li[1]");
    await expect(carte.locator("dl")).toContainText("70 %");
    const figes = (await carte.locator("dl").textContent())!;

    // Une dépense de plus change le taux du projet (par l'API : la saisie a été exercée à l'écran ci-dessus).
    const administrateur = await ouvrirSessionApi(request, "admin");
    const lignes = await administrateur.lire<{ id: string; poste: string }[]>(
      `budget_lignes?select=id,poste&project_id=eq.${projetId}`,
    );
    const ajout = await administrateur.ecrire("post", "depenses", {
      project_id: projetId,
      budget_ligne_id: lignes.find((l) => l.poste === "Forages")!.id,
      date: new Date().toISOString().slice(0, 10),
      libelle: "Supplément pompes",
      montant: 100_000,
    });
    expect(ajout.ok(), await ajout.text()).toBe(true);

    await page.reload();
    await expect(taux(page)).toContainText("77 %"); // 1 150 000,5 sur 1 500 000
    await expect(carte.locator("dl")).toHaveText(figes);
  });

  test("lecteur : tout se consulte et se télécharge, rien ne s'écrit", async ({ browser, request }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    const { contexte, page } = await ouvrirSession(browser, "lecteur");
    await ouvrirFinances(page);
    await expect(page.getByRole("heading", { level: 3, name: "Pompes et tuyauterie" })).toBeVisible();
    await expect(page.getByText("Votre rôle est en lecture seule")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Ajouter une ligne|Enregistrer une dépense|Actions pour/ }),
    ).toHaveCount(0);
    const [telechargement] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Télécharger le justificatif/ }).click(),
    ]);
    expect(
      readFileSync((await telechargement.path())!)
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
    await contexte.close();

    // Même refus côté API.
    const lecteur = await ouvrirSessionApi(request, "lecteur");
    const lignes = await lecteur.lire<{ id: string }[]>(`budget_lignes?select=id&project_id=eq.${projetId}`);
    expect(lignes.length).toBe(2);
    const refus = await lecteur.ecrire("post", "depenses", {
      project_id: projetId,
      budget_ligne_id: lignes[0]!.id,
      date: new Date().toISOString().slice(0, 10),
      libelle: "Intrus",
      montant: 1,
    });
    expect(refus.status()).toBe(403);
    expect(await refus.text()).toMatch(/42501|row-level security/);
    const suppression = await lecteur.ecrire("delete", `budget_lignes?id=eq.${lignes[0]!.id}`);
    expect(suppression.status() === 403 || (await suppression.json()).length === 0).toBe(true);
  });

  test("la base refuse la suppression d'une ligne qui a des dépenses, et les montants ou dates absurdes", async ({
    request,
  }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    const admin = await ouvrirSessionApi(request, "admin");
    const lignes = await admin.lire<{ id: string; poste: string }[]>(
      `budget_lignes?select=id,poste&project_id=eq.${projetId}`,
    );
    const forages = lignes.find((l) => l.poste === "Forages")!;
    const suppression = await admin.ecrire("delete", `budget_lignes?id=eq.${forages.id}`);
    expect(suppression.status()).toBe(409);
    expect(await suppression.text()).toContain("23503");
    // Un montant nul ou négatif, une date absurde : refusés par la base.
    for (const [champs, nom] of [
      [{ montant: 0 }, "montant nul"],
      [{ montant: -5 }, "montant négatif"],
      [{ date: "1999-01-01" }, "date absurde"],
    ] as const) {
      const r = await admin.ecrire("post", "depenses", {
        project_id: projetId,
        budget_ligne_id: forages.id,
        date: new Date().toISOString().slice(0, 10),
        libelle: "Refusée",
        montant: 10,
        ...champs,
      });
      expect(r.status(), nom).toBe(400);
      expect(await r.text(), nom).toContain("23514");
    }
  });

  test("nettoyage : supprimer le projet retire ses dépenses et le fichier de son justificatif", async ({
    page,
    request,
  }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    const admin = await ouvrirSessionApi(request, "admin");
    expect((await admin.lister(`${orgId}/${projetId}`)).length, "le justificatif est dans le stockage").toBe(1);
    await connecter(page, "admin");
    await page.goto("/app");
    await page.getByRole("button", { name: echapper(`Actions pour ${NOM}`) }).click();
    await page.getByRole("menuitem", { name: "Supprimer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer définitivement" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Projet « " + NOM + " » supprimé.").first()).toBeVisible();
    await expect
      .poll(() => admin.lister(`${orgId}/${projetId}`), {
        timeout: 30_000,
        message: "le justificatif part du stockage",
      })
      .toEqual([]);
    await expect.poll(() => admin.rpc<string[]>("fichiers_a_retirer"), { timeout: 30_000 }).toEqual([]);
    expect(await admin.lire<unknown[]>(`depenses?select=id&project_id=eq.${projetId}`)).toEqual([]);
    expect(await admin.lire<unknown[]>(`budget_lignes?select=id&project_id=eq.${projetId}`)).toEqual([]);
    projetId = ""; // déjà supprimé : rien à nettoyer dans afterAll
  });
});
