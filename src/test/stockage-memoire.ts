import type { StockageSync } from "~/lib/hors-ligne/file";

/** Faux `localStorage` en mémoire, propre à chaque test. */
export function creerStockageMemoire(): StockageSync & { donnees: Map<string, string> } {
  const donnees = new Map<string, string>();
  return {
    donnees,
    get length() {
      return donnees.size;
    },
    key: (i) => Array.from(donnees.keys())[i] ?? null,
    getItem: (cle) => donnees.get(cle) ?? null,
    setItem: (cle, valeur) => void donnees.set(cle, valeur),
    removeItem: (cle) => void donnees.delete(cle),
  };
}
