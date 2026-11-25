import { describe, expect, it } from "vitest";
import { acteursRattachables, type ActeurListe, filtrerActeurs, normaliser, rolesParActeur } from "./acteurs";

const acteurs: ActeurListe[] = [
  { id: "a1", nom: "Fondation pour l’eau", type: "bailleur", contact: "Chargée de programme" },
  { id: "a2", nom: "Mairie de Kolda", type: "autorite_locale", description: "Éducation et état civil" },
  { id: "a3", nom: "Entreprise de forage", type: "prestataire" },
];

describe("annuaire d'acteurs", () => {
  it("normalise sans accents ni majuscules", () => {
    expect(normaliser("  Éducation  ")).toBe("education");
    expect(normaliser("Mairie")).toBe("mairie");
  });
  it("filtre par type", () => {
    expect(filtrerActeurs(acteurs, { type: "prestataire" }).map((a) => a.id)).toEqual(["a3"]);
    expect(filtrerActeurs(acteurs, { type: "" })).toHaveLength(3);
  });
  it("cherche dans le nom, le contact et la description, sans tenir compte des accents", () => {
    expect(filtrerActeurs(acteurs, { recherche: "KOLDA" }).map((a) => a.id)).toEqual(["a2"]);
    expect(filtrerActeurs(acteurs, { recherche: "education" }).map((a) => a.id)).toEqual(["a2"]);
    expect(filtrerActeurs(acteurs, { recherche: "chargee" }).map((a) => a.id)).toEqual(["a1"]);
    expect(filtrerActeurs(acteurs, { recherche: "introuvable" })).toEqual([]);
  });
  it("combine le type et la recherche", () => {
    expect(filtrerActeurs(acteurs, { type: "bailleur", recherche: "kolda" })).toEqual([]);
  });
  it("regroupe les rôles par acteur", () => {
    const roles = [
      { acteur_id: "a1", project_id: "p1", role: "Bailleur principal" },
      { acteur_id: "a1", project_id: "p2", role: "Cofinanceur" },
      { acteur_id: "a2", project_id: "p1", role: "Autorité locale" },
    ];
    const groupes = rolesParActeur(roles);
    expect(groupes.get("a1")).toHaveLength(2);
    expect(groupes.get("a3")).toBeUndefined();
  });
  it("propose à un projet les acteurs qui n'y ont pas encore de rôle", () => {
    expect(acteursRattachables(acteurs, [{ acteur_id: "a1" }]).map((a) => a.id)).toEqual(["a2", "a3"]);
  });
});
