import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "@fontsource/cormorant-garamond/600-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./index.css";
import i18n from "./i18n";

import jakarta800 from "@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-800-normal.woff2?url";
import { type ReactNode, useEffect } from "react";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { PageErreur } from "~/components/app/PageErreur";
import { LogoMark } from "~/components/brand/Logo";
import { Toaster } from "~/components/ui/toaster";
import { env } from "~/lib/env";
import { SCRIPT_FILE_ATTENTE, URL_SCRIPT_PLAUSIBLE } from "~/lib/analytics";
import type { Route } from "./+types/root";

export const links: Route.LinksFunction = () => [
  { rel: "preload", href: jakarta800, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
];

export const meta: Route.MetaFunction = () => [
  { title: i18n.t("marque.titre_defaut") },
  { name: "description", content: i18n.t("marque.description") },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0B2545" />
        <Meta />
        <Links />
        {/* Mesure d'audience sans cookie : chargée seulement si un domaine Plausible est configuré. */}
        {env.plausibleDomain && (
          <>
            <script dangerouslySetInnerHTML={{ __html: SCRIPT_FILE_ATTENTE }} />
            <script defer data-domain={env.plausibleDomain} src={URL_SCRIPT_PLAUSIBLE} />
          </>
        )}
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  // Repère pour les tests de bout en bout : l'application est hydratée, les boutons et formulaires sont actifs.
  useEffect(() => {
    document.documentElement.dataset.hydrate = "";
  }, []);
  return (
    <>
      <Outlet />
      <Toaster />
    </>
  );
}

/** Affiché pendant le chargement initial des routes non pré-rendues. */
export function HydrateFallback() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy>
      <LogoMark className="size-12 animate-pulse" />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const introuvable = isRouteErrorResponse(error) && error.status === 404;
  if (import.meta.env.DEV && !introuvable) console.error(error);
  return <PageErreur introuvable={introuvable} />;
}
