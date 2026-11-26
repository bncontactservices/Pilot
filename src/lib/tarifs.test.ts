import { describe, expect, it } from "vitest";
import { formaterEuros, prixAffiche } from "./tarifs";

describe("prixAffiche", () => {
  it("mensuel : prix de base en euros et équivalent FCFA indicatif (1 € = 655,957 FCFA) arrondi à 50", () => {
    expect(prixAffiche("starter", false)).toEqual({ mensuelEur: 25, totalAnnuelEur: null, mensuelFcfa: 16400 });
    expect(prixAffiche("pro", false)).toEqual({ mensuelEur: 50, totalAnnuelEur: null, mensuelFcfa: 32800 });
  });
  it("annuel : −20 %, prix mensuel équivalent et total annuel clairs", () => {
    expect(prixAffiche("starter", true)).toEqual({ mensuelEur: 20, totalAnnuelEur: 240, mensuelFcfa: 13100 });
    expect(prixAffiche("pro", true)).toEqual({ mensuelEur: 40, totalAnnuelEur: 480, mensuelFcfa: 26250 });
  });
  it("le total annuel égale 12 mois au prix remisé, soit 20 % de moins qu'au tarif mensuel", () => {
    const mensuel = prixAffiche("pro", false).mensuelEur;
    expect(prixAffiche("pro", true).totalAnnuelEur).toBe(mensuel * 12 * 0.8);
  });
});

describe("formaterEuros", () => {
  it("n'affiche les centimes que s'il y en a", () => {
    expect(formaterEuros(25)).toBe("25 €");
    expect(formaterEuros(19.99)).toBe("19,99 €");
  });
});
