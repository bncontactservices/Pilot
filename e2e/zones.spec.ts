// Localités, zones d'intervention et carte (Lot 3d), contre le build servi (npm run apercu) et le vrai Supabase :
// le référentiel de Yoff (lecture seule), la création d'une localité de l'organisation, la carte (repères, fond
// OpenStreetMap, aucune violation de la politique de sécurité), le rattachement d'une réalisation et d'une saisie, le
// retrait d'une zone qui laisse les rattachements, la suppression refusée tant qu'une localité sert, la lecture seule
// du lecteur et les refus de la base. Mêmes comptes de test que parcours.spec.ts (voir e2e/README.md). Il crée
// « Projet E2E zones » et des localités « … E2E », qu'il supprime à la fin : il demande une place libre dans le quota
// de trois projets de l'essai.

import { expect, type APIRequestContext, type Page, test } from "@playwright/test";
import { COMPTES, COMPTES_ABSENTS, ouvrirPageProjet, ouvrirSession, PHASE, violations } from "./aide";

const NOM = "Projet E2E zones";
const VILLAGE = "Village E2E";
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
  test("éditeur : zones du référentiel de Yoff, localité de l'organisation, carte", async ({ browser }) => {
    test.skip(quotaPlein, "quota de projets plein : supprimer les projets de test (e2e/README.md)");
    const { contexte, page } = await ouvrirSession(browser, "editeur");
    const refusesParLaPolitique: string[] = [];
    page.on("console", (m) => {
      if (/content security policy|violates the following/i.test(m.text())) refusesParLaPolitique.push(m.text());
    });
    await ouvrirProjet(page);
    await ouvrirPageProjet(page, "Planification", "Zones");
    await expect(page.getByText("Aucune zone d’intervention")).toBeVisible();

    // Le référentiel de Yoff : la commune a des coordonnées sourcées, ses quartiers n'en ont pas.
    await page.getByRole("button", { name: "Ajouter une zone" }).first().click();
    let tiroir = page.getByRole("dialog");
    await expect(tiroir.getByRole("button", { name: "Ajouter : Région de Dakar" })).toBeVisible();
    await expect(tiroir.getByText("Référentiel").first()).toBeVisible();
    await tiroir.getByLabel("Rechercher une localité").fill("yoff");
    await tiroir.getByRole("button", { name: "Ajouter : Commune de Yoff" }).click();
    await expect(page.getByText("Zone ajoutée.").first()).toBeVisible();
    await expect(tiroir.getByText("Déjà une zone")).toBeVisible();
    // Sans accents : « layene » trouve « Layène ».
    await tiroir.getByLabel("Rechercher une localité").fill("layene");
    await tiroir.getByRole("button", { name: "Ajouter : Layène" }).click();
    // Derrière la fenêtre ouverte, la liste est masquée aux requêtes par rôle : on le lit dans la fenêtre.
    await expect(tiroir.getByText("Déjà une zone")).toHaveCount(1);
    await tiroir.getByLabel("Rechercher une localité").fill("");
    await expect(tiroir.getByText("Déjà une zone")).toHaveCount(2);
    await tiroir.getByRole("button", { name: "Fermer" }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const yoff = page.getByRole("heading", { level: 2, name: "Commune de Yoff" }).locator("xpath=ancestor::li[1]");
    await expect(yoff).toContainText("Référentiel");
    await expect(yoff).toContainText("14,760358 N, 17,468149 O");
    await expect(yoff).toContainText("Arrondissement des Almadies, Département de Dakar, Région de Dakar");
    const layene = page.getByRole("heading", { level: 2, name: "Layène" }).locator("xpath=ancestor::li[1]");
    await expect(layene).toContainText("Sans coordonnées : absente de la carte");

    // La carte : un repère pour Yoff seulement, avec le fond OpenStreetMap et son attribution.
    const carte = page.getByRole("region", { name: /Carte des zones d’intervention du projet/ });
    await expect(carte).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon[title="Commune de Yoff"]')).toBeVisible();
    await expect(page.locator(".leaflet-marker-icon")).toHaveCount(1);
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
    await page.locator('.leaflet-marker-icon[title="Commune de Yoff"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".leaflet-popup-content")).toContainText("Commune de Yoff");

    // Une localité propre à l'organisation, rattachée à la commune, avec ses coordonnées : elle devient une zone.
    await page.getByRole("button", { name: "Créer une localité" }).first().click();
    tiroir = page.getByRole("dialog");
    await tiroir.getByLabel("Nom", { exact: true }).fill(VILLAGE);
    await tiroir.getByLabel("Niveau").selectOption({ label: "Village" });
    await tiroir
      .getByLabel(/^Rattachée à/)
      .selectOption({ label: "Commune de Yoff, Arrondissement des Almadies (Commune)" });
    await tiroir.getByLabel(/^Latitude/).fill("14,7700");
    await tiroir.getByLabel(/^Longitude/).fill("−17,4700");
    await tiroir.getByLabel(/^Source des coordonnées/).fill("Relevé de test E2E");
    await tiroir.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText("Localité ajoutée.").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: VILLAGE })).toBeVisible();
    await expect(page.locator(".leaflet-marker-icon")).toHaveCount(2);

    // Le référentiel n'est pas recréé : une localité du référentiel de même nom et de même parent est refusée.
    await page.getByRole("button", { name: "Créer une localité" }).first().click();
    tiroir = page.getByRole("dialog");
    await tiroir.getByLabel("Nom", { exact: true }).fill("Layène");
    await tiroir.getByLabel("Niveau").selectOption({ label: "Quartier" });
    await tiroir
      .getByLabel(/^Rattachée à/)
      .selectOption({ label: "Village traditionnel de Yoff, Commune de Yoff (Village)" });
    await tiroir.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText(/existe déjà dans le référentiel de la plateforme/).first()).toBeVisible();
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
    await tiroir.getByLabel("Intitulé").fill("Forage de Layène E2E");
    const choix = tiroir.getByLabel(/^Localité/);
    // Seules les zones du projet sont proposées.
    await expect(choix.locator("option")).toHaveText([
      "Aucune localité précisée",
      "Commune de Yoff, Arrondissement des Almadies, Département de Dakar",
      "Layène, Village traditionnel de Yoff, Commune de Yoff",
      `${VILLAGE}, Commune de Yoff, Arrondissement des Almadies`,
    ]);
    await choix.selectOption({ label: "Layène, Village traditionnel de Yoff, Commune de Yoff" });
    await tiroir.getByRole("button", { name: "Enregistrer la réalisation" }).click();
    await expect(page.getByText("Réalisation enregistrée.").first()).toBeVisible();
    await expect(page.getByText("Layène, Village traditionnel de Yoff").first()).toBeVisible();

    await ouvrirPageProjet(page, "Pilotage", "Saisie");
    await page.getByLabel(/^Valeur/).fill("7");
    await page.getByLabel(/^Localité/).selectOption({ label: "Layène, Village traditionnel de Yoff, Commune de Yoff" });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText(/Valeur enregistrée/).first()).toBeVisible();
    const historique = page.getByRole("table");
    await expect(historique.getByRole("columnheader", { name: "Localité" })).toBeVisible();
    await expect(historique).toContainText("Layène, Village traditionnel de Yoff");

    // L'usage par zone : une saisie et une réalisation à Layène.
    await ouvrirPageProjet(page, "Planification", "Zones");
    const layene = page.getByRole("heading", { level: 2, name: "Layène" }).locator("xpath=ancestor::li[1]");
    await expect(layene).toContainText("1 saisie · 1 réalisation");

    // Retirer la zone laisse la réalisation et la saisie rattachées.
    await page.getByRole("button", { name: "Actions pour la zone Layène" }).click();
    await page.getByRole("menuitem", { name: "Retirer des zones" }).click();
    await expect(page.getByRole("dialog").getByText(/gardent/)).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Retirer" }).click();
    await expect(page.getByText("Zone retirée.").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Layène" })).toHaveCount(0);
    await ouvrirPageProjet(page, "Mise en œuvre", "Réalisations");
    await expect(page.getByText("Layène, Village traditionnel de Yoff").first()).toBeVisible();
    await contexte.close();
  });

  test("éditeur : gérer les localités de l'organisation, suppression refusée tant qu'une zone s'en sert", async ({
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
    await expect(page.getByText(/vous pouvez les utiliser, pas les modifier/)).toBeVisible();
    // Le référentiel (12 localités de Yoff) plus celle de l'organisation ; seule celle-ci a un menu d'actions.
    const village = page
      .getByRole("heading", { level: 2, name: new RegExp(`^${VILLAGE}`) })
      .locator("xpath=ancestor::li[1]");
    await expect(village).toContainText("Votre organisation");
    await expect(village).toContainText("14,7700 N, 17,4700 O");
    await expect(village).toContainText("Source : Relevé de test E2E");
    await expect(page.getByRole("button", { name: /^Actions pour la localité/ })).toHaveCount(1);
    await page.getByLabel("Rechercher une localité").fill("tonghor");
    await expect(page.getByRole("heading", { level: 2, name: /^Tonghor/ })).toBeVisible();
    await expect(
      page.getByText("Village traditionnel de Yoff, Commune de Yoff, Arrondissement des Almadies"),
    ).toBeVisible();
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

    // Elle est encore une zone du projet : la suppression est refusée, et le dit.
    await page.getByRole("button", { name: `Actions pour la localité ${VILLAGE} renommé` }).click();
    await page.getByRole("menuitem", { name: "Supprimer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
    await expect(page.getByText(/utilisé ailleurs/).first()).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Annuler" }).click();

    // Une fois retirée des zones, elle se supprime.
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
    await expect(page.getByText("Localité supprimée.").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: new RegExp(VILLAGE) })).toHaveCount(0);
    await contexte.close();
  });

  test("lecteur : tout se consulte, rien ne s'écrit", async ({ browser }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    const { contexte, page } = await ouvrirSession(browser, "lecteur");
    await ouvrirProjet(page);
    await ouvrirPageProjet(page, "Planification", "Zones");
    await expect(page.getByRole("heading", { level: 2, name: "Commune de Yoff" })).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon[title="Commune de Yoff"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajouter une zone" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Créer une localité" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Actions pour la zone/ })).toHaveCount(0);
    await expect(page.getByText(/Votre rôle est en lecture seule/)).toBeVisible();
    await page.goto("/app/localites");
    await expect(page.getByRole("heading", { level: 2, name: /^Commune de Yoff/ })).toBeVisible();
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

      const lecture = await lecteur.lire<{ id: string; org_id: string | null }[]>("localites?select=id,org_id");
      expect(lecture.filter((l) => l.org_id === null)).toHaveLength(12);

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
      const yoff = (
        await editeur.lire<{ id: string; nom: string }[]>("localites?select=id,nom&nom=eq.Commune%20de%20Yoff")
      )[0]!;
      const modification = await editeur.ecrire("patch", `localites?id=eq.${yoff.id}`, { nom: "Piraté" });
      expect(await modification.json(), "aucune ligne du référentiel n'est modifiée").toEqual([]);
      const suppression = await editeur.ecrire("delete", `localites?id=eq.${yoff.id}`);
      expect(await suppression.json(), "aucune ligne du référentiel n'est supprimée").toEqual([]);
      expect((await editeur.lire<{ nom: string }[]>(`localites?select=nom&id=eq.${yoff.id}`))[0]!.nom).toBe(
        "Commune de Yoff",
      );

      // Niveau et parent d'une localité ne changent plus.
      const creation = await editeur.ecrire("post", "localites", { org_id: orgId, niveau: "village", nom: "Fixe E2E" });
      expect(creation.ok(), await creation.text()).toBe(true);
      const id = ((await creation.json()) as { id: string }[])[0]!.id;
      expect(
        (await editeur.ecrire("patch", `localites?id=eq.${id}`, { niveau: "region" })).status(),
        "niveau figé",
      ).toBe(403);
      expect(
        (await editeur.ecrire("patch", `localites?id=eq.${id}`, { parent_id: yoff.id })).status(),
        "parent figé",
      ).toBe(403);
      // Un enfant n'est pas de niveau supérieur à son parent.
      const incoherent = await editeur.ecrire("post", "localites", {
        org_id: orgId,
        parent_id: yoff.id,
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
    } finally {
      await request.dispose();
    }
  });
});
