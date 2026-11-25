import { useTranslation } from "react-i18next";
import { FormulaireLead } from "~/components/landing/FormulaireLead";
import { Badge } from "~/components/ui/badge";

/** Pas de témoignage inventé : tant qu'aucun n'est fourni, la section présente le programme pilotes. */
export function Pilotes() {
  const { t } = useTranslation();
  return (
    <section
      id="pilotes"
      aria-labelledby="titre-pilotes"
      className="differe [--hauteur-estimee:53rem] md:[--hauteur-estimee:57rem] lg:[--hauteur-estimee:44rem] px-4 py-24 sm:px-6 sm:py-32"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 rounded-[3rem] bg-navy p-8 text-white sm:p-14 lg:grid-cols-2">
        <div className="grid gap-5">
          <Badge className="w-fit bg-white/10 text-white">{t("landing.pilotes.badge")}</Badge>
          <h2 id="titre-pilotes" className="text-3xl leading-[1.1] font-extrabold sm:text-5xl">
            {t("landing.pilotes.titre")}
          </h2>
          <p className="max-w-md text-white/85">{t("landing.pilotes.texte")}</p>
        </div>
        <div className="rounded-[2rem] bg-card p-6 text-card-foreground sm:p-8">
          <FormulaireLead
            type="pilote"
            compact
            libelleEnvoi={t("landing.formulaire.envoyer_pilote")}
            emplacement="pilotes"
          />
        </div>
      </div>
    </section>
  );
}
