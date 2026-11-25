// Prix affichés sur la landing. Les valeurs de base sont dans constants.ts (à valider, voir PLACEHOLDERS.md).

import { PRIX_MENSUEL_USD, REMISE_ANNUELLE, TAUX_USD_XOF } from "./constants";

export type PlanPayant = keyof typeof PRIX_MENSUEL_USD;

export type PrixAffiche = {
  /** Prix mensuel effectif, en dollars : remise annuelle déduite en facturation annuelle. */
  mensuelUsd: number;
  /** Total facturé par an (facturation annuelle seulement). */
  totalAnnuelUsd: number | null;
  /** Équivalent mensuel indicatif en FCFA, arrondi aux 50 FCFA. */
  mensuelFcfa: number;
};

const arrondirDeuxDecimales = (n: number) => Math.round(n * 100) / 100;

export function prixAffiche(plan: PlanPayant, annuel: boolean): PrixAffiche {
  const base = PRIX_MENSUEL_USD[plan];
  const mensuelUsd = arrondirDeuxDecimales(annuel ? base * (1 - REMISE_ANNUELLE) : base);
  return {
    mensuelUsd,
    totalAnnuelUsd: annuel ? arrondirDeuxDecimales(mensuelUsd * 12) : null,
    mensuelFcfa: Math.round((mensuelUsd * TAUX_USD_XOF) / 50) * 50,
  };
}

/** « 25 $ » ou « 19,99 $ » : les centimes ne sont affichés que s'il y en a. */
export function formaterDollars(montant: number): string {
  const entier = Number.isInteger(montant);
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: entier ? 0 : 2, maximumFractionDigits: 2 }).format(montant)} $`;
}
