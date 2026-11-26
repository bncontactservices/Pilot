#!/usr/bin/env node
// Saisie hors ligne dans le VRAI Safari de bureau (WebDriver), contre le vrai Supabase (Lot 4a, DECISIONS.md section 28).
//
// Safari n'a pas de mode hors ligne simulable : le build de test fait passer Supabase par le serveur d'aperçu local
// (/supabase/*), et arrêter ce serveur coupe l'application ET sa base, comme une absence de réseau (navigator.onLine reste vrai :
// le cas « réseau annoncé mais injoignable »). Le scénario : connexion, page de saisie, service worker et IndexedDB, serveur
// arrêté et jeton périmé, ouverture sans serveur, saisie dans la file, rechargement, serveur relancé, envoi et identifiant conservé.
//
// Prérequis (voir e2e/README.md) : Safari > Réglages > Développeur > « Autoriser l'automatisation à distance », un compte
// administrateur de test (.env.e2e), et un build dédié :
//   VITE_SUPABASE_URL=http://localhost:4191/supabase npm run build
// Puis : node scripts/safari-hors-ligne.mjs   (rebâtir ensuite avec « npm run build » : ce build ne sert qu'à ce test).
// Il crée « Projet E2E Safari » et le supprime à la fin.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const fichier of [".env.e2e", ".env.local"]) {
  try {
    process.loadEnvFile(path.join(RACINE, fichier));
  } catch {
    // absent
  }
}
const SUPA = process.env.VITE_SUPABASE_URL;
const CLE = process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const MDP = process.env.E2E_ADMIN_MDP;
if (!SUPA || !CLE || !EMAIL || !MDP) throw new Error("VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY et les comptes de test (.env.e2e) sont requis");
const PORT = 4191;
const APP = `http://localhost:${PORT}`;
const WD = "http://localhost:4455";
const pilote = spawn("safaridriver", ["-p", "4455"], { stdio: "ignore" });
const t0 = Date.now();
const log = (...a) => console.log(String(((Date.now() - t0) / 1000).toFixed(1)).padStart(6), ...a);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const resultats = {};

// --- Supabase (côté Node, directement) -------------------------------------------------------------------------
async function jeton() {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: CLE, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: MDP }),
  });
  return (await r.json()).access_token;
}
const entetes = (t) => ({ apikey: CLE, Authorization: `Bearer ${t}`, "Content-Type": "application/json", Prefer: "return=representation" });
async function api(t, methode, chemin, corps) {
  const r = await fetch(`${SUPA}/rest/v1/${chemin}`, { method: methode, headers: entetes(t), body: corps ? JSON.stringify(corps) : undefined });
  const texte = await r.text();
  return { statut: r.status, json: texte ? JSON.parse(texte) : null };
}

// --- Serveur de l'application ------------------------------------------------------------------------------------
let serveur = null;
async function demarrerServeur() {
  serveur = spawn(process.execPath, ["scripts/apercu-build.mjs", String(PORT)], {
    cwd: RACINE,
    stdio: "ignore",
    env: { ...process.env, APERCU_SUPABASE: SUPA, APERCU_SANS_UPGRADE: "1" },
  });
  for (let i = 0; i < 50; i++) {
    if (await fetch(APP).then(() => true, () => false)) return;
    await pause(200);
  }
  throw new Error("serveur injoignable");
}
const arreterServeur = () => serveur?.kill("SIGKILL");
const serveurJoignable = () => fetch(`${APP}/robots.txt`).then(() => true, () => false);

// --- WebDriver ---------------------------------------------------------------------------------------------------
let sid = null;
async function wd(methode, chemin, corps) {
  const r = await fetch(`${WD}${chemin}`, { method: methode, headers: { "Content-Type": "application/json" }, body: corps ? JSON.stringify(corps) : undefined });
  const j = await r.json();
  if (j.value?.error) throw new Error(`${j.value.error}: ${j.value.message}`);
  return j.value;
}
const executer = (script, args = []) => wd("POST", `/session/${sid}/execute/sync`, { script, args });
const executerAsync = (script, args = []) => wd("POST", `/session/${sid}/execute/async`, { script, args });
const naviguer = (url) => wd("POST", `/session/${sid}/url`, { url });
async function attendre(description, fn, timeoutMs = 60000, pas = 300) {
  const debut = Date.now();
  let derniere;
  while (Date.now() - debut < timeoutMs) {
    try {
      const v = await fn();
      if (v) return { v, ms: Date.now() - debut };
    } catch (e) {
      derniere = e;
    }
    await pause(pas);
  }
  throw new Error(`délai dépassé : ${description}${derniere ? ` (${derniere.message})` : ""}`);
}
const texteCorps = () => executer("return document.body ? document.body.innerText : ''");
const present = (css) => executer("return Boolean(document.querySelector(arguments[0]))", [css]);
async function saisirTexte(css, texte) {
  const el = await wd("POST", `/session/${sid}/element`, { using: "css selector", value: css });
  const id = Object.values(el)[0];
  await wd("POST", `/session/${sid}/element/${id}/clear`, {});
  await wd("POST", `/session/${sid}/element/${id}/value`, { text: texte });
}
const cliquerBouton = (libelle) =>
  executer("const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===arguments[0]); if(!b) return false; b.click(); return true;", [libelle]);

const lireFile = () =>
  executer("return Object.keys(localStorage).filter(c=>c.startsWith('pilot.file.v1.')).map(c=>JSON.parse(localStorage.getItem(c)))");
const lireCacheGarde = () =>
  executerAsync(
    `const fait=arguments[arguments.length-1];
     const o=indexedDB.open('pilot-hors-ligne');
     o.onerror=()=>fait(null);
     o.onsuccess=()=>{const b=o.result; if(!b.objectStoreNames.contains('cache')){b.close();fait(null);return;}
       const g=b.transaction('cache').objectStore('cache').get('requetes');
       g.onsuccess=()=>{b.close();fait(g.result?{proprietaire:g.result.proprietaire,cles:g.result.requetes.map(r=>r.cle[0]+':'+(r.cle[1]||''))}:null)};
       g.onerror=()=>{b.close();fait(null)};};`,
  );

// --- Scénario ----------------------------------------------------------------------------------------------------
let projetId = "";
let jetonAdmin = "";
try {
  jetonAdmin = await jeton();
  const org = (await api(jetonAdmin, "GET", "organisations?select=id")).json[0].id;
  const projet = await api(jetonAdmin, "POST", "projects", { org_id: org, nom: "Projet E2E Safari", date_debut: "2026-01-01", date_fin: "2027-12-31" });
  projetId = projet.json[0].id;
  const kpi = await api(jetonAdmin, "POST", "kpis", { project_id: projetId, nom: "Points d'eau Safari", unite: "points", cible: 100, valeur_base: 0, frequence: "mensuelle", sens: "croissant", type_agregation: "dernier" });
  const kpiId = kpi.json[0].id;
  log("projet et indicateur de test créés");

  await demarrerServeur();
  log("serveur de l'application (avec relais Supabase) démarré sur", APP);

  await pause(1500); // laisse safaridriver démarrer
  const session = await wd("POST", "/session", { capabilities: { alwaysMatch: { browserName: "safari" } } });
  sid = session.sessionId;
  await wd("POST", `/session/${sid}/timeouts`, { script: 120000, pageLoad: 90000, implicit: 0 });
  log("Safari", session.capabilities.browserVersion, "piloté");

  // 1. Connexion
  await naviguer(`${APP}/connexion`);
  await attendre("formulaire de connexion", () => present("input[type=email]"));
  await saisirTexte("input[type=email]", EMAIL);
  await saisirTexte("input[type=password]", MDP);
  await executer("document.querySelector('button[type=submit]').click()");
  await attendre("arrivée dans /app", async () => (await executer("return location.pathname")).startsWith("/app"), 60000);
  log("connecté, url :", await executer("return location.pathname"));

  // 2. Page de saisie en ligne ; le service worker et les données se gardent
  await naviguer(`${APP}/app/projets/${projetId}/saisie`);
  const enLigne = await attendre("page de saisie en ligne", async () => (await texteCorps()).includes("Saisir une valeur"), 60000);
  resultats.chargement_en_ligne_ms = enLigne.ms;
  log("page de saisie visible en ligne");

  const sw = await executerAsync(
    `const fait=arguments[arguments.length-1];
     (async()=>{ if(!('serviceWorker' in navigator)) return fait({ok:false,raison:'serviceWorker absent'});
       const reg=await navigator.serviceWorker.ready;
       for(let i=0;i<200;i++){ const noms=(await caches.keys()).filter(n=>/^pilot-[0-9a-f]{12}$/.test(n));
         const n=noms.length?(await (await caches.open(noms[0])).keys()).length:0;
         if(n>=200) return fait({ok:true,entrees:n,scope:reg.scope,controle:Boolean(navigator.serviceWorker.controller)});
         await new Promise(r=>setTimeout(r,200)); }
       fait({ok:false,raison:'précache incomplet'}); })().catch(e=>fait({ok:false,raison:String(e)}));`,
  );
  resultats.service_worker = sw;
  log("service worker :", JSON.stringify(sw));

  const garde = await attendre("données gardées (IndexedDB)", async () => {
    const c = await lireCacheGarde();
    return c && c.cles.some((k) => k === `kpis:${projetId}`) ? c : null;
  }, 30000).catch(() => null);
  resultats.indexeddb = garde ? { ok: true, requetes: garde.v.cles.length } : { ok: false };
  log("IndexedDB :", JSON.stringify(resultats.indexeddb));

  // 3. Coupure : le serveur disparaît (application et base), le jeton d'accès est périmé
  arreterServeur();
  await pause(800);
  resultats.serveur_joignable_apres_arret = await serveurJoignable();
  log("serveur arrêté, joignable :", resultats.serveur_joignable_apres_arret);
  await executer("const c=Object.keys(localStorage).find(k=>/^sb-.*-auth-token$/.test(k)); const s=JSON.parse(localStorage.getItem(c)); s.expires_at=1; localStorage.setItem(c,JSON.stringify(s)); return c;");

  const t1 = Date.now();
  await naviguer(`${APP}/app/projets/${projetId}/saisie`);
  log("navigation terminée (service worker) en", Date.now() - t1, "ms");
  const boot = await attendre("page de saisie sans serveur", async () => (await texteCorps()).includes("Saisir une valeur"), 120000);
  resultats.ouverture_sans_serveur_ms = Date.now() - t1;
  log("PAGE DE SAISIE VISIBLE sans serveur après", resultats.ouverture_sans_serveur_ms, "ms ; navigator.onLine =", await executer("return navigator.onLine"));

  // 4. Saisie sans réseau
  const jour = new Date().toISOString().slice(0, 10);
  await saisirTexte("#saisie-valeur", "7");
  const t2 = Date.now();
  await cliquerBouton("Enregistrer");
  const carte = await attendre("carte d'attente", () => present('[data-testid="saisies-en-attente"]'), 120000);
  resultats.saisie_mise_en_file_ms = Date.now() - t2;
  const file = await lireFile();
  resultats.file = file.map((s) => ({ valeur: s.valeur, date: s.date, statut: s.statut }));
  log("SAISIE EN FILE après", resultats.saisie_mise_en_file_ms, "ms :", JSON.stringify(resultats.file));
  const idFile = file[0]?.id;

  // 5. Rechargement sans serveur : la saisie survit
  await naviguer(`${APP}/app/projets/${projetId}/saisie`);
  await attendre("carte d'attente après rechargement", () => present('[data-testid="saisies-en-attente"]'), 120000);
  const apres = await lireFile();
  resultats.survit_au_rechargement = apres.length === 1 && apres[0].id === idFile;
  log("après rechargement sans serveur, la file est intacte :", resultats.survit_au_rechargement);

  // 6. Le « réseau » revient : le serveur repart ; l'envoi automatique doit faire son travail
  await demarrerServeur();
  const t3 = Date.now();
  log("serveur relancé : on attend l'envoi automatique…");
  await attendre("envoi de la saisie", async () => !(await present('[data-testid="saisies-en-attente"]')), 180000, 1000).then(
    () => (resultats.envoi_apres_retour_ms = Date.now() - t3),
    (e) => (resultats.envoi_apres_retour_ms = `ÉCHEC : ${e.message}`),
  );
  log("envoi après retour du serveur :", resultats.envoi_apres_retour_ms, "ms");

  const lignes = (await api(jetonAdmin, "GET", `kpi_entries?select=id,valeur,date&kpi_id=eq.${kpiId}`)).json;
  resultats.ligne_en_base = lignes;
  resultats.identifiant_conserve = lignes.length === 1 && lignes[0].id === idFile && Number(lignes[0].valeur) === 7;
  log("base :", JSON.stringify(lignes), "identifiant de l'appareil conservé :", resultats.identifiant_conserve);
} catch (e) {
  resultats.erreur = String(e.message ?? e);
  log("ERREUR :", resultats.erreur);
} finally {
  try { if (sid) await wd("DELETE", `/session/${sid}`); } catch {}
  arreterServeur();
  pilote.kill();
  if (projetId) await api(jetonAdmin || (await jeton()), "DELETE", `projects?id=eq.${projetId}`).catch(() => {});
  console.log("\nRÉSULTATS :", JSON.stringify(resultats, null, 2));
}
