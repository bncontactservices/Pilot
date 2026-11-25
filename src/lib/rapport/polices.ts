// Polices du PDF : les fichiers WOFF des paquets @fontsource (le WOFF2 n'est pas géré par @react-pdf).
// Les sources sont injectées : l'application passe des URL Vite (polices-urls.ts), les tests des chemins de fichiers.

import { Font } from "@react-pdf/renderer";

export type SourcesPolices = {
  sans: { 400: string; 600: string; 700: string; 800: string };
  mono: { 400: string; 500: string };
};

export const FAMILLE_SANS = "Plus Jakarta Sans";
export const FAMILLE_MONO = "IBM Plex Mono";

let enregistrees = false;

export function enregistrerPolices(sources: SourcesPolices): void {
  if (enregistrees) return;
  Font.register({
    family: FAMILLE_SANS,
    fonts: ([400, 600, 700, 800] as const).map((fontWeight) => ({ src: sources.sans[fontWeight], fontWeight })),
  });
  Font.register({
    family: FAMILLE_MONO,
    fonts: ([400, 500] as const).map((fontWeight) => ({ src: sources.mono[fontWeight], fontWeight })),
  });
  // Pas de césure automatique : celle de @react-pdf est faite pour l'anglais et coupe mal le français.
  Font.registerHyphenationCallback((mot) => [mot]);
  enregistrees = true;
}
