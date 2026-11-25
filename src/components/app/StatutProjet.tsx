import { AlertTriangle, Archive, CheckCircle2, Circle, CircleDot, PauseCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "~/components/ui/badge";
import type { Enums } from "~/lib/database.types";

const STYLES = {
  non_demarre: { variante: "neutre", icone: Circle },
  en_cours: { variante: "contour", icone: CircleDot },
  en_retard: { variante: "alerte", icone: AlertTriangle },
  suspendu: { variante: "vigilance", icone: PauseCircle },
  termine: { variante: "ok", icone: CheckCircle2 },
  cloture: { variante: "neutre", icone: Archive },
} as const;

export const STATUTS_PROJET = Object.keys(STYLES) as Enums<"statut_projet">[];

/** Statut toujours doublé d'une icône et d'un libellé. */
export function StatutProjet({ statut }: { statut: Enums<"statut_projet"> }) {
  const { t } = useTranslation();
  const { variante, icone: Icone } = STYLES[statut];
  return (
    <Badge variante={variante}>
      <Icone aria-hidden />
      {t(`projets.statuts.${statut}`)}
    </Badge>
  );
}
