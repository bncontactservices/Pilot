import { Check } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useAnimation } from "~/lib/animation";
import { DUREE_ESSAI_JOURS, LIMITES_PLAN } from "~/lib/constants";
import { lienWhatsAppEquipe } from "~/lib/contact";
import { formaterNombre } from "~/lib/format";
import { formaterDollars, type PlanPayant, prixAffiche } from "~/lib/tarifs";
import { cn } from "~/lib/utils";

function Coche({ children, bientot }: { children: string; bientot?: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <Check className="mt-0.5 size-4 shrink-0 text-status-ok-ink" aria-hidden />
      <span>
        {children}
        {bientot && (
          <Badge variante="neutre" className="ml-2 align-middle">
            {bientot}
          </Badge>
        )}
      </span>
    </li>
  );
}

function CartePayante({ plan, annuel, vedette }: { plan: PlanPayant; annuel: boolean; vedette?: boolean }) {
  const { t } = useTranslation();
  const prix = prixAffiche(plan, annuel);
  const limites = LIMITES_PLAN[plan];
  return (
    <li
      data-tarif
      className={cn(
        "relative flex flex-col gap-5 rounded-[2rem] p-7 transition-[box-shadow,transform] duration-300 ease-soft",
        vedette
          ? "bg-navy text-white shadow-card-hover md:scale-[1.03]"
          : "bg-card shadow-card hover:scale-[1.01] hover:shadow-card-hover",
      )}
    >
      {vedette && (
        <Badge className="absolute -top-3 left-7 bg-accent text-accent-foreground">
          {t("landing.tarifs.pro.badge")}
        </Badge>
      )}
      <div className="grid gap-1">
        <h3 className="text-xl font-extrabold">{t(`landing.tarifs.${plan}.nom`)}</h3>
        <p className={cn("text-sm", vedette ? "text-white/80" : "text-muted-foreground")}>
          {t(`landing.tarifs.${plan}.description`)}
        </p>
      </div>
      <div className="grid gap-1">
        <p className="font-mono text-4xl font-semibold tabular">
          {formaterDollars(prix.mensuelUsd)}
          <span
            className={cn("ml-1.5 font-sans text-sm font-medium", vedette ? "text-white/75" : "text-muted-foreground")}
          >
            {t("landing.tarifs.par_mois")}
          </span>
        </p>
        <p className={cn("min-h-5 text-sm", vedette ? "text-white/80" : "text-muted-foreground")}>
          {prix.totalAnnuelUsd !== null &&
            t("landing.tarifs.total_annuel", { total: formaterDollars(prix.totalAnnuelUsd) })}
        </p>
        <p className={cn("text-xs", vedette ? "text-white/70" : "text-muted-foreground")}>
          {t("landing.tarifs.equivalent", { montant: formaterNombre(prix.mensuelFcfa) })}
        </p>
      </div>
      <ul className="grid gap-2.5">
        <Coche>{t("landing.tarifs.inclusions.projets", { count: limites.projects ?? 0 })}</Coche>
        <Coche>{t("landing.tarifs.inclusions.kpis", { count: limites.kpis ?? 0 })}</Coche>
        <Coche>{t("landing.tarifs.inclusions.utilisateurs", { count: limites.users ?? 0 })}</Coche>
        {plan === "pro" && <Coche>{t("landing.tarifs.inclusions.roles")}</Coche>}
        {plan === "pro" && (
          <Coche bientot={t("landing.tarifs.bientot")}>{t("landing.tarifs.inclusions.programmes")}</Coche>
        )}
      </ul>
      <Button asChild variante={vedette ? "accent" : "primaire"} taille="lg" className="mt-auto w-full">
        <Link to={`/inscription?plan=${plan}`}>{t("landing.tarifs.commencer")}</Link>
      </Button>
    </li>
  );
}

export function Tarifs() {
  const { t } = useTranslation();
  const [annuel, setAnnuel] = useState(false);
  const racine = useRef<HTMLElement>(null);
  const whatsapp = lienWhatsAppEquipe(t("landing.contact.whatsapp_message"));

  useAnimation(racine, ({ gsap, racine }) => {
    gsap.from(racine.querySelectorAll("[data-tarif]"), {
      y: 40,
      opacity: 0,
      duration: 0.8,
      stagger: 0.15,
      ease: "power3.out",
      scrollTrigger: { trigger: racine, start: "top 40%", once: true },
    });
  });

  return (
    <section
      ref={racine}
      id="tarifs"
      aria-labelledby="titre-tarifs"
      className="differe [--hauteur-estimee:130rem] md:[--hauteur-estimee:82rem] lg:[--hauteur-estimee:74rem] bg-subtle/60 px-4 py-24 sm:px-6 sm:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-xs tracking-[0.18em] text-accent-ink uppercase">{t("landing.tarifs.surtitre")}</p>
        <h2 id="titre-tarifs" className="mt-4 max-w-3xl text-3xl leading-[1.1] font-extrabold text-navy sm:text-5xl">
          {t("landing.tarifs.titre")}
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          {t("landing.tarifs.texte", { jours: DUREE_ESSAI_JOURS })}
        </p>

        <div
          role="group"
          aria-label={t("landing.tarifs.periode")}
          className="mt-8 inline-flex rounded-full bg-card p-1 shadow-card"
        >
          {([false, true] as const).map((valeur) => (
            <button
              key={String(valeur)}
              type="button"
              aria-pressed={annuel === valeur}
              onClick={() => setAnnuel(valeur)}
              className={cn(
                "rounded-full px-5 py-2.5 text-sm font-semibold transition-colors",
                annuel === valeur ? "bg-navy text-white" : "text-navy hover:bg-subtle",
              )}
            >
              {valeur ? t("landing.tarifs.annuel") : t("landing.tarifs.mensuel")}
              {valeur && (
                <span className={cn("ml-2 font-mono text-xs", annuel ? "text-accent" : "text-accent-ink")}>
                  {t("landing.tarifs.remise")}
                </span>
              )}
            </button>
          ))}
        </div>

        <ul data-tarifs className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3 md:items-stretch">
          <CartePayante plan="starter" annuel={annuel} />
          <CartePayante plan="pro" annuel={annuel} vedette />
          <li
            data-tarif
            className="flex flex-col gap-5 rounded-[2rem] bg-card p-7 shadow-card transition-[box-shadow,transform] duration-300 ease-soft hover:scale-[1.01] hover:shadow-card-hover"
          >
            <div className="grid gap-1">
              <h3 className="text-xl font-extrabold text-navy">{t("landing.tarifs.enterprise.nom")}</h3>
              <p className="text-sm text-muted-foreground">{t("landing.tarifs.enterprise.description")}</p>
            </div>
            <p className="font-mono text-4xl font-semibold text-navy">{t("landing.tarifs.enterprise.prix")}</p>
            <ul className="grid gap-2.5">
              <Coche>{t("landing.tarifs.inclusions.sur_mesure")}</Coche>
              <Coche>{t("landing.tarifs.inclusions.roles")}</Coche>
              <Coche>{t("landing.tarifs.inclusions.echange")}</Coche>
            </ul>
            <div className="mt-auto grid gap-2">
              <Button asChild taille="lg" className="w-full">
                <a
                  href="#contact"
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent("pilot:contact", { detail: { type: "enterprise" } }))
                  }
                >
                  {t("landing.tarifs.parler")}
                </a>
              </Button>
              {whatsapp && (
                <Button asChild variante="lien" className="mx-auto h-auto py-1 text-sm">
                  <a href={whatsapp} target="_blank" rel="noreferrer">
                    {t("landing.contact.whatsapp")}
                  </a>
                </Button>
              )}
            </div>
          </li>
        </ul>

        <div className="mt-10 grid gap-4 rounded-[2rem] bg-card/70 p-6 sm:flex sm:items-center sm:gap-8">
          <p className="font-bold text-navy">{t("landing.tarifs.tous.titre")}</p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {(["pdf", "import", "temps_reel"] as const).map((cle) => (
              <Coche key={cle}>{t(`landing.tarifs.tous.${cle}`)}</Coche>
            ))}
          </ul>
        </div>
        <p className="mt-4 max-w-3xl text-sm text-muted-foreground">{t("landing.tarifs.facturation")}</p>
      </div>
    </section>
  );
}
