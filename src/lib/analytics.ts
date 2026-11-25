// Mesure d'audience avec Plausible : sans cookie, et seulement si VITE_PLAUSIBLE_DOMAIN est défini.
// Les événements sont des appels `window.plausible(...)`, sans effet quand le script n'est pas chargé.

import { env } from "./env";

export type EvenementAudience = "Demo CTA Click" | "Lead Submit" | "Signup";

declare global {
  interface Window {
    plausible?: ((nom: string, options?: { props?: Record<string, string> }) => void) & { q?: unknown[] };
  }
}

export function evenement(nom: EvenementAudience, props?: Record<string, string>): void {
  if (typeof window === "undefined" || !env.plausibleDomain) return;
  window.plausible?.(nom, props ? { props } : undefined);
}

/** Balises à insérer dans l'en-tête : script différé et file d'attente pour les événements émis avant son chargement. */
export const SCRIPT_FILE_ATTENTE =
  "window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)}";
export const URL_SCRIPT_PLAUSIBLE = "https://plausible.io/js/script.js";
