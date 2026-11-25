// Rapport PDF consolidé d'un programme (Lot 3e), contre le build servi (npm run apercu) et le vrai Supabase : la page d'un
// programme avec deux projets (l'un avec un indicateur, une saisie et un budget dépensé, l'autre sans donnée), le
// téléchargement d'un vrai PDF par un administrateur et par un lecteur, et l'accessibilité de la page.
// Mêmes comptes de test que parcours.spec.ts (voir e2e/README.md). Il crée un programme et deux projets de test, qu'il
// supprime à la fin : il demande de la place pour deux projets dans le quota de trois de l'essai.

import { expect, type APIRequestContext, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { COMPTES, COMPTES_ABSENTS, connecter, debordement, ouvrirSession, PHASE, violations } from "./aide";

const PROGRAMME = "Programme E2E rapport";
const URL_SUPABASE = process.env.VITE_SUPABASE_URL;
const CLE = process.env.VITE_SUPABASE_ANON_KEY;
const ANNEE = new Date().getFullYear();
const JOUR = new Date().toISOString().slice(0, 10);

test.skip(COMPTES_ABSENTS || !URL_SUPABASE || !CLE, "comptes de test ou projet Supabase absents");
test.skip(PHASE !== "1");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

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
    ecrire: async (methode: "post" | "patch" | "delete", chemin: string, data?: unknown) => {
      const r = await request[methode](`${URL_SUPABASE}/rest/v1/${chemin}`, { headers: entetes, data });
      expect(r.ok(), `${methode} ${chemin} : ${await r.text()}`).toBe(true);
      return r;
    },
  };
}

let programmeId = "";
const projetsIds: string[] = [];
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
    const programme = await admin.ecrire("post", "programmes", {
      org_id: orgId,
      nom: PROGRAMME,
      description: "Programme de test du rapport.",
    });
    programmeId = ((await programme.json()) as { id: string }[])[0]!.id;
    for (const nom of ["Projet E2E programme A", "Projet E2E programme B"]) {
      const projet = await admin.ecrire("post", "projects", {
        org_id: orgId,
        nom,
        date_debut: `${ANNEE}-01-01`,
        date_fin: `${ANNEE + 1}-12-31`,
        programme_id: programmeId,
      });
      projetsIds.push(((await projet.json()) as { id: string }[])[0]!.id);
    }
    // Le projet A a un indicateur à moitié atteint, et la moitié de son budget dépensée ; le projet B n'a aucune donnée.
    const [a] = projetsIds;
    const kpi = await admin.ecrire("post", "kpis", {
      project_id: a,
      nom: "Indicateur A",
      unite: "unités",
      cible: 100,
      valeur_base: 0,
      frequence: "mensuelle",
      sens: "croissant",
      type_agregation: "dernier",
    });
    const kpiId = ((await kpi.json()) as { id: string }[])[0]!.id;
    await admin.ecrire("post", "kpi_entries", { kpi_id: kpiId, date: JOUR, valeur: 50 });
    const ligne = await admin.ecrire("post", "budget_lignes", {
      project_id: a,
      annee: ANNEE,
      poste: "Poste test",
      montant_prevu: 1_000_000,
    });
    const ligneId = ((await ligne.json()) as { id: string }[])[0]!.id;
    await admin.ecrire("post", "depenses", {
      project_id: a,
      budget_ligne_id: ligneId,
      date: JOUR,
      libelle: "Dépense test",
      montant: 500_000,
    });
  } finally {
    await request.dispose();
  }
});

test.afterAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  try {
    const admin = await ouvrirSessionApi(request, "admin");
    for (const id of projetsIds) await admin.ecrire("delete", `projects?id=eq.${id}`);
    if (programmeId) await admin.ecrire("delete", `programmes?id=eq.${programmeId}`);
  } finally {
    await request.dispose();
  }
});

test.describe("rapport PDF d'un programme", () => {
  test.skip(({ isMobile }) => isMobile);
  for (const role of ["admin", "lecteur"] as const) {
    test(`${role} : la page du programme et le téléchargement d'un vrai PDF`, async ({ browser }) => {
      test.skip(quotaPlein, "quota de projets plein : supprimer les projets de test (e2e/README.md)");
      const { contexte, page } = await ouvrirSession(browser, role);
      await page.goto(`/app/programmes/${programmeId}`);
      await expect(page.getByRole("heading", { level: 1, name: PROGRAMME })).toBeVisible();
      // La consolidation vient des vues SQL : un projet a 50 % de résultats et de financier, l'autre n'a rien.
      await expect(page.getByText("Financier").first()).toBeVisible();
      await expect(page.getByText("50 %").first()).toBeVisible();

      // La génération du PDF se fait dans le navigateur : sa durée dépend du poste (14 s à 35 s selon les passages).
      const bouton = page.getByRole("button", { name: "Rapport PDF du programme" });
      await expect(bouton).toBeVisible();
      const [telechargement] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), bouton.click()]);
      expect(telechargement.suggestedFilename()).toBe(`Programme_Programme-E2E-rapport_${JOUR}.pdf`);
      const contenu = readFileSync((await telechargement.path())!);
      expect(contenu.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(contenu.length).toBeGreaterThan(5_000);
      await expect(page.getByText(/Rapport téléchargé/).first()).toBeVisible();

      if (role === "admin") expect(await violations(page)).toEqual([]);
      await contexte.close();
    });
  }
});

test.describe("page d'un programme sur téléphone (375 px)", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("la page ne déborde pas de l'écran et le rapport reste proposé", async ({ page }) => {
    test.skip(quotaPlein, "quota de projets plein : supprimer les projets de test (e2e/README.md)");
    await connecter(page, "admin");
    await page.goto(`/app/programmes/${programmeId}`);
    await expect(page.getByRole("heading", { level: 1, name: PROGRAMME })).toBeVisible();
    await expect(page.getByText("50 %").first()).toBeVisible();
    await expect(page.locator("[aria-busy='true']")).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Rapport PDF du programme" })).toBeVisible();
    const { debordement: px, coupables } = await debordement(page);
    expect(px, `débordement de ${px} px (${coupables.join(" | ")})`).toBe(0);
  });
});
