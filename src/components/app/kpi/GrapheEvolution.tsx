// Chargé à la demande (React.lazy) : Recharts ne pèse pas sur le premier affichage de l'application.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ticksMois } from "~/lib/chart-geometry";
import type { Kpi } from "~/lib/donnees";
import { formaterDate, formaterNombre, formaterValeur } from "~/lib/format";
import { isoDepuisJour, type Periode, type PointSerie, numeroJour, valeurAttendue } from "~/lib/kpi";

// Les attributs SVG ne résolvent pas var(--…) : couleurs du preset A en clair.
const COULEUR_COURBE = "#0B2545";
const COULEUR_CIBLE = "#0B7A57";
const COULEUR_TRAJECTOIRE = "#8A929B";

type Ligne = { x: number; date: string; valeur?: number; trajectoire: number; commentaire?: string | null };

export default function GrapheEvolution({
  kpi,
  serie,
  projet,
  periode,
}: {
  kpi: Kpi;
  serie: PointSerie[];
  projet: { date_debut: string; date_fin: string };
  periode: Periode;
}) {
  const { t } = useTranslation();

  const { lignes, domaineX, domaineY } = useMemo(() => {
    const debutProjet = numeroJour(projet.date_debut);
    const finProjet = numeroJour(projet.date_fin);
    const debut = numeroJour(periode.debut ?? projet.date_debut);
    const fin = periode.debut ? numeroJour(periode.fin) : finProjet;
    const trajectoire = (x: number) =>
      valeurAttendue(
        kpi,
        finProjet > debutProjet ? Math.min(1, Math.max(0, (x - debutProjet) / (finProjet - debutProjet))) : 0,
      );

    const lignes: Ligne[] = serie
      .map((p) => ({
        x: numeroJour(p.date),
        date: p.date,
        valeur: p.valeur,
        trajectoire: trajectoire(numeroJour(p.date)),
        commentaire: p.commentaire,
      }))
      .filter((l) => l.x >= debut && l.x <= fin);
    // Extrémités du domaine : la trajectoire se lit jusqu'au bout, même sans saisie.
    for (const x of [debut, fin]) lignes.push({ x, date: isoDepuisJour(x), trajectoire: trajectoire(x) });
    lignes.sort((a, b) => a.x - b.x);

    const ordonnees = [
      kpi.cible,
      kpi.valeur_base,
      ...lignes.flatMap((l) => (l.valeur === undefined ? [l.trajectoire] : [l.valeur, l.trajectoire])),
    ];
    const min = Math.min(...ordonnees);
    const max = Math.max(...ordonnees);
    const marge = (max - min || Math.abs(max) || 1) * 0.08;
    return {
      lignes,
      domaineX: [debut, fin] as [number, number],
      domaineY: [min - marge, max + marge] as [number, number],
    };
  }, [kpi, serie, projet, periode]);

  const nbSaisies = serie.length;
  return (
    <div
      role="img"
      aria-label={t("dashboard.graphe_alt", {
        nom: kpi.nom,
        count: nbSaisies,
        cible: formaterValeur(kpi.cible, kpi.unite),
      })}
      className="h-72 w-full sm:h-80"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={lignes} margin={{ top: 12, right: 24, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#E4E0D7" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            domain={domaineX}
            ticks={ticksMois(domaineX[0], domaineX[1])}
            tickFormatter={(x: number) => formaterDate(isoDepuisJour(x), "MMM yy")}
            tick={{ fontSize: 12, fill: "#55606B" }}
            tickMargin={8}
          />
          <YAxis
            domain={domaineY}
            tickFormatter={(v: number) => formaterNombre(Math.round(v * 100) / 100)}
            tick={{ fontSize: 12, fill: "#55606B", fontFamily: "IBM Plex Mono" }}
            width={56}
          />
          <Tooltip
            cursor={{ stroke: "#8A929B", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const ligne = payload?.[0]?.payload as Ligne | undefined;
              if (!active || !ligne || ligne.valeur === undefined) return null;
              const ecart = ligne.valeur - ligne.trajectoire;
              return (
                <div className="max-w-64 rounded-xl border border-border bg-card px-3 py-2.5 text-sm shadow-card-hover">
                  <p className="font-semibold text-navy">{formaterDate(ligne.date, "d MMMM yyyy")}</p>
                  <p className="font-mono text-foreground">{formaterValeur(ligne.valeur, kpi.unite)}</p>
                  <p className="text-muted-foreground">
                    {t("dashboard.infobulle_attendu", {
                      attendue: formaterValeur(ligne.trajectoire, kpi.unite),
                      ecart: `${ecart > 0 ? "+" : ecart < 0 ? "−" : ""}${formaterNombre(Math.abs(ecart))}`,
                    })}
                  </p>
                  {ligne.commentaire && (
                    <p className="mt-1 border-t border-border pt-1 text-foreground">{ligne.commentaire}</p>
                  )}
                </div>
              );
            }}
          />
          <ReferenceLine
            y={kpi.cible}
            stroke={COULEUR_CIBLE}
            strokeDasharray="6 4"
            strokeWidth={2}
            label={{
              value: t("dashboard.cible_etiquette"),
              position: "insideTopRight",
              fill: COULEUR_CIBLE,
              fontSize: 12,
            }}
          />
          <Line
            dataKey="trajectoire"
            stroke={COULEUR_TRAJECTOIRE}
            strokeWidth={1.5}
            strokeDasharray="2 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="valeur"
            stroke={COULEUR_COURBE}
            strokeWidth={3}
            dot={{ r: 3, fill: COULEUR_COURBE, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls
            animationDuration={400}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
