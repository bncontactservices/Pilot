import { useEffect } from "react";
import { mouvementAutorise } from "~/lib/animation";

/**
 * Liens d'ancre de la landing. Les sections lointaines sont ignorées par le navigateur tant qu'elles ne sont pas près de
 * l'écran (content-visibility) : leur hauteur est estimée, puis corrigée à l'affichage. Un défilement qui les traverse
 * peut donc dépasser sa cible ou s'arrêter avant. On le corrige à l'arrivée, y compris pour une adresse du type /#tarifs.
 */
export function useAncres(): void {
  useEffect(() => {
    const decalage = () => Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;

    const corriger = (cible: HTMLElement, essais = 0) => {
      if (Math.abs(cible.getBoundingClientRect().top - decalage()) <= 4 || essais >= 4) return;
      cible.scrollIntoView({ behavior: "auto", block: "start" });
      window.setTimeout(() => corriger(cible, essais + 1), 200);
    };

    const aller = (cible: HTMLElement, doux: boolean) => {
      cible.scrollIntoView({ behavior: doux && mouvementAutorise() ? "smooth" : "auto", block: "start" });
      const supporteScrollend = "onscrollend" in window;
      if (supporteScrollend) window.addEventListener("scrollend", () => corriger(cible), { once: true });
      else globalThis.setTimeout(() => corriger(cible), 1000);
    };

    const surClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const lien = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
      const identifiant = lien?.getAttribute("href")?.slice(1);
      const cible = identifiant ? document.getElementById(identifiant) : null;
      if (!lien || !cible) return;
      e.preventDefault();
      window.history.pushState(null, "", `#${identifiant}`);
      aller(cible, true);
    };
    document.addEventListener("click", surClic);

    // Adresse avec ancre à l'ouverture de la page : on rejoint la cible une fois les sections affichées.
    const identifiantInitial = window.location.hash.slice(1);
    const cibleInitiale = identifiantInitial ? document.getElementById(identifiantInitial) : null;
    const minuteries = cibleInitiale
      ? [400, 1200].map((delai) => window.setTimeout(() => corriger(cibleInitiale), delai))
      : [];

    return () => {
      document.removeEventListener("click", surClic);
      minuteries.forEach(window.clearTimeout);
    };
  }, []);
}
