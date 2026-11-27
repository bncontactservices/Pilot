// Localités, zones d'intervention et carte (Lot 3d), contre le build servi (npm run apercu) et le vrai Supabase :
// aucune localité n'est préchargée (c'est l'organisation qui renseigne les siennes), la création d'une petite hiérarchie
// (commune, village, quartier) avec ses coordonnées, la carte (repères, fond OpenStreetMap, aucune violation de la
// politique de sécurité), le rattachement d'une réalisation et d'une saisie, le retrait d'une zone qui laisse les
// rattachements, la suppression refusée tant qu'une localité sert ou contient d'autres localités, la lecture seule du
// lecteur et les refus de la base. Mêmes comptes de test que parcours.spec.ts (voir e2e/README.md). Il crée
// « Projet E2E zones » et des localités « … E2E », qu'il supprime à la fin : il demande une place libre dans le quota
// de trois projets de l'essai, et une organisation de test sans localité au départ.

import { expect, type APIRequestContext, type Page, test } from "@playwright/test";
import { COMPTES, COMPTES_ABSENTS, ouvrirPageProjet, ouvrirSession, PHASE, violations } from "./aide";

const NOM = "Projet E2E zones";
const COMMUNE = "Commune E2E";
const VILLAGE = "Village E2E";
const QUARTIER = "Quartier E2E";
const LIEU_QUARTIER = `${QUARTIER}, ${VILLAGE}, ${COMMUNE}`;
const URL_SUPABASE = process.env.VITE_SUPABASE_URL;
const CLE = process.env.VITE_SUPABASE_ANON_KEY;
const ANNEE = new Date().getFullYear();
const JOUR = new Date().toISOString().slice(0, 10);

test.skip(COMPTES_ABSENTS || !URL_SUPABASE || !CLE, "comptes de test ou projet Supabase absents");
test.skip(({ isMobile }) => isMobile || PHASE !== "1");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const echapper = (texte: string) => new RegExp(texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

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
    });
    expect(creation.ok(), await creation.text()).toBe(true);
    projetId = ((await creation.json()) as { id: string }[])[0]!.id;
    // Un indicateur « dernière valeur » pour les saisies rattachées à une localité.
    const kpi = await admin.ecrire("post", "kpis", {
      project_id: projetId,
      nom: "Points d’eau E2E",
      unite: "points",
      cible: 100,
      valeur_base: 0,
      frequence: "mensuelle",
      sens: "croissant",
      type_agregation: "dernier",
    });
    expect(kpi.ok(), await kpi.text()).toBe(true);
  } finally {
    await request.dispose();
  }
});

// Les localités de l'organisation ne dépendent pas du projet : on retire explicitement celles du parcours.
test.afterAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  try {
    const admin = await ouvrirSessionApi(request, "admin");
    if (projetId) await admin.ecrire("delete", `projects?id=eq.${projetId}`);
    await admin.ecrire("delete", `localites?nom=ilike.*E2E*&org_id=not.is.null`);
  } finally {
    await request.dispose();
  }
});

async function ouvrirProjet(page: Page) {
  await page.goto("/app");
  await page
    .getByRole("link", { name: echapper(NOM) })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: NOM })).toBeVisible();
}

test.describe("localités, zones d'intervention et carte", () => {
  test("éditeur : aucune localité préchargée, hiérarchie créée par l'organisation, carte", async ({ browser }) => {
    test.skip(quotaPlein, "quota de projets plein : supprimer les projets de test (e2e/README.md)");
    const { contexte, page } = await ouvrirSession(browser, "editeur");
    const refusesParLaPolitique: string[] = [];
    page.on("console", (m) => {
      if (/content security policy|violates the following/i.test(m.text())) refusesParLaPolitique.push(m.text());
    });
    await ouvrirProjet(page);
    await ouvrirPageProjet(page, "Planification", "Zones");
    // Rien n'est chargé à la place de l'organisation : ni zone, ni localité, ni référentiel.
    await expect(page.getByText("Aucune zone d’intervention")).toBeVisible();
    await expect(page.getByText(/Votre organisation n’a pas encore de localité/)).toBeVisible();
    await page.getByRole("button", { name: "Ajouter une zone" }).first().click();
    let tiroir = page.getByRole("dialog");
    await expect(tiroir.getByText("Votre organisation n’a pas encore de localité à choisir.")).toBeVisible();
    await expect(tiroir.getByText("Référentiel")).toHaveCount(0);
    await tiroir.getByRole("button", { name: "Fermer" }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // La commune, sans parent, avec ses coordonnées : elle devient aussitôt une zone du projet.
    await page.getByRole("button", { name: "Créer une localité" }).first().click();
    tiroir = page.getByRole("dialog");
    await tiroir.getByLabel("Nom", { exact: true }).fill(COMMUNE);
    await tiroir.getByLabel("Niveau").selectOption({ label: "Commune" });
    await tiroir.getByLabel(/^Latitude/).fill("14,7604");
    await tiroir.getByLabel(/^Longitude/).fill("−17,4681");
    await tiroir.getByLabel(/^Source des coordonnées/).fill("Relevé de test E2E");
    await tiroir.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText("Localité ajoutée.").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: COMMUNE })).toBeVisible();

    // Le village, rattaché à la commune, avec ses coordonnées.
    await page.getByRole("button", { name: "Créer une localité" }).first().click();
    tiroir = page.getByRole("dialog");
    await tiroir.getByLabel("Nom", { exact: true }).fill(VILLAGE);
    await tiroir.getByLabel("Niveau").selectOption({ label: "Village" });
    await tiroir.getByLabel(/^Rattachée à/).selectOption({ label: `${COMMUNE} (Commune)` });
    await tiroir.getByLabel(/^Latitude/).fill("14,7700");
    await tiroir.getByLabel(/^Longitude/).fill("−17,4700");
    await tiroir.getByLabel(/^Source des coordonnées/).fill("Relevé de test E2E");
    await tiroir.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByRole("heading", { level: 2, name: VILLAGE })).toBeVisible();

    // Le quartier, sans coordonnées : utilisable, mais absent de la carte (aucune coordonnée n'est inventée).
    await page.getByRole("button", { name: "Créer une localité" }).first().click();
    tiroir = page.getByRole("dialog");
    await tiroir.getByLabel("Nom", { exact: true }).fill(QUARTIER);
    await tiroir.getByLabel("Niveau").selectOption({ label: "Quartier" });
    await tiroir.getByLabel(/^Rattachée à/).selectOption({ label: `${VILLAGE}, ${COMMUNE} (Village)` });
    await tiroir.getByRole("button", { name: "Ajouter" }).click();
    const quartier = page.getByRole("heading", { level: 2, name: QUARTIER }).locator("xpath=ancestor::li[1]");
    await expect(quartier).toBeVisible();
    await expect(quartier).toContainText("Sans coordonnées : absente de la carte");
    await expect(quartier).toContainText(`${VILLAGE}, ${COMMUNE}`);
    await expect(page.getByRole("heading", { level: 2, name: COMMUNE }).locator("xpath=ancestor::li[1]")).toContainText(
      "14,7604 N, 17,4681 O",
    );

    // La carte : un repère par zone qui a des coordonnées, avec le fond OpenStreetMap et son attribution.
    const carte = page.getByRole("region", { name: /Carte des zones d’intervention du projet/ });
    await expect(carte).toBeVisible();
    await expect(page.locator(`.leaflet-marker-icon[title="${COMMUNE}"]`)).toBeVisible();
    await expect(page.locator(".leaflet-marker-icon")).toHaveCount(2);
    await expect(page.getByText("1 zone sans coordonnées n’apparaît pas sur la carte.")).toBeVisible();
    await expect(carte.getByRole("link", { name: "les contributeurs d’OpenStreetMap" })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
    await expect.poll(async () => page.locator(".leaflet-tile-loaded").count(), { timeout: 30_000 }).toBeGreaterThan(0);
    const tuiles = await page
      .locator(".leaflet-tile-loaded")
      .evaluateAll((i) => i.map((e) => (e as HTMLImageElement).src));
    for (const src of tuiles) expect(src).toMatch(/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/);
    // Le repère s'atteint au clavier et ouvre une fenêtre de texte.
    await page.locator(`.leaflet-marker-icon[title="${COMMUNE}"]`).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".leaflet-popup-content")).toContainText(COMMUNE);

    // Un même nom sous un même parent est refusé, sans tenir compte de la casse.
    await page.getByRole("button", { name: "Créer une localité" }).first().click();
    tiroir = page.getByRole("dialog");
    await tiroir.getByLabel("Nom", { exact: true }).fill(COMMUNE.toLowerCase());
    await tiroir.getByLabel("Niveau").selectOption({ label: "Commune" });
    await tiroir.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText("Une localité de ce nom existe déjà au même endroit.").first()).toBeVisible();
    // Une latitude hors limites est refusée avant tout envoi.
    await tiroir.getByLabel("Nom", { exact: true }).fill("Autre village E2E");
    await tiroir.getByLabel(/^Latitude/).fill("95");
    await tiroir.getByLabel(/^Longitude/).fill("10");
    await tiroir.getByRole("button", { name: "Ajouter" }).click();
    await expect(tiroir.getByText("La latitude est un nombre entre −90 et 90.")).toBeVisible();
    await tiroir.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    expect(refusesParLaPolitique, "la politique de sécurité ne bloque ni la carte ni ses images").toEqual([]);
    expect(await violations(page)).toEqual([]);
    await contexte.close();
  });

  test("éditeur : une réalisation et une saisie rattachées à une localité, usage par zone", async ({ browser }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    const { contexte, page } = await ouvrirSession(browser, "editeur");
    await ouvrirProjet(page);

    await ouvrirPageProjet(page, "Mise en œuvre", "Réalisations");
    await page.getByRole("button", { name: "Ajouter une réalisation" }).first().click();
    const tiroir = page.getByRole("dialog");
    await tiroir.getByLabel("Intitulé").fill("Forage du quartier E2E");
    const choix = tiroir.getByLabel(/^Localité/);
    // Seules les zones du projet sont proposées.
    await expect(choix.locator("option")).toHaveText([
      "Aucune localité précisée",
      COMMUNE,
      LIEU_QUARTIER,
      `${VILLAGE}, ${COMMUNE}`,
    ]);
    await choix.selectOption({ label: LIEU_QUARTIER });
    await tiroir.getByRole("button", { name: "Enregistrer la réalisation" }).click();
    await expect(page.getByText("Réalisation enregistrée.").first()).toBeVisible();
    await expect(page.getByText(LIEU_QUARTIER).first()).toBeVisible();

    await ouvrirPageProjet(page, "Pilotage", "Saisie");
    await page.getByLabel(/^Valeur/).fill("7");
    await page.getByLabel(/^Localité/).selectOption({ label: LIEU_QUARTIER });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText(/Valeur enregistrée/).first()).toBeVisible();
    const historique = page.getByRole("table");
    await expect(historique.getByRole("columnheader", { name: "Localité" })).toBeVisible();
    await expect(historique).toContainText(LIEU_QUARTIER);

    // L'usage par zone : une saisie et une réalisation dans le quartier.
    await ouvrirPageProjet(page, "Planification", "Zones");
    const quartier = page.getByRole("heading", { level: 2, name: QUARTIER }).locator("xpath=ancestor::li[1]");
    await expect(quartier).toContainText("1 saisie · 1 réalisation");

    // Retirer la zone laisse la réalisation et la saisie rattachées.
    await page.getByRole("button", { name: `Actions pour la zone ${QUARTIER}` }).click();
    await page.getByRole("menuitem", { name: "Retirer des zones" }).click();
    await expect(page.getByRole("dialog").getByText(/gardent/)).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Retirer" }).click();
    await expect(page.getByText("Zone retirée.").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: QUARTIER })).toHaveCount(0);
    await ouvrirPageProjet(page, "Mise en œuvre", "Réalisations");
    await expect(page.getByText(LIEU_QUARTIER).first()).toBeVisible();
    await contexte.close();
  });

  test("éditeur : gérer les localités de l'organisation, suppression refusée tant qu'une localité sert ou contient d'autres localités", async ({
    browser,
  }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    const { contexte, page } = await ouvrirSession(browser, "editeur");
    await page.goto("/app");
    await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "Localités" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Localités" })).toBeVisible();
    // Aucun référentiel : pas d'explication à son sujet, aucune étiquette « Référentiel », et toutes les localités sont les siennes.
    await expect(page.getByText(/vous pouvez les utiliser, pas les modifier/)).toHaveCount(0);
    await expect(page.getByText("Référentiel", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Actions pour la localité/ })).toHaveCount(3);
    const village = page
      .getByRole("heading", { level: 2, name: new RegExp(`^${VILLAGE}`) })
      .locator("xpath=ancestor::li[1]");
    await expect(village).toContainText("Votre organisation");
    await expect(village).toContainText("14,7700 N, 17,4700 O");
    await expect(village).toContainText("Source : Relevé de test E2E");
    await page.getByLabel("Rechercher une localité").fill("quartier");
    await expect(page.getByRole("heading", { level: 2, name: new RegExp(`^${QUARTIER}`) })).toBeVisible();
    await expect(page.getByText(`${VILLAGE}, ${COMMUNE}`)).toBeVisible();
    await page.getByLabel("Rechercher une localité").fill("");

    // Modifier le nom et les coordonnées.
    await page.getByRole("button", { name: `Actions pour la localité ${VILLAGE}` }).click();
    await page.getByRole("menuitem", { name: "Modifier" }).click();
    const tiroir = page.getByRole("dialog");
    await tiroir.getByLabel("Nom", { exact: true }).fill(`${VILLAGE} renommé`);
    await tiroir.getByLabel(/^Latitude/).fill("14,7710");
    await tiroir.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Localité modifiée.").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: new RegExp(`^${VILLAGE} renommé`) })).toBeVisible();

    // Elle est encore une zone du projet et contient un quartier : la suppression est refusée, et le dit.
    await page.getByRole("button", { name: `Actions pour la localité ${VILLAGE} renommé` }).click();
    await page.getByRole("menuitem", { name: "Supprimer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
    await expect(page.getByText(/utilisé ailleurs/).first()).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Annuler" }).click();

    // Une fois retirée des zones, elle reste protégée par le quartier qu'elle contient.
    await ouvrirProjet(page);
    await ouvrirPageProjet(page, "Planification", "Zones");
    await page.getByRole("button", { name: `Actions pour la zone ${VILLAGE} renommé` }).click();
    await page.getByRole("menuitem", { name: "Retirer des zones" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Retirer" }).click();
    await expect(page.getByText("Zone retirée.").first()).toBeVisible();
    await page.goto("/app/localites");
    await page.getByRole("button", { name: `Actions pour la localité ${VILLAGE} renommé` }).click();
    await page.getByRole("menuitem", { name: "Supprimer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
    await expect(page.getByText(/utilisé ailleurs/).first()).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Annuler" }).click();

    // Une localité que rien n'utilise se supprime.
    await page.getByRole("button", { name: "Ajouter une localité" }).first().click();
    await page.getByRole("dialog").getByLabel("Nom", { exact: true }).fill("Hameau E2E");
    await page.getByRole("dialog").getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText("Localité ajoutée.").first()).toBeVisible();
    await page.getByRole("button", { name: "Actions pour la localité Hameau E2E" }).click();
    await page.getByRole("menuitem", { name: "Supprimer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
    await expect(page.getByText("Localité supprimée.").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /^Hameau E2E/ })).toHaveCount(0);
    await contexte.close();
  });

  test("lecteur : tout se consulte, rien ne s'écrit", async ({ browser }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    const { contexte, page } = await ouvrirSession(browser, "lecteur");
    await ouvrirProjet(page);
    await ouvrirPageProjet(page, "Planification", "Zones");
    await expect(page.getByRole("heading", { level: 2, name: COMMUNE })).toBeVisible();
    await expect(page.locator(`.leaflet-marker-icon[title="${COMMUNE}"]`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajouter une zone" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Créer une localité" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Actions pour la zone/ })).toHaveCount(0);
    await expect(page.getByText(/Votre rôle est en lecture seule/)).toBeVisible();
    await page.goto("/app/localites");
    await expect(page.getByRole("heading", { level: 2, name: new RegExp(`^${COMMUNE}`) })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajouter une localité" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Actions pour la localité/ })).toHaveCount(0);
    await contexte.close();
  });

  test("la base refuse un lecteur, l'écriture du référentiel, un changement de niveau et une localité hors zone", async ({
    playwright,
  }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    const request = await playwright.request.newContext();
    try {
      const lecteur = await ouvrirSessionApi(request, "lecteur");
      const editeur = await ouvrirSessionApi(request, "editeur");
      const anonyme = await request.get(`${URL_SUPABASE}/rest/v1/localites?select=id`, { headers: { apikey: CLE! } });
      expect(anonyme.status(), "anonyme : aucune lecture").toBeGreaterThanOrEqual(401);

      // Aucune localité n'est livrée avec la plateforme : le référentiel est vide.
      const lecture = await lecteur.lire<{ id: string; org_id: string | null }[]>("localites?select=id,org_id");
      expect(lecture.filter((l) => l.org_id === null)).toHaveLength(0);

      const refus = await lecteur.ecrire("post", "localites", { org_id: orgId, niveau: "village", nom: "Intrus E2E" });
      expect(refus.status(), "lecteur : pas de création").toBe(403);

      // Le référentiel est écrit par la plateforme seule : ni création, ni modification, ni suppression par un éditeur.
      const faux = await editeur.ecrire("post", "localites", {
        org_id: null,
        niveau: "village",
        nom: "Faux référentiel E2E",
        source: "inventé",
      });
      expect(faux.status(), "éditeur : pas d'écriture dans le référentiel").toBe(403);
      // Une commune de l'organisation sert de parent aux contrôles suivants.
      const commune = await editeur.ecrire("post", "localites", {
        org_id: orgId,
        niveau: "commune",
        nom: "Parent E2E",
      });
      expect(commune.ok(), await commune.text()).toBe(true);
      const parentId = ((await commune.json()) as { id: string }[])[0]!.id;

      // Niveau et parent d'une localité ne changent plus.
      const creation = await editeur.ecrire("post", "localites", { org_id: orgId, niveau: "village", nom: "Fixe E2E" });
      expect(creation.ok(), await creation.text()).toBe(true);
      const id = ((await creation.json()) as { id: string }[])[0]!.id;
      expect(
        (await editeur.ecrire("patch", `localites?id=eq.${id}`, { niveau: "region" })).status(),
        "niveau figé",
      ).toBe(403);
      expect(
        (await editeur.ecrire("patch", `localites?id=eq.${id}`, { parent_id: parentId })).status(),
        "parent figé",
      ).toBe(403);
      // Un enfant n'est pas de niveau supérieur à son parent.
      const incoherent = await editeur.ecrire("post", "localites", {
        org_id: orgId,
        parent_id: parentId,
        niveau: "region",
        nom: "Région sous une commune E2E",
      });
      expect(await incoherent.text()).toContain("LOCALITE_NIVEAU_INVALIDE");

      // Une réalisation ne se rattache qu'à une zone de son projet : Fixe E2E n'en est pas une.
      const hors = await editeur.ecrire("post", "realisations", {
        project_id: projetId,
        date: JOUR,
        titre: "Hors zone E2E",
        localite_id: id,
      });
      expect(hors.status()).toBe(400);
      expect(await hors.text()).toContain("LOCALITE_HORS_PROJET");
      expect((await editeur.ecrire("delete", `localites?id=eq.${id}`)).ok()).toBe(true);
      expect((await editeur.ecrire("delete", `localites?id=eq.${parentId}`)).ok()).toBe(true);
    } finally {
      await request.dispose();
    }
  });
});
