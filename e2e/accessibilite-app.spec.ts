// Accessibilité des écrans de l'application (derrière une connexion) : axe-core sur chaque page, formulaires ouverts
// compris, puis un contrôle de débordement horizontal sur téléphone (375 px).
// Mêmes comptes de test que parcours.spec.ts ; sans eux, tout est ignoré. Le projet d'exemple fournit un contenu réel
// pour chaque écran : il est chargé s'il manque, et supprimé à la fin s'il a été chargé par le test.

import { expect, type Page, test } from "@playwright/test";
import { COMPTES_ABSENTS, connecter, debordement, PHASE, violations } from "./aide";

test.skip(COMPTES_ABSENTS, "comptes de test absents (.env.e2e)");
// Après la fin d'essai (phase 2), l'organisation est en lecture seule : le projet d'exemple ne peut plus être chargé.
test.skip(PHASE !== "1");
test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);

const PAGES_PROJET = [
  ["", "tableau de bord"],
  ["/indicateurs", "indicateurs"],
  ["/saisie", "saisie"],
  ["/import", "import"],
  ["/rapports", "rapports"],
  ["/cadre-logique", "cadre logique"],
  ["/plan-de-travail", "plan de travail"],
  ["/phases", "phases et étapes"],
  ["/realisations", "réalisations"],
  ["/prochaines-etapes", "prochaines étapes"],
  ["/etats-avancement", "états d’avancement"],
  ["/documents", "documents"],
] as const;

/** Attend la fin du chargement : plus de squelette ni de bouton occupé, titre de page affiché. */
async function attendreChargement(page: Page) {
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.locator("[aria-busy='true']")).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(700); // transitions d'entrée terminées
}

/** Ouvre le projet d'exemple ; le charge s'il n'existe pas. Retourne l'adresse du projet et si le test l'a chargé. */
async function ouvrirExemple(page: Page): Promise<{ base: string; charge: boolean }> {
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1, name: "Projets" })).toBeVisible();
  await expect(page.locator("[aria-busy='true']")).toHaveCount(0, { timeout: 20_000 });
  let charge = false;
  const lien = page.getByRole("link", { name: /Projet exemple/ }).first();
  if ((await lien.count()) === 0) {
    await page.getByRole("button", { name: "Charger un projet exemple" }).first().click();
    await expect(lien).toBeVisible({ timeout: 30_000 });
    charge = true;
  }
  await lien.click();
  await expect(page.getByRole("heading", { level: 1, name: /Projet exemple/ })).toBeVisible();
  return { base: new URL(page.url()).pathname, charge };
}

async function supprimerExemple(page: Page) {
  await page.goto("/app");
  await page
    .getByRole("button", { name: /^Actions pour Projet exemple/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Supprimer" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Supprimer définitivement" }).click();
  // La confirmation masque le reste de la page tant qu'elle est ouverte : on attend sa fermeture avant de conclure.
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByRole("link", { name: /Projet exemple/ })).toHaveCount(0, { timeout: 20_000 });
}

test.describe("accessibilité des écrans de l'application (bureau)", () => {
  test.skip(({ isMobile }) => isMobile);

  test("aucune violation sur chaque écran, formulaires ouverts compris", async ({ page }) => {
    await connecter(page, "admin");
    const { base, charge } = await ouvrirExemple(page);
    const trouvees: string[] = [];
    const controler = async (nom: string) => {
      trouvees.push(...(await violations(page)).map((v) => `${nom} : ${v}`));
    };
    /** Ouvre un formulaire, le contrôle, le ferme. */
    const avecFormulaire = async (nom: string, ouvrir: () => Promise<unknown>) => {
      await ouvrir();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.waitForTimeout(500);
      await controler(`${nom} (formulaire ouvert)`);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    };

    try {
      // Écrans de l'organisation
      for (const [chemin, nom] of [
        ["/app", "liste des projets"],
        ["/app/programmes", "programmes"],
        ["/app/equipe", "équipe"],
        ["/app/parametres", "paramètres"],
      ] as const) {
        await page.goto(chemin);
        await attendreChargement(page);
        await controler(nom);
      }
      await page.goto("/app");
      await attendreChargement(page);
      await avecFormulaire("liste des projets, nouveau projet", () =>
        page.getByRole("button", { name: "Nouveau projet" }).first().click(),
      );
      await page.goto("/app/programmes");
      await attendreChargement(page);
      await avecFormulaire("programmes, nouveau programme", () =>
        page.getByRole("button", { name: "Nouveau programme" }).first().click(),
      );

      // Pages du projet
      for (const [chemin, nom] of PAGES_PROJET) {
        await page.goto(base + chemin);
        await attendreChargement(page);
        await controler(nom);
      }

      // Formulaires des pages du projet
      const ouvrirFormulaire = async (chemin: string, nom: string, bouton: string | RegExp) => {
        await page.goto(base + chemin);
        await attendreChargement(page);
        await avecFormulaire(nom, () => page.getByRole("button", { name: bouton }).first().click());
      };
      // Pas de formulaire d'indicateur ici : sur le projet d'exemple, la définition des indicateurs n'est pas modifiable.
      await ouvrirFormulaire("/realisations", "réalisations, nouvelle réalisation", "Ajouter une réalisation");
      await ouvrirFormulaire("/prochaines-etapes", "prochaines étapes, nouvelle action", "Ajouter une prochaine étape");
      await ouvrirFormulaire("/etats-avancement", "états d’avancement, nouvel état", "Rédiger un état d’avancement");
      await ouvrirFormulaire("/documents", "documents, dépôt", "Déposer un document");
      await ouvrirFormulaire("/phases", "phases, nouvelle phase", "Ajouter une phase");
      await ouvrirFormulaire("/phases", "phases, nouvelle étape", "Ajouter une étape");
      await ouvrirFormulaire("/plan-de-travail", "plan de travail, nouvelle activité", "Planifier une activité");
      await ouvrirFormulaire("/cadre-logique", "cadre logique, nouvelle ligne", /^Ajouter un objectif spécifique$/);

      // Vues alternatives (la matrice n'avait jamais été contrôlée, le calendrier et la liste du plan de travail non plus)
      await page.goto(base + "/cadre-logique");
      await attendreChargement(page);
      await page.getByRole("button", { name: "Matrice" }).click();
      await page.waitForTimeout(500);
      await controler("cadre logique, matrice");
      await page.goto(base + "/plan-de-travail");
      await attendreChargement(page);
      await page.getByRole("button", { name: "Liste" }).click();
      await page.waitForTimeout(500);
      await controler("plan de travail, liste");
    } finally {
      if (charge) await supprimerExemple(page);
    }
    expect([...new Set(trouvees)]).toEqual([]);
  });
});

test.describe("écrans de l'application sur téléphone (375 px)", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("aucune page ne déborde de l'écran", async ({ page }) => {
    await connecter(page, "admin");
    const { base, charge } = await ouvrirExemple(page);
    const debordements: string[] = [];
    try {
      const mesurer = async (nom: string) => {
        const { debordement: px, coupables } = await debordement(page);
        if (px > 0) debordements.push(`${nom} : ${px} px (${coupables.join(" | ")})`);
      };
      for (const [chemin, nom] of [
        ["/app", "liste des projets"],
        ["/app/programmes", "programmes"],
        ["/app/equipe", "équipe"],
        ["/app/parametres", "paramètres"],
      ] as const) {
        await page.goto(chemin);
        await attendreChargement(page);
        await mesurer(nom);
      }
      for (const [chemin, nom] of PAGES_PROJET) {
        await page.goto(base + chemin);
        await attendreChargement(page);
        await mesurer(nom);
      }
      // Les trois rubriques tiennent sur une ligne.
      await page.goto(base);
      await attendreChargement(page);
      const boites = await page
        .getByRole("navigation", { name: "Rubriques du projet" })
        .getByRole("link")
        .evaluateAll((liens) => liens.map((l) => Math.round(l.getBoundingClientRect().top)));
      expect(new Set(boites).size, "les trois rubriques sont sur une seule ligne").toBe(1);
    } finally {
      if (charge) await supprimerExemple(page);
    }
    expect(debordements).toEqual([]);
  });
});
