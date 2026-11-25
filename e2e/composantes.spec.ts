// Parcours composantes et planning (Lot 3b), contre le build servi (npm run apercu) et le vrai Supabase : créer des
// composantes avec leurs dates, voir le diagramme de Gantt, rattacher des activités du plan de travail, lecture
// seule du lecteur, refus de la base, suppression d'une composante (ses activités restent).
// Mêmes comptes de test que parcours.spec.ts (voir e2e/README.md). Il crée « Projet E2E composantes » et le supprime à
// la fin : il demande une place libre dans le quota de trois projets de l'essai.

import { expect, type APIRequestContext, type Page, test } from "@playwright/test";
import { COMPTES, COMPTES_ABSENTS, ouvrirPageProjet, ouvrirSession, PHASE } from "./aide";

const NOM = "Projet E2E composantes";
const URL_SUPABASE = process.env.VITE_SUPABASE_URL;
const CLE = process.env.VITE_SUPABASE_ANON_KEY;
const ANNEE = new Date().getFullYear();

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
let autreProjetId = "";
let quotaPlein = false;

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  try {
    const admin = await ouvrirSessionApi(request, "admin");
    const existants = await admin.lire<{ id: string }[]>("projects?select=id&is_demo=eq.false");
    if (existants.length + 2 > 3) {
      quotaPlein = true;
      return;
    }
    const orgId = (await admin.lire<{ id: string }[]>("organisations?select=id"))[0]!.id;
    for (const [nom, cible] of [
      [NOM, "principal"],
      ["Projet secondaire E2E", "autre"],
    ] as const) {
      const creation = await admin.ecrire("post", "projects", {
        org_id: orgId,
        nom,
        date_debut: `${ANNEE}-01-01`,
        date_fin: `${ANNEE + 1}-12-31`,
      });
      expect(creation.ok(), await creation.text()).toBe(true);
      const id = ((await creation.json()) as { id: string }[])[0]!.id;
      if (cible === "principal") projetId = id;
      else autreProjetId = id;
    }
    // Deux activités du plan de travail, datées, dans le projet principal.
    for (const [intitule, debut, fin] of [
      ["Réhabilitation des forages", `${ANNEE}-02-01`, `${ANNEE}-05-31`],
      ["Formation des artisans", `${ANNEE}-04-01`, `${ANNEE}-06-30`],
    ] as const) {
      const activite = await admin.ecrire("post", "pta_activites", {
        project_id: projetId,
        annee: ANNEE,
        date_debut: debut,
        date_fin: fin,
        intitule,
      });
      expect(activite.ok(), await activite.text()).toBe(true);
    }
  } finally {
    await request.dispose();
  }
});

test.afterAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  try {
    const admin = await ouvrirSessionApi(request, "admin");
    for (const id of [projetId, autreProjetId]) if (id) await admin.ecrire("delete", `projects?id=eq.${id}`);
  } finally {
    await request.dispose();
  }
});

async function ouvrirComposantes(page: Page) {
  await page.goto("/app");
  await page
    .getByRole("link", { name: echapper(NOM) })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: NOM })).toBeVisible();
  await ouvrirPageProjet(page, "Planification", "Composantes");
  await expect(page.getByRole("heading", { level: 1, name: "Composantes et planning" })).toBeVisible();
}

test.describe("composantes d'un projet", () => {
  test("éditeur : créer des composantes, rattacher des activités, lire le planning", async ({ browser }) => {
    test.skip(quotaPlein, "quota de projets plein : supprimer les projets de test (e2e/README.md)");
    const { contexte, page } = await ouvrirSession(browser, "editeur");
    await ouvrirComposantes(page);
    await expect(page.getByText("Aucune composante pour ce projet")).toBeVisible();

    // Une composante datée, puis une sans dates.
    await page.getByRole("button", { name: "Ajouter une composante" }).first().click();
    let tiroir = page.getByRole("dialog");
    await tiroir.getByLabel("Nom de la composante").fill("Accès à l’eau potable");
    await tiroir.getByLabel(/^Responsable/).fill("Ingénieur hydraulicien");
    await tiroir.getByLabel(/^Début/).fill(`${ANNEE}-01-15`);
    await tiroir.getByLabel(/^Fin/).fill(`${ANNEE}-07-15`);
    await tiroir.getByLabel("Statut").selectOption({ label: "En cours" });
    await tiroir.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText("Composante ajoutée.").first()).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Ajouter une composante" }).first().click();
    tiroir = page.getByRole("dialog");
    await tiroir.getByLabel("Nom de la composante").fill("Plaidoyer");
    await tiroir.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText("Composante ajoutée.").first()).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Un doublon de nom est refusé en le disant ; une seule date aussi.
    await page.getByRole("button", { name: "Ajouter une composante" }).first().click();
    tiroir = page.getByRole("dialog");
    await tiroir.getByLabel("Nom de la composante").fill("accès à l’eau potable");
    await tiroir.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText("Une composante porte déjà ce nom dans ce projet.").first()).toBeVisible();
    await tiroir.getByLabel(/^Début/).fill(`${ANNEE}-03-01`);
    await tiroir.getByRole("button", { name: "Ajouter" }).click();
    await expect(tiroir.getByText("Indiquez les deux dates, ou aucune.")).toBeVisible();
    await tiroir.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Le planning dessine la composante datée et dit où est l'autre.
    await expect(page.getByRole("img", { name: /Planning de 1 composante datée/ })).toBeVisible();
    await expect(page.getByText(/Sans dates, absente du planning : Plaidoyer/)).toBeVisible();

    // Rattacher une activité depuis le plan de travail.
    await ouvrirPageProjet(page, "Planification", "Plan de travail");
    await page.getByRole("button", { name: "Liste" }).click();
    await page
      .getByRole("button", { name: /^Actions pour l’activité Réhabilitation des forages/ })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Modifier" }).click();
    const activite = page.getByRole("dialog");
    await activite.getByLabel(/^Composante/).selectOption({ label: "Accès à l’eau potable" });
    await activite.getByRole("button", { name: /^Enregistrer/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // La liste des composantes montre l'activité rattachée et son avancement.
    await ouvrirPageProjet(page, "Planification", "Composantes");
    await page.getByRole("button", { name: "Liste" }).click();
    const carte = page
      .getByRole("heading", { level: 2, name: "Accès à l’eau potable" })
      .locator("xpath=ancestor::li[1]");
    await expect(carte).toContainText("1 activité rattachée");
    await expect(carte).toContainText("Réhabilitation des forages");
    await expect(carte).toContainText("Ingénieur hydraulicien");
    await expect(page.getByRole("heading", { level: 2, name: "Activités sans composante" })).toBeVisible();
    await contexte.close();
  });

  test("lecteur : tout se consulte, rien ne s'écrit", async ({ browser }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    const { contexte, page } = await ouvrirSession(browser, "lecteur");
    await ouvrirComposantes(page);
    await expect(page.getByRole("img", { name: /Planning de 1 composante datée/ })).toBeVisible();
    await expect(page.getByText("Votre rôle est en lecture seule")).toBeVisible();
    await expect(page.getByRole("button", { name: /Ajouter une composante|Actions pour/ })).toHaveCount(0);
    await contexte.close();
  });

  test("la base refuse un lecteur, un rattachement à un autre projet et un doublon ; supprimer une composante garde ses activités", async ({
    request,
  }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    const admin = await ouvrirSessionApi(request, "admin");
    const lecteur = await ouvrirSessionApi(request, "lecteur");

    const refus = await lecteur.ecrire("post", "composantes", { project_id: projetId, nom: "Intrus" });
    expect(refus.status()).toBe(403);
    expect(await refus.text()).toMatch(/42501|row-level security/);

    // Une composante d'un autre projet ne peut pas recevoir une activité de celui-ci.
    const autre = await admin.ecrire("post", "composantes", {
      project_id: autreProjetId,
      nom: "Composante d'un autre projet",
    });
    expect(autre.ok(), await autre.text()).toBe(true);
    const autreId = ((await autre.json()) as { id: string }[])[0]!.id;
    const activites = await admin.lire<{ id: string; intitule: string }[]>(
      `pta_activites?select=id,intitule&project_id=eq.${projetId}`,
    );
    const mal = await admin.ecrire("patch", `pta_activites?id=eq.${activites[0]!.id}`, { composante_id: autreId });
    expect(mal.status()).toBe(400);
    expect(await mal.text()).toContain("RATTACHEMENT_INVALIDE");

    // Un nom existe une fois par projet, sans tenir compte de la casse.
    const doublon = await admin.ecrire("post", "composantes", { project_id: projetId, nom: "ACCÈS À L’EAU POTABLE" });
    expect(doublon.status()).toBe(409);
    expect(await doublon.text()).toContain("23505");

    // Supprimer la composante garde ses activités, détachées.
    const composante = (
      await admin.lire<{ id: string }[]>(
        `composantes?select=id&project_id=eq.${projetId}&nom=eq.${encodeURIComponent("Accès à l’eau potable")}`,
      )
    )[0]!;
    const suppression = await admin.ecrire("delete", `composantes?id=eq.${composante.id}`);
    expect(suppression.ok(), await suppression.text()).toBe(true);
    const restantes = await admin.lire<{ intitule: string; composante_id: string | null }[]>(
      `pta_activites?select=intitule,composante_id&project_id=eq.${projetId}`,
    );
    expect(restantes).toHaveLength(2);
    expect(restantes.every((a) => a.composante_id === null)).toBe(true);
  });
});
