import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { StatutTravail } from "~/lib/avancement";
import { arrondirTaux } from "~/lib/avancement";
import type { BarrePlan, Planning } from "~/lib/composantes";
import { formaterDate } from "~/lib/format";
import { graduations, positionJour, tronquer } from "~/lib/gantt";
import { numeroJour } from "~/lib/kpi";
import { cn } from "~/lib/utils";

const LARGEUR = 900;
const COLONNE_NOMS = 200;
const MARGE = 12;
const HAUTEUR_AXE = 28;
const LIGNE_COMPOSANTE = 36;
const LIGNE_ACTIVITE = 24;

/** Apparence d'une barre selon le statut : la forme (contour, hachures) dit la même chose que la couleur. */
export function classeBarre(statut: StatutTravail, enRetard: boolean): string {
  if (enRetard) return "fill-status-alert stroke-status-alert";
  switch (statut) {
    case "termine":
      return "fill-status-ok stroke-status-ok";
    case "en_cours":
      return "fill-navy stroke-navy";
    case "a_faire":
      return "fill-card stroke-navy";
    case "reporte":
      return "stroke-status-warn";
    case "annule":
      return "fill-muted stroke-muted-foreground";
  }
}

type Props = {
  planning: Planning;
  aujourdhui: string;
};

/**
 * Planning des composantes en diagramme de Gantt : une barre par composante datée (avec son avancement), ses
 * activités du plan de travail en barres plus fines dessous, la date du jour en pointillés. La figure est une vue
 * d'ensemble ; la liste (même page) porte le détail et reste la version accessible.
 */
export function GanttComposantes({ planning, aujourdhui }: Props) {
  const { t } = useTranslation();
  const idHachures = useId();
  const { groupes, sansComposante, periode } = planning;
  if (!periode) return null;

  const { debut, fin } = periode;
  const gauche = COLONNE_NOMS;
  const largeurUtile = LARGEUR - gauche - MARGE;
  const x = (jour: number) => positionJour(jour, debut, fin, gauche, largeurUtile);
  const nbLignesActivites = groupes.reduce((n, g) => n + g.activitesDatees.length, 0) + sansComposante.length;
  const enTeteSans = sansComposante.length > 0 ? LIGNE_COMPOSANTE - 8 : 0;
  const hauteur =
    HAUTEUR_AXE + groupes.length * LIGNE_COMPOSANTE + nbLignesActivites * LIGNE_ACTIVITE + enTeteSans + 14;
  const jourAujourdhui = numeroJour(aujourdhui);
  const xAujourdhui = jourAujourdhui >= debut && jourAujourdhui <= fin ? x(jourAujourdhui + 0.5) : null;

  const infobulle = (nom: string, statut: StatutTravail, barre: BarrePlan, suite = "") =>
    `${nom} - ${t(`travail.statuts.${statut}`)} - ${formaterDate(isoDe(barre.debut))} → ${formaterDate(isoDe(barre.fin))}${suite}`;

  let y = HAUTEUR_AXE;
  const lignes: React.ReactNode[] = [];

  for (const g of groupes) {
    const c = g.composante;
    const yBarre = y + 9;
    const classe = classeBarre(c.statut, g.enRetard);
    const droite = x(g.barre.fin + 1);
    const taux = g.taux === null ? null : `${arrondirTaux(g.taux)} %`;
    lignes.push(
      <g key={c.id}>
        <text x={MARGE} y={y + 21} className="fill-navy" fontSize={13} fontWeight={700}>
          {tronquer(c.nom, 24)}
          <title>{c.nom}</title>
        </text>
        <rect
          x={x(g.barre.debut)}
          y={yBarre}
          width={Math.max(4, droite - x(g.barre.debut))}
          height={16}
          rx={5}
          className={classe}
          fill={c.statut === "reporte" && !g.enRetard ? `url(#${idHachures})` : undefined}
          strokeWidth={1.5}
        >
          <title>{infobulle(c.nom, c.statut, g.barre, taux ? ` - ${taux}` : "")}</title>
        </rect>
        {taux && (
          <text
            x={droite + 6 + 40 > LARGEUR ? x(g.barre.debut) - 6 : droite + 6}
            textAnchor={droite + 6 + 40 > LARGEUR ? "end" : "start"}
            y={yBarre + 12}
            className="fill-navy font-mono"
            fontSize={11}
            fontWeight={600}
          >
            {taux}
          </text>
        )}
      </g>,
    );
    y += LIGNE_COMPOSANTE;
    for (const a of g.activitesDatees) {
      lignes.push(ligneActivite(a, y));
      y += LIGNE_ACTIVITE;
    }
  }

  if (sansComposante.length > 0) {
    lignes.push(
      <text key="sans" x={MARGE} y={y + 18} className="fill-muted-foreground" fontSize={12} fontWeight={700}>
        {t("composantes.gantt.sans_composante")}
      </text>,
    );
    y += enTeteSans;
    for (const a of sansComposante) {
      lignes.push(ligneActivite(a, y));
      y += LIGNE_ACTIVITE;
    }
  }

  function ligneActivite(a: { id: string; intitule: string; statut: StatutTravail; barre: BarrePlan }, yLigne: number) {
    const gaucheBarre = x(a.barre.debut);
    return (
      <g key={a.id}>
        <text x={MARGE + 12} y={yLigne + 15} className="fill-muted-foreground" fontSize={11.5}>
          {tronquer(a.intitule, 28)}
          <title>{a.intitule}</title>
        </text>
        <rect
          x={gaucheBarre}
          y={yLigne + 7}
          width={Math.max(3, x(a.barre.fin + 1) - gaucheBarre)}
          height={8}
          rx={4}
          className={classeBarre(a.statut, false)}
          fill={a.statut === "reporte" ? `url(#${idHachures})` : undefined}
          opacity={0.9}
          strokeWidth={1.25}
        >
          <title>{infobulle(a.intitule, a.statut, a.barre)}</title>
        </rect>
      </g>
    );
  }

  const resume = t("composantes.gantt.alt", { count: groupes.length, retard: planning.nbEnRetard });
  return (
    <div className="grid gap-3">
      <div className="relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <svg
          role="img"
          aria-label={resume}
          viewBox={`0 0 ${LARGEUR} ${hauteur}`}
          className="h-auto w-full min-w-[44rem] rounded-2xl bg-card shadow-card"
        >
          <defs>
            <pattern id={idHachures} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={6} height={6} className="fill-card" />
              <line x1={0} y1={0} x2={0} y2={6} className="stroke-status-warn" strokeWidth={3} />
            </pattern>
          </defs>

          {graduations(debut, fin).map(({ jour, iso }) => (
            <g key={iso}>
              <line
                x1={x(jour)}
                x2={x(jour)}
                y1={HAUTEUR_AXE - 4}
                y2={hauteur - 6}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={x(jour) + 55 > LARGEUR ? x(jour) - 4 : x(jour) + 4}
                textAnchor={x(jour) + 55 > LARGEUR ? "end" : "start"}
                y={17}
                className="fill-muted-foreground font-mono"
                fontSize={11}
              >
                {formaterDate(iso, "MMM yy")}
              </text>
            </g>
          ))}

          {lignes}

          {xAujourdhui !== null && (
            <g>
              <line
                x1={xAujourdhui}
                x2={xAujourdhui}
                y1={HAUTEUR_AXE - 4}
                y2={hauteur - 6}
                className="stroke-accent-ink"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <text
                x={Math.min(xAujourdhui + 5, LARGEUR - 70)}
                y={hauteur - 10}
                className="fill-accent-ink"
                fontSize={11}
                fontWeight={600}
              >
                {t("composantes.gantt.aujourdhui")}
              </text>
            </g>
          )}
        </svg>
      </div>
      <Legende />
    </div>
  );
}

/** Jour (numéro) → date ISO, pour les infobulles. */
function isoDe(jour: number): string {
  return new Date(jour * 86_400_000).toISOString().slice(0, 10);
}

const LEGENDE: { statut: StatutTravail | "retard"; classe: string }[] = [
  { statut: "termine", classe: "bg-status-ok" },
  { statut: "en_cours", classe: "bg-navy" },
  { statut: "a_faire", classe: "border-2 border-navy bg-card" },
  {
    statut: "reporte",
    classe:
      "border border-status-warn bg-[repeating-linear-gradient(135deg,var(--status-warn)_0_2px,transparent_2px_5px)]",
  },
  { statut: "annule", classe: "border border-muted-foreground bg-muted" },
  { statut: "retard", classe: "bg-status-alert" },
];

function Legende() {
  const { t } = useTranslation();
  return (
    <ul
      className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground"
      aria-label={t("composantes.gantt.legende")}
    >
      {LEGENDE.map(({ statut, classe }) => (
        <li key={statut} className="inline-flex items-center gap-1.5">
          <span className={cn("inline-block h-2.5 w-5 rounded-full", classe)} aria-hidden />
          {statut === "retard" ? t("travail.en_retard") : t(`travail.statuts.${statut}`)}
        </li>
      ))}
    </ul>
  );
}
