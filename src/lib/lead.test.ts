import { describe, expect, it } from "vitest";
import { champsRequis, LIMITES_LEAD, validerLead } from "../../supabase/functions/submit-lead/lead";

const demo = {
  type_demande: "demo",
  nom: "Awa Diop",
  organisation: "ONG Eau Vive",
  email: "awa@exemple.org",
  besoin: "Suivre 3 projets bailleurs",
};

describe("validerLead", () => {
  it("accepte une demande complète et normalise les champs", () => {
    const r = validerLead({ ...demo, nom: "  Awa Diop ", email: "  Awa@Exemple.ORG " });
    expect(r).toEqual({ ok: true, valeur: { ...demo, email: "awa@exemple.org" } });
  });

  it("le besoin est facultatif et devient null quand il est vide", () => {
    const r = validerLead({ ...demo, besoin: "   " });
    expect(r.ok && r.valeur.besoin).toBeNull();
  });

  it("le formulaire « client pilote » ne demande que l'organisation et l'e-mail", () => {
    expect(champsRequis("pilote")).toEqual(["organisation", "email"]);
    const r = validerLead({ type_demande: "pilote", organisation: "PME Sahel", email: "contact@pme.sn" });
    expect(r).toEqual({
      ok: true,
      valeur: { type_demande: "pilote", nom: null, organisation: "PME Sahel", email: "contact@pme.sn", besoin: null },
    });
  });

  it("démo et Enterprise exigent aussi le nom", () => {
    for (const type_demande of ["demo", "enterprise"]) {
      expect(validerLead({ ...demo, type_demande, nom: "" })).toEqual({ ok: false, erreurs: { nom: "requis" } });
    }
  });

  it("refuse un type de demande inconnu ou absent", () => {
    expect(validerLead({ ...demo, type_demande: "admin" })).toEqual({
      ok: false,
      erreurs: { type_demande: "inconnu" },
    });
    expect(validerLead({ ...demo, type_demande: undefined })).toEqual({
      ok: false,
      erreurs: { type_demande: "inconnu" },
    });
  });

  it.each(["", "sans-arobase", "a@b", "a b@c.d", "@c.d", "a@.", "a@b@c.d x"])("refuse l'e-mail %j", (email) => {
    const r = validerLead({ ...demo, email });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs.email).toBe(email === "" ? "requis" : "email_invalide");
  });

  it("refuse des textes trop courts ou trop longs, aux bornes de la base", () => {
    expect(validerLead({ ...demo, nom: "A" })).toEqual({ ok: false, erreurs: { nom: "trop_court" } });
    expect(validerLead({ ...demo, nom: "x".repeat(LIMITES_LEAD.nom + 1) })).toEqual({
      ok: false,
      erreurs: { nom: "trop_long" },
    });
    expect(validerLead({ ...demo, nom: "x".repeat(LIMITES_LEAD.nom) }).ok).toBe(true);
    expect(validerLead({ ...demo, organisation: "x".repeat(161) })).toEqual({
      ok: false,
      erreurs: { organisation: "trop_long" },
    });
    expect(validerLead({ ...demo, besoin: "x".repeat(2001) })).toEqual({ ok: false, erreurs: { besoin: "trop_long" } });
    expect(validerLead({ ...demo, email: `${"a".repeat(250)}@b.cd` })).toEqual({
      ok: false,
      erreurs: { email: "trop_long" },
    });
  });

  it("signale toutes les erreurs à la fois", () => {
    expect(validerLead({ type_demande: "demo", email: "x" })).toEqual({
      ok: false,
      erreurs: { nom: "requis", organisation: "requis", email: "email_invalide" },
    });
  });

  it("retire les caractères de contrôle mais garde les retours à la ligne", () => {
    const r = validerLead({ ...demo, besoin: "ligne 1\nligne 2\u0000\u0007" });
    expect(r.ok && r.valeur.besoin).toBe("ligne 1\nligne 2");
  });

  it("ignore les valeurs qui ne sont pas du texte et les entrées qui ne sont pas des objets", () => {
    expect(validerLead({ ...demo, nom: 42, organisation: { a: 1 } })).toEqual({
      ok: false,
      erreurs: { nom: "requis", organisation: "requis" },
    });
    expect(validerLead(null)).toEqual({ ok: false, erreurs: { type_demande: "inconnu" } });
    expect(validerLead("texte")).toEqual({ ok: false, erreurs: { type_demande: "inconnu" } });
  });
});
