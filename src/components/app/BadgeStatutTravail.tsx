import { AlertTriangle, CalendarClock, CheckCircle2, Circle, CircleDot, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "~/components/ui/badge";
import type { StatutTravail } from "~/lib/avancement";

export const STYLES_STATUT_TRAVAIL = {
  a_faire: { variante: "neutre", Icone: Circle },
  en_cours: { variante: "contour", Icone: CircleDot },
  termine: { variante: "ok", Icone: CheckCircle2 },
  reporte: { variante: "vigilance", Icone: CalendarClock },
  annule: { variante: "neutre", Icone: XCircle },
} as const;

/** Statut d'une activité, d'une étape ou d'une action : toujours une icône ET un libellé. */
export function BadgeStatutTravail({ statut, enRetard = false }: { statut: StatutTravail; enRetard?: boolean }) {
  const { t } = useTranslation();
  const { variante, Icone } = STYLES_STATUT_TRAVAIL[statut];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variante={variante}>
        <Icone aria-hidden />
        {t(`travail.statuts.${statut}`)}
      </Badge>
      {enRetard && (
        <Badge variante="alerte">
          <AlertTriangle aria-hidden />
          {t("travail.en_retard")}
        </Badge>
      )}
    </span>
  );
}
