import { ArrowRight, Mail, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FormulaireLead } from "~/components/landing/FormulaireLead";
import { Magnetique } from "~/components/landing/Magnetique";
import { Button } from "~/components/ui/button";
import { evenement } from "~/lib/analytics";
import { lienEmailEquipe, lienWhatsAppEquipe } from "~/lib/contact";
import type { TypeDemande } from "../../../supabase/functions/submit-lead/lead";

/** Section d'appel à l'action finale : accent pleine largeur, bouton géant, WhatsApp et formulaire (`demo` ou `enterprise`). */
export function Contact() {
  const { t } = useTranslation();
  const [type, setType] = useState<TypeDemande>("demo");
  const carte = useRef<HTMLDivElement>(null);

  const aller = (nouveau?: "demo" | "enterprise") => {
    if (nouveau) setType(nouveau);
    // Le champ est focalisé après le rendu : le formulaire peut venir de changer de type.
    window.setTimeout(
      () =>
        carte.current?.querySelector<HTMLElement>("input:not([tabindex='-1']), select")?.focus({ preventScroll: true }),
      350,
    );
  };

  useEffect(() => {
    // Le bouton « Parler à l'équipe » de l'offre Enterprise pré-sélectionne la demande.
    const surDemande = (e: Event) => aller((e as CustomEvent<{ type: "demo" | "enterprise" }>).detail.type);
    window.addEventListener("pilot:contact", surDemande);
    return () => window.removeEventListener("pilot:contact", surDemande);
  }, []);

  const whatsapp = lienWhatsAppEquipe(t("landing.contact.whatsapp_message"));
  const email = lienEmailEquipe(t("landing.contact.email_sujet"));

  return (
    <section
      id="contact"
      aria-labelledby="titre-contact"
      className="differe [--hauteur-estimee:86rem] md:[--hauteur-estimee:85rem] lg:[--hauteur-estimee:61rem] bg-accent px-4 py-24 text-accent-foreground sm:px-6 sm:py-32"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid gap-6">
          <p className="font-mono text-xs tracking-[0.18em] uppercase">{t("landing.contact.surtitre")}</p>
          <h2 id="titre-contact" className="text-4xl leading-[1.05] font-extrabold sm:text-6xl">
            {t("landing.contact.titre")}
          </h2>
          <p className="max-w-md text-lg">{t("landing.contact.texte")}</p>
          <div className="flex flex-wrap items-center gap-4">
            <Magnetique force={0.3}>
              <Button
                taille="lg"
                className="h-16 px-9 text-lg"
                onClick={() => {
                  evenement("Demo CTA Click", { emplacement: "contact" });
                  aller("demo");
                }}
              >
                {t("landing.contact.cta")}
                <ArrowRight aria-hidden />
              </Button>
            </Magnetique>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="lift inline-flex items-center gap-2 font-bold underline underline-offset-4"
              >
                <MessageCircle className="size-5" aria-hidden />
                {t("landing.contact.whatsapp")}
              </a>
            )}
            {email && (
              <a href={email} className="lift inline-flex items-center gap-2 font-bold underline underline-offset-4">
                <Mail className="size-5" aria-hidden />
                {t("landing.contact.email")}
              </a>
            )}
          </div>
        </div>
        <div ref={carte} className="rounded-[2.5rem] bg-card p-6 text-card-foreground shadow-card-hover sm:p-8">
          <FormulaireLead
            type={type}
            onTypeChange={setType}
            titre={
              type === "enterprise" ? t("landing.formulaire.titre_enterprise") : t("landing.formulaire.titre_demo")
            }
            libelleEnvoi={t("landing.formulaire.envoyer")}
            emplacement="contact"
          />
        </div>
      </div>
    </section>
  );
}
