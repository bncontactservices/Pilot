#!/usr/bin/env node
// Lighthouse sur le build servi avec les en-têtes de vercel.json (mobile, réseau 4G lent simulé, réglages par défaut).
// Critère du brief : au moins 90 en performance, accessibilité, bonnes pratiques et SEO sur la landing.
// Usage : npm run build && npm run lighthouse [-- chemin]   (Chrome du poste requis)

import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4174;
const CHEMIN = process.argv[2] ?? "/";
const PASSES = Number(process.env.LH_PASSES ?? 3);
const SEUIL = 90;
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);

const serveur = spawn(process.execPath, [path.join(RACINE, "scripts", "apercu-build.mjs"), String(PORT)], { stdio: "ignore" });
await new Promise((resolve) => setTimeout(resolve, 1200));
const chrome = await chromeLauncher.launch({ chromePath: CHROME, chromeFlags: ["--headless=new", "--no-sandbox", ...(process.env.LH_MOUVEMENT_REDUIT ? ["--force-prefers-reduced-motion"] : [])] });

let code = 0;
try {
  const url = `http://localhost:${PORT}${CHEMIN}`;
  const passes = [];
  for (let i = 0; i < PASSES; i++) {
    const { lhr } = await lighthouse(url, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices", "seo"] });
    passes.push(lhr);
  }
  const mediane = (valeurs) => [...valeurs].sort((x, y) => x - y)[Math.floor(valeurs.length / 2)];
  if (process.env.LH_JSON) writeFileSync(process.env.LH_JSON, JSON.stringify(passes[0]));
  console.log(`Lighthouse (mobile, médiane de ${PASSES} passes) — ${url}`);
  for (const id of Object.keys(passes[0].categories)) {
    const notes = passes.map((p) => Math.round((p.categories[id].score ?? 0) * 100));
    const note = mediane(notes);
    console.log(`  ${note >= SEUIL ? "✓" : "✗"} ${passes[0].categories[id].title} : ${note}  (passes : ${notes.join(", ")})`);
    if (note < SEUIL) code = 1;
  }
  const metrique = (id) => mediane(passes.map((p) => p.audits[id].numericValue));
  console.log(
    `  FCP ${Math.round(metrique("first-contentful-paint"))} ms · LCP ${Math.round(metrique("largest-contentful-paint"))} ms · TBT ${Math.round(metrique("total-blocking-time"))} ms · CLS ${metrique("cumulative-layout-shift").toFixed(3)} · Speed Index ${Math.round(metrique("speed-index"))} ms`,
  );
  const echecs = Object.values(passes[0].audits).filter((x) => x.score !== null && x.score < 0.9 && !["informative", "notApplicable", "manual"].includes(x.scoreDisplayMode));
  for (const x of echecs.slice(0, 10)) console.log(`    - ${x.id} (${Math.round(x.score * 100)}) ${x.title}${x.displayValue ? " : " + x.displayValue : ""}`);
} finally {
  await chrome.kill();
  serveur.kill();
}
process.exit(code);
