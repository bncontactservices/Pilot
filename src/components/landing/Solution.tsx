import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "~/components/ui/badge";
import { VisuelCentraliser, VisuelRapport, VisuelSaisir, VisuelTempsReel } from "~/components/landing/VisuelsSolution";
import { useAnimation } from "~/lib/animation";

const FONCTIONS = [
  { cle: "centraliser", Visuel: VisuelCentraliser },
  { cle: "saisir", Visuel: VisuelSaisir },
  { cle: "temps_reel", Visuel: VisuelTempsReel },
  { cle: "rapports", Visuel: VisuelRapport },
] as const;
// Ce qui est déjà dans l'application (Lot 2) et ce qui est annoncé sans date : une fonction passe de la seconde liste
// à la première quand elle est livrée ET exercée dans l'application, pas avant.
const LIVRE = [
  "programmes",
  "cadre_logique",
  "pta",
  "phases",
  "realisations",
  "prochaines_etapes",
  "etats",
  "documents",
] as const;
const BIENTOT = ["carte", "budget", "rapports_programmes", "hors_ligne"] as const;

export function Solution() {
  const { t } = useTranslation();
  const racine = useRef<HTMLElement>(null);

  useAnimation(racine, ({ gsap, racine }) => {
    const unefois = (element: Element | null) => ({ trigger: element, start: "top 70%", once: true });
    const cartes = racine.querySelectorAll<HTMLElement>("[data-fonction]");

    // Chaque mini-visuel s'anime quand sa carte arrive à l'écran ; l'état final est celui de la page sans animation.
    const [c1, c2, c3, c4] = cartes;
    gsap.from(c1!.querySelectorAll("[data-ligne]"), {
      x: -18,
      opacity: 0,
      duration: 0.6,
      stagger: 0.14,
      ease: "power3.out",
      scrollTrigger: unefois(c1!),
    });

    const t2 = gsap.timeline({ scrollTrigger: unefois(c2!) });
    t2.from(c2!.querySelector("[data-minuteur]"), { strokeDashoffset: 1, duration: 1.8, ease: "power1.inOut" }).from(
      c2!.querySelector("[data-confirmation]"),
      { y: 8, opacity: 0, duration: 0.4, ease: "power3.out" },
    );

    const t3 = gsap.timeline({ scrollTrigger: unefois(c3!) });
    t3.from(c3!.querySelector("[data-trace2]"), { strokeDashoffset: 1, duration: 1.4, ease: "power2.inOut" }).from(
      c3!.querySelector("[data-dernier]"),
      { scale: 0, transformOrigin: "50% 50%", duration: 0.4, ease: "back.out(2.5)" },
    );
    gsap.to(c3!.querySelector("[data-pouls]"), {
      opacity: 0.25,
      repeat: -1,
      yoyo: true,
      duration: 0.9,
      ease: "power2.inOut",
    });

    gsap.from(c4!.querySelector("[data-page]"), {
      y: 26,
      rotate: 4,
      opacity: 0,
      duration: 0.8,
      ease: "power3.out",
      scrollTrigger: unefois(c4!),
    });
    gsap.from(c4!.querySelector("[data-bouton-pdf]"), {
      scale: 0.8,
      opacity: 0,
      duration: 0.4,
      delay: 0.5,
      ease: "back.out(2)",
      scrollTrigger: unefois(c4!),
    });

    // Sur grand écran, les cartes s'empilent (sticky en CSS) et les précédentes reculent légèrement.
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px)", () => {
      cartes.forEach((carte, i) => {
        const suivante = cartes[i + 1];
        if (!suivante) return;
        gsap.to(carte, {
          scale: 0.94,
          opacity: 0.55,
          ease: "none",
          scrollTrigger: { trigger: suivante, start: "top 75%", end: "top 25%", scrub: true },
        });
      });
    });
  });

  return (
    <section
      ref={racine}
      id="solution"
      aria-labelledby="titre-solution"
      className="bg-subtle/60 px-4 py-24 sm:px-6 sm:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-xs tracking-[0.18em] text-accent-ink uppercase">
          {t("landing.solution.surtitre")}
        </p>
        <h2 id="titre-solution" className="mt-4 max-w-4xl text-3xl leading-[1.1] font-extrabold text-navy sm:text-5xl">
          {t("landing.solution.titre")}
        </h2>

        <ol className="mt-14 grid grid-cols-1 gap-6 lg:gap-[26vh]">
          {FONCTIONS.map(({ cle, Visuel }, i) => (
            <li key={cle} className="lg:sticky" style={{ top: `${6 + i * 1.1}rem` }}>
              <article
                data-fonction
                className="grid grid-cols-1 items-center gap-8 rounded-[2.5rem] bg-card p-6 shadow-card-hover sm:p-10 lg:min-h-[22rem] lg:grid-cols-2"
              >
                <div className="grid gap-4">
                  <p className="font-mono text-sm text-accent-ink">
                    <span aria-hidden>{String(i + 1).padStart(2, "0")} / 04</span>
                    <span className="sr-only">{t("landing.solution.etape", { n: i + 1 })}</span>
                  </p>
                  <h3 className="text-2xl font-extrabold text-navy sm:text-3xl">
                    {t(`landing.solution.${cle}.titre`)}
                  </h3>
                  <p className="max-w-md text-muted-foreground">{t(`landing.solution.${cle}.texte`)}</p>
                </div>
                <div className="mx-auto w-full max-w-sm">
                  <Visuel />
                </div>
              </article>
            </li>
          ))}
        </ol>

        <div className="mt-16 grid gap-4">
          {(
            [
              { cle: "livre", variante: "ok", elements: LIVRE },
              { cle: "bientot", variante: "marque", elements: BIENTOT },
            ] as const
          ).map(({ cle, variante, elements }) => (
            <div
              key={cle}
              className="flex flex-col gap-4 rounded-[2rem] border border-dashed border-navy/25 bg-card/60 p-6 sm:flex-row sm:items-center sm:gap-6"
            >
              <div className="grid gap-1.5 sm:w-64 sm:shrink-0">
                <Badge variante={variante} className="w-fit">
                  {t(`landing.solution.${cle}.titre`)}
                </Badge>
                <p className="text-sm text-muted-foreground">{t(`landing.solution.${cle}.texte`)}</p>
              </div>
              <ul className="flex flex-wrap gap-2">
                {elements.map((element) => (
                  <li key={element} className="rounded-full bg-subtle px-3.5 py-1.5 text-sm font-semibold text-navy">
                    {t(`landing.solution.${cle}.elements.${element}`)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
