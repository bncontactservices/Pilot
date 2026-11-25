import jakarta400 from "@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-400-normal.woff?url";
import jakarta600 from "@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-600-normal.woff?url";
import jakarta700 from "@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff?url";
import jakarta800 from "@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-800-normal.woff?url";
import plex400 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff?url";
import plex500 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff?url";
import type { SourcesPolices } from "./polices";

/** URL servies par Vite (empreinte dans le nom de fichier) : le PDF n'appelle aucun service de polices externe. */
export const SOURCES_POLICES: SourcesPolices = {
  sans: { 400: jakarta400, 600: jakarta600, 700: jakarta700, 800: jakarta800 },
  mono: { 400: plex400, 500: plex500 },
};
