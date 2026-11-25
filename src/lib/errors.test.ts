import { describe, expect, it } from "vitest";
import { analyserErreur } from "./errors";

describe("analyserErreur", () => {
  it("reconnaît les quotas de plan", () => {
    expect(analyserErreur({ code: "P0001", message: "PLAN_LIMIT:kpis" })).toEqual({
      cle: "erreurs.PLAN_LIMIT.kpis",
      quota: "kpis",
    });
  });
  it("reconnaît les codes métier", () => {
    expect(analyserErreur({ code: "P0001", message: "ESSAI_EXPIRE" }).cle).toBe("erreurs.ESSAI_EXPIRE");
    expect(analyserErreur(new Error("DEJA_INSCRIT")).cle).toBe("erreurs.DEJA_INSCRIT");
  });
  it("traduit les erreurs d'authentification", () => {
    expect(analyserErreur({ code: "invalid_credentials", message: "Invalid login credentials" }).cle).toBe(
      "erreurs.auth.identifiants",
    );
    expect(analyserErreur({ code: "weak_password", message: "x" }).cle).toBe("erreurs.auth.mot_de_passe_faible");
  });
  it("reconnaît les coupures réseau", () => {
    expect(analyserErreur(new TypeError("Failed to fetch")).cle).toBe("erreurs.reseau");
    expect(analyserErreur({ name: "AuthRetryableFetchError", message: "" }).cle).toBe("erreurs.reseau");
  });
  it("traduit les refus de droits Postgres", () => {
    expect(analyserErreur({ code: "42501", message: "new row violates row-level security policy" }).cle).toBe(
      "erreurs.acces_refuse",
    );
  });
  it("traduit les refus du stockage de fichiers", () => {
    expect(analyserErreur({ message: "The object exceeded the maximum allowed size", statusCode: "413" }).cle).toBe(
      "erreurs.stockage_trop_gros",
    );
    expect(analyserErreur({ message: "mime type text/html is not supported" }).cle).toBe("erreurs.stockage_type");
    expect(analyserErreur({ message: "new row violates row-level security policy", statusCode: "403" }).cle).toBe(
      "erreurs.stockage_refuse",
    );
  });
  it("retombe sur un message générique", () => {
    expect(analyserErreur({ message: "boom" }).cle).toBe("erreurs.inconnue");
    expect(analyserErreur(undefined).cle).toBe("erreurs.inconnue");
  });
});
