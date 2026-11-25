// Saisie hors ligne (Lot 4a), contre le build servi et le vrai Supabase.
//
// - Ouverture sans réseau : le serveur de l'application est ARRÊTÉ et le navigateur est mis hors ligne ; l'application
//   s'ouvre depuis le cache du service worker, reprend la session gardée sur l'appareil (jeton volontairement périmé,
//   rafraîchissement impossible) et affiche les données gardées.
// - Saisie sans réseau, saisie qui survit à un rechargement, envoi au retour du réseau avec l'identifiant tiré sur
//   l'appareil (la ligne de la base porte le même identifiant).
// - Rejeu : la requête atteint la base mais la réponse est perdue ; l'appareil la renvoie ; la base ne contient qu'une ligne.
// - Conflit réel avec la valeur d'un autre, résolu en remplaçant.
// - Déconnexion bloquée tant que des saisies n'ont ni été envoyées ni été supprimées.
//
// Mêmes comptes de test que parcours.spec.ts (voir e2e/README.md). Il crée « Projet E2E hors ligne » (supprimé à la
// fin) : il demande une place libre dans le quota de trois projets de l'essai.

import { type ChildProcess, spawn } from "node:child_process";
import { expect, type APIRequestContext, type Page, test } from "@playwright/test";
import { COMPTES, COMPTES_ABSENTS, connecter, PHASE, violations } from "./aide";

const NOM = "Projet E2E hors ligne";
const INDICATEUR = "Points d’eau hors ligne E2E";
const URL_SUPABASE = process.env.VITE_SUPABASE_URL;
const CLE = process.env.VITE_SUPABASE_ANON_KEY;
const ANNEE = new Date().getFullYear();
const PORT_ISOLE = 4191;
const URL_ISOLEE = `http://localhost:${PORT_ISOLE}`;

test.skip(COMPTES_ABSENTS || !URL_SUPABASE || !CLE, "comptes de test ou projet Supabase absents");
test.skip(() => PHASE !== "1");
test.describe.configure({ mode: "serial" });
test.setTimeout(360_000);

/** Une date passée (AAAA-MM-JJ), `n` jours avant aujourd'hui. */
function jourMoins(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

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
let kpiId = "";
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
    const orgId = (await admin.lire<{ id: string }[]>("organisations?select=id"))[0]!.id;
    const creation = await admin.ecrire("post", "projects", {
      org_id: orgId,
      nom: NOM,
      date_debut: `${ANNEE}-01-01`,
      date_fin: `${ANNEE + 1}-12-31`,
    });
    expect(creation.ok(), await creation.text()).toBe(true);
    projetId = ((await creation.json()) as { id: string }[])[0]!.id;
    const kpi = await admin.ecrire("post", "kpis", {
      project_id: projetId,
      nom: INDICATEUR,
      unite: "points",
      cible: 100,
      valeur_base: 0,
      frequence: "mensuelle",
      sens: "croissant",
      type_agregation: "dernier",
    });
    expect(kpi.ok(), await kpi.text()).toBe(true);
    kpiId = ((await kpi.json()) as { id: string }[])[0]!.id;
  } finally {
    await request.dispose();
  }
});

// Supprimer le projet emporte ses indicateurs et leurs saisies (une seule instruction).
test.afterAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  try {
    const admin = await ouvrirSessionApi(request, "admin");
    if (projetId) await admin.ecrire("delete", `projects?id=eq.${projetId}`);
  } finally {
    await request.dispose();
  }
});

// --- Outils -------------------------------------------------------------------------------------------------

type EntreeFile = { id: string; statut: string; valeur: number; date: string; kpiId: string };

/** Les saisies gardées sur l'appareil (localStorage), telles que l'application les a écrites. */
const lireFile = (page: Page) =>
  page.evaluate(() =>
    Object.keys(localStorage)
      .filter((cle) => cle.startsWith("pilot.file.v1."))
      .map((cle) => JSON.parse(localStorage.getItem(cle)!)),
  ) as Promise<EntreeFile[]>;

/** Le contenu gardé pour l'ouverture sans réseau (IndexedDB), ou null. */
const lireCacheGarde = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ proprietaire: string; requetes: { cle: unknown[] }[] } | null>((resolve) => {
        const ouverture = indexedDB.open("pilot-hors-ligne");
        ouverture.onerror = () => resolve(null);
        ouverture.onsuccess = () => {
          const base = ouverture.result;
          if (!base.objectStoreNames.contains("cache")) {
            base.close();
            resolve(null);
            return;
          }
          const lecture = base.transaction("cache").objectStore("cache").get("requetes");
          lecture.onsuccess = () => {
            base.close();
            resolve(lecture.result ?? null);
          };
          lecture.onerror = () => {
            base.close();
            resolve(null);
          };
        };
      }),
  );

async function lignesDeLaBase(request: APIRequestContext, date?: string) {
  const admin = await ouvrirSessionApi(request, "admin");
  return admin.lire<{ id: string; valeur: number; date: string; created_by: string }[]>(
    `kpi_entries?select=id,valeur,date,created_by&kpi_id=eq.${kpiId}${date ? `&date=eq.${date}` : ""}&order=date`,
  );
}

async function ouvrirSaisie(page: Page) {
  await page.goto(`/app/projets/${projetId}/saisie`);
  await expect(page.getByRole("heading", { name: "Saisir une valeur" })).toBeVisible({ timeout: 30_000 });
}

async function saisir(page: Page, valeur: string, date: string) {
  await page.getByLabel("Date").fill(date);
  await page.getByLabel(/^Valeur/).fill(valeur);
  await page.getByRole("button", { name: "Enregistrer" }).click();
  // Une valeur qui s'écarte des précédentes demande confirmation (règle du Lot 1) : les séries de ce scénario s'y prêtent.
  const confirmer = page.getByRole("button", { name: "Confirmer et enregistrer" });
  if (await confirmer.isVisible({ timeout: 1000 }).catch(() => false)) await confirmer.click();
}

function demarrerServeur(port: number): ChildProcess {
  return spawn(process.execPath, ["scripts/apercu-build.mjs", String(port)], { stdio: "ignore" });
}

async function attendreServeur(url: string) {
  for (let i = 0; i < 50; i++) {
    if (
      await fetch(url).then(
        () => true,
        () => false,
      )
    )
      return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`serveur ${url} injoignable`);
}

// --- Les scénarios --------------------------------------------------------------------------------------------

test.describe("saisie hors ligne", () => {
  test.skip(({ isMobile }) => isMobile);

  test("ouverture sans réseau, saisie, rechargement, envoi au retour du réseau", async ({ browser, request }) => {
    test.skip(quotaPlein, "quota de projets plein : supprimer les projets de test (e2e/README.md)");
    const serveur = demarrerServeur(PORT_ISOLE);
    try {
      await attendreServeur(URL_ISOLEE);
      const contexte = await browser.newContext({ baseURL: URL_ISOLEE, locale: "fr-FR", timezoneId: "Africa/Dakar" });
      const page = await contexte.newPage();
      const erreursDePage: string[] = [];
      page.on("pageerror", (e) => erreursDePage.push(e.message));

      // 1. En ligne : connexion, ouverture de la page de saisie, puis le service worker et les données se gardent.
      await connecter(page, "editeur");
      await ouvrirSaisie(page);
      const precache = await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        for (let i = 0; i < 150; i++) {
          const noms = (await caches.keys()).filter((n) => /^pilot-[0-9a-f]{12}$/.test(n));
          const entrees = noms.length ? (await (await caches.open(noms[0]!)).keys()).length : 0;
          if (entrees >= 200) return entrees;
          await new Promise((r) => setTimeout(r, 200));
        }
        return 0;
      });
      expect(precache, "enveloppe de l'application préchargée par le service worker").toBeGreaterThanOrEqual(200);
      await expect
        .poll(
          async () => (await lireCacheGarde(page))?.requetes.some((r) => r.cle[0] === "kpis" && r.cle[1] === projetId),
          {
            message: "les indicateurs du projet sont gardés sur l'appareil",
            timeout: 20_000,
          },
        )
        .toBe(true);

      // 2. Plus de serveur, plus de réseau, et un jeton d'accès périmé : l'application doit s'ouvrir quand même.
      serveur.kill("SIGKILL");
      await contexte.setOffline(true);
      await page.evaluate(() => {
        const cle = Object.keys(localStorage).find((c) => /^sb-.*-auth-token$/.test(c))!;
        const session = JSON.parse(localStorage.getItem(cle)!);
        session.expires_at = 1;
        localStorage.setItem(cle, JSON.stringify(session));
      });
      await page.reload();
      await expect(page.getByRole("heading", { name: "Saisir une valeur" })).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveURL(new RegExp(`/app/projets/${projetId}/saisie$`));
      await expect(page.getByText(/Vous êtes hors ligne/)).toBeVisible();

      // 3. Une valeur saisie sans réseau reste sur l'appareil, et survit à un rechargement.
      const jour = jourMoins(0);
      await saisir(page, "7", jour);
      const carte = page.getByTestId("saisies-en-attente");
      await expect(carte).toBeVisible();
      await expect(carte).toContainText(INDICATEUR);
      await expect(carte).toContainText("7 points");
      expect(await violations(page), "accessibilité hors ligne (bandeau et carte d'attente)").toEqual([]);
      const avant = await lireFile(page);
      expect(avant).toHaveLength(1);
      expect(avant[0]).toMatchObject({ valeur: 7, date: jour, statut: "attente", kpiId });
      await page.reload();
      await expect(page.getByTestId("saisies-en-attente")).toContainText("7 points", { timeout: 30_000 });
      expect(await lireFile(page)).toEqual(avant);
      expect(await lignesDeLaBase(request), "rien n'est encore dans la base").toEqual([]);

      // 4. Le réseau revient : le jeton se renouvelle, la saisie part, avec l'identifiant tiré sur l'appareil.
      // supabase-js garde un renouvellement échoué pendant une minute, même après le retour du réseau : l'envoi peut
      // donc tarder jusqu'à ce délai (le bandeau dit alors « connexion instable »), jamais plus.
      await contexte.setOffline(false);
      await expect(page.getByTestId("saisies-en-attente")).toHaveCount(0, { timeout: 120_000 });
      await expect(page.getByText("1 saisie envoyée.").first()).toBeVisible();
      const lignes = await lignesDeLaBase(request);
      expect(lignes).toHaveLength(1);
      expect(lignes[0]).toMatchObject({ id: avant[0]!.id, valeur: 7, date: jour });
      expect(await lireFile(page)).toEqual([]);
      expect(erreursDePage, "aucune erreur JavaScript pendant tout le scénario").toEqual([]);
      await contexte.close();
    } finally {
      serveur.kill("SIGKILL");
    }
  });

  test("rejeu : la base a reçu la saisie mais la réponse s'est perdue", async ({ browser, request }) => {
    test.skip(quotaPlein, "quota de projets plein");
    const contexte = await browser.newContext({
      baseURL: "http://localhost:4173",
      locale: "fr-FR",
      timezoneId: "Africa/Dakar",
    });
    const page = await contexte.newPage();
    await connecter(page, "editeur");
    await ouvrirSaisie(page);
    const jour = jourMoins(1);

    // La première requête d'écriture atteint la base, puis sa réponse est coupée : l'appareil croit à un échec.
    // Le renvoi, lui, est retenu jusqu'à ce que le test l'autorise (sinon l'envoi automatique le ferait avant qu'on regarde).
    let coupees = 0;
    let autoriserRenvoi!: () => void;
    const renvoiAutorise = new Promise<void>((resolve) => (autoriserRenvoi = resolve));
    await page.route(/\/rest\/v1\/kpi_entries/, async (route) => {
      if (route.request().method() === "POST") {
        if (coupees === 0) {
          coupees += 1;
          await route.fetch();
          await route.abort("connectionreset");
          return;
        }
        await renvoiAutorise;
      }
      await route.continue();
    });
    await saisir(page, "8", jour);
    await expect(page.getByTestId("saisies-en-attente")).toContainText("8 points");
    expect(coupees).toBe(1);
    const [attente] = await lireFile(page);
    expect(attente).toMatchObject({ valeur: 8, date: jour, statut: "attente" });
    expect(
      (await lignesDeLaBase(request, jour)).map((l) => l.id),
      "la base a bien reçu la première requête",
    ).toEqual([attente!.id]);

    // Le renvoi se heurte à la ligne déjà là : c'est la sienne (même identifiant), pas un conflit.
    autoriserRenvoi();
    await expect(page.getByTestId("saisies-en-attente")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(/Une autre valeur existe déjà/)).toHaveCount(0);
    expect(await lignesDeLaBase(request, jour), "une seule ligne, aucun doublon").toEqual([
      expect.objectContaining({ id: attente!.id, valeur: 8 }),
    ]);
    expect(await lireFile(page)).toEqual([]);
    await contexte.close();
  });

  test("conflit réel avec la valeur d'un autre, résolu en remplaçant", async ({ browser, request }) => {
    test.skip(quotaPlein, "quota de projets plein");
    const contexte = await browser.newContext({
      baseURL: "http://localhost:4173",
      locale: "fr-FR",
      timezoneId: "Africa/Dakar",
    });
    const page = await contexte.newPage();
    await connecter(page, "editeur");
    await ouvrirSaisie(page);
    const jour = jourMoins(2);

    await contexte.setOffline(true);
    await saisir(page, "9", jour);
    await expect(page.getByTestId("saisies-en-attente")).toContainText("9 points");
    // Pendant ce temps, quelqu'un d'autre saisit une autre valeur à la même date.
    const admin = await ouvrirSessionApi(request, "admin");
    const creation = await admin.ecrire("post", "kpi_entries", { kpi_id: kpiId, date: jour, valeur: 50 });
    expect(creation.ok(), await creation.text()).toBe(true);

    await contexte.setOffline(false);
    const carte = page.getByTestId("saisies-en-attente");
    await expect(carte).toContainText("Une autre valeur existe déjà à cette date : 50 points", { timeout: 45_000 });
    // La valeur de l'autre est intacte : rien n'a été écrasé en silence.
    expect((await lignesDeLaBase(request, jour)).map((l) => l.valeur)).toEqual([50]);
    expect(await violations(page), "accessibilité d'un conflit").toEqual([]);

    await carte.getByRole("button", { name: "Remplacer par ma valeur" }).click();
    await expect(page.getByTestId("saisies-en-attente")).toHaveCount(0, { timeout: 30_000 });
    expect((await lignesDeLaBase(request, jour)).map((l) => l.valeur)).toEqual([9]);
    await contexte.close();
  });

  test("déconnexion : bloquée tant que des saisies attendent, puis envoyées ou supprimées explicitement", async ({
    browser,
    request,
  }) => {
    test.skip(quotaPlein, "quota de projets plein");
    const contexte = await browser.newContext({
      baseURL: "http://localhost:4173",
      locale: "fr-FR",
      timezoneId: "Africa/Dakar",
    });
    const page = await contexte.newPage();
    await connecter(page, "editeur");
    await ouvrirSaisie(page);

    await contexte.setOffline(true);
    await saisir(page, "10", jourMoins(3));
    await expect(page.getByTestId("saisies-en-attente")).toContainText("10 points");

    const seDeconnecter = async () => {
      await page
        .getByRole("button", { name: /Éditeur E2E/ })
        .first()
        .click();
      await page.getByRole("menuitem", { name: "Se déconnecter" }).click();
    };

    // Hors ligne : la déconnexion est bloquée, l'envoi impossible.
    await seDeconnecter();
    let dialogue = page.getByRole("dialog");
    await expect(dialogue).toContainText("Des saisies n’ont pas été envoyées");
    await expect(dialogue.getByRole("button", { name: "Envoyer maintenant" })).toBeDisabled();
    expect(await violations(page), "accessibilité de la fenêtre de déconnexion").toEqual([]);
    await dialogue.getByRole("button", { name: "Rester connecté" }).click();
    await expect(page).toHaveURL(/\/app\//);

    // Le réseau revient pendant que la fenêtre est ouverte : tout part, la déconnexion se propose.
    await seDeconnecter();
    await contexte.setOffline(false);
    dialogue = page.getByRole("dialog");
    await expect(dialogue).toContainText("Tout est envoyé", { timeout: 45_000 });
    expect((await lignesDeLaBase(request, jourMoins(3))).map((l) => l.valeur)).toEqual([10]);
    await dialogue.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/connexion/);
    // Plus rien du compte sur l'appareil : ni le contenu gardé, ni la session.
    await expect.poll(() => lireCacheGarde(page)).toBeNull();
    expect(await page.evaluate(() => Object.keys(localStorage).filter((c) => c.startsWith("sb-")))).toEqual([]);

    // Seconde sortie : suppression explicite des saisies non envoyées.
    await connecter(page, "editeur");
    await ouvrirSaisie(page);
    await contexte.setOffline(true);
    await saisir(page, "11", jourMoins(4));
    await expect(page.getByTestId("saisies-en-attente")).toContainText("11 points");
    await seDeconnecter();
    dialogue = page.getByRole("dialog");
    await dialogue.getByRole("button", { name: "Supprimer ces saisies et me déconnecter" }).click();
    await expect(dialogue).toContainText("sera supprimée de cet appareil");
    // La confirmation est nécessaire : rien n'est parti ni supprimé avant.
    expect(await lireFile(page)).toHaveLength(1);
    await dialogue.getByRole("button", { name: "Supprimer 1 saisie et me déconnecter" }).click();
    await expect(page).toHaveURL(/\/connexion/);
    expect(await lireFile(page)).toEqual([]);
    await contexte.setOffline(false);
    expect(await lignesDeLaBase(request, jourMoins(4)), "la saisie supprimée n'a jamais été envoyée").toEqual([]);
    await contexte.close();
  });
});

test.describe("saisie hors ligne sur téléphone", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("375 px : bandeau, saisie et carte d'attente sans débordement", async ({ page, context }) => {
    test.skip(quotaPlein, "quota de projets plein");
    await connecter(page, "editeur");
    await ouvrirSaisie(page);
    await context.setOffline(true);
    await expect(page.getByText(/Vous êtes hors ligne/)).toBeVisible();
    await saisir(page, "12", jourMoins(5));
    await expect(page.getByTestId("saisies-en-attente")).toContainText("12 points");
    const debordement = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(debordement, "aucun défilement horizontal à 375 px").toBeLessThanOrEqual(0);
    await context.setOffline(false);
    await expect(page.getByTestId("saisies-en-attente")).toHaveCount(0, { timeout: 45_000 });
  });
});
