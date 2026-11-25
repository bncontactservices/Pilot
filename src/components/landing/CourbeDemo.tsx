import { courbeDemo, HAUTEUR_COURBE, LARGEUR_COURBE } from "~/lib/demo-landing";
import { cn } from "~/lib/utils";

// Les attributs SVG ne résolvent pas var(--…) : couleurs du preset en clair, comme le graphique de l'application.
const NAVY = "#0B2545";
const CIBLE = "#0B7A57";
const TRAJECTOIRE = "#8A929B";
const BORD = "#E4E0D7";
const TEXTE = "#55606B";

const courbe = courbeDemo();

/** Courbe d'évolution en SVG maison, tracée par la géométrie partagée avec le rapport PDF (chart-geometry.ts). */
export function CourbeDemo({ description, className }: { description: string; className?: string }) {
  const { zone } = courbe;
  return (
    <svg
      viewBox={`0 0 ${LARGEUR_COURBE} ${HAUTEUR_COURBE}`}
      role="img"
      aria-label={description}
      className={cn("h-auto w-full", className)}
      data-courbe
    >
      {courbe.axeY.map((t, i) => (
        <g key={`y${i}`}>
          <line x1={zone.gauche} x2={zone.droite} y1={t.y} y2={t.y} stroke={BORD} strokeDasharray="3 4" />
          <text
            x={zone.gauche - 8}
            y={t.y + 4}
            textAnchor="end"
            fontSize="11"
            fill={TEXTE}
            fontFamily="IBM Plex Mono, monospace"
          >
            {courbe.etiquettesY[i]}
          </text>
        </g>
      ))}
      {courbe.axeX.map((t, i) => (
        <text key={`x${i}`} x={t.x} y={zone.bas + 17} textAnchor="middle" fontSize="11" fill={TEXTE}>
          {courbe.etiquettesX[i]}
        </text>
      ))}
      <line x1={zone.gauche} x2={zone.droite} y1={zone.bas} y2={zone.bas} stroke={BORD} />
      <line
        x1={zone.gauche}
        x2={zone.droite}
        y1={courbe.yCible}
        y2={courbe.yCible}
        stroke={CIBLE}
        strokeWidth="2"
        strokeDasharray="7 5"
      />
      <path
        d={courbe.trajectoire}
        fill="none"
        stroke={TRAJECTOIRE}
        strokeWidth="1.5"
        strokeDasharray="2 5"
        strokeLinecap="round"
      />
      {/* pathLength=1 : le tracé s'anime avec stroke-dashoffset sans mesurer le chemin. */}
      <path
        d={courbe.courbe}
        data-trace
        fill="none"
        stroke={NAVY}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
      />
      {courbe.points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill={NAVY} data-point style={{ "--p": i } as React.CSSProperties} />
      ))}
    </svg>
  );
}
