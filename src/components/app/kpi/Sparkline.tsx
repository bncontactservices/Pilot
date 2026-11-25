import { cheminAire, cheminLigne, pointsCourbe } from "~/lib/chart-geometry";
import type { StatutKpi } from "~/lib/kpi";
import { cn } from "~/lib/utils";

const COULEURS: Record<StatutKpi, string> = {
  ok: "var(--status-ok)",
  warn: "var(--status-warn)",
  alert: "var(--status-alert)",
  none: "var(--status-none)",
};
const LARGEUR = 120;
const HAUTEUR = 36;

/** Petite courbe des dernières valeurs ; décorative, les valeurs sont données en texte à côté. */
export function Sparkline({
  valeurs,
  statut,
  className,
}: {
  valeurs: number[];
  statut: StatutKpi;
  className?: string;
}) {
  const points = pointsCourbe(valeurs.slice(-12), LARGEUR, HAUTEUR);
  if (points.length < 2) return <div aria-hidden className={cn("h-9 w-28", className)} />;
  const couleur = COULEURS[statut];
  const dernier = points[points.length - 1]!;
  return (
    <svg viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} className={cn("h-9 w-28", className)} aria-hidden focusable="false">
      <path d={cheminAire(points, HAUTEUR)} fill={couleur} opacity="0.12" />
      <path
        d={cheminLigne(points)}
        fill="none"
        stroke={couleur}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={dernier.x} cy={dernier.y} r="2.6" fill={couleur} />
    </svg>
  );
}
