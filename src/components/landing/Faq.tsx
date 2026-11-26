import { ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { chargerGsap, mouvementAutorise } from "~/lib/animation";
import { DUREE_ESSAI_JOURS } from "~/lib/constants";
import { cn } from "~/lib/utils";

const QUESTIONS = ["securite", "import", "demarrer", "bailleurs", "essai", "support"] as const;

/**
 * Accordéon accessible (aria-expanded, aria-controls). L'ouverture est animée par GSAP (hauteur automatique) quand le
 * mouvement est autorisé ; sinon, ou si GSAP n'est pas encore chargé, l'ouverture est instantanée.
 */
function Question({ cle }: { cle: (typeof QUESTIONS)[number] }) {
  const { t } = useTranslation();
  const id = useId();
  const [ouvert, setOuvert] = useState(false);
  const panneau = useRef<HTMLDivElement>(null);

  const basculer = async () => {
    const element = panneau.current;
    const ouvrir = !ouvert;
    setOuvert(ouvrir);
    if (!element) return;
    if (!mouvementAutorise()) {
      element.hidden = !ouvrir;
      return;
    }
    const { gsap } = await chargerGsap();
    gsap.killTweensOf(element);
    if (ouvrir) {
      element.hidden = false;
      gsap.fromTo(
        element,
        { height: 0, opacity: 0 },
        {
          height: "auto",
          opacity: 1,
          duration: 0.35,
          ease: "power2.inOut",
          onComplete: () => void gsap.set(element, { clearProps: "height,opacity" }),
        },
      );
    } else {
      gsap.to(element, {
        height: 0,
        opacity: 0,
        duration: 0.3,
        ease: "power2.inOut",
        onComplete: () => {
          element.hidden = true;
          gsap.set(element, { clearProps: "height,opacity" });
        },
      });
    }
  };

  return (
    <div className="rounded-[1.5rem] bg-card shadow-card">
      <h3>
        <button
          type="button"
          id={`${id}-q`}
          aria-expanded={ouvert}
          aria-controls={`${id}-r`}
          onClick={() => void basculer()}
          className="flex w-full items-center justify-between gap-4 rounded-[1.5rem] px-6 py-5 text-left text-base font-bold text-navy sm:text-lg"
        >
          {t(`landing.faq.questions.${cle}.q`)}
          <ChevronDown
            className={cn("size-5 shrink-0 transition-transform duration-300", ouvert && "rotate-180")}
            aria-hidden
          />
        </button>
      </h3>
      <div ref={panneau} id={`${id}-r`} role="region" aria-labelledby={`${id}-q`} hidden className="overflow-hidden">
        <p className="px-6 pb-6 text-muted-foreground">
          {t(`landing.faq.questions.${cle}.r`, { jours: DUREE_ESSAI_JOURS })}
        </p>
      </div>
    </div>
  );
}

export function Faq() {
  const { t } = useTranslation();
  return (
    <section
      id="faq"
      aria-labelledby="titre-faq"
      className="differe [--hauteur-estimee:53rem] md:[--hauteur-estimee:54rem] lg:[--hauteur-estimee:45rem] px-4 py-24 sm:px-6 sm:py-32"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="text-center lg:sticky lg:top-28 lg:self-start">
          <p className="font-mono text-xs tracking-[0.18em] text-accent-ink uppercase">{t("landing.faq.surtitre")}</p>
          <h2 id="titre-faq" className="mt-4 text-3xl leading-[1.1] font-extrabold text-balance text-navy sm:text-5xl">
            {t("landing.faq.titre")}
          </h2>
        </div>
        <div className="grid gap-3">
          {QUESTIONS.map((cle) => (
            <Question key={cle} cle={cle} />
          ))}
        </div>
      </div>
    </section>
  );
}
