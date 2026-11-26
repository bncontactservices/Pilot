// @vitest-environment node
import { describe, expect, it } from "vitest";
import { entetesCors, originesAutorisees } from "../../supabase/functions/_shared/cors";

const env = (valeurs: Record<string, string>) => (nom: string) => valeurs[nom];
const requete = (origine?: string) =>
  new Request("https://f.test", { method: "POST", headers: origine ? { Origin: origine } : {} });

describe("originesAutorisees", () => {
  it("reprend APP_URL et ALLOWED_ORIGINS, sans doublon, réduites à leur origine", () => {
    expect(
      originesAutorisees(
        env({
          APP_URL: "https://app.exemple.org/",
          ALLOWED_ORIGINS: "http://localhost:5173, https://app.exemple.org/x ,https://preview.exemple.org",
        }),
      ),
    ).toEqual(["https://app.exemple.org", "http://localhost:5173", "https://preview.exemple.org"]);
  });

  it("ignore ce qui n'est pas une adresse http(s)", () => {
    expect(
      originesAutorisees(
        env({ APP_URL: "pas une adresse", ALLOWED_ORIGINS: "*, javascript:alert(1), ftp://x.test, ," }),
      ),
    ).toEqual([]);
  });

  it("ne tient pas le joker « * » pour une origine", () => {
    expect(originesAutorisees(env({ ALLOWED_ORIGINS: "*" }))).toEqual([]);
  });
});

describe("entetesCors", () => {
  const e = env({ APP_URL: "https://app.exemple.org", ALLOWED_ORIGINS: "http://localhost:5173" });

  it("renvoie l'origine de l'appelant quand elle est admise", () => {
    expect(entetesCors(requete("http://localhost:5173"), e)["Access-Control-Allow-Origin"]).toBe(
      "http://localhost:5173",
    );
    expect(entetesCors(requete("https://app.exemple.org"), e)["Access-Control-Allow-Origin"]).toBe(
      "https://app.exemple.org",
    );
  });

  it("refuse une origine étrangère (y compris un sous-domaine ou un autre port) sans jamais renvoyer de joker", () => {
    for (const origine of [
      "https://pirate.example",
      "https://app.exemple.org.pirate.example",
      "http://localhost:5174",
      "null",
    ]) {
      const valeur = entetesCors(requete(origine), e)["Access-Control-Allow-Origin"];
      expect(valeur, origine).toBe("https://app.exemple.org");
      expect(valeur, origine).not.toBe(origine);
    }
  });

  it("sans Origin (appel de serveur à serveur) ni configuration : « null », jamais « * »", () => {
    expect(entetesCors(requete(), e)["Access-Control-Allow-Origin"]).toBe("https://app.exemple.org");
    expect(entetesCors(requete("https://app.exemple.org"), env({}))["Access-Control-Allow-Origin"]).toBe("null");
  });

  it("indique que la réponse varie selon l'origine et garde les méthodes et en-têtes attendus", () => {
    const h = entetesCors(requete("https://app.exemple.org"), e);
    expect(h.Vary).toBe("Origin");
    expect(h["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
    expect(h["Access-Control-Allow-Headers"]).toContain("authorization");
    expect(h["Access-Control-Allow-Credentials"]).toBeUndefined();
  });
});
