import { describe, expect, it } from "vitest";
import { formaterDollars, prixAffiche } from "./tarifs";

describe("prixAffiche", () => {
  it("mensuel : prix de base et équivalent FCFA indicatif arrondi à 50", () => {
    expect(prixAffiche("starter", false)).toEqual({ mensuelUsd: 25, totalAnnuelUsd: null, mensuelFcfa: 14150 });
    expect(prixAffiche("pro", false)).toEqual({ mensuelUsd: 50, totalAnnuelUsd: null, mensuelFcfa: 28250 });
  });
  it("annuel : −20 %, prix mensuel équivalent et total annuel clairs", () => {
    expect(prixAffiche("starter", true)).toEqual({ mensuelUsd: 20, totalAnnuelUsd: 240, mensuelFcfa: 11300 });
    expect(prixAffiche("pro", true)).toEqual({ mensuelUsd: 40, totalAnnuelUsd: 480, mensuelFcfa: 22600 });
  });
  it("le total annuel égale 12 mois au prix remisé, soit 20 % de moins qu'au tarif mensuel", () => {
    const mensuel = prixAffiche("pro", false).mensuelUsd;
    expect(prixAffiche("pro", true).totalAnnuelUsd).toBe(mensuel * 12 * 0.8);
  });
});

describe("formaterDollars", () => {
  it("n'affiche les centimes que s'il y en a", () => {
    expect(formaterDollars(25)).toBe("25 $");
    expect(formaterDollars(19.99)).toBe("19,99 $");
  });
});
