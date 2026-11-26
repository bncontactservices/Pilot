#!/usr/bin/env node
// Contrôle des variables du build (étape « prebuild »). Deux garde-fous :
//
//  1. Aucune valeur secrète dans une variable VITE_ : tout ce qui porte ce préfixe est copié dans le JavaScript envoyé à tous les
//     visiteurs. Le build échoue si une clé secrète (Supabase service, Stripe, Resend, jeton GitHub…) s'y trouve.
//  2. Les variables indispensables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) sont présentes. Sur Vercel et en intégration
//     continue, leur absence fait échouer le build (sinon le site se déploie « non configuré » et personne ne peut se
//     connecter) ; en local, c'est un simple avertissement : la landing se construit sans base.
//
// Lit les mêmes fichiers que Vite (.env, .env.local, .env.production…) et l'environnement du processus.

import { loadEnv } from "vite";

const RACINE = process.cwd();
const env = loadEnv(process.env.NODE_ENV === "development" ? "development" : "production", RACINE, "VITE_");
const strict = Boolean(process.env.VERCEL || process.env.CI);

const MOTIFS_SECRETS = [
  [/^sb_secret_/, "clé secrète Supabase"],
  [/^(sk|rk)_(live|test)_/, "clé secrète Stripe"],
  [/^whsec_/, "secret de webhook Stripe"],
  [/^re_[A-Za-z0-9]{20,}$/, "clé Resend"],
  [/^(ghp|gho|ghu|ghs|github_pat)_/, "jeton GitHub"],
  [/^xox[bp]-/, "jeton Slack"],
  [/^AKIA[0-9A-Z]{16}$/, "clé d'accès AWS"],
];

function roleDuJwt(valeur) {
  const morceaux = valeur.split(".");
  if (morceaux.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(morceaux[1], "base64url").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

const erreurs = [];
const avertissements = [];

for (const [nom, valeur] of Object.entries(env)) {
  for (const [motif, libelle] of MOTIFS_SECRETS) {
    if (motif.test(valeur.trim())) erreurs.push(`${nom} contient une ${libelle} : une variable VITE_ est publique.`);
  }
  if (roleDuJwt(valeur.trim()) === "service_role")
    erreurs.push(`${nom} contient la clé service_role de Supabase : une variable VITE_ est publique.`);
}

const manquantes = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"].filter((nom) => !env[nom]?.trim());
for (const nom of manquantes)
  (strict ? erreurs : avertissements).push(`${nom} est absente : l'application se construirait « non configurée ».`);

const url = env.VITE_SUPABASE_URL?.trim();
if (url) {
  try {
    const u = new URL(url);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && !strict))
      erreurs.push("VITE_SUPABASE_URL doit être une adresse https://.");
  } catch {
    erreurs.push("VITE_SUPABASE_URL n'est pas une adresse valide.");
  }
}

for (const a of avertissements) console.warn(`⚠ ${a}`);
if (erreurs.length > 0) {
  for (const e of erreurs) console.error(`✗ ${e}`);
  console.error("Build interrompu : corrigez les variables d'environnement (voir .env.example).");
  process.exit(1);
}
console.log(
  `Variables de build vérifiées (${Object.keys(env).length} variables VITE_${strict ? ", mode strict" : ""}).`,
);
