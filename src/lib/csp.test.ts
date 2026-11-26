// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
// @ts-expect-error script .mjs sans déclaration de types
import { empreinte, resserrer, scriptsInline, sourcesDeScript } from "../../scripts/generer-csp.mjs";

const vercel = {
  headers: [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        {
          key: "Content-Security-Policy",
          value:
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://plausible.io; style-src 'self' 'unsafe-inline'",
        },
      ],
    },
  ],
};
const PAGE = `<!DOCTYPE html><html lang="fr"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width"/><title>t</title><script type="application/ld+json">{"@context":"x"}</script></head><body><script>window.a=1;</script><script type="module" async="">import("/assets/e.js")</script><script src="/assets/x.js" defer></script><script>window.a=1;</script></body></html>`;

describe("sourcesDeScript", () => {
  it("reprend les sources de l'en-tête de vercel.json, sans 'unsafe-inline'", () => {
    expect(sourcesDeScript(vercel)).toEqual(["'self'", "'wasm-unsafe-eval'", "https://plausible.io"]);
  });
  it("échoue si l'en-tête ou la directive manque", () => {
    expect(() => sourcesDeScript({ headers: [] })).toThrow(/Content-Security-Policy/);
    expect(() =>
      sourcesDeScript({ headers: [{ headers: [{ key: "Content-Security-Policy", value: "default-src 'self'" }] }] }),
    ).toThrow(/script-src/);
  });
});

describe("scriptsInline", () => {
  it("ne retient que les scripts exécutables sans attribut src", () => {
    expect(scriptsInline(PAGE)).toEqual(["window.a=1;", 'import("/assets/e.js")', "window.a=1;"]);
  });
});

describe("resserrer", () => {
  const sources = sourcesDeScript(vercel);
  const resultat = resserrer(PAGE, sources) as string;
  const balise = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"\/>/.exec(resultat);

  it("ajoute une balise CSP juste après la déclaration d'encodage, avant tout script", () => {
    expect(balise).not.toBeNull();
    expect(resultat.indexOf('<meta charSet="utf-8"/><meta http-equiv="Content-Security-Policy"')).toBeGreaterThan(-1);
    expect(resultat.indexOf("http-equiv")).toBeLessThan(resultat.indexOf("<script"));
  });

  it("autorise exactement les scripts inline de la page, par empreinte, et aucun 'unsafe-inline'", () => {
    const contenu = balise![1]!;
    expect(contenu).not.toContain("unsafe-inline");
    const attendu = createHash("sha256").update("window.a=1;").digest("base64");
    expect(contenu).toContain(`'sha256-${attendu}'`);
    expect(contenu).toContain(empreinte('import("/assets/e.js")'));
    // Deux scripts identiques : une seule empreinte.
    expect(contenu.split(`'sha256-${attendu}'`)).toHaveLength(2);
    expect(contenu.startsWith("script-src 'self' 'wasm-unsafe-eval' https://plausible.io ")).toBe(true);
  });

  it("n'autorise pas un script injecté après coup", () => {
    expect(balise![1]).not.toContain(createHash("sha256").update("alert(1)").digest("base64"));
  });

  it("refuse de traiter deux fois la même page", () => {
    expect(() => resserrer(resultat, sources)).toThrow(/déjà traitée/);
  });

  it("sans balise d'encodage, s'insère juste après <head>", () => {
    expect(resserrer("<html><head><title>t</title></head></html>", sources)).toMatch(/^<html><head><meta http-equiv/);
  });
});
