import { useTranslation } from "react-i18next";
import { enRetard } from "~/lib/avancement";
import type { Etape, Phase } from "~/lib/donnees-se";
import { formaterDate } from "~/lib/format";
import { numeroJour } from "~/lib/kpi";

const LARGEUR = 800;
const MARGE = 12;
const HAUTEUR_AXE = 26;
const HAUTEUR_LIGNE = 38;
const HAUTEUR_ETAPES = 44;

/** Mois de départ des graduations : au plus huit repères sur l'axe. */
function graduations(debut: number, fin: number): { jour: number; iso: string }[] {
  const d = new Date(debut * 86_400_000);
  const nbMois =
    (new Date(fin * 86_400_000).getUTCFullYear() - d.getUTCFullYear()) * 12 +
    new Date(fin * 86_400_000).getUTCMonth() -
    d.getUTCMonth() +
    1;
  const pas = [1, 2, 3, 6, 12, 24].find((p) => nbMois / p <= 8) ?? 24;
  const sortie: { jour: number; iso: string }[] = [];
  let annee = d.getUTCFullYear();
  let mois = d.getUTCMonth();
  for (let i = 0; i < 400; i += 1) {
    const iso = `${annee}-${String(mois + 1).padStart(2, "0")}-01`;
    const jour = numeroJour(iso);
    if (jour > fin) break;
    if (jour >= debut && (annee * 12 + mois) % pas === 0) sortie.push({ jour, iso });
    mois += 1;
    if (mois > 11) {
      mois = 0;
      annee += 1;
    }
  }
  return sortie;
}

/** Le nom d'une phase qui commencerait trop près du bord droit est aligné sur la fin de sa barre. */
const debordeADroite = (gauche: number, nom: string) => gauche + nom.length * 7.8 > LARGEUR - MARGE;

type Props = {
  projet: { date_debut: string; date_fin: string };
  phases: Phase[];
  etapes: Etape[];
  aujourdhui: string;
};

/**
 * Chronologie du projet : une barre par phase datée, les étapes en marqueurs (losange = jalon, carré = livrable),
 * la date du jour en pointillés. Les listes sous la figure portent le détail ; la figure est une vue d'ensemble.
 */
export function Chronologie({ projet, phases, etapes, aujourdhui }: Props) {
  const { t } = useTranslation();
  const datees = phases.filter((p) => p.date_debut && p.date_fin);
  if (datees.length === 0 && etapes.length === 0) return null;

  // L'axe couvre le projet, élargi à tout ce qui dépasse.
  const jours = [
    numeroJour(projet.date_debut),
    numeroJour(projet.date_fin),
    ...datees.flatMap((p) => [numeroJour(p.date_debut!), numeroJour(p.date_fin!)]),
    ...etapes.map((e) => numeroJour(e.date_prevue)),
  ];
  const debut = Math.min(...jours);
  const fin = Math.max(...jours);
  const largeurUtile = LARGEUR - 2 * MARGE;
  const x = (jour: number) => MARGE + ((jour - debut) / Math.max(1, fin - debut + 1)) * largeurUtile;
  const hauteur = HAUTEUR_AXE + datees.length * HAUTEUR_LIGNE + HAUTEUR_ETAPES + 8;
  const yEtapes = HAUTEUR_AXE + datees.length * HAUTEUR_LIGNE + 22;
  const aujourdhuiJour = numeroJour(aujourdhui);
  const xAujourdhui = aujourdhuiJour >= debut && aujourdhuiJour <= fin ? x(aujourdhuiJour + 0.5) : null;

  const classeMarqueur = (e: Etape) =>
    e.statut === "termine"
      ? "fill-status-ok stroke-status-ok"
      : e.statut === "annule"
        ? "fill-muted stroke-muted-foreground"
        : enRetard({ statut: e.statut, echeance: e.date_prevue }, aujourdhui)
          ? "fill-status-alert stroke-status-alert"
          : e.statut === "en_cours"
            ? "fill-navy stroke-navy"
            : "fill-card stroke-navy";

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <svg
        role="img"
        aria-label={t("phases.chronologie.alt")}
        viewBox={`0 0 ${LARGEUR} ${hauteur}`}
        className="h-auto w-full min-w-[40rem] rounded-2xl bg-card shadow-card"
      >
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
              y={16}
              className="fill-muted-foreground font-mono"
              fontSize={11}
            >
              {formaterDate(iso, "MMM yy")}
            </text>
          </g>
        ))}

        {datees.map((p, i) => {
          const gauche = x(numeroJour(p.date_debut!));
          const droite = x(numeroJour(p.date_fin!) + 1);
          const y = HAUTEUR_AXE + i * HAUTEUR_LIGNE;
          return (
            <g key={p.id}>
              <text
                x={debordeADroite(gauche, p.nom) ? Math.max(MARGE, droite) : gauche}
                textAnchor={debordeADroite(gauche, p.nom) ? "end" : "start"}
                y={y + 14}
                className="fill-navy"
                fontSize={13}
                fontWeight={600}
              >
                {p.nom}
              </text>
              <rect
                x={gauche}
                y={y + 20}
                width={Math.max(4, droite - gauche)}
                height={9}
                rx={4.5}
                className="fill-navy"
                opacity={0.85}
              />
            </g>
          );
        })}

        {etapes.map((e) => {
          const cx = x(numeroJour(e.date_prevue) + 0.5);
          const classes = classeMarqueur(e);
          return e.type === "jalon" ? (
            <polygon
              key={e.id}
              points={`${cx},${yEtapes - 8} ${cx + 8},${yEtapes} ${cx},${yEtapes + 8} ${cx - 8},${yEtapes}`}
              className={classes}
              strokeWidth={2}
            >
              <title>{`${e.nom} — ${formaterDate(e.date_prevue)}`}</title>
            </polygon>
          ) : (
            <rect
              key={e.id}
              x={cx - 6.5}
              y={yEtapes - 6.5}
              width={13}
              height={13}
              rx={2}
              className={classes}
              strokeWidth={2}
            >
              <title>{`${e.nom} — ${formaterDate(e.date_prevue)}`}</title>
            </rect>
          );
        })}

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
              {t("phases.chronologie.aujourdhui")}
            </text>
          </g>
        )}
      </svg>
      {datees.length < phases.length && (
        <p className="mt-2 text-sm text-muted-foreground">{t("phases.chronologie.sans_dates")}</p>
      )}
    </div>
  );
}
