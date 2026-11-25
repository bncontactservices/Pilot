import { Clock, ListPlus, Minus, Pencil, TrendingDown, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { StatutKpiBadge } from "~/components/app/kpi/StatutKpiBadge";
import { Sparkline } from "~/components/app/kpi/Sparkline";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import type { Kpi } from "~/lib/donnees";
import { formaterEcart, formaterNombre, formaterPourcentage, formaterValeur } from "~/lib/format";
import type { Evaluation, PointSerie } from "~/lib/kpi";

/** Un indicateur dit trois choses : où nous en sommes, l'écart, quoi faire. */
export function CarteKpi({
  kpi,
  evaluation,
  serie,
  peutSaisir,
  onCreerEtape,
  etapesOuvertes = 0,
}: {
  kpi: Kpi;
  evaluation: Evaluation;
  serie: PointSerie[];
  peutSaisir: boolean;
  /** Ouvre la création d'une prochaine étape pour cet indicateur (alerte ambre ou rouge, rôle éditeur). */
  onCreerEtape?: () => void;
  /** Prochaines étapes déjà ouvertes pour cet indicateur : on les montre plutôt que d'en proposer une de plus. */
  etapesOuvertes?: number;
}) {
  const { t } = useTranslation();
  const { valeur, pourcent, statut, ecart, enAvance, attendue, delta } = evaluation;
  const IconeVariation = delta ? (delta.valeur > 0 ? TrendingUp : delta.valeur < 0 ? TrendingDown : Minus) : Minus;

  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl bg-card p-5 shadow-card transition-[box-shadow,transform] duration-300 ease-soft hover:scale-[1.01] hover:shadow-card-hover">
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-base leading-snug font-bold text-navy">{kpi.nom}</h3>
        <StatutKpiBadge statut={statut} className="shrink-0" />
      </header>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {valeur === null ? (
            <>
              <p className="font-mono text-3xl font-semibold text-muted-foreground">—</p>
              <p className="text-sm text-muted-foreground">{t("kpi.carte.aucune_donnee")}</p>
            </>
          ) : (
            <p className="font-mono text-3xl font-semibold text-navy tabular">
              {formaterNombre(valeur)}
              {kpi.unite && (
                <span className="ml-1.5 font-sans text-base font-medium text-muted-foreground">{kpi.unite}</span>
              )}
            </p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {t("kpi.carte.cible", { cible: formaterValeur(kpi.cible, kpi.unite) })}
            {pourcent !== null && <> · {t("kpi.carte.atteint", { pourcent: formaterPourcentage(pourcent) })}</>}
          </p>
        </div>
        <Sparkline valeurs={serie.map((p) => p.valeur)} statut={statut} />
      </div>

      <ul className="grid gap-1.5 text-sm">
        {ecart !== null && attendue !== null && (
          <li className="text-foreground">
            {t(enAvance ? "kpi.carte.ecart_avance" : "kpi.carte.ecart_retard", {
              attendue: formaterValeur(attendue, kpi.unite),
              ecart: formaterValeur(Math.abs(ecart), kpi.unite),
            })}
          </li>
        )}
        {delta && (
          <li className="flex items-center gap-1.5 text-muted-foreground">
            <IconeVariation className="size-4 shrink-0" aria-hidden />
            {t("kpi.carte.variation", { variation: formaterEcart(delta.valeur) })}
            {delta.pourcent !== null && <> ({formaterEcart(Math.round(delta.pourcent))} %)</>}
          </li>
        )}
        {evaluation.retardSaisie && (
          <li>
            <Badge variante="vigilance">
              <Clock aria-hidden />
              {t("kpi.carte.saisie_en_retard")}
            </Badge>
          </li>
        )}
      </ul>

      {(statut === "warn" || statut === "alert") && (
        <div className="grid gap-2 rounded-xl bg-sand px-3 py-2.5 text-sm text-foreground">
          <p>{t(`kpi.actions.${statut}`)}</p>
          {etapesOuvertes > 0 ? (
            <Link
              to={`/app/projets/${kpi.project_id}/prochaines-etapes`}
              className="w-fit font-semibold text-accent-ink hover:underline"
            >
              {t("kpi.carte.etapes_ouvertes", { count: etapesOuvertes })}
            </Link>
          ) : (
            onCreerEtape && (
              <Button type="button" variante="contour" taille="sm" className="w-fit" onClick={onCreerEtape}>
                <ListPlus aria-hidden />
                {t("kpi.carte.creer_etape")}
              </Button>
            )
          )}
        </div>
      )}

      {peutSaisir && (
        <Button asChild variante="contour" taille="sm" className="mt-auto w-fit">
          <Link to={`/app/projets/${kpi.project_id}/saisie?kpi=${kpi.id}`}>
            <Pencil aria-hidden />
            {t("kpi.carte.saisir")}
          </Link>
        </Button>
      )}
    </article>
  );
}
