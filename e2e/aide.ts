import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");

/** Adresse du build servi par npm run apercu (voir playwright.config.ts). */
export const URL_APERCU = "http://localhost:4173";

/** Comptes de test (.env.e2e) : administrateur, éditeur, lecteur d'une même organisation de test. */
export const COMPTES = {
  admin: { email: process.env.E2E_ADMIN_EMAIL, mdp: process.env.E2E_ADMIN_MDP },
  editeur: { email: process.env.E2E_EDITEUR_EMAIL, mdp: process.env.E2E_EDITEUR_MDP },
  lecteur: { email: process.env.E2E_LECTEUR_EMAIL, mdp: process.env.E2E_LECTEUR_MDP },
};
export const PHASE = process.env.E2E_PHASE ?? "1";
export const COMPTES_ABSENTS = !COMPTES.admin.email || !COMPTES.admin.mdp;

/** Ouvre une page et attend que React soit hydraté (repère posé par root.tsx) : avant, les boutons ne font rien. */
export async function ouvrir(page: Page, chemin: string) {
  await page.goto(chemin);
  await page.waitForSelector("html[data-hydrate]", { state: "attached", timeout: 20_000 });
  // Les sections sous le premier écran de la landing sont hydratées ensuite (React.lazy) : on attend que leurs fichiers soient chargés.
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

export async function connecter(page: Page, role: keyof typeof COMPTES) {
  await page.goto("/connexion");
  await page.waitForSelector("html[data-hydrate]", { state: "attached" });
  await page.getByLabel("Adresse e-mail").fill(COMPTES[role].email!);
  await page.getByLabel("Mot de passe", { exact: true }).fill(COMPTES[role].mdp!);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
}

/** Une session indépendante (navigateur vierge) pour un rôle : utile pour voir la même donnée avec deux rôles. */
export async function ouvrirSession(
  browser: Browser,
  role: keyof typeof COMPTES,
): Promise<{ contexte: BrowserContext; page: Page }> {
  const contexte = await browser.newContext({ baseURL: URL_APERCU, locale: "fr-FR", timezoneId: "Africa/Dakar" });
  const page = await contexte.newPage();
  await connecter(page, role);
  return { contexte, page };
}

/**
 * Ouvre une page d'un projet par la navigation à deux niveaux (rubrique, puis page), comme le ferait une personne.
 * Les pages sont celles de ProjetLayout : Pilotage, Planification, Mise en œuvre.
 */
export async function ouvrirPageProjet(
  page: Page,
  rubrique: "Pilotage" | "Planification" | "Mise en œuvre",
  libelle: string,
) {
  await page.getByRole("navigation", { name: "Rubriques du projet" }).getByRole("link", { name: rubrique }).click();
  await page
    .getByRole("navigation", { name: "Sections du projet" })
    .getByRole("link", { name: libelle, exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 }).last()).toBeVisible();
}

/** Contrôle axe-core (WCAG 2 A/AA, 2.1 AA et bonnes pratiques) de la page affichée : une ligne par violation. */
export async function violations(page: Page): Promise<string[]> {
  // Le script reste en place tant que la page n'est pas rechargée : on ne le réinjecte pas pour chaque formulaire.
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            c: Document,
            o: object,
          ) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[]; html: string }[] }[] }>;
        };
      }
    ).axe;
    const resultat = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    });
    return resultat.violations.map(
      (v) =>
        `${v.id} (${v.impact}) : ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`,
    );
  });
}

/** Dépassement horizontal de la page (0 attendu) et éléments coupables. */
export async function debordement(page: Page): Promise<{ debordement: number; coupables: string[] }> {
  return page.evaluate(() => {
    const racine = document.documentElement;
    const coupables = [...document.querySelectorAll("body *")]
      .filter((e) => {
        const b = e.getBoundingClientRect();
        return (
          b.width > 0 &&
          b.right > racine.clientWidth + 1 &&
          !e.closest("svg") &&
          !e.closest("nav") &&
          !e.closest("[class*=overflow-x-auto]") &&
          getComputedStyle(e).position !== "fixed"
        );
      })
      .slice(0, 6)
      .map((e) => `${e.tagName}.${String(e.className).slice(0, 60)} → ${Math.round(e.getBoundingClientRect().right)}`);
    return { debordement: racine.scrollWidth - racine.clientWidth, coupables };
  });
}
