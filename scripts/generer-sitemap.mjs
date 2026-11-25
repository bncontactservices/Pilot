#!/usr/bin/env node
// Génère sitemap.xml et ajoute la ligne « Sitemap » à robots.txt après la construction (npm run build).
// Un sitemap exige des adresses absolues : il n'est produit que si VITE_SITE_URL est défini
// (variable d'environnement, ou fichier .env / .env.production / .env.local à la racine).
// Les pages listées sont les pages publiques pré-rendues, trouvées dans build/client.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SORTIE = path.join(RACINE, "build", "client");
const PAGES_PUBLIQUES = ["/", "/mentions-legales", "/confidentialite", "/conditions-utilisation"];

function lireVariable(nom) {
  if (process.env[nom]) return process.env[nom];
  for (const fichier of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    const chemin = path.join(RACINE, fichier);
    if (!existsSync(chemin)) continue;
    const ligne = readFileSync(chemin, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${nom}=`));
    if (ligne) return ligne.slice(nom.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

if (!existsSync(SORTIE)) {
  console.error("build/client introuvable : lancez d'abord `npm run build`.");
  process.exit(1);
}

const site = lireVariable("VITE_SITE_URL").replace(/\/+$/, "");
if (!/^https?:\/\/[^\s/]+/.test(site)) {
  console.warn("VITE_SITE_URL n'est pas défini : sitemap.xml n'est pas généré (il exige des adresses absolues).");
  process.exit(0);
}

const pages = PAGES_PUBLIQUES.filter((page) => page === "/" || existsSync(path.join(SORTIE, page, "index.html")));
const urls = pages.map((page) => `  <url><loc>${site}${page === "/" ? "/" : page}</loc></url>`).join("\n");
writeFileSync(path.join(SORTIE, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

const robots = path.join(SORTIE, "robots.txt");
const contenu = existsSync(robots) ? readFileSync(robots, "utf8").replace(/\n*Sitemap:.*\n*/g, "\n").trimEnd() : "User-agent: *\nAllow: /";
writeFileSync(robots, `${contenu}\n\nSitemap: ${site}/sitemap.xml\n`);
console.log(`sitemap.xml généré (${pages.length} pages) pour ${site}`);
