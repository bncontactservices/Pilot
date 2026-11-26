import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "~/components/ui/badge";
import { arrondirTaux } from "~/lib/avancement";
import { cn } from "~/lib/utils";

type Props = {
  /** Taux de résultats en pourcentage, ou null sans donnée. */
  resultats: number | null;
  /** Taux physique en pourcentage, ou null sans activité planifiée. */
  physique: number | null;
  /** Taux financier (dépenses / budget) en pourcentage, au-delà de 100 en cas de dépassement ; null sans budget. */
  financier: number | null;
  /** Légende sous chaque taux (page de programme et en-tête de projet). */
  avecAide?: boolean;
  className?: string;
};

/**
 * Les trois taux d'avancement : résultats, physique, financier.
 * Valeurs chiffrées, jamais de barre de progression : les statuts colorés restent ceux des indicateurs.
 * Un taux financier au-delà de 100 % (budget dépassé) est dit en toutes lettres, pas seulement par sa valeur.
 */
export function TauxAvancement({ resultats, physique, financier, avecAide = false, className }: Props) {
  const { t } = useTranslation();
  const lignes = [
    { cle: "resultats", valeur: resultats, vide: t("avancement.aucune_donnee") },
    { cle: "physique", valeur: physique, vide: t("avancement.aucune_activite") },
    { cle: "financier", valeur: financier, vide: t("avancement.aucun_budget") },
  ] as const;
  return (
    <dl className={cn("grid grid-cols-3 gap-3", className)}>
      {lignes.map(({ cle, valeur, vide }) => (
        <div key={cle} className="grid content-start gap-0.5">
          <dt className="text-xs font-semibold text-muted-foreground">{t(`avancement.${cle}`)}</dt>
          <dd className="font-mono text-lg font-semibold text-navy tabular">
            {valeur === null ? (
              <span title={vide}>
                <span aria-hidden>-</span>
                <span className="sr-only">{vide}</span>
              </span>
            ) : cle === "financier" && valeur > 100 ? (
              <span className="inline-flex flex-wrap items-center gap-x-1.5">
                {arrondirTaux(valeur)} %
                <Badge variante="alerte">
                  <TriangleAlert aria-hidden />
                  {t("avancement.depasse")}
                </Badge>
              </span>
            ) : (
              `${arrondirTaux(valeur)} %`
            )}
          </dd>
          {avecAide && <dd className="text-xs text-muted-foreground">{t(`avancement.${cle}_aide`)}</dd>}
        </div>
      ))}
    </dl>
  );
}
