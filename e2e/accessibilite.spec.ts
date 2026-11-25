// Contrôle automatisé d'accessibilité (axe-core, WCAG 2 A/AA, 2.1 AA et bonnes pratiques) sur les pages publiques.
// Les pages de l'application, derrière une connexion, sont contrôlées par accessibilite-app.spec.ts.

import { expect, test } from "@playwright/test";
import { ouvrir, violations } from "./aide";

test.skip(({ isMobile }) => isMobile);

test("landing : aucune violation, section par section", async ({ page }) => {
  await ouvrir(page, "/");
  const trouvees: string[] = [];
  for (const id of ["probleme", "solution", "demo", "pilotes", "tarifs", "faq", "contact"]) {
    await page.locator(`#${id}`).evaluate((e) => e.scrollIntoView({ behavior: "instant" }));
    await page.waitForTimeout(2500); // les animations d'entrée sont terminées
    trouvees.push(...(await violations(page)).map((v) => `${id} : ${v}`));
  }
  expect([...new Set(trouvees)]).toEqual([]);
});

for (const chemin of [
  "/connexion",
  "/inscription",
  "/mot-de-passe-oublie",
  "/mentions-legales",
  "/confidentialite",
  "/conditions-utilisation",
]) {
  test(`${chemin} : aucune violation`, async ({ page }) => {
    await ouvrir(page, chemin);
    await page.waitForTimeout(800);
    expect(await violations(page)).toEqual([]);
  });
}

test("deck : aucune violation sur les dix diapositives", async ({ page }) => {
  await ouvrir(page, "/deck");
  const trouvees: string[] = [];
  for (let n = 1; n <= 10; n++) {
    await page.goto(`/deck#${n}`);
    await page.reload();
    await page.waitForSelector("html[data-hydrate]", { state: "attached" });
    await page.waitForTimeout(3000);
    trouvees.push(...(await violations(page)).map((v) => `diapositive ${n} : ${v}`));
  }
  expect([...new Set(trouvees)]).toEqual([]);
});
