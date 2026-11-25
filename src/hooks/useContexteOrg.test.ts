import { describe, expect, it } from "vitest";
import { construireContexte } from "./useContexteOrg";

const organisation = {
  id: "org",
  nom: "ONG Alpha",
  plan: "essai" as const,
  plan_souhaite: null,
  essai_fin: "2026-12-07T10:00:00Z",
  devise_defaut: "XOF",
  pays: "SN",
  logo_path: null,
};
const profil = { id: "u", nom: "A", email: "a@exemple.test", telephone: null };

describe("construireContexte", () => {
  it("essai actif : écriture permise, jours restants calculés", () => {
    const c = construireContexte("editeur", organisation, profil, new Date("2026-12-04T09:00:00Z"));
    expect(c.peutEcrire).toBe(true);
    expect(c.peutEditer).toBe(true);
    expect(c.joursEssaiRestants).toBe(3);
    expect(c.limites).toEqual({ projects: 3, kpis: 20, users: 5 });
  });
  it("essai terminé : lecture seule pour tous les rôles", () => {
    const c = construireContexte("admin", organisation, profil, new Date("2026-12-08T09:00:00Z"));
    expect(c.peutEcrire).toBe(false);
    expect(c.peutEditer).toBe(false);
    expect(c.estAdmin).toBe(true);
  });
  it("lecteur : jamais éditeur", () => {
    const c = construireContexte("lecteur", { ...organisation, plan: "pro" }, profil);
    expect(c.peutEcrire).toBe(true);
    expect(c.peutEditer).toBe(false);
    expect(c.joursEssaiRestants).toBeNull();
  });
  it("starter : limites du plan Starter", () => {
    expect(construireContexte("admin", { ...organisation, plan: "starter" }, profil).limites).toEqual({
      projects: 1,
      kpis: 5,
      users: 1,
    });
  });
});
