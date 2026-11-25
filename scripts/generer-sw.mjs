#!/usr/bin/env node
// Produit build/client/sw.js (étape « postbuild »), le service worker qui garde l'enveloppe de l'application pour
// l'ouvrir sans réseau (Lot 4a).
//
// - Il précharge la page de repli de l'application, le manifeste, les icônes et les fichiers de /assets/ utiles à la
//   saisie. Les modules lourds et rarement utiles (export PDF, import Excel, carte) ne sont pas préchargés : ils sont
//   gardés à l'usage, la première fois qu'on s'en sert.
// - Il ne touche ni à la landing, ni au deck, ni aux pages légales, ni à Supabase : seulement /app et la connexion.
// - La version dérive du contenu : un nouveau build donne un nouveau service worker, qui remplace l'ancien. L'ancien
//   cache est gardé une génération de plus, pour qu'un onglet resté ouvert trouve encore ses modules.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "build", "client");
const ASSETS = path.join(DOSSIER, "assets");

// Gardés à l'usage seulement (gros, et sans rapport avec la saisie).
const NON_PRECHARGES = [/^generer-/, /^import\.worker-/, /^import-lecture-/, /^CarteZones-/, /\.map$/];

const fichiers = readdirSync(ASSETS)
  .filter((nom) => statSync(path.join(ASSETS, nom)).isFile())
  .filter((nom) => !NON_PRECHARGES.some((motif) => motif.test(nom)))
  .sort();
const urls = fichiers.map((nom) => `/assets/${nom}`);

const coeur = [
  "/__spa-fallback.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

const empreinte = createHash("sha256");
for (const url of urls) empreinte.update(url);
empreinte.update(readFileSync(path.join(DOSSIER, "__spa-fallback.html")));
const version = empreinte.digest("hex").slice(0, 12);

const source = `// Généré par scripts/generer-sw.mjs : ne pas modifier à la main.
const VERSION = ${JSON.stringify(version)};
const CACHE = "pilot-" + VERSION;
const META = "pilot-meta";
const COEUR = ${JSON.stringify(coeur)};
const ASSETS = ${JSON.stringify(urls)};
// Seules ces pages passent par le service worker (l'application et la connexion) ; la landing, le deck et les pages légales restent au réseau.
const PAGES_APP = /^\\/(app|connexion|inscription|mot-de-passe-oublie|reinitialiser-mot-de-passe)(\\/|$)/;
const DELAI_RESEAU_MS = 4000;

self.addEventListener("install", (evenement) => {
  evenement.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Le cœur est indispensable : s'il manque, l'installation échoue et l'ancienne version reste en place.
      await cache.addAll(COEUR);
      // Le reste au mieux : un fichier qui manque se récupère à l'usage.
      await Promise.allSettled(ASSETS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(
    (async () => {
      const meta = await caches.open(META);
      const ancien = await meta.match("/_versions").then((r) => (r ? r.json() : null)).catch(() => null);
      const precedent = ancien && ancien.courant !== CACHE ? ancien.courant : ancien ? ancien.precedent : null;
      await meta.put("/_versions", new Response(JSON.stringify({ courant: CACHE, precedent })));
      const garder = new Set([CACHE, precedent, META]);
      for (const nom of await caches.keys()) {
        if (nom.startsWith("pilot-") && !garder.has(nom)) await caches.delete(nom);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (evenement) => {
  const requete = evenement.request;
  if (requete.method !== "GET") return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  if (requete.mode === "navigate") {
    if (PAGES_APP.test(url.pathname)) evenement.respondWith(navigation(requete));
    return;
  }
  if (url.pathname.startsWith("/assets/") || COEUR.includes(url.pathname)) {
    evenement.respondWith(cacheAbord(requete));
  }
});

// Réseau d'abord (la page à jour), la page de repli gardée si le réseau manque ou tarde trop.
async function navigation(requete) {
  try {
    return await Promise.race([
      fetch(requete),
      new Promise((_, refuser) => setTimeout(() => refuser(new Error("delai")), DELAI_RESEAU_MS)),
    ]);
  } catch {
    const repli = await caches.match("/__spa-fallback.html");
    return repli || Response.error();
  }
}

// Les fichiers de /assets/ portent leur empreinte dans leur nom : le cache fait foi.
async function cacheAbord(requete) {
  const trouve = await caches.match(requete);
  if (trouve) return trouve;
  const reponse = await fetch(requete);
  // On ne garde pas la page de repli servie à la place d'un fichier absent (200 en text/html).
  const type = reponse.headers.get("content-type") || "";
  if (reponse.ok && !type.startsWith("text/html")) {
    const cache = await caches.open(CACHE);
    cache.put(requete, reponse.clone()).catch(() => undefined);
  }
  return reponse;
}
`;

writeFileSync(path.join(DOSSIER, "sw.js"), source);
const octets = urls.reduce((somme, url) => somme + statSync(path.join(DOSSIER, url)).size, 0);
console.log(
  `sw.js : version ${version}, ${urls.length} fichiers préchargés (${(octets / 1024 / 1024).toFixed(1)} Mo avant compression).`,
);
