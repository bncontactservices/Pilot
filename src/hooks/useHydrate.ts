import { useSyncExternalStore } from "react";

const ne_rien_ecouter = () => () => {};

/** Faux dans le HTML pré-rendu et pendant l'hydratation, vrai ensuite : sert à n'activer une action qu'une fois React en place. */
export function useHydrate(): boolean {
  return useSyncExternalStore(
    ne_rien_ecouter,
    () => true,
    () => false,
  );
}
