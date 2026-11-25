import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fr from "./fr.json";

const RACINE = path.resolve(__dirname, "..");

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(tsx?|mjs)$/.test(nom) && !nom.endsWith(".test.ts") ? [chemin] : [];
  });
}

function existe(cle: string): boolean {
  const valeur = cle
    .split(".")
    .reduce<unknown>((noeud, partie) => (noeud as Record<string, unknown> | undefined)?.[partie], fr);
  if (typeof valeur === "string") return true;
  // Clé plurielle : au moins les formes _one et _other.
  const parent = cle
    .split(".")
    .slice(0, -1)
    .reduce<unknown>((n, p) => (n as Record<string, unknown>)?.[p], fr) as Record<string, unknown>;
  const feuille = cle.split(".").at(-1)!;
  return typeof parent?.[`${feuille}_one`] === "string" && typeof parent?.[`${feuille}_other`] === "string";
}

describe("traductions françaises", () => {
  const sources = fichiers(RACINE).map((f) => readFileSync(f, "utf8"));

  it("contiennent toutes les clés statiques utilisées dans le code", () => {
    const cles = new Set<string>();
    for (const source of sources) {
      for (const m of source.matchAll(/\bt\(\s*"([a-z_.A-Z:]+)"/g)) cles.add(m[1]!);
      for (const m of source.matchAll(/error:\s*"([a-z_.]+)"/g)) cles.add(m[1]!);
      for (const m of source.matchAll(/message:\s*"([a-z_]+\.[a-z_.]+)"/g)) cles.add(m[1]!);
      for (const m of source.matchAll(/cle:\s*"([a-z_]+\.[a-z_.]+)"/g)) cles.add(m[1]!);
      for (const m of source.matchAll(/:\s*"(erreurs\.[a-zA-Z_.]+)"/g)) cles.add(m[1]!);
    }
    const manquantes = [...cles].filter((cle) => !existe(cle));
    expect(manquantes).toEqual([]);
  });

  it("couvrent les familles de clés dynamiques", () => {
    const familles = {
      roles: ["admin", "editeur", "lecteur"],
      "roles.descriptions": ["admin", "editeur", "lecteur"],
      plans: ["essai", "starter", "pro", "enterprise"],
      "projets.statuts": ["non_demarre", "en_cours", "en_retard", "suspendu", "termine", "cloture"],
      limite: ["projects", "kpis", "users"],
      "erreurs.PLAN_LIMIT": ["projects", "kpis", "users"],
      "auth.marque": ["position", "ecart", "action"],
      "equipe.inviter": ["email_envoye", "email_non_configure", "email_echec"],
      "kpi.statuts": ["ok", "warn", "alert", "none"],
      "kpi.actions": ["warn", "alert"],
      "kpi.frequences": ["hebdomadaire", "mensuelle", "trimestrielle", "annuelle"],
      "kpi.agregations": ["cumul", "dernier", "moyenne"],
      "kpi.sens": ["croissant", "decroissant"],
      "kpi.carte": ["ecart_avance", "ecart_retard"],
      "kpi.formulaire": ["titre_creer", "titre_modifier", "cree", "modifie", "action_creer"],
      "kpi.formulaire.agregation_aide": ["cumul", "dernier", "moyenne"],
      kpi: ["epingler", "desepingler"],
      "dashboard.periodes": ["tout", "12m", "6m", "3m", "perso"],
      pays: ["SN", "CI", "ML", "BF", "NE", "GN", "TG", "BJ", "CM", "MR", "GM", "GW", "CV", "FR"],
    };
    const manquantes = Object.entries(familles).flatMap(([prefixe, valeurs]) =>
      valeurs.map((v) => `${prefixe}.${v}`).filter((cle) => !existe(cle)),
    );
    expect(manquantes).toEqual([]);
  });

  it("traduisent chaque code d'erreur métier de la base", () => {
    const dossier = path.resolve(RACINE, "../supabase/migrations");
    const migrations = readdirSync(dossier)
      .filter((nom) => nom.endsWith(".sql"))
      .map((nom) => readFileSync(path.join(dossier, nom), "utf8"));
    const codes = new Set(
      migrations.flatMap((sql) => [...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]!)),
    );
    codes.delete("NON_AUTHENTIFIE");
    const manquants = [...codes].filter((code) => !existe(`erreurs.${code}`));
    expect(manquants).toEqual([]);
  });
});
