import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";
import "~/i18n";

// jsdom n'a pas matchMedia : on simule un environnement sans préférence de mouvement réduit ni pointeur précis,
// donc sans animation (les animations de la landing sont testées dans le navigateur).
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Les écrans montent des formulaires lourds : sur une machine chargée (suite complète en parallèle), 1 s d'attente par
// défaut suffit parfois à peine.
configure({ asyncUtilTimeout: 4000 });

// Sans « globals », Testing Library ne nettoie pas le DOM entre deux tests.
afterEach(cleanup);

// jsdom n'implémente pas scrollIntoView (utilisé pour garder l'onglet actif visible sur téléphone).
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
