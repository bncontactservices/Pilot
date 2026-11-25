// Parcours du cœur suivi-évaluation (Lot 2), contre le build servi (npm run apercu) et le vrai Supabase :
// un projet suivi de bout en bout, du cadre logique à l'état d'avancement, avec les trois rôles.
// Mêmes comptes de test que parcours.spec.ts (voir e2e/README.md). Sans eux, tout est ignoré.
//
// Le parcours crée « Projet E2E — suivi complet » et le supprime à la fin (avec ses fichiers) : il tient dans le quota de
// trois projets de l'essai tant que l'organisation de test n'en compte pas déjà trois. S'il n'y a pas de place, il le
// dit et s'arrête (supprimer les projets du parcours précédent, voir supabase/e2e/creer_comptes.sql).
// Phase 2 (E2E_PHASE=2) : après la fin d'essai, les écrans du cœur S&E sont en lecture seule.

import { expect, type Locator, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { COMPTES, COMPTES_ABSENTS, connecter, ouvrirPageProjet, ouvrirSession, PHASE } from "./aide";

const NOM = "Projet E2E — suivi complet";
const PROGRAMME = "Programme E2E (suivi)";

test.skip(COMPTES_ABSENTS, "comptes de test absents (.env.e2e)");
test.describe.configure({ mode: "serial" });

// --- Dates relatives à aujourd'hui : le projet a commencé il y a six mois et dure vingt-quatre mois, de sorte qu'un
// indicateur à peine entamé est toujours « en retard », quelle que soit la date d'exécution.
const iso = (d: Date) => d.toISOString().slice(0, 10);
const AUJOURDHUI = new Date();
const DEBUT = iso(new Date(Date.UTC(AUJOURDHUI.getUTCFullYear(), AUJOURDHUI.getUTCMonth() - 6, 1)));
const FIN = iso(new Date(Date.UTC(AUJOURDHUI.getUTCFullYear(), AUJOURDHUI.getUTCMonth() + 18, 28)));
const JOUR = iso(AUJOURDHUI);
// Une date de plus pour une seconde saisie du même indicateur (une date déjà saisie demande de choisir : remplacer ou garder).
const HIER = iso(new Date(AUJOURDHUI.getTime() - 24 * 3600 * 1000));
const DANS_UN_MOIS = iso(new Date(Date.UTC(AUJOURDHUI.getUTCFullYear(), AUJOURDHUI.getUTCMonth() + 1, 15)));

// Un PDF minimal mais valide : le stockage vérifie le type annoncé, pas le contenu.
const PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

let quotaPlein = false;

const echapper = (texte: string) => new RegExp(texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

async function ouvrirProjet(page: Page) {
  await page.goto("/app");
  await page
    .getByRole("link", { name: echapper(NOM) })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: NOM })).toBeVisible();
}

async function choisirOptionParDebut(select: Locator, debut: string) {
  const valeur = await select.locator("option").filter({ hasText: debut }).first().getAttribute("value");
  expect(valeur, `option commençant par « ${debut} »`).not.toBeNull();
  await select.selectOption(valeur!);
}

/** La ligne (carte) du cadre logique dont le code est exactement celui demandé. */
const ligneCadre = (page: Page, code: string) =>
  page.locator("li").filter({ has: page.locator("span", { hasText: new RegExp(`^${code.replace(/\./g, "\\.")}$`) }) });

const taux = (page: Page) => page.locator("dl").filter({ hasText: "Physique" }).first();

test.describe("parcours du cœur S&E (phase 1)", () => {
  test.skip(({ isMobile }) => isMobile || PHASE !== "1");
  test.setTimeout(180_000);

  // Chaque test a son navigateur vierge : on se reconnecte (sauf là où la connexion est ouverte par le test lui-même).
  test.beforeEach(async ({ page }, info) => {
    if (!info.title.startsWith("rôles") && !info.title.startsWith("lecteur") && !info.title.startsWith("éditeur")) {
      if (info.title.startsWith("création")) {
        await connecter(page, "admin");
        // « 0 projet sur 3 inclus dans le plan Essai » : les projets d'exemple ne comptent pas dans le quota.
        const compte = await page
          .getByText(/^\d+ projets?/)
          .first()
          .textContent();
        const reels = Number(/^(\d+)/.exec(compte ?? "")?.[1] ?? 0);
        quotaPlein = reels >= 3;
        test.skip(
          quotaPlein,
          `quota de projets plein (${reels} sur 3) : supprimer les projets de test, voir e2e/README.md`,
        );
      } else {
        test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
        await connecter(page, "admin");
      }
    }
  });

  test("création du projet, des indicateurs et du cadre logique complet", async ({ page }) => {
    // Projet
    await page.getByRole("button", { name: "Nouveau projet" }).first().click();
    await page.getByLabel("Nom du projet").fill(NOM);
    await page.getByLabel("Date de début").fill(DEBUT);
    await page.getByLabel("Date de fin").fill(FIN);
    await page.getByRole("button", { name: "Créer le projet" }).click();
    await expect(page.getByText(`Projet « ${NOM} » créé.`).first()).toBeVisible();
    await page
      .getByRole("link", { name: echapper(NOM) })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: NOM })).toBeVisible();

    // Navigation à deux niveaux : trois rubriques, les pages de la rubrique ouverte.
    const rubriques = page.getByRole("navigation", { name: "Rubriques du projet" });
    await expect(rubriques.getByRole("link")).toHaveText(["Pilotage", "Planification", "Mise en œuvre"]);
    await expect(rubriques.getByRole("link", { name: "Pilotage" })).toHaveAttribute("aria-current", "true");

    // Deux indicateurs
    await ouvrirPageProjet(page, "Pilotage", "Indicateurs");
    for (const [nom, cible, unite] of [
      ["Forages réhabilités", "40", "forages"],
      ["Ménages sensibilisés", "500", "ménages"],
    ]) {
      await page.getByRole("button", { name: "Nouvel indicateur" }).first().click();
      await page.getByLabel("Nom de l’indicateur").fill(nom!);
      await page.getByLabel("Cible", { exact: true }).fill(cible!);
      await page.getByLabel("Unité").fill(unite!);
      await page.getByRole("button", { name: "Créer l’indicateur" }).click();
      await expect(page.getByText(`Indicateur « ${nom} » créé.`).first()).toBeVisible();
    }

    // Cadre logique : état vide, puis les quatre niveaux. Les codes sont calculés par la base.
    await ouvrirPageProjet(page, "Planification", "Cadre logique");
    await expect(page.getByText("Aucun cadre logique pour l’instant")).toBeVisible();
    const ajouter = async (bouton: string, libelle: string) => {
      await page.getByRole("button", { name: bouton }).first().click();
      await page.getByLabel("Libellé").fill(libelle);
      await page.getByRole("button", { name: "Ajouter", exact: true }).click();
      await expect(page.getByText("Ligne ajoutée.").first()).toBeVisible();
    };
    await ajouter("Définir l’objectif global", "Améliorer l’accès à l’eau potable dans la commune");
    await expect(ligneCadre(page, "OG")).toBeVisible();
    await ajouter("Ajouter un objectif spécifique", "Réhabiliter les points d’eau en panne");
    await expect(ligneCadre(page, "OS1")).toBeVisible();
    await ajouter("Ajouter un résultat", "Les forages fonctionnent durablement");
    await expect(ligneCadre(page, "R1.1")).toBeVisible();
    await ajouter("Ajouter une activité", "Réhabiliter les forages en panne");
    await expect(ligneCadre(page, "A1.1.1")).toBeVisible();

    // Relier un indicateur au résultat : il apparaît sous sa ligne.
    await page.getByRole("button", { name: "Actions pour R1.1" }).click();
    await page.getByRole("menuitem", { name: "Modifier" }).click();
    await page.getByRole("checkbox", { name: /Forages réhabilités/ }).check();
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.getByText("Ligne modifiée.").first()).toBeVisible();
    await expect(ligneCadre(page, "R1.1")).toContainText("Forages réhabilités");

    // La matrice présente les mêmes lignes.
    await page.getByRole("button", { name: "Matrice" }).click();
    await expect(page.getByRole("rowheader").filter({ hasText: "A1.1.1" })).toBeVisible();
  });

  test("phases, étapes et plan de travail : l'avancement physique se calcule à partir des activités", async ({
    page,
  }) => {
    await ouvrirProjet(page);

    // Phases : les cinq phases types, puis un jalon qu'on atteint.
    await ouvrirPageProjet(page, "Planification", "Phases et étapes");
    await expect(page.getByText("Aucune phase définie")).toBeVisible();
    await page.getByRole("button", { name: "Ajouter les 5 phases types" }).click();
    for (const nom of ["Conception", "Démarrage", "Mise en œuvre", "Suivi-évaluation", "Clôture"]) {
      await expect(page.getByRole("heading", { level: 3, name: nom, exact: true })).toBeVisible();
    }
    const demarrage = page
      .getByRole("heading", { level: 3, name: "Démarrage", exact: true })
      .locator("xpath=ancestor::li[1]");
    await demarrage.getByRole("button", { name: "Ajouter une étape" }).click();
    await page.getByLabel("Intitulé").fill("Lancement officiel");
    await page.getByLabel("Date prévue").fill(JOUR);
    await page.getByRole("button", { name: "Ajouter l’étape" }).click();
    await expect(page.getByText("Étape ajoutée.").first()).toBeVisible();
    await expect(demarrage).toContainText("0 sur 1 étape terminée");
    await page.getByLabel("Statut de l’étape Lancement officiel").selectOption({ label: "Terminé" });
    await expect(demarrage).toContainText("1 sur 1 étape terminée");
    await expect(demarrage).toContainText("Atteinte le");

    // Plan de travail : une activité reliée à A1.1.1, puis terminée.
    await ouvrirPageProjet(page, "Planification", "Plan de travail");
    await expect(page.getByText("Aucune activité planifiée pour cette année")).toBeVisible();
    await page.getByRole("button", { name: "Planifier une activité" }).first().click();
    const tiroir = page.getByRole("dialog");
    await tiroir.getByLabel("Intitulé").fill("Réhabiliter les forages du premier lot");
    await tiroir.getByLabel(/^Responsable/).fill("Chef de chantier");
    await tiroir.getByLabel(/^Budget prévu/).fill("2 500 000");
    await choisirOptionParDebut(tiroir.getByLabel(/^Activité du cadre logique/), "A1.1.1");
    await tiroir.getByRole("button", { name: "Planifier l’activité" }).click();
    await expect(page.getByText("Activité planifiée.").first()).toBeVisible();
    await page.getByRole("button", { name: "Liste" }).click();
    await page
      .getByLabel("Statut de l’activité Réhabiliter les forages du premier lot")
      .selectOption({ label: "Terminé" });
    await expect(page.getByRole("row", { name: /Réhabiliter les forages du premier lot/ })).toContainText("100 %");
    // Le taux physique du projet suit : une seule activité, terminée.
    await expect(taux(page)).toContainText("100 %");
  });

  test("saisie, alerte d'indicateur et prochaine étape créée depuis l'alerte", async ({ page }) => {
    await ouvrirProjet(page);
    await ouvrirPageProjet(page, "Pilotage", "Saisie");
    await page.getByLabel("Indicateur", { exact: true }).selectOption({ label: "Forages réhabilités" });
    await page.getByLabel("Date", { exact: true }).fill(JOUR);
    await page.getByLabel(/^Valeur/).fill("1");
    await page.getByLabel(/^Valeur/).press("Enter");
    await expect(page.getByLabel(/^Valeur/)).toHaveValue("");

    // 1 forage sur 40 après six mois sur trente : « En retard », avec l'action suggérée et le bouton.
    await ouvrirPageProjet(page, "Pilotage", "Tableau de bord");
    const carte = page.locator("article").filter({ hasText: "Forages réhabilités" });
    await expect(carte.getByText("En retard", { exact: true }).first()).toBeVisible();
    await carte.getByRole("button", { name: "Créer une prochaine étape" }).click();
    const dialogue = page.getByRole("dialog", { name: "Nouvelle prochaine étape" });
    await expect(dialogue.getByLabel("Action à mener")).toHaveValue(/Forages réhabilités/);
    await expect(dialogue.getByLabel(/^Indicateur concerné/)).toContainText("Forages réhabilités");
    await dialogue.getByLabel(/^Responsable/).fill("Cheffe de projet");
    await dialogue.getByLabel(/^Échéance/).fill(DANS_UN_MOIS);
    await dialogue.getByRole("button", { name: "Créer la prochaine étape" }).click();
    await expect(page.getByText("Prochaine étape créée.").first()).toBeVisible();
    // L'alerte renvoie désormais vers l'action ouverte au lieu d'en proposer une seconde.
    await expect(carte.getByRole("link", { name: "1 prochaine étape en cours" })).toBeVisible();
    await expect(carte.getByRole("button", { name: "Créer une prochaine étape" })).toHaveCount(0);

    // La page des prochaines étapes la montre, avec son indicateur, puis on la termine.
    await carte.getByRole("link", { name: "1 prochaine étape en cours" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Prochaines étapes" })).toBeVisible();
    await expect(page.getByText("Ouvertes : 1 · en retard : 0")).toBeVisible();
    await expect(page.getByText("Indicateur : Forages réhabilités")).toBeVisible();
    await page.getByLabel(/^Statut de la prochaine étape/).selectOption({ label: "Terminé" });
    await expect(page.getByText("Ouvertes : 0 · en retard : 0")).toBeVisible();
    await expect(page.getByText("Aucune prochaine étape ouverte : tout est à jour.")).toBeVisible();
  });

  test("éditeur : réalisation avec preuve jointe, refus des fichiers non acceptés, téléchargement", async ({
    browser,
  }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    const { contexte, page } = await ouvrirSession(browser, "editeur");
    await ouvrirProjet(page);
    await ouvrirPageProjet(page, "Mise en œuvre", "Réalisations");
    await expect(page.getByText("Aucune réalisation enregistrée")).toBeVisible();
    await page.getByRole("button", { name: "Ajouter une réalisation" }).first().click();
    const tiroir = page.getByRole("dialog");
    await expect(tiroir.getByLabel("Date")).toHaveValue(JOUR);
    await tiroir.getByLabel("Intitulé").fill("Trois forages réceptionnés");
    await tiroir.getByLabel(/^Quantité/).fill("3,5");
    await tiroir.getByLabel(/^Unité/).fill("forages");
    await tiroir.getByLabel(/^Lieu/).fill("Département de Kolda");
    await choisirOptionParDebut(tiroir.getByLabel(/^Résultat ou activité du cadre logique/), "A1.1.1");
    await tiroir.getByRole("button", { name: "Enregistrer la réalisation" }).click();
    await expect(page.getByText("Réalisation enregistrée.").first()).toBeVisible();
    const carte = page
      .getByRole("heading", { level: 2, name: "Trois forages réceptionnés" })
      .locator("xpath=ancestor::li[1]");
    await expect(carte).toContainText("3,5");
    await expect(carte).toContainText("Département de Kolda");
    await expect(carte).toContainText("A1.1.1");
    // Aucune preuve présumée : tant que rien n'est joint, la page le dit.
    await expect(carte.getByText("Aucune preuve jointe")).toBeVisible();
    await expect(page.getByText("1 réalisation, dont 0 avec preuve jointe")).toBeVisible();

    // Un fichier non accepté et un fichier trop gros sont refusés avant tout envoi.
    await carte.getByRole("button", { name: "Joindre une preuve" }).click();
    const depot = page.getByRole("dialog", { name: "Déposer un document" });
    const champ = depot.locator('input[type="file"]');
    await champ.setInputFiles({
      name: "page.html",
      mimeType: "text/html",
      buffer: Buffer.from("<script>alert(1)</script>"),
    });
    await expect(depot.getByText(/Ce type de fichier n’est pas accepté/)).toBeVisible();
    await champ.setInputFiles({
      name: "enorme.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
    });
    await expect(depot.getByText("Ce fichier dépasse 20 Mo.")).toBeVisible();

    // Un vrai PDF : déposé dans le stockage privé, rattaché à la réalisation.
    await champ.setInputFiles({ name: "Bon de réception.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(depot.getByLabel("Nom du document")).toHaveValue("Bon de réception");
    await expect(depot.getByLabel(/^Preuve de la réalisation/)).toContainText("Trois forages réceptionnés");
    await depot.getByLabel("Catégorie").selectOption({ label: "Justificatif" });
    await depot.getByRole("button", { name: "Déposer", exact: true }).click();
    await expect(page.getByText("Document déposé.").first()).toBeVisible();
    await expect(carte.getByText("1 preuve jointe")).toBeVisible();
    await expect(page.getByText("1 réalisation, dont 1 avec preuve jointe")).toBeVisible();

    // Téléchargement par lien signé : le fichier d'origine, nommé d'après le document.
    const [telechargement] = await Promise.all([
      page.waitForEvent("download"),
      carte.getByRole("button", { name: "Télécharger Bon de réception" }).click(),
    ]);
    expect(telechargement.suggestedFilename()).toBe("Bon de réception.pdf");
    expect(
      readFileSync((await telechargement.path())!)
        .subarray(0, 5)
        .toString("latin1"),
    ).toBe("%PDF-");
    await contexte.close();
  });

  test("état d'avancement : les taux sont figés à la rédaction et ne bougent plus", async ({ page }) => {
    await ouvrirProjet(page);
    await ouvrirPageProjet(page, "Mise en œuvre", "États d’avancement");
    await expect(page.getByText("Aucun état d’avancement")).toBeVisible();
    await page.getByRole("button", { name: "Rédiger un état d’avancement" }).first().click();
    const tiroir = page.getByRole("dialog");
    await expect(tiroir.getByLabel("Début de la période")).toHaveValue(DEBUT);
    await expect(tiroir.getByLabel("Fin de la période")).toHaveValue(JOUR);
    await expect(tiroir.getByText("1 réalisation enregistrée sur cette période.")).toBeVisible();
    await expect(tiroir.getByText("Ces taux seront enregistrés avec l’état et ne changeront plus.")).toBeVisible();
    await tiroir.getByLabel(/^Faits marquants/).fill("Trois forages réceptionnés ce mois-ci.");
    await tiroir.getByLabel(/^Difficultés rencontrées/).fill("Retard de livraison des pompes.");
    await tiroir.getByRole("button", { name: "Enregistrer l’état" }).click();
    await expect(page.getByText("État d’avancement enregistré.").first()).toBeVisible();
    const carte = page
      .getByRole("heading", { level: 2, name: /^État d’avancement ·/ })
      .locator("xpath=ancestor::li[1]");
    await expect(carte).toContainText("Trois forages réceptionnés ce mois-ci.");
    await expect(carte).toContainText("Retard de livraison des pompes.");
    await expect(carte).toContainText("Non renseigné."); // les risques n'ont pas été renseignés
    const figes = (await carte.locator("dl").textContent())!;
    const enTete = (await taux(page).textContent())!;

    // Une saisie de plus change les taux du projet, pas ceux de l'état déjà rédigé.
    await ouvrirPageProjet(page, "Pilotage", "Saisie");
    await page.getByLabel("Indicateur", { exact: true }).selectOption({ label: "Forages réhabilités" });
    await page.getByLabel("Date", { exact: true }).fill(HIER);
    await page.getByLabel(/^Valeur/).fill("1");
    await page.getByLabel(/^Valeur/).press("Enter");
    await expect(page.getByLabel(/^Valeur/)).toHaveValue("");
    await ouvrirPageProjet(page, "Mise en œuvre", "États d’avancement");
    await expect(taux(page)).not.toHaveText(enTete);
    await expect(carte.locator("dl")).toHaveText(figes);
  });

  test("étiquettes et programme : classer le projet, filtrer la liste, consolider", async ({ page }) => {
    await ouvrirProjet(page);
    // Étiquettes : minuscules, espaces simplifiés, pas de doublon.
    const champ = page.getByLabel("Ajouter une étiquette");
    await champ.fill("  E2E   Suivi ");
    await champ.press("Enter");
    const groupe = page.getByRole("group", { name: "Étiquettes du projet" });
    await expect(groupe).toContainText("e2e suivi");
    await champ.fill("E2E SUIVI");
    await champ.press("Enter");
    await expect(page.getByText("L’étiquette « e2e suivi » existe déjà.")).toBeVisible();

    // Programme : créé, le projet y est rattaché, l'avancement est consolidé.
    await page.goto("/app/programmes");
    await page.getByRole("button", { name: "Nouveau programme" }).first().click();
    await page.getByLabel("Nom du programme").fill(PROGRAMME);
    await page.getByRole("button", { name: "Créer le programme" }).click();
    await expect(page.getByText(`Programme « ${PROGRAMME} » créé.`).first()).toBeVisible();
    await ouvrirProjet(page);
    await page.getByRole("combobox", { name: "Programme", exact: true }).selectOption({ label: PROGRAMME });
    await expect(page.getByText("Programme du projet modifié.").first()).toBeVisible();
    await page.goto("/app/programmes");
    await page
      .getByRole("link", { name: echapper(PROGRAMME) })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: PROGRAMME })).toBeVisible();
    await expect(page.getByText("Avancement consolidé")).toBeVisible();
    await expect(page.getByRole("link", { name: echapper(NOM) })).toBeVisible();

    // La liste des projets montre l'étiquette et la filtre.
    await page.goto("/app");
    const cartes = page.locator("article");
    await expect(cartes.filter({ hasText: NOM })).toContainText("e2e suivi");
    await page.getByRole("combobox", { name: "Étiquette", exact: true }).selectOption({ label: "e2e suivi" });
    await expect(cartes.filter({ hasText: NOM })).toHaveCount(1);
    await expect(cartes).toHaveCount(1);
    await page
      .getByRole("combobox", { name: "Étiquette", exact: true })
      .selectOption({ label: "Toutes les étiquettes" });
    await expect(cartes.filter({ hasText: NOM })).toHaveCount(1);
  });

  test("lecteur : tout se consulte et se télécharge, rien ne s'écrit", async ({ browser }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    const { contexte, page } = await ouvrirSession(browser, "lecteur");
    await ouvrirProjet(page);
    // Les étiquettes sont visibles, sans retrait ni saisie.
    await expect(page.getByRole("group", { name: "Étiquettes du projet" })).toContainText("e2e suivi");
    await expect(page.getByLabel("Ajouter une étiquette")).toHaveCount(0);
    for (const [rubrique, ecran, bouton] of [
      ["Planification", "Cadre logique", /Ajouter|Définir|Actions pour/],
      ["Planification", "Phases et étapes", /Ajouter|Actions pour/],
      ["Planification", "Plan de travail", /Planifier|Actions pour/],
      ["Mise en œuvre", "Réalisations", /Ajouter|Joindre|Actions pour/],
      ["Mise en œuvre", "Prochaines étapes", /Ajouter|Actions pour/],
      ["Mise en œuvre", "États d’avancement", /Rédiger|Actions pour/],
      ["Mise en œuvre", "Documents", /Déposer|Actions pour/],
    ] as const) {
      await ouvrirPageProjet(page, rubrique, ecran);
      await expect(page.getByRole("button", { name: bouton }), `${ecran} : aucune action d'écriture`).toHaveCount(0);
    }
    await ouvrirPageProjet(page, "Mise en œuvre", "Réalisations");
    await expect(page.getByText("Votre rôle est en lecture seule")).toBeVisible();
    await ouvrirPageProjet(page, "Mise en œuvre", "Documents");
    await expect(page.getByRole("heading", { level: 2, name: "Bon de réception" })).toBeVisible();
    const [telechargement] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Télécharger Bon de réception" }).click(),
    ]);
    expect(telechargement.suggestedFilename()).toBe("Bon de réception.pdf");
    // Le tableau de bord ne propose pas de créer une prochaine étape.
    await ouvrirPageProjet(page, "Pilotage", "Tableau de bord");
    await expect(page.getByRole("button", { name: "Créer une prochaine étape" })).toHaveCount(0);
    await contexte.close();
  });

  test("éditeur : modifier un document puis le supprimer retire aussi le fichier", async ({ browser }) => {
    test.skip(quotaPlein, "quota de projets plein : parcours non exécuté");
    const { contexte, page } = await ouvrirSession(browser, "editeur");
    await ouvrirProjet(page);
    await ouvrirPageProjet(page, "Mise en œuvre", "Documents");
    await expect(page.getByText("1 document ·")).toBeVisible();
    await page.getByRole("button", { name: "Actions pour le document « Bon de réception »" }).click();
    await page.getByRole("menuitem", { name: "Modifier" }).click();
    const dialogue = page.getByRole("dialog", { name: "Modifier le document" });
    await expect(dialogue.locator('input[type="file"]')).toHaveCount(0); // on ne remplace pas le fichier
    await dialogue.getByLabel("Nom du document").fill("Bon de réception signé");
    await dialogue.getByLabel("Catégorie").selectOption({ label: "Contrat" });
    await dialogue.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Document mis à jour.").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Bon de réception signé" })).toBeVisible();
    await page.getByRole("combobox", { name: "Catégorie", exact: true }).selectOption({ label: "Rapport" });
    await expect(page.getByText("Aucun document dans cette catégorie.")).toBeVisible();
    await page.getByRole("combobox", { name: "Catégorie", exact: true }).selectOption({ label: "Contrat" });

    await page.getByRole("button", { name: "Actions pour le document « Bon de réception signé »" }).click();
    await page.getByRole("menuitem", { name: "Supprimer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer le document" }).click();
    await expect(page.getByText("Document supprimé.").first()).toBeVisible();
    await expect(page.getByText("Aucun document déposé")).toBeVisible();
    await contexte.close();
  });

  test("nettoyage : l'administrateur supprime le programme et le projet de test", async ({ page }) => {
    await page.goto("/app/programmes");
    await page.getByRole("button", { name: `Actions pour le programme ${PROGRAMME}` }).click();
    await page.getByRole("menuitem", { name: "Supprimer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer le programme" }).click();
    await expect(page.getByText(`Programme « ${PROGRAMME} » supprimé.`).first()).toBeVisible();

    await page.goto("/app");
    await page.getByRole("button", { name: echapper(`Actions pour ${NOM}`) }).click();
    await page.getByRole("menuitem", { name: "Supprimer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer définitivement" }).click();
    // Tant que la confirmation est ouverte, le reste de la page est masqué aux technologies d'assistance : « aucun lien »
    // serait vrai tout de suite, avant même que le projet soit supprimé. On attend donc la fin de la suppression.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Projet « " + NOM + " » supprimé.").first()).toBeVisible();
    await expect(page.getByRole("link", { name: echapper(NOM) })).toHaveCount(0);
  });
});

test.describe("fin d'essai : cœur S&E en lecture seule (phase 2)", () => {
  test.skip(({ isMobile }) => isMobile || PHASE !== "2");

  test("les écrans du suivi se consultent, rien ne s'y écrit", async ({ page }) => {
    await connecter(page, "admin");
    // Le décompte n'a de sens qu'une fois la liste chargée : avant, il est toujours nul et le test se croirait sans projet.
    await expect(page.getByRole("heading", { level: 1, name: "Projets" })).toBeVisible();
    await expect(page.locator("[aria-busy='true']")).toHaveCount(0, { timeout: 20_000 });
    const lien = page.getByRole("link", { name: /Projet E2E/ }).first();
    test.skip((await lien.count()) === 0, "aucun projet de test à consulter");
    await lien.click();
    for (const [rubrique, ecran, bouton] of [
      ["Planification", "Cadre logique", /Ajouter|Définir|Actions pour/],
      ["Planification", "Phases et étapes", /Ajouter|Actions pour/],
      ["Planification", "Plan de travail", /Planifier|Actions pour/],
      ["Mise en œuvre", "Réalisations", /Ajouter|Joindre|Actions pour/],
      ["Mise en œuvre", "Prochaines étapes", /Ajouter|Actions pour/],
      ["Mise en œuvre", "États d’avancement", /Rédiger|Actions pour/],
      ["Mise en œuvre", "Documents", /Déposer|Actions pour/],
    ] as const) {
      await ouvrirPageProjet(page, rubrique, ecran);
      await expect(
        page.getByText("L’essai est terminé : cet écran reste consultable, les modifications sont suspendues."),
        ecran,
      ).toBeVisible();
      await expect(page.getByRole("button", { name: bouton }), `${ecran} : aucune action d'écriture`).toHaveCount(0);
    }
    // Les étiquettes ne se modifient plus.
    await expect(page.getByLabel("Ajouter une étiquette")).toHaveCount(0);
  });
});

void COMPTES;
