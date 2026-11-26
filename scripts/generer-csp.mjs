#!/usr/bin/env node
// Resserre la politique de sécurité (CSP) des pages construites (étape « postbuild », avant la génération du service worker).
//
// Pourquoi : le rendu pré-calculé de React Router place des scripts inline dans chaque page HTML (amorçage de l'hydratation,
// 4 à 17 par page), et vercel.json, statique, ne peut pas en porter les empreintes (elles changent à chaque build). L'en-tête
// garde donc 'unsafe-inline' dans script-src ; ce script ajoute à chaque page HTML une balise
//   <meta http-equiv="Content-Security-Policy" content="script-src …">
// qui ne laisse passer que les scripts inline de CETTE page, par leur empreinte SHA-256. Le navigateur applique les deux
// politiques à la fois : un script inline injecté dans une page (donc sans empreinte) est bloqué, même si l'en-tête
// l'autoriserait.
//
// La liste des sources de script (hôtes autorisés, wasm) est lue dans l'en-tête de vercel.json : une seule source de vérité.
// Une balise meta ne peut porter ni frame-ancestors ni report-uri : seul script-src est repris ici.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "build", "client");

/** Sources de script de l'en-tête de vercel.json, sans 'unsafe-inline'. */
export function sourcesDeScript(vercel) {
  const entete = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy");
  if (!entete) throw new Error("vercel.json : pas d'en-tête Content-Security-Policy");
  const directive = entete.value
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith("script-src "));
  if (!directive) throw new Error("vercel.json : pas de directive script-src");
  return directive
    .slice("script-src ".length)
    .split(/\s+/)
    .filter((s) => s !== "'unsafe-inline'");
}

/** Contenu des scripts inline (sans attribut src) d'une page. Les blocs de données (application/ld+json) ne s'exécutent pas. */
export function scriptsInline(html) {
  const trouves = [];
  for (const m of html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/type="(application\/ld\+json|application\/json)"/.test(m[1])) continue;
    trouves.push(m[2]);
  }
  return trouves;
}

export const empreinte = (contenu) => `'sha256-${createHash("sha256").update(contenu).digest("base64")}'`;

export function balisePour(html, sources) {
  const empreintes = [...new Set(scriptsInline(html).map(empreinte))];
  const contenu = `script-src ${[...sources, ...empreintes].join(" ")}`;
  return `<meta http-equiv="Content-Security-Policy" content="${contenu}"/>`;
}

function pagesHtml(dossier) {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dossier, e.name);
    return e.isDirectory() ? pagesHtml(p) : e.name.endsWith(".html") ? [p] : [];
  });
}

export function resserrer(html, sources) {
  if (html.includes('http-equiv="Content-Security-Policy"')) throw new Error("page déjà traitée");
  const balise = balisePour(html, sources);
  // Après la déclaration d'encodage (elle doit rester dans les 1 024 premiers octets de la page), avant tout script : la
  // politique s'applique à tout ce qui suit, donc à tous les scripts de la page.
  const encodage = /<meta\s+charset=[^>]*>/i.exec(html);
  if (encodage)
    return (
      html.slice(0, encodage.index + encodage[0].length) + balise + html.slice(encodage.index + encodage[0].length)
    );
  const tete = /<head[^>]*>/.exec(html);
  if (!tete) throw new Error("page sans <head>");
  return html.slice(0, tete.index + tete[0].length) + balise + html.slice(tete.index + tete[0].length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sources = sourcesDeScript(JSON.parse(readFileSync(path.join(RACINE, "vercel.json"), "utf8")));
  const pages = pagesHtml(DOSSIER);
  if (pages.length === 0) throw new Error("Aucune page HTML dans build/client : lancer d'abord le build.");
  let total = 0;
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    writeFileSync(page, resserrer(html, sources));
    total += new Set(scriptsInline(html).map(empreinte)).size;
  }
  console.log(`CSP : ${pages.length} pages, ${total} empreintes de scripts inline.`);
}
