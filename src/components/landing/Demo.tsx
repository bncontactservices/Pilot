import { FileDown } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CarteKpi } from "~/components/app/kpi/CarteKpi";
import { CadreNavigateur } from "~/components/landing/CadreNavigateur";
import { CourbeDemo } from "~/components/landing/CourbeDemo";
import { useAnimation } from "~/lib/animation";
import { INDICATEURS_DEMO } from "~/lib/demo-landing";
import { cn } from "~/lib/utils";

const REPERES = [1, 2, 3, 4] as const;
type Repere = (typeof REPERES)[number];

/** Repère cliquable : un bouton numéroté posé sur une zone du tableau de bord. */
function Pin({
  n,
  actif,
  onChoisir,
  className,
}: {
  n: Repere;
  actif: Repere;
  onChoisir: (n: Repere) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const selectionne = actif === n;
  return (
    <button
      type="button"
      aria-pressed={selectionne}
      aria-label={t("landing.demo.repere", { n, titre: t(`landing.demo.repere_${n}.titre`) })}
      onClick={() => onChoisir(n)}
      className={cn(
        "absolute z-10 grid size-8 place-items-center rounded-full font-mono text-xs font-bold shadow-card-hover transition-colors",
        selectionne ? "bg-accent text-accent-foreground" : "bg-navy text-white hover:bg-navy-soft",
        className,
      )}
    >
      {selectionne && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-accent/60" />}
      <span className="relative">{n}</span>
    </button>
  );
}

function Zone({
  n,
  actif,
  className,
  children,
}: {
  n: Repere;
  actif: Repere;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative rounded-2xl transition-shadow duration-300",
        actif === n && "ring-4 ring-accent/70 ring-offset-4 ring-offset-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Demo() {
  const { t } = useTranslation();
  const [actif, setActif] = useState<Repere>(1);
  const racine = useRef<HTMLElement>(null);

  useAnimation(racine, ({ gsap, racine }) => {
    const declencheur = { trigger: racine, start: "top 45%", once: true };
    gsap.from(racine.querySelectorAll("[data-carte-demo]"), {
      y: 28,
      opacity: 0,
      duration: 0.7,
      stagger: 0.12,
      ease: "power3.out",
      scrollTrigger: declencheur,
    });
    gsap.from(racine.querySelector("[data-trace]"), {
      strokeDashoffset: 1,
      duration: 1.6,
      delay: 0.3,
      ease: "power2.inOut",
      scrollTrigger: declencheur,
    });
    gsap.from(racine.querySelectorAll("[data-point]"), {
      opacity: 0,
      scale: 0,
      transformOrigin: "50% 50%",
      duration: 0.4,
      stagger: 0.15,
      delay: 0.7,
      ease: "back.out(2)",
      scrollTrigger: declencheur,
    });
  });

  return (
    <section
      ref={racine}
      id="demo"
      aria-labelledby="titre-demo"
      className="differe [--hauteur-estimee:169rem] md:[--hauteur-estimee:139rem] lg:[--hauteur-estimee:103rem] px-4 py-24 sm:px-6 sm:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-xs tracking-[0.18em] text-accent-ink uppercase">{t("landing.demo.surtitre")}</p>
        <h2 id="titre-demo" className="mt-4 max-w-3xl text-3xl leading-[1.1] font-extrabold text-navy sm:text-5xl">
          {t("landing.demo.titre")}
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">{t("landing.demo.texte")}</p>

        <div data-cadre className="mt-12">
          <CadreNavigateur
            titre={t("landing.demo.fenetre")}
            etiquette={t("landing.hero.donnees_demo")}
            rayon="3rem"
            className="shadow-card-hover ring-border"
          >
            <div className="grid grid-cols-1 gap-6 p-1 sm:p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 text-lg font-extrabold text-navy">Accès à l’eau potable</p>
                <Zone n={4} actif={actif}>
                  <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-input bg-card px-4 text-sm font-semibold text-foreground">
                    <FileDown className="size-4" aria-hidden />
                    {t("landing.demo.export")}
                  </span>
                  <Pin n={4} actif={actif} onChoisir={setActif} className="-top-3 -left-3" />
                </Zone>
              </div>

              <Zone n={1} actif={actif} className="p-1">
                <Pin n={1} actif={actif} onChoisir={setActif} className="-top-3 -left-3" />
                <ul
                  data-statut={actif === 3}
                  className="grid grid-cols-1 gap-4 data-[statut=true]:[&_header>span]:ring-4 data-[statut=true]:[&_header>span]:ring-accent/70 data-[statut=true]:[&_header>span]:ring-offset-2 sm:grid-cols-2 xl:grid-cols-4"
                >
                  {INDICATEURS_DEMO.map(({ kpi, evaluation, serie }, i) => (
                    <li key={kpi.id} data-carte-demo className="relative">
                      <CarteKpi kpi={kpi} evaluation={evaluation} serie={serie} peutSaisir={false} />
                      {i === 0 && (
                        <Pin n={3} actif={actif} onChoisir={setActif} className="-top-3 right-1 sm:-right-3" />
                      )}
                    </li>
                  ))}
                </ul>
              </Zone>

              <Zone n={2} actif={actif} className="bg-card p-5 shadow-card">
                <Pin n={2} actif={actif} onChoisir={setActif} className="-top-3 -left-3" />
                <p className="mb-2 text-lg font-bold text-navy">{t("landing.hero.evolution")}</p>
                <CourbeDemo description={t("landing.hero.evolution")} className="mx-auto max-w-3xl" />
              </Zone>
            </div>
          </CadreNavigateur>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-4">
          {REPERES.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={actif === n}
              onClick={() => setActif(n)}
              className={cn(
                "grid gap-1.5 rounded-[1.5rem] p-5 text-left transition-[background-color,box-shadow,transform] duration-300 ease-soft hover:scale-[1.01]",
                actif === n ? "bg-navy text-white shadow-card-hover" : "bg-card shadow-card",
              )}
            >
              <span className={cn("font-mono text-xs", actif === n ? "text-accent" : "text-accent-ink")}>0{n}</span>
              <span className="font-bold">{t(`landing.demo.repere_${n}.titre`)}</span>
              <span className={cn("text-sm", actif === n ? "text-white/85" : "text-muted-foreground")}>
                {t(`landing.demo.repere_${n}.texte`)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
