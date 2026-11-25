import { expect, test } from "@playwright/test";
import { ouvrir } from "./aide";

test.skip(({ isMobile }) => isMobile, "le deck est conçu pour un écran 16:9 ou un PDF");

const diapoActive = (page: import("@playwright/test").Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-diapo]")].findIndex((e) => getComputedStyle(e).display !== "none") + 1);

test.describe("deck : navigation", () => {
  test("flèches, espace, début et fin, et l'adresse suit la diapositive", async ({ page }) => {
    await ouvrir(page, "/deck");
    await expect(page.locator("[data-diapo='1']")).toBeVisible();
    expect(await diapoActive(page)).toBe(1);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(/#3$/);
    await page.keyboard.press("ArrowLeft");
    await expect(page).toHaveURL(/#2$/);
    await page.keyboard.press("End");
    await expect(page).toHaveURL(/#10$/);
    await page.keyboard.press("ArrowRight"); // pas de diapositive 11
    expect(await diapoActive(page)).toBe(10);
    await page.keyboard.press("Home");
    await expect(page).toHaveURL(/#1$/);
  });

  test("un lien #7 ouvre la diapositive 7 et la barre de progression l'indique", async ({ page }) => {
    await ouvrir(page, "/deck#7");
    await expect(page.locator("[data-diapo='7']")).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Progression du deck" })).toHaveAttribute("aria-valuenow", "7");
    expect(await page.locator("[data-diapo]").count()).toBe(10);
  });

  test("les boutons de navigation fonctionnent et sont désactivés aux extrémités", async ({ page }) => {
    await ouvrir(page, "/deck");
    await expect(page.getByRole("button", { name: "Diapositive précédente" })).toBeDisabled();
    await page.getByRole("button", { name: "Diapositive suivante" }).click();
    await expect(page).toHaveURL(/#2$/);
    await ouvrir(page, "/deck#10");
    await expect(page.getByRole("button", { name: "Diapositive suivante" })).toBeDisabled();
  });

  test("le lecteur d'écran est informé du changement de diapositive", async ({ page }) => {
    await ouvrir(page, "/deck");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("Diapositive 2 sur 10 : Le problème")).toBeAttached();
  });

  test.describe("tactile", () => {
    test.use({ hasTouch: true });
    test("un balayage horizontal change de diapositive", async ({ page }) => {
      await ouvrir(page, "/deck");
      const cdp = await page.context().newCDPSession(page);
      const toucher = async (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
        cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
      await toucher("touchStart", 900, 360);
      await toucher("touchMove", 600, 365);
      await toucher("touchEnd", 400, 365);
      await expect(page).toHaveURL(/#2$/);
      await toucher("touchStart", 400, 360);
      await toucher("touchMove", 700, 362);
      await toucher("touchEnd", 900, 362);
      await expect(page).toHaveURL(/#1$/);
    });
  });
});

test.describe("deck : confidentialité", () => {
  test("la route est en noindex (balise et en-tête) et interdite aux robots", async ({ page, request }) => {
    const reponse = await request.get("/deck");
    expect(reponse.headers()["x-robots-tag"]).toContain("noindex");
    await ouvrir(page, "/deck");
    await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /noindex/);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \/deck/);
  });
});

test.describe("deck : impression PDF", () => {
  test("une diapositive par page, au format 16:9, sans aucun élément invisible", async ({ page }, info) => {
    await ouvrir(page, "/deck#4");
    await page.waitForTimeout(400); // animation de la diapositive 4 en cours : le cas à risque
    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(200);

    // Aucun élément animé ne reste masqué ou décalé en impression, sur aucune diapositive.
    const masques = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-diapo] [data-a], [data-diapo] [data-cercle], [data-diapo] [data-etape]")]
        .filter((e) => Number(getComputedStyle(e).opacity) < 0.99)
        .map((e) => `${e.closest("[data-diapo]")?.getAttribute("data-diapo")}:${e.tagName}`),
    );
    expect(masques, "éléments encore masqués à l'impression").toEqual([]);
    const visibles = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-diapo]")].filter((e) => getComputedStyle(e).display !== "none").length);
    expect(visibles).toBe(10);
    const controles = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("nav[aria-label='Navigation du deck'], [role='progressbar']")].every((e) => getComputedStyle(e).display === "none"));
    expect(controles, "navigation et barre de progression masquées").toBe(true);

    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    if (process.env.DECK_PDF_SORTIE) (await import("node:fs")).writeFileSync(process.env.DECK_PDF_SORTIE, pdf);
    const texte = pdf.toString("latin1");
    expect(texte.startsWith("%PDF")).toBe(true);
    const pages = (texte.match(/\/Type\s*\/Page(?![a-z])/g) ?? []).length;
    expect(pages, "une diapositive par page").toBe(10);
    // 13,333 × 7,5 pouces = 960 × 540 points.
    const formats = new Set([...texte.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => `${Math.round(Number(m[1]))}×${Math.round(Number(m[2]))}`));
    expect([...formats], "toutes les pages au format 960 × 540 pt").toEqual(["960×540"]);
    await info.attach("deck.pdf", { body: pdf, contentType: "application/pdf" });
  });
});
