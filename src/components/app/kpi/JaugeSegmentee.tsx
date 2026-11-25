import { useTranslation } from "react-i18next";
import { JaugeVide } from "~/components/app/Etats";
import { compterStatuts, type StatutKpi } from "~/lib/kpi";
import { cn } from "~/lib/utils";

const COULEURS: Record<StatutKpi, string> = {
  ok: "bg-status-ok",
  warn: "bg-status-warn",
  alert: "bg-status-alert",
  none: "bg-[repeating-linear-gradient(135deg,var(--status-none)_0_3px,transparent_3px_6px)]",
};

/** Progression d'un projet : un segment par indicateur, coloré selon son statut (jamais une barre simple). */
export function JaugeSegmentee({ statuts, className }: { statuts: StatutKpi[]; className?: string }) {
  const { t } = useTranslation();
  if (statuts.length === 0) return <JaugeVide className={cn("w-full", className)} segments={5} />;
  const resume = t("kpi.jauge_resume", compterStatuts(statuts.map((statut) => ({ statut }))));
  return (
    <div role="img" aria-label={resume} className={cn("flex w-full gap-1", className)}>
      {statuts.map((statut, i) => (
        <span key={i} className={cn("h-2.5 min-w-2 flex-1 rounded-full", COULEURS[statut])} />
      ))}
    </div>
  );
}
