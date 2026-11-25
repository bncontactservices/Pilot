import { describe, expect, it } from "vitest";
import { cleSessionStockee, lireSessionStockee } from "./session";

describe("cleSessionStockee", () => {
  it("reprend le nom que supabase-js donne à sa clé de stockage", () => {
    expect(cleSessionStockee("https://rdhjfdfbtopkgamaifda.supabase.co")).toBe("sb-rdhjfdfbtopkgamaifda-auth-token");
    expect(cleSessionStockee("http://127.0.0.1:54321")).toBe("sb-127-auth-token");
  });
});

describe("lireSessionStockee", () => {
  const stockage = (valeur: string | null) => ({ getItem: () => valeur });
  const valide = { access_token: "a", refresh_token: "r", expires_at: 1, user: { id: "u1", email: "a@exemple.test" } };

  it("rend la session gardée, même périmée (le jeton de rafraîchissement sert au retour du réseau)", () => {
    expect(lireSessionStockee("cle", stockage(JSON.stringify(valide)))?.user.id).toBe("u1");
  });

  it.each([
    ["rien", null],
    ["du texte", "pas du json"],
    ["sans jeton de rafraîchissement", JSON.stringify({ ...valide, refresh_token: "" })],
    ["sans utilisateur", JSON.stringify({ ...valide, user: undefined })],
    ["un utilisateur sans identifiant", JSON.stringify({ ...valide, user: { email: "a@exemple.test" } })],
    ["null", "null"],
  ])("rend null pour %s", (_nom, brut) => {
    expect(lireSessionStockee("cle", stockage(brut))).toBeNull();
  });

  it("rend null sans stockage, et quand la lecture lève", () => {
    expect(lireSessionStockee("cle", null)).toBeNull();
    expect(
      lireSessionStockee("cle", {
        getItem: () => {
          throw new Error("bloqué");
        },
      }),
    ).toBeNull();
  });
});
