import { expect, test } from "@playwright/test";
import { ouvrir } from "./aide";

test.describe("landing", () => {
  test("le contenu est complet et lisible, sans erreur dans la console", async ({ page }) => {
    const erreurs: string[] = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    page.on("console", (m) => m.type() === "error" && erreurs.push(m.text().slice(0, 200)));
    await ouvrir(page, "/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pilotez vos projets avec des données fiables, en temps réel.");
    for (const id of ["probleme", "solution", "demo", "pilotes", "tarifs", "faq", "contact"]) await expect(page.locator(`#${id}`)).toBeAttached();
    await page.waitForTimeout(2500);
    expect(erreurs, "aucune erreur de console ni violation de la politique de sécurité").toEqual([]);
  });

  test("aucun débordement horizontal", async ({ page }) => {
    await ouvrir(page, "/");
    await page.waitForTimeout(1500);
    const { debordement, trop } = await page.evaluate(() => {
      const racine = document.documentElement;
      const trop = [...document.querySelectorAll("main *, footer *, header *")]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.right > racine.clientWidth + 1 && !e.closest("[aria-hidden='true']") && !e.closest("svg") && getComputedStyle(e).position !== "fixed" && !e.closest(".fond-hero") && !e.closest("[data-diapo]");
        })
        .slice(0, 5)
        .map((e) => `${e.tagName}.${String(e.className).slice(0, 40)} → ${Math.round(e.getBoundingClientRect().right)} (section ${e.closest("section")?.id || "?"})`);
      return { debordement: racine.scrollWidth - racine.clientWidth, trop };
    });
    expect(debordement).toBe(0);
    expect(trop).toEqual([]);
  });

  test("la navigation par ancres mène aux sections", async ({ page, isMobile }) => {
    await ouvrir(page, "/");
    if (isMobile) await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    const nav = isMobile ? page.locator("#menu-mobile") : page.getByRole("navigation", { name: "Navigation principale" });
    await nav.getByRole("link", { name: "Tarifs" }).click();
    await expect(page).toHaveURL(/#tarifs$/);
    // La section est alignée sous la barre de navigation : son titre est visible, pas masqué par un dépassement.
    await expect.poll(async () => Math.round(await page.locator("#tarifs").evaluate((e) => e.getBoundingClientRect().top)), { timeout: 15_000 }).toBeGreaterThanOrEqual(80);
    await expect.poll(async () => Math.round(await page.locator("#tarifs").evaluate((e) => e.getBoundingClientRect().top)), { timeout: 15_000 }).toBeLessThanOrEqual(120);
  });

  test("le formulaire valide les champs sans rien envoyer", async ({ page }) => {
    await ouvrir(page, "/");
    const demandes: string[] = [];
    page.on("request", (r) => r.url().includes("submit-lead") && demandes.push(r.method()));
    await page.locator("#contact").scrollIntoViewIfNeeded();
    await page.locator("#contact").getByRole("button", { name: "Envoyer ma demande" }).click();
    await expect(page.locator("#contact").getByText("Ce champ est obligatoire.")).toHaveCount(3);
    await page.locator("#contact").getByLabel("E-mail professionnel").fill("pas-un-email");
    await page.locator("#contact").getByRole("button", { name: "Envoyer ma demande" }).click();
    await expect(page.locator("#contact").getByText("Cette adresse e-mail n’est pas valide.")).toBeVisible();
    expect(demandes).toEqual([]);
  });

  test("une adresse avec ancre (/#faq) ouvre la page sur la bonne section", async ({ page }) => {
    await ouvrir(page, "/#faq");
    await expect.poll(async () => Math.round(await page.locator("#faq").evaluate((e) => e.getBoundingClientRect().top)), { timeout: 15_000 }).toBeLessThanOrEqual(120);
    await expect(page.locator("#faq")).toBeInViewport();
  });

  test("le bascule annuel des tarifs affiche le total annuel", async ({ page }) => {
    await ouvrir(page, "/");
    await page.getByRole("button", { name: /Annuel/ }).click();
    await expect(page.getByText("soit 480 $ par an")).toBeVisible();
  });

  test("la FAQ s'ouvre au clavier", async ({ page }) => {
    await ouvrir(page, "/");
    const question = page.getByRole("button", { name: "Puis-je importer mes fichiers Excel ?" });
    await question.focus();
    await page.keyboard.press("Enter");
    await expect(question).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText(/Déposez un fichier Excel/)).toBeVisible();
  });

  test("l'indicateur d'état du service interroge le backend", async ({ page }) => {
    await ouvrir(page, "/");
    await expect(page.getByRole("contentinfo").getByRole("status")).toHaveText(/En ligne|Service perturbé/, { timeout: 15_000 });
  });
});

test.describe("préférence de mouvement réduit", () => {
  test.use({ reducedMotion: "reduce" });

  test("tout le contenu est visible, rien n'est animé et GSAP n'est jamais chargé", async ({ page }) => {
    const gsapCharge: string[] = [];
    page.on("request", (r) => /gsap|ScrollTrigger/i.test(r.url()) && gsapCharge.push(r.url()));
    await ouvrir(page, "/");
    await page.waitForTimeout(2500);
    expect(gsapCharge).toEqual([]);
    // Aucun élément de contenu n'est resté masqué ou décalé par une animation.
    const caches = await page.evaluate(() =>
      [...document.querySelectorAll("main h1, main h2, main h3, main p")].filter((e) => getComputedStyle(e).opacity === "0" || getComputedStyle(e).visibility === "hidden").length,
    );
    expect(caches).toBe(0);
    await expect(page.locator("[data-compteur]").first()).toHaveText("27");
    const defilement = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
    expect(defilement).toBe("auto");
  });
});
