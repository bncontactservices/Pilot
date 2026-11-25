import { describe, expect, it } from "vitest";
import { destinationSure } from "./AuthLayout";

describe("destinationSure", () => {
  it("accepte les chemins internes de l'application", () => {
    expect(destinationSure("/app/equipe")).toBe("/app/equipe");
    expect(destinationSure("/app")).toBe("/app");
  });
  it("refuse toute redirection externe ou hors application", () => {
    for (const suite of ["https://exemple.test", "//exemple.test", "/connexion", "/app/../x", "/app?x=1", null]) {
      expect(destinationSure(suite)).toBe("/app");
    }
  });
});
