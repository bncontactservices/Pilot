// Parcours acteurs et bénéficiaires (Lot 3c), contre le build servi (npm run apercu) et le vrai Supabase :
// l'annuaire d'acteurs de l'organisation, leur rôle dans un projet (dont la création d'un acteur depuis le projet),
// les effectifs de bénéficiaires par période, sexe et tranche d'âge, la lecture seule du lecteur et les refus de la base.
// Mêmes comptes de test que parcours.spec.ts (voir e2e/README.md). Il crée « Projet E2E acteurs » et deux acteurs, et
// les supprime à la fin : il demande une place libre dans le quota de trois projets de l'essai.

import { expect, type APIRequestContext, type Page, test } from "@playwright/test";
import { COMPTES, COMPTES_ABSENTS, connecter, ouvrirPageProjet, ouvrirSession, PHASE } from "./aide";

const NOM = "Projet E2E acteurs";
const ACTEUR_A = "Fondation E2E";
const ACTEUR_B = "Entreprise E2E";
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
  } finally {
    await request.dispose();
  }
});

// Les acteurs appartiennent à l'organisation, pas au projet : on les retire explicitement.
test.afterAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  try {
    const admin = await ouvrirSessionApi(request, "admin");
    if (projetId) await admin.ecrire("delete", `projects?id=eq.${projetId}`);
    for (const nom of [ACTEUR_A, ACTEUR_B]) await admin.ecrire("delete", `acteurs?nom=eq.${encodeURIComponent(nom)}`);
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

test.describe("acteurs et bénéficiaires", () => {
  test("éditeur : annuaire, acteurs du projet (dont création depuis le projet)", async ({ browser }) => {
    test.skip(quotaPlein, "quota de projets plein : supprimer les projets de test (e2e/README.md)");
    const { contexte, page } = await ouvrirSession(browser, "editeur");
    await page.goto("/app");
    await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "Acteurs" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Acteurs" })).toBeVisible();
    await expect(page.getByText("Aucun acteur dans l’annuaire")).toBeVisible();

    // Un premier acteur, dans l'annuaire.
    await page.getByRole("button", { name: "Ajouter un acteur" }).first().click();
    let tiroir = page.getByRole("dialog");
    await tiroir.getByLabel("Nom de l’acteur").fill(ACTEUR_A);
    await tiroir.getByLabel("Type", { exact: true }).selectOption({ label: "Bailleur" });
    await tiroir.getByLabel(/^Adresse e-mail/).fill("fondation@exemple.invalid");
    await tiroir.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText("Acteur ajouté.").first()).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Un doublon de nom (casse différente) est refusé en le disant ; une adresse mal formée aussi.
    await page.getByRole("button", { name: "Ajouter un acteur" }).first().click();
    tiroir = page.getByRole("dialog");
    await tiroir.getByLabel("Nom de l’acteur").fill(ACTEUR_A.toUpperCase());
    await tiroir.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText("Un acteur porte déjà ce nom dans l’annuaire.").first()).toBeVisible();
    await tiroir.getByLabel(/^Adresse e-mail/).fill("pas-un-email");
    await tiroir.getByRole("button", { name: "Ajouter" }).click();
    await expect(tiroir.getByText("Cette adresse e-mail n’est pas valide.")).toBeVisible();
    await tiroir.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Dans le projet : rattacher le premier acteur avec son rôle.
    await ouvrirProjet(page);
    await ouvrirPageProjet(page, "Planification", "Acteurs");
    await expect(page.getByText("Aucun acteur rattaché à ce projet")).toBeVisible();
    await page.getByRole("button", { name: "Rattacher un acteur" }).first().click();
    tiroir = page.getByRole("dialog");
    await tiroir.getByLabel("Acteur", { exact: true }).selectOption({ label: `${ACTEUR_A} - Bailleur` });
    await tiroir.getByLabel(/^Rôle dans le projet/).fill("Bailleur principal");
    await tiroir.getByRole("button", { name: "Rattacher" }).click();
    await expect(page.getByText("Acteur rattaché au projet.").first()).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Créer un acteur depuis le projet : le rôle s'ouvre aussitôt, l'acteur est présélectionné.
    await page.getByRole("button", { name: "Créer un acteur" }).first().click();
    tiroir = page.getByRole("dialog");
    await tiroir.getByLabel("Nom de l’acteur").fill(ACTEUR_B);
    await tiroir.getByLabel("Type", { exact: true }).selectOption({ label: "Prestataire" });
    await tiroir.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText("Acteur ajouté.").first()).toBeVisible();
    const role = page.getByRole("dialog", { name: "Rattacher un acteur au projet" });
    await expect(role.getByLabel("Acteur", { exact: true })).toHaveValue(/.+/);
    await role.getByLabel(/^Rôle dans le projet/).fill("Prestataire des travaux");
    await role.getByRole("button", { name: "Rattacher" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const liste = page.getByRole("heading", { level: 2 });
    await expect(liste.filter({ hasText: ACTEUR_A })).toBeVisible();
    await expect(liste.filter({ hasText: ACTEUR_B })).toBeVisible();
    await expect(page.getByText("2 acteurs dans ce projet")).toBeVisible();

    // L'annuaire dit maintenant dans quels projets chacun intervient.
    await page.goto("/app/acteurs");
    const carte = page.getByRole("heading", { level: 2, name: ACTEUR_A }).locator("xpath=ancestor::li[1]");
    await expect(carte).toContainText("Intervient dans 1 projet");
    await expect(carte).toContainText("Bailleur principal");
    // Seul un administrateur supprime un acteur.
    await page.getByRole("button", { name: `Actions pour l’acteur ${ACTEUR_A}` }).click();
    await expect(page.getByRole("menuitem", { name: "Modifier" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Supprimer" })).toHaveCount(0);
    await contexte.close();
  });

  test("éditeur : effectifs de bénéficiaires, synthèse, cumul et doublon", async ({ browser }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    const { contexte, page } = await ouvrirSession(browser, "editeur");
    await ouvrirProjet(page);
    await ouvrirPageProjet(page, "Mise en œuvre", "Bénéficiaires");
    await expect(page.getByText("Aucun effectif enregistré")).toBeVisible();
    await expect(page.getByText(/Aucune fiche nominative n’est enregistrée/)).toBeVisible();

    const saisir = async (sexe: string, effectif: string, debut = `${ANNEE}-01-01`, fin = `${ANNEE}-06-30`) => {
      await page.getByRole("button", { name: "Ajouter un effectif" }).first().click();
      const tiroir = page.getByRole("dialog");
      await tiroir.getByLabel("Début de la période").fill(debut);
      await tiroir.getByLabel("Fin de la période").fill(fin);
      await tiroir.getByLabel("Catégorie de bénéficiaires").fill("Usagers des points d’eau");
      await tiroir.getByLabel("Sexe", { exact: true }).selectOption({ label: sexe });
      await tiroir.getByLabel("Tranche d’âge", { exact: true }).selectOption({ label: "25 à 59 ans" });
      await tiroir.getByLabel(/^Effectif/).fill(effectif);
      await tiroir.getByRole("button", { name: "Ajouter" }).click();
      await expect(page.getByText("Effectif enregistré.").first()).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    };
    await saisir("Femmes", "1 800");
    await saisir("Hommes", "1 200");

    const synthese = page.getByRole("region", { name: "Synthèse des effectifs" });
    await expect(synthese).toContainText("Total de la période");
    await expect(synthese).toContainText(/3\s000/);
    await expect(synthese).toContainText("60 %"); // 1 800 / (1 800 + 1 200)
    const matrice = page.getByRole("table", { name: "Effectifs par tranche d’âge et par sexe." });
    await expect(matrice.getByRole("row", { name: /25 à 59 ans/ })).toContainText(/1\s800/);

    // La même combinaison ne se saisit qu'une fois : l'écran le dit.
    await page.getByRole("button", { name: "Ajouter un effectif" }).first().click();
    const doublon = page.getByRole("dialog");
    await doublon.getByLabel("Début de la période").fill(`${ANNEE}-01-01`);
    await doublon.getByLabel("Fin de la période").fill(`${ANNEE}-06-30`);
    await doublon.getByLabel("Catégorie de bénéficiaires").fill("USAGERS DES POINTS D’EAU");
    await doublon.getByLabel("Sexe", { exact: true }).selectOption({ label: "Femmes" });
    await doublon.getByLabel("Tranche d’âge", { exact: true }).selectOption({ label: "25 à 59 ans" });
    await doublon.getByLabel(/^Effectif/).fill("5");
    await doublon.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText(/Cet effectif existe déjà pour cette période/).first()).toBeVisible();
    await doublon.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Un second semestre : le cumul additionne les périodes et prévient qu'une personne peut y être comptée deux fois.
    await saisir("Femmes", "2 000", `${ANNEE}-07-01`, `${ANNEE}-12-31`);
    await page.getByLabel("Période").selectOption({ label: "Toutes les périodes (cumul)" });
    await expect(page.getByText(/une même personne peut y être comptée plusieurs fois/)).toBeVisible();
    await expect(synthese).toContainText("Cumul des effectifs");
    await expect(synthese).toContainText(/5\s000/); // 1 800 + 1 200 + 2 000
    await contexte.close();
  });

  test("lecteur : tout se consulte, rien ne s'écrit", async ({ browser }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    const { contexte, page } = await ouvrirSession(browser, "lecteur");
    await ouvrirProjet(page);
    await ouvrirPageProjet(page, "Planification", "Acteurs");
    await expect(page.getByRole("heading", { level: 2, name: ACTEUR_A })).toBeVisible();
    await expect(page.getByText("Votre rôle est en lecture seule")).toBeVisible();
    await expect(page.getByRole("button", { name: /Rattacher un acteur|Créer un acteur|Actions pour/ })).toHaveCount(0);
    await ouvrirPageProjet(page, "Mise en œuvre", "Bénéficiaires");
    await expect(page.getByRole("region", { name: "Synthèse des effectifs" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Ajouter un effectif|Actions pour/ })).toHaveCount(0);
    await contexte.close();
  });

  test("la base refuse un lecteur, un marquage « exemple », un effectif négatif et une période à l'envers ; seuls les admins suppriment un acteur", async ({
    request,
  }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    const admin = await ouvrirSessionApi(request, "admin");
    const editeur = await ouvrirSessionApi(request, "editeur");
    const lecteur = await ouvrirSessionApi(request, "lecteur");

    const refusLecteur = await lecteur.ecrire("post", "acteurs", { org_id: orgId, nom: "Intrus", type: "autre" });
    expect(refusLecteur.status()).toBe(403);
    expect(await refusLecteur.text()).toMatch(/42501|row-level security/);

    const forge = await editeur.ecrire("post", "acteurs", {
      org_id: orgId,
      nom: "Faux exemple",
      type: "autre",
      exemple: true,
    });
    expect(forge.status()).toBe(403);
    expect(await forge.text()).toContain("42501");

    for (const [champs, nom] of [
      [{ effectif: -1 }, "effectif négatif"],
      [{ periode_debut: `${ANNEE}-12-31`, periode_fin: `${ANNEE}-01-01` }, "période à l'envers"],
    ] as const) {
      const r = await editeur.ecrire("post", "beneficiaires_effectifs", {
        project_id: projetId,
        periode_debut: `${ANNEE}-01-01`,
        periode_fin: `${ANNEE}-06-30`,
        categorie: "Refusé",
        effectif: 1,
        ...champs,
      });
      expect(r.status(), nom).toBe(400);
      expect(await r.text(), nom).toContain("23514");
    }

    // L'éditeur ne supprime pas un acteur : la requête ne touche aucune ligne ; l'administrateur, si.
    const acteurs = await admin.lire<{ id: string; nom: string }[]>(
      `acteurs?select=id,nom&nom=eq.${encodeURIComponent(ACTEUR_B)}`,
    );
    expect(acteurs).toHaveLength(1);
    const tentative = await editeur.ecrire("delete", `acteurs?id=eq.${acteurs[0]!.id}`);
    expect(tentative.status() === 403 || (await tentative.json()).length === 0).toBe(true);
    expect(await admin.lire<unknown[]>(`acteurs?select=id&id=eq.${acteurs[0]!.id}`)).toHaveLength(1);
    const suppression = await admin.ecrire("delete", `acteurs?id=eq.${acteurs[0]!.id}`);
    expect(suppression.ok(), await suppression.text()).toBe(true);
    // Son rôle dans le projet est parti avec lui.
    expect(await admin.lire<unknown[]>(`projet_acteurs?select=id&project_id=eq.${projetId}`)).toHaveLength(1);
  });

  test("nettoyage : supprimer le projet retire ses rôles et ses effectifs, pas l'annuaire", async ({
    page,
    request,
  }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    await connecter(page, "admin");
    await page.goto("/app");
    await page.getByRole("button", { name: echapper(`Actions pour ${NOM}`) }).click();
    await page.getByRole("menuitem", { name: "Supprimer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer définitivement" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Projet « " + NOM + " » supprimé.").first()).toBeVisible();
    const admin = await ouvrirSessionApi(request, "admin");
    expect(await admin.lire<unknown[]>(`beneficiaires_effectifs?select=id&project_id=eq.${projetId}`)).toEqual([]);
    expect(await admin.lire<unknown[]>(`projet_acteurs?select=id&project_id=eq.${projetId}`)).toEqual([]);
    // L'acteur de l'annuaire reste : il appartient à l'organisation, pas au projet.
    expect(await admin.lire<unknown[]>(`acteurs?select=id&nom=eq.${encodeURIComponent(ACTEUR_A)}`)).toHaveLength(1);
    projetId = "";
  });
});
