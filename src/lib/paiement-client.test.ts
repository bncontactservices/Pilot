import { describe, expect, it } from "vitest";
import { abonnementEnCours, formaterPrix, montantMensuelDepuisAnnuel } from "./paiement";

describe("prix", () => {
  it("convertit les centimes de Stripe en montant lisible, dans la devise du prix", () => {
    expect(formaterPrix(2500, "EUR").replace(/\s/g, " ")).toBe("25,00 €");
    expect(formaterPrix(48000, "EUR").replace(/\s/g, " ")).toBe("480,00 €");
    expect(formaterPrix(990, "USD").replace(/\s/g, " ")).toMatch(/^9,90 \$US$/);
  });

  it("n'applique pas de décimales à une devise qui n'en a pas (le FCFA)", () => {
    expect(formaterPrix(15000, "XOF").replace(/\s/g, " ")).toBe("15 000 F CFA");
  });

  it("replie sur le montant brut quand la devise est inconnue", () => {
    expect(formaterPrix(2500, "pas-une-devise")).toBe("2500 pas-une-devise");
  });

  it("ramène un prix annuel au mois, arrondi à l'unité de la devise", () => {
    expect(montantMensuelDepuisAnnuel(24000)).toBe(2000);
    expect(montantMensuelDepuisAnnuel(24001)).toBe(2000);
    expect(montantMensuelDepuisAnnuel(24006)).toBe(2001);
  });
});

describe("abonnement en cours", () => {
  it("distingue les statuts qui donnent accès (actif, essai de Stripe, paiement en retard) des autres", () => {
    for (const statut of ["active", "trialing", "past_due"] as const) expect(abonnementEnCours({ statut })).toBe(true);
    for (const statut of ["canceled", "unpaid", "paused", "incomplete", "incomplete_expired"] as const)
      expect(abonnementEnCours({ statut })).toBe(false);
    expect(abonnementEnCours(null)).toBe(false);
    expect(abonnementEnCours(undefined)).toBe(false);
  });
});
