import { useTranslation } from "react-i18next";
import { Badge } from "~/components/ui/badge";
import { arrondirTaux } from "~/lib/avancement";
import { cn } from "~/lib/utils";

type Props = {
  /** Taux de résultats en pourcentage, ou null sans donnée. */
  resultats: number | null;
  /** Taux physique en pourcentage, ou null sans activité planifiée. */
  physique: number | null;
  /** Légende sous chaque taux (page de programme et en-tête de projet). */
  avecAide?: boolean;
  className?: string;
};

/**
 * Les trois taux d'avancement : résultats, physique, financier (ce dernier arrive avec le suivi financier).
 * Valeurs chiffrées, jamais de barre de progression : les statuts colorés restent ceux des indicateurs.
 */
export function TauxAvancement({ resultats, physique, avecAide = false, className }: Props) {
  const { t } = useTranslation();
  const lignes = [
    { cle: "resultats", valeur: resultats, vide: t("avancement.aucune_donnee") },
    { cle: "physique", valeur: physique, vide: t("avancement.aucune_activite") },
  ] as const;
  return (
    <dl className={cn("grid grid-cols-3 gap-3", className)}>
      {lignes.map(({ cle, valeur, vide }) => (
        <div key={cle} className="grid content-start gap-0.5">
          <dt className="text-xs font-semibold text-muted-foreground">{t(`avancement.${cle}`)}</dt>
          <dd className="font-mono text-lg font-semibold text-navy tabular">
            {valeur === null ? (
              <span title={vide}>
                <span aria-hidden>—</span>
                <span className="sr-only">{vide}</span>
              </span>
            ) : (
              `${arrondirTaux(valeur)} %`
            )}
          </dd>
          {avecAide && <dd className="text-xs text-muted-foreground">{t(`avancement.${cle}_aide`)}</dd>}
        </div>
      ))}
      <div className="grid content-start gap-0.5">
        <dt className="text-xs font-semibold text-muted-foreground">{t("avancement.financier")}</dt>
        <dd>
          <Badge variante="neutre">{t("avancement.bientot")}</Badge>
        </dd>
        {avecAide && <dd className="text-xs text-muted-foreground">{t("avancement.financier_aide")}</dd>}
      </div>
    </dl>
  );
}
