// Animations de la landing : GSAP est chargé à la première interaction (jamais dans le JS initial ni pendant le chargement).
// Règles du brief : contenu visible par défaut (les animations partent de l'état visible avec gsap.from),
// gsap.context() pour tout, nettoyage avec revert(), et rien du tout si l'utilisateur préfère moins de mouvement.

import { type RefObject, useEffect } from "react";

type Gsap = typeof import("gsap").gsap;
type ScrollTriggerStatic = typeof import("gsap/ScrollTrigger").ScrollTrigger;
export type OutilsAnimation = { gsap: Gsap; ScrollTrigger: ScrollTriggerStatic; racine: HTMLElement };

let chargement: Promise<{ gsap: Gsap; ScrollTrigger: ScrollTriggerStatic }> | null = null;

export function chargerGsap() {
  chargement ??= Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([g, s]) => {
    g.gsap.registerPlugin(s.ScrollTrigger);
    return { gsap: g.gsap, ScrollTrigger: s.ScrollTrigger };
  });
  return chargement;
}

export const MOUVEMENT_AUTORISE = "(prefers-reduced-motion: no-preference)";

export function mouvementAutorise(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MOUVEMENT_AUTORISE).matches;
}

const EVENEMENTS_INTERACTION = ["scroll", "wheel", "touchstart", "pointerdown", "keydown"] as const;
const DELAI_REPLI_MS = 10_000;

/**
 * Appelle `lancer` à la première interaction (défilement, toucher, clavier) ou, à défaut, après 10 s. Les animations
 * de la landing sont déclenchées par le défilement : charger GSAP pendant le chargement de la page n'apporterait rien
 * et alourdirait le thread principal quand il doit rendre le premier écran (mesuré avec Lighthouse).
 */
function quandInteraction(lancer: () => void): () => void {
  let lance = false;
  const declencher = () => {
    if (lance) return;
    lance = true;
    nettoyer();
    lancer();
  };
  const minuterie = window.setTimeout(declencher, DELAI_REPLI_MS);
  const nettoyer = () => {
    window.clearTimeout(minuterie);
    for (const nom of EVENEMENTS_INTERACTION) window.removeEventListener(nom, declencher);
  };
  for (const nom of EVENEMENTS_INTERACTION) window.addEventListener(nom, declencher, { passive: true });
  return nettoyer;
}

/**
 * Exécute `animer` quand la page est utilisée, dans un gsap.context() annulé au démontage, et seulement si le
 * mouvement est autorisé (gsap.matchMedia).
 */
export function useAnimation(racine: RefObject<HTMLElement | null>, animer: (outils: OutilsAnimation) => void): void {
  useEffect(() => {
    const element = racine.current;
    if (!element || !mouvementAutorise()) return;
    let annule = false;
    let contexte: { revert: () => void } | undefined;
    const arreter = quandInteraction(() => {
      void chargerGsap().then(({ gsap, ScrollTrigger }) => {
        if (annule) return;
        contexte = gsap.context(() => {
          const mm = gsap.matchMedia();
          mm.add(MOUVEMENT_AUTORISE, () => animer({ gsap, ScrollTrigger, racine: element }));
        }, element);
      });
    });
    return () => {
      annule = true;
      arreter();
      contexte?.revert();
    };
    // `animer` est volontairement absent des dépendances : l'animation est montée une fois par affichage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
