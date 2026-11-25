#!/usr/bin/env node
// Sert build/client comme Vercel le ferait, avec les en-têtes et la réécriture de vercel.json
// (npm run apercu), avec compression. Sert à vérifier en local la politique de sécurité (CSP), les tests de bout en bout
// (Playwright) et Lighthouse sur le vrai build.
// Usage : npm run build && npm run apercu [-- port]

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createBrotliCompress, createGzip } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "build", "client");
const PORT = Number(process.argv[2] ?? 4173);
const config = JSON.parse(readFileSync(path.join(RACINE, "vercel.json"), "utf8"));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff": "font/woff", ".woff2": "font/woff2", ".json": "application/json", ".webmanifest": "application/manifest+json", ".xml": "application/xml", ".txt": "text/plain" };

// Les motifs de vercel.json sont de la forme « /prefixe/(.*) » ou un chemin exact.
const correspond = (source, chemin) => new RegExp(`^${source.replace("(.*)", ".*")}$`).test(chemin);

function fichierPour(chemin) {
  const brut = path.join(DOSSIER, decodeURIComponent(chemin));
  if (!brut.startsWith(DOSSIER)) return null;
  for (const candidat of [brut, path.join(brut, "index.html")]) {
    if (existsSync(candidat) && statSync(candidat).isFile()) return candidat;
  }
  return null;
}

createServer((requete, reponse) => {
  const chemin = new URL(requete.url, "http://localhost").pathname;
  const fichier = fichierPour(chemin) ?? path.join(DOSSIER, "__spa-fallback.html");
  const entetes = { "Content-Type": TYPES[path.extname(fichier)] ?? "application/octet-stream" };
  for (const regle of config.headers) {
    if (correspond(regle.source, chemin)) for (const { key, value } of regle.headers) entetes[key] = value;
  }
  // Comme Vercel : les fichiers texte sont servis compressés (Brotli ou gzip) quand le navigateur l'accepte.
  const compressible = /^(text\/|image\/svg|application\/(json|xml)|font\/(woff|ttf)$)/.test(entetes["Content-Type"]) && !/woff2?$/.test(path.extname(fichier).slice(1));
  const accepte = String(requete.headers["accept-encoding"] ?? "");
  const flux = createReadStream(fichier);
  if (compressible && /\bbr\b/.test(accepte)) {
    entetes["Content-Encoding"] = "br";
    reponse.writeHead(200, entetes);
    flux.pipe(createBrotliCompress()).pipe(reponse);
  } else if (compressible && /\bgzip\b/.test(accepte)) {
    entetes["Content-Encoding"] = "gzip";
    reponse.writeHead(200, entetes);
    flux.pipe(createGzip()).pipe(reponse);
  } else {
    reponse.writeHead(200, entetes);
    flux.pipe(reponse);
  }
}).listen(PORT, () => console.log(`Aperçu du build avec les en-têtes de vercel.json : http://localhost:${PORT}`));
