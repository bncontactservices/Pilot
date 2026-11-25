import { ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FenetreHero } from "~/components/landing/FenetreHero";
import { Magnetique } from "~/components/landing/Magnetique";
import { Button } from "~/components/ui/button";
import { evenement } from "~/lib/analytics";
import { mouvementAutorise } from "~/lib/animation";
import { formaterNombre } from "~/lib/format";

const FAITS = ["kpi", "import", "pdf"] as const;

export function Hero() {
  const { t } = useTranslation();
  const racine = useRef<HTMLElement>(null);

  // Entrée du hero en CSS pur (voir « .hero-anim » dans index.css) : aucun JavaScript sur le chemin du premier écran.
  // Seuls les compteurs sont animés en JavaScript, sans bibliothèque.
  useEffect(() => {
    const element = racine.current;
    if (!element || !mouvementAutorise()) return;
    const arretes: number[] = [];
    element.querySelectorAll<HTMLElement>("[data-compteur]").forEach((el, i) => {
      const final = Number(el.dataset.compteur);
      const debut = performance.now() + 500 + i * 100;
      const DUREE = 1600;
      el.textContent = formaterNombre(0);
      const pas = (maintenant: number) => {
        const t = Math.min(1, Math.max(0, (maintenant - debut) / DUREE));
        el.textContent = formaterNombre(Math.round(final * (1 - (1 - t) ** 3)));
        if (t < 1) arretes[i] = requestAnimationFrame(pas);
      };
      arretes[i] = requestAnimationFrame(pas);
    });
    return () => arretes.forEach((id) => cancelAnimationFrame(id));
  }, []);

  return (
    <section
      ref={racine}
      aria-labelledby="titre-hero"
      className="fond-hero hero-anim relative flex min-h-dvh flex-col overflow-hidden text-white"
    >
      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-10 px-4 pt-28 pb-10 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8 lg:pt-24">
        <div className="grid gap-6">
          <p
            data-hero
            style={{ "--i": 0 } as React.CSSProperties}
            className="w-fit rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 font-mono text-xs tracking-wide text-white/85 uppercase"
          >
            {t("landing.hero.badge")}
          </p>
          <h1 id="titre-hero" className="text-[2.6rem] leading-[1.02] font-extrabold sm:text-6xl lg:text-[4.1rem]">
            {t("landing.hero.titre_debut")}
            <em className="font-serif text-[1.12em] font-semibold text-accent italic">{t("landing.hero.titre_mot")}</em>
            {t("landing.hero.titre_fin")}
          </h1>
          <p data-hero style={{ "--i": 2 } as React.CSSProperties} className="max-w-xl text-lg text-white/85">
            {t("landing.hero.sous_titre")}
          </p>
          <div data-hero style={{ "--i": 3 } as React.CSSProperties} className="flex flex-wrap items-center gap-3">
            <Magnetique>
              <Button asChild variante="accent" taille="lg">
                <a href="#contact" onClick={() => evenement("Demo CTA Click", { emplacement: "hero" })}>
                  {t("landing.hero.cta_demo")}
                  <ArrowRight aria-hidden />
                </a>
              </Button>
            </Magnetique>
            <Button
              asChild
              variante="contour"
              taille="lg"
              className="border-white/40 bg-transparent text-white hover:bg-white/10"
            >
              <a href="#demo">{t("landing.hero.cta_produit")}</a>
            </Button>
          </div>
        </div>
        <div data-hero style={{ "--i": 4 } as React.CSSProperties}>
          <FenetreHero />
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6">
        <div
          data-hero
          style={{ "--i": 5 } as React.CSSProperties}
          className="flex flex-col gap-3 border-t border-white/15 pt-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-white/75">{t("landing.hero.confiance")}</p>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-white/85">
            {FAITS.map((cle) => (
              <li key={cle} className="flex items-center gap-2">
                <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                {t(`landing.hero.faits.${cle}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
