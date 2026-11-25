import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "~/components/ui/badge";
import type { StatutKpi } from "~/lib/kpi";

const CONFIG = {
  ok: { Icone: CheckCircle2, variante: "ok" },
  warn: { Icone: AlertTriangle, variante: "vigilance" },
  alert: { Icone: XCircle, variante: "alerte" },
  none: { Icone: CircleDashed, variante: "neutre" },
} as const;

/** Un statut se lit toujours par une icône ET un libellé, jamais par la couleur seule. */
export function StatutKpiBadge({ statut, className }: { statut: StatutKpi; className?: string }) {
  const { t } = useTranslation();
  const { Icone, variante } = CONFIG[statut];
  return (
    <Badge variante={variante} className={className}>
      <Icone aria-hidden />
      {t(`kpi.statuts.${statut}`)}
    </Badge>
  );
}
