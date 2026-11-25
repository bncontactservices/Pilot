import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { StatutKpi } from "~/lib/kpi";
import { cn } from "~/lib/utils";

const ICONES = {
  ok: { Icone: CheckCircle2, classe: "text-status-ok-ink" },
  warn: { Icone: AlertTriangle, classe: "text-status-warn-ink" },
  alert: { Icone: XCircle, classe: "text-status-alert-ink" },
  none: { Icone: CircleDashed, classe: "text-muted-foreground" },
} as const;

export type IndicateurRelie = { id: string; nom: string; statut: StatutKpi };

/** Indicateurs reliés à une ligne du cadre logique : nom + statut (icône et texte pour les lecteurs d'écran). */
export function IndicateursNoeud({ indicateurs, className }: { indicateurs: IndicateurRelie[]; className?: string }) {
  const { t } = useTranslation();
  if (indicateurs.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{t("cadre.aucun_indicateur")}</p>;
  }
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {indicateurs.map(({ id, nom, statut }) => {
        const { Icone, classe } = ICONES[statut];
        return (
          <li
            key={id}
            className="inline-flex max-w-full items-start gap-1.5 rounded-xl bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
          >
            <Icone className={cn("mt-px size-3.5 shrink-0", classe)} aria-hidden />
            <span className="min-w-0 break-words">{nom}</span>
            <span className="sr-only">{`: ${t(`kpi.statuts.${statut}`)}`}</span>
          </li>
        );
      })}
    </ul>
  );
}
