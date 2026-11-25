// Parcours authentifié, contre le build servi (npm run apercu) et le vrai Supabase.
// Exige des comptes de test (E2E_*_EMAIL / E2E_*_MDP dans .env.e2e, voir e2e/README.md) : sans eux, tout est ignoré.
// Phase 1 (par défaut) : parcours complet, limites de plan, invitation, rôles, temps réel.
// Phase 2 (E2E_PHASE=2, après avoir terminé l'essai de l'organisation de test) : lecture seule et export PDF.

import { expect, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { COMPTES, connecter, ouvrirSession, PHASE } from "./aide";

const NOM_PROJET = "Projet E2E — accès à l’eau";

test.skip(!COMPTES.admin.email || !COMPTES.admin.mdp, "comptes de test absents (.env.e2e)");
test.describe.configure({ mode: "serial" });

async function ouvrirProjet(page: Page, onglet?: "Indicateurs" | "Saisie" | "Import" | "Rapports") {
  await page.goto("/app");
  await page
    .getByRole("link", { name: new RegExp(NOM_PROJET) })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: NOM_PROJET })).toBeVisible();
  if (onglet)
    await page.getByRole("navigation", { name: "Sections du projet" }).getByRole("link", { name: onglet }).click();
}

const lire = (page: Page) => page.locator("main, #contenu").first();

test.describe("parcours complet de l'administrateur", () => {
  test.skip(({ isMobile }) => isMobile || PHASE !== "1");
  let debut = 0;
  test.setTimeout(150_000);

  // Chaque test a son propre navigateur vierge : on se reconnecte (sauf le premier, dont la connexion fait partie du parcours).
  test.beforeEach(async ({ page }, info) => {
    if (!info.title.startsWith("connexion")) await connecter(page, "admin");
  });

  test("connexion, projet, trois indicateurs, six saisies et tableau de bord en moins de 5 minutes", async ({
    page,
  }) => {
    debut = Date.now();
    await connecter(page, "admin");
    await expect(page.getByRole("heading", { level: 1, name: "Projets" })).toBeVisible();

    // Projet
    await page.getByRole("button", { name: "Nouveau projet" }).first().click();
    await page.getByLabel("Nom du projet").fill(NOM_PROJET);
    await page.getByLabel("Date de début").fill("2026-01-01");
    await page.getByLabel("Date de fin").fill("2026-12-31");
    await page.getByRole("button", { name: "Créer le projet" }).click();
    await expect(page.getByText(`Projet « ${NOM_PROJET} » créé.`)).toBeVisible();
    await page
      .getByRole("link", { name: new RegExp(NOM_PROJET) })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: NOM_PROJET })).toBeVisible();

    // Trois indicateurs
    await page
      .getByRole("navigation", { name: "Sections du projet" })
      .getByRole("link", { name: "Indicateurs" })
      .click();
    const creer = async (
      nom: string,
      cible: string,
      unite: string,
      options: { base?: string; agregation?: string; sens?: string } = {},
    ) => {
      await page.getByRole("button", { name: "Nouvel indicateur" }).first().click();
      await page.getByLabel("Nom de l’indicateur").fill(nom);
      await page.getByLabel("Cible", { exact: true }).fill(cible);
      if (options.base) await page.getByLabel("Valeur de base").fill(options.base);
      await page.getByLabel("Unité").fill(unite);
      if (options.agregation) await page.getByLabel("Mode de calcul").selectOption({ label: options.agregation });
      if (options.sens) await page.getByLabel("Sens de l’objectif").selectOption({ label: options.sens });
      await page.getByRole("button", { name: "Créer l’indicateur" }).click();
      await expect(page.getByText(`Indicateur « ${nom} » créé.`)).toBeVisible();
    };
    await creer("Forages réhabilités", "40", "forages");
    await creer("Ménages avec accès à l’eau", "80", "%", { base: "35", agregation: "Dernière valeur" });
    await creer("Délai de réparation", "3", "jours", { base: "12", agregation: "Moyenne", sens: "À diminuer" });

    // Six saisies
    await page.getByRole("navigation", { name: "Sections du projet" }).getByRole("link", { name: "Saisie" }).click();
    const saisir = async (indicateur: string, date: string, valeur: string, commentaire?: string) => {
      await page.getByLabel("Indicateur", { exact: true }).selectOption({ label: indicateur });
      await page.getByLabel("Date", { exact: true }).fill(date);
      await page.getByLabel(/^Valeur/).fill(valeur);
      if (commentaire) await page.getByLabel("Commentaire").fill(commentaire);
      await page.getByLabel(/^Valeur/).press("Enter");
      // Le formulaire se vide une fois la saisie enregistrée : on n'enchaîne pas avant (sinon la suivante serait effacée).
      await expect(page.getByLabel(/^Valeur/)).toHaveValue("");
    };
    await saisir("Forages réhabilités", "2026-01-31", "3");
    await saisir("Forages réhabilités", "2026-02-28", "4", "Premier lot terminé");
    await saisir("Forages réhabilités", "2026-03-31", "5");
    await saisir("Ménages avec accès à l’eau", "2026-03-31", "41");
    await saisir("Ménages avec accès à l’eau", "2026-06-30", "52");
    await saisir("Délai de réparation", "2026-05-31", "9");

    // Tableau de bord : valeurs, statuts en toutes lettres, écart
    await page
      .getByRole("navigation", { name: "Sections du projet" })
      .getByRole("link", { name: "Tableau de bord" })
      .click();
    const cartes = page.locator("article");
    await expect(cartes).toHaveCount(3);
    await expect(cartes.filter({ hasText: "Forages réhabilités" })).toContainText("12");
    await expect(cartes.filter({ hasText: "Forages réhabilités" })).toContainText("forages");
    await expect(cartes.filter({ hasText: "Ménages avec accès" })).toContainText("52");
    await expect(cartes.filter({ hasText: "Délai de réparation" })).toContainText("9");
    for (const carte of await cartes.all())
      await expect(carte.getByText(/Sur la trajectoire|Vigilance|En retard|Aucune donnée/).first()).toBeVisible();

    const secondes = (Date.now() - debut) / 1000;
    console.log(`Parcours (connexion → tableau de bord) : ${Math.round(secondes)} s`);
    expect(secondes, "moins de 5 minutes").toBeLessThan(300);
  });

  test("export PDF : un vrai fichier, nommé d'après le projet et la période", async ({ page }) => {
    await ouvrirProjet(page);
    const [telechargement] = await Promise.all([
      page.waitForEvent("download", { timeout: 90_000 }),
      page.getByRole("button", { name: "Exporter en PDF" }).click(),
    ]);
    expect(telechargement.suggestedFilename()).toMatch(/^Projet-E2E-acces-a-l-eau_2026-01-01_\d{4}-\d{2}-\d{2}\.pdf$/);
    const chemin = await telechargement.path();
    const octets = readFileSync(chemin!);
    expect(octets.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(octets.length).toBeGreaterThan(10_000);
    // Le contenu textuel est présent dans le PDF (flux compressés : on vérifie au moins les métadonnées).
    expect(octets.toString("latin1")).toContain("Pilot M&E");
  });

  test("import CSV : aperçu, vérification ligne par ligne, remplacement et rapport d'erreurs", async ({ page }) => {
    await ouvrirProjet(page, "Import");
    const csv = [
      "Indicateur;Date;Valeur;Commentaire",
      "Forages réhabilités;30/04/2026;6;Import Excel",
      "Forages réhabilités;31/03/2026;9;Valeur corrigée",
      "Inconnu;30/04/2026;1;",
      "Forages réhabilités;31/04/2026;2;",
    ].join("\n");
    await page
      .getByLabel("Fichier CSV ou Excel à importer")
      .setInputFiles({ name: "saisies.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await expect(page.getByRole("heading", { name: "Associez les colonnes du fichier" })).toBeVisible();
    await page.getByRole("button", { name: /Vérifier le fichier/ }).click();
    const tuile = (nom: string) => page.getByText(nom, { exact: true }).locator("xpath=..").getByText(/^\d+$/);
    await expect(tuile("Lignes lues")).toHaveText("4");
    await expect(tuile("Prêtes à importer")).toHaveText("2");
    await expect(tuile("Rejetées")).toHaveText("2");
    await expect(tuile("Dates déjà saisies")).toHaveText("1");
    await expect(page.getByText("Cet indicateur n’existe pas dans ce projet.")).toBeVisible();
    await expect(page.getByText("Cette date n’existe pas dans le calendrier.")).toBeVisible();
    const [rapport] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Télécharger le rapport d’erreurs" }).click(),
    ]);
    expect(readFileSync((await rapport.path())!, "utf8")).toContain("Cet indicateur n’existe pas dans ce projet.");
    await page.getByLabel(/Remplacer les valeurs existantes/).check();
    await page.getByRole("button", { name: "Importer 2 lignes" }).click();
    await expect(page.getByRole("heading", { name: "Import terminé" })).toBeVisible({ timeout: 30_000 });
    // Résumé : 1 insérée, 1 remplacée, 2 rejetées.
    const resume = (nom: string) => page.getByText(nom, { exact: true }).locator("xpath=..").getByText(/^\d+$/);
    await expect(resume("Importées")).toHaveText("1");
    await expect(resume("Remplacées")).toHaveText("1");
    await expect(resume("Rejetées")).toHaveText("2");
    // Le tableau de bord reflète l'import : 3 + 4 + 9 (remplace 5) + 6 = 22.
    await page.getByRole("link", { name: "Voir le tableau de bord" }).click();
    await expect(page.locator("article").filter({ hasText: "Forages réhabilités" })).toContainText("22");
  });

  test("les limites du plan sont refusées par la base et présentées avec un message d'upgrade", async ({ page }) => {
    await page.goto("/app");
    for (const nom of ["Projet E2E 2", "Projet E2E 3"]) {
      await page.getByRole("button", { name: "Nouveau projet" }).first().click();
      await page.getByLabel("Nom du projet").fill(nom);
      await page.getByLabel("Date de début").fill("2026-01-01");
      await page.getByLabel("Date de fin").fill("2026-12-31");
      await page.getByRole("button", { name: "Créer le projet" }).click();
      await expect(page.getByText(`Projet « ${nom} » créé.`).first()).toBeVisible();
      // On attend la fermeture du formulaire avant de rouvrir le suivant : sinon le nouveau nom est saisi dans le
      // formulaire qui se ferme encore, et le projet précédent peut être créé deux fois (course constatée au 2d).
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Nouveau projet" }).first().click();
    await page.getByLabel("Nom du projet").fill("Projet E2E 4");
    await page.getByLabel("Date de début").fill("2026-01-01");
    await page.getByLabel("Date de fin").fill("2026-12-31");
    await page.getByRole("button", { name: "Créer le projet" }).click();
    const dialogue = page.getByRole("dialog", { name: "Limite de votre plan atteinte" });
    await expect(dialogue).toBeVisible();
    await expect(dialogue).toContainText("3 projet");
    await expect(dialogue.getByText(/passez à un plan supérieur/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Projet E2E 4")).toHaveCount(0);
  });

  test("invitation par lien : lien affiché, page « Rejoindre », et quota d'utilisateurs", async ({ page, browser }) => {
    await page.goto("/app/equipe");
    const inviter = async (email: string) => {
      await page.getByLabel("Adresse e-mail").fill(email);
      await page.getByLabel("Rôle", { exact: true }).selectOption({ label: "Lecteur" });
      await page.getByRole("button", { name: "Inviter", exact: true }).click();
    };
    await inviter("e2e-invite1@exemple.invalid");
    await expect(
      page.getByText(/L’envoi d’e-mails n’est pas encore configuré|Un e-mail d’invitation vient d’être envoyé/),
    ).toBeVisible({ timeout: 30_000 });
    const lien = await page.getByLabel("Lien d’invitation").inputValue();
    expect(lien).toMatch(/\/inscription\?invitation=[\w-]{20,}$/);
    await expect(page.getByRole("button", { name: "Copier le lien" })).toBeVisible();

    // Un visiteur ouvre le lien : il rejoint l'organisation, il n'en crée pas une.
    const visiteur = await browser.newContext({ baseURL: "http://localhost:4173" });
    const pageVisiteur = await visiteur.newPage();
    await pageVisiteur.goto(new URL(lien).pathname + new URL(lien).search);
    await expect(pageVisiteur.getByRole("heading", { name: "Rejoindre Organisation E2E (test)" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(pageVisiteur.getByLabel("Nom de votre organisation")).toHaveCount(0);
    await visiteur.close();

    // 3 membres + 1 invitation en attente = 4 sur 5 : une de plus passe, la suivante est refusée.
    await inviter("e2e-invite2@exemple.invalid");
    // Le quota (5 utilisateurs, invitations en attente comprises) est atteint : l'interface le dit clairement et ne propose plus d'inviter.
    await expect(
      page.getByText(
        "Le quota d’utilisateurs de votre plan est atteint : révoquez une invitation ou passez à un plan supérieur.",
      ),
    ).toBeVisible({ timeout: 30_000 });
    // Insister : la base refuse (PLAN_LIMIT:users) et l'interface présente le message d'upgrade.
    await inviter("e2e-invite3@exemple.invalid");
    await expect(page.getByRole("dialog", { name: "Limite de votre plan atteinte" })).toBeVisible({ timeout: 30_000 });
  });

  test("temps réel : une saisie faite par l'éditeur apparaît chez l'administrateur sans rechargement", async ({
    page,
    browser,
  }) => {
    await ouvrirProjet(page);
    const carte = page.locator("article").filter({ hasText: "Forages réhabilités" });
    await expect(carte).toContainText("22");
    const marque = await page.evaluate(
      () =>
        (window as unknown as { __marque?: string }).__marque ??
        ((window as unknown as { __marque: string }).__marque = "meme-page"),
    );

    const { contexte, page: pageEditeur } = await ouvrirSession(browser, "editeur");
    await ouvrirProjet(pageEditeur, "Saisie");
    await pageEditeur.getByLabel("Indicateur", { exact: true }).selectOption({ label: "Forages réhabilités" });
    await pageEditeur.getByLabel("Date", { exact: true }).fill("2026-05-31");
    await pageEditeur.getByLabel(/^Valeur/).fill("8");
    await pageEditeur.getByLabel(/^Valeur/).press("Enter");
    await expect(pageEditeur.getByLabel(/^Valeur/)).toHaveValue("");

    // 22 + 8 = 30, mis à jour par le temps réel (la page n'est pas rechargée).
    await expect(carte).toContainText("30", { timeout: 20_000 });
    expect(await page.evaluate(() => (window as unknown as { __marque?: string }).__marque)).toBe(marque);
    await contexte.close();
  });
});

test.describe("rôles", () => {
  test.skip(({ isMobile }) => isMobile || PHASE !== "1" || !COMPTES.lecteur.email);

  test("le lecteur consulte mais ne peut rien modifier", async ({ browser }) => {
    const { contexte, page } = await ouvrirSession(browser, "lecteur");
    await expect(page.getByText("Vous consultez les projets en lecture seule.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Nouveau projet" })).toHaveCount(0);
    await ouvrirProjet(page, "Indicateurs");
    await expect(page.getByRole("button", { name: "Nouvel indicateur" })).toHaveCount(0);
    await page.getByRole("navigation", { name: "Sections du projet" }).getByRole("link", { name: "Saisie" }).click();
    await expect(page.getByText("Vous consultez les saisies en lecture seule.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer", exact: true })).toHaveCount(0);
    await page.getByRole("navigation", { name: "Sections du projet" }).getByRole("link", { name: "Import" }).click();
    await expect(
      page.getByText("Seuls les administrateurs et les éditeurs peuvent importer des saisies."),
    ).toBeVisible();
    await page.goto("/app/equipe");
    await expect(
      page.getByText("Seuls les administrateurs peuvent inviter des personnes et modifier les rôles."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Inviter", exact: true })).toHaveCount(0);
    // L'export PDF reste ouvert au lecteur.
    await ouvrirProjet(page, "Rapports");
    await expect(page.getByRole("button", { name: "Générer le PDF" })).toBeEnabled();
    await contexte.close();
  });

  test("l'éditeur saisit et importe, mais ne gère ni l'équipe ni la suppression des projets", async ({ browser }) => {
    const { contexte, page } = await ouvrirSession(browser, "editeur");
    await expect(page.getByRole("button", { name: "Nouveau projet" }).first()).toBeVisible();
    await ouvrirProjet(page, "Saisie");
    await expect(page.getByRole("button", { name: "Enregistrer", exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Sections du projet" }).getByRole("link", { name: "Import" }).click();
    await expect(page.getByLabel("Fichier CSV ou Excel à importer")).toBeAttached();
    await page.goto("/app/equipe");
    await expect(
      page.getByText("Seuls les administrateurs peuvent inviter des personnes et modifier les rôles."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Inviter", exact: true })).toHaveCount(0);
    await page.goto("/app");
    await expect(page.getByRole("button", { name: /^Actions pour/ })).toHaveCount(0); // pas de menu de suppression
    await contexte.close();
  });

  test("l'administrateur voit tout : équipe, invitations et suppression", async ({ browser }) => {
    const { contexte, page } = await ouvrirSession(browser, "admin");
    await page.goto("/app/equipe");
    await expect(page.getByRole("button", { name: "Inviter", exact: true })).toBeVisible();
    // Le texte figure deux fois quand une invitation attend (le titre de la liste et la ligne de quota,
    // « …, invitations en attente comprises ») : on désigne le premier.
    await expect(page.getByText("Invitations en attente").first()).toBeVisible();
    await page.goto("/app");
    await expect(page.getByRole("button", { name: /^Actions pour/ }).first()).toBeVisible();
    await contexte.close();
  });
});

test.describe("mobile 375 px", () => {
  test.skip(({ isMobile }) => !isMobile || PHASE !== "1");

  test("le tableau de bord, la saisie et l'import tiennent dans l'écran, sans débordement", async ({ page }) => {
    await connecter(page, "admin");
    await ouvrirProjet(page);
    await expect(page.locator("article").first()).toBeVisible(); // état chargé, pas le squelette
    for (const onglet of [undefined, "Saisie", "Import", "Rapports"] as const) {
      if (onglet)
        await page.getByRole("navigation", { name: "Sections du projet" }).getByRole("link", { name: onglet }).click();
      await page.waitForTimeout(800);
      const { debordement, coupables } = await page.evaluate(() => {
        const racine = document.documentElement;
        const coupables = [...document.querySelectorAll("body *")]
          .filter((e) => {
            const b = e.getBoundingClientRect();
            return (
              b.width > 0 &&
              b.right > racine.clientWidth + 1 &&
              !e.closest("svg") &&
              !e.closest("nav") &&
              getComputedStyle(e).position !== "fixed"
            );
          })
          .slice(0, 6)
          .map(
            (e) => `${e.tagName}.${String(e.className).slice(0, 60)} → ${Math.round(e.getBoundingClientRect().right)}`,
          );
        return { debordement: racine.scrollWidth - racine.clientWidth, coupables };
      });
      expect(debordement, `onglet ${onglet ?? "tableau de bord"} : ${coupables.join(" | ")}`).toBe(0);
    }
  });
});

test.describe("préférence de mouvement réduit dans l'application", () => {
  test.skip(({ isMobile }) => isMobile || PHASE !== "1");
  test.use({ reducedMotion: "reduce" });

  test("le tableau de bord est complet et lisible", async ({ page }) => {
    await connecter(page, "admin");
    await ouvrirProjet(page);
    await expect(page.locator("article").first()).toBeVisible();
    const masques = await page.evaluate(
      () =>
        [...document.querySelectorAll("article, h1, h2, h3")].filter((e) => getComputedStyle(e).opacity === "0").length,
    );
    expect(masques).toBe(0);
  });
});

test.describe("fin d'essai (phase 2)", () => {
  test.skip(({ isMobile }) => isMobile || PHASE !== "2");

  test("l'administrateur passe en lecture seule : données consultables, écriture refusée, export PDF toujours disponible", async ({
    page,
  }) => {
    await connecter(page, "admin");
    await expect(page.getByText(/Votre essai est terminé/).first()).toBeVisible();
    await ouvrirProjet(page, "Saisie");
    await expect(
      page.getByText("L’essai est terminé : les saisies restent consultables mais ne sont plus modifiables."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer", exact: true })).toHaveCount(0);
    await page.getByRole("navigation", { name: "Sections du projet" }).getByRole("link", { name: "Import" }).click();
    await expect(page.getByText(/l’import est désactivé/)).toBeVisible();
    await page.goto("/app");
    await expect(page.getByRole("button", { name: "Nouveau projet" })).toHaveCount(0);
    // Les données restent consultables…
    await ouvrirProjet(page);
    await expect(page.locator("article").filter({ hasText: "Forages réhabilités" })).toContainText("30");
    // …et exportables.
    const [pdf] = await Promise.all([
      page.waitForEvent("download", { timeout: 90_000 }),
      page.getByRole("button", { name: "Exporter en PDF" }).click(),
    ]);
    expect(
      readFileSync((await pdf.path())!)
        .subarray(0, 5)
        .toString("latin1"),
    ).toBe("%PDF-");
  });
});

void lire;
