import { lazy, Suspense } from "react";
import { Hero } from "~/components/landing/Hero";
import { useAncres } from "~/hooks/useAncres";
import { Navbar } from "~/components/landing/Navbar";
import i18n from "~/i18n";
import { env } from "~/lib/env";

// Tout ce qui est sous le premier écran est découpé en fichiers à part et hydraté ensuite, section par section
// (hydratation sélective de React) : le thread principal n'a pas à tout hydrater avant que la page réponde.
// Le HTML pré-rendu est complet ; l'export nommé est converti en export par défaut pour React.lazy.
const section = <T extends string>(importer: () => Promise<Record<T, React.ComponentType>>, nom: T) =>
  lazy(() => importer().then((module) => ({ default: module[nom] })));
const Probleme = section(() => import("~/components/landing/Probleme"), "Probleme");
const Solution = section(() => import("~/components/landing/Solution"), "Solution");
const Demo = section(() => import("~/components/landing/Demo"), "Demo");
const Pilotes = section(() => import("~/components/landing/Pilotes"), "Pilotes");
const Tarifs = section(() => import("~/components/landing/Tarifs"), "Tarifs");
const Faq = section(() => import("~/components/landing/Faq"), "Faq");
const Contact = section(() => import("~/components/landing/Contact"), "Contact");
const PiedDePage = section(() => import("~/components/landing/PiedDePage"), "PiedDePage");

export const meta = () => {
  const titre = i18n.t("landing.meta.titre");
  const description = i18n.t("landing.meta.description");
  return [
    { title: titre },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:locale", content: "fr_FR" },
    { property: "og:site_name", content: "Pilot M&E" },
    { property: "og:title", content: titre },
    { property: "og:description", content: description },
    // Les aperçus de partage exigent des adresses absolues : sans adresse publique configurée, pas d'image ni d'URL.
    ...(env.siteUrl
      ? [
          { property: "og:url", content: `${env.siteUrl}/` },
          { property: "og:image", content: `${env.siteUrl}/images/og.png` },
          { property: "og:image:width", content: "1200" },
          { property: "og:image:height", content: "630" },
          { name: "twitter:card", content: "summary_large_image" },
        ]
      : [{ name: "twitter:card", content: "summary" }]),
  ];
};

export const links = () => (env.siteUrl ? [{ rel: "canonical", href: `${env.siteUrl}/` }] : []);

/** Landing : les sections A à I du brief. Le contenu est complet et lisible sans JavaScript ni animation. */
export default function Landing() {
  useAncres();
  return (
    <div className="bruit relative">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-xl focus:bg-card focus:px-4 focus:py-2 focus:font-semibold focus:text-navy focus:shadow-card-hover"
      >
        {i18n.t("landing.aller_contenu")}
      </a>
      <div id="debut" aria-hidden className="absolute top-0 left-0 h-px w-px" />
      <Navbar />
      <main id="contenu">
        <Hero />
        <Suspense fallback={null}>
          <Probleme />
          <Solution />
          <Demo />
          <Pilotes />
          <Tarifs />
          <Faq />
          <Contact />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <PiedDePage />
      </Suspense>
    </div>
  );
}
