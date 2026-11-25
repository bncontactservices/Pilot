import { useTranslation } from "react-i18next";
import { Sparkline } from "~/components/app/kpi/Sparkline";
import { StatutKpiBadge } from "~/components/app/kpi/StatutKpiBadge";
import { CadreNavigateur } from "~/components/landing/CadreNavigateur";
import { CourbeDemo } from "~/components/landing/CourbeDemo";
import { INDICATEURS_DEMO } from "~/lib/demo-landing";
import { formaterNombre, formaterValeur } from "~/lib/format";

/**
 * Maquette du hero : quatre cartes d'indicateurs et la courbe d'évolution, avec les composants de l'application
 * (badge de statut, sparkline) et les calculs de kpi.ts, sur des données de démonstration.
 */
export function FenetreHero() {
  const { t } = useTranslation();
  return (
    <div className="lg:[perspective:1600px]">
      <CadreNavigateur
        titre={t("landing.hero.fenetre")}
        etiquette={t("landing.hero.donnees_demo")}
        className="lg:[transform:rotateY(-7deg)_rotateX(3deg)]"
      >
        <ul className="grid grid-cols-2 gap-3">
          {INDICATEURS_DEMO.map(({ kpi, evaluation, serie }) => (
            <li key={kpi.id} className="flex flex-col gap-2 rounded-2xl bg-sand p-3.5">
              <p className="line-clamp-2 min-h-8 text-xs leading-snug font-bold text-navy">{kpi.nom}</p>
              <p className="font-mono text-2xl font-semibold text-navy tabular">
                <span data-compteur={evaluation.valeur ?? 0}>{formaterNombre(evaluation.valeur ?? 0)}</span>
                {kpi.unite === "%" && <span className="ml-0.5 text-base">&nbsp;%</span>}
              </p>
              <p className="-mt-1 text-[0.7rem] text-muted-foreground">
                {t("kpi.carte.cible", { cible: formaterValeur(kpi.cible, kpi.unite) })}
              </p>
              <div className="flex items-end justify-between gap-2">
                <StatutKpiBadge statut={evaluation.statut} />
                <Sparkline valeurs={serie.map((p) => p.valeur)} statut={evaluation.statut} className="h-7 w-16" />
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 rounded-2xl bg-sand p-3.5">
          <p className="mb-1 text-xs font-bold text-navy">{t("landing.hero.evolution")}</p>
          <CourbeDemo description={t("landing.hero.evolution")} />
        </div>
      </CadreNavigateur>
    </div>
  );
}
