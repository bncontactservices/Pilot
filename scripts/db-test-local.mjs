#!/usr/bin/env node
// Applique les migrations et exécute les tests pgTAP sur un Postgres embarqué,
// sans Docker. Complément de `supabase test db` (qui reste la référence) :
// le socle Supabase y est imité par scripts/db-test/supabase-stub.sql.
//
// Usage : npm run db:test:local [-- motif]   (motif : filtre sur le nom des fichiers de test)

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, ".pg-test");
const PORT = 54329;
const PGTAP_VERSION = "1.3.4";
const IDENTIFIANTS = { host: "127.0.0.1", port: PORT, user: "postgres", password: "postgres" };
const motif = process.argv[2] ?? "";

function dossierExtensions() {
  const plateforme = `${process.platform}-${process.arch}`;
  return path.join(RACINE, "node_modules", "@embedded-postgres", plateforme, "native", "share", "postgresql", "extension");
}

async function installerPgtap() {
  const ext = dossierExtensions();
  const cible = path.join(ext, `pgtap--${PGTAP_VERSION}.sql`);
  if (existsSync(cible)) return;

  const dossier = path.join(DOSSIER, "pgtap");
  const source = path.join(dossier, `pgtap-${PGTAP_VERSION}`);
  if (!existsSync(source)) {
    mkdirSync(dossier, { recursive: true });
    const url = `https://github.com/theory/pgtap/archive/refs/tags/v${PGTAP_VERSION}.tar.gz`;
    console.log(`Téléchargement de pgTAP ${PGTAP_VERSION}…`);
    const reponse = await fetch(url);
    if (!reponse.ok) throw new Error(`pgTAP introuvable (${reponse.status})`);
    const archive = path.join(dossier, `pgtap-${PGTAP_VERSION}.tar.gz`);
    writeFileSync(archive, Buffer.from(await reponse.arrayBuffer()));
    execFileSync("tar", ["-xzf", archive, "-C", dossier]);
  }

  // Mêmes substitutions que le Makefile de pgTAP (Postgres ≥ 10 : aucun patch).
  const numVersion = PGTAP_VERSION.split(".").slice(0, 2).join(".");
  const sql = readFileSync(path.join(source, "sql", "pgtap.sql.in"), "utf8")
    .replaceAll("MODULE_PATHNAME", "pgtap")
    .replaceAll("__OS__", process.platform)
    .replaceAll("__VERSION__", numVersion);
  writeFileSync(cible, sql);
  copyFileSync(path.join(source, "pgtap.control"), path.join(ext, "pgtap.control"));
}

function ligneErreur(contenu, position) {
  if (!position) return "";
  const avant = contenu.slice(0, Number(position));
  const numero = avant.split("\n").length;
  return ` (ligne ${numero} : ${contenu.split("\n")[numero - 1]?.trim()})`;
}

async function executerFichier(client, fichier) {
  const contenu = readFileSync(fichier, "utf8");
  try {
    return await client.query(contenu);
  } catch (erreur) {
    const relatif = path.relative(RACINE, fichier);
    throw new Error(`${relatif}${ligneErreur(contenu, erreur.position)}\n  ${erreur.message}`);
  }
}

function lignesTap(resultats) {
  const liste = Array.isArray(resultats) ? resultats : [resultats];
  const lignes = [];
  for (const resultat of liste) {
    for (const rangee of resultat.rows ?? []) {
      const valeur = Object.values(rangee)[0];
      if (typeof valeur === "string" && /^(ok|not ok|1\.\.|#)/.test(valeur)) {
        lignes.push(...valeur.split("\n"));
      }
    }
  }
  return lignes;
}

async function main() {
  await installerPgtap();

  rmSync(path.join(DOSSIER, "data"), { recursive: true, force: true });
  const serveur = new EmbeddedPostgres({
    databaseDir: path.join(DOSSIER, "data"),
    ...IDENTIFIANTS,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await serveur.initialise();
  await serveur.start();

  let echecs = 0;
  let total = 0;
  try {
    const admin = new pg.Client({ ...IDENTIFIANTS, database: "postgres" });
    await admin.connect();
    await admin.query("create database pilot_test");
    await admin.query(`alter database pilot_test set search_path to "$user", public, extensions`);
    await admin.end();

    const base = new pg.Client({ ...IDENTIFIANTS, database: "pilot_test" });
    await base.connect();
    await executerFichier(base, path.join(RACINE, "scripts", "db-test", "supabase-stub.sql"));
    await base.query("create extension if not exists pgtap with schema extensions");

    const dossierMigrations = path.join(RACINE, "supabase", "migrations");
    for (const nom of readdirSync(dossierMigrations).filter((f) => f.endsWith(".sql")).sort()) {
      await executerFichier(base, path.join(dossierMigrations, nom));
      console.log(`✓ migration ${nom}`);
    }
    await base.end();

    const dossierTests = path.join(RACINE, "supabase", "tests");
    const fichiers = readdirSync(dossierTests)
      .filter((f) => f.endsWith(".test.sql") && f.includes(motif))
      .sort();

    for (const nom of fichiers) {
      const client = new pg.Client({ ...IDENTIFIANTS, database: "pilot_test" });
      await client.connect();
      console.log(`\n# ${nom}`);
      try {
        const lignes = lignesTap(await executerFichier(client, path.join(dossierTests, nom)));
        for (const ligne of lignes) {
          if (ligne.startsWith("not ok") || ligne.startsWith("# Looks like")) echecs += 1;
          if (/^(ok|not ok)/.test(ligne)) total += 1;
          if (!ligne.startsWith("ok") || process.env.VERBOSE) console.log(ligne);
        }
        const ok = lignes.filter((l) => l.startsWith("ok")).length;
        console.log(`  ${ok}/${lignes.filter((l) => /^(ok|not ok)/.test(l)).length} assertions passées`);
      } catch (erreur) {
        echecs += 1;
        console.log(`not ok - le fichier a échoué : ${erreur.message}`);
      } finally {
        await client.end();
      }
    }
  } finally {
    await serveur.stop();
  }

  console.log(`\n${echecs === 0 ? "✓" : "✗"} ${total} assertions, ${echecs} échec(s)`);
  process.exitCode = echecs === 0 ? 0 : 1;
}

main().catch((erreur) => {
  console.error(`✗ ${erreur.message}`);
  process.exitCode = 1;
});
