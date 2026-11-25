import { useTranslation } from "react-i18next";
import { BadgeStatutTravail } from "~/components/app/BadgeStatutTravail";
import { enRetard } from "~/lib/avancement";
import type { ActivitePta } from "~/lib/donnees-se";
import { formaterDate } from "~/lib/format";
import { moisFiscaux, periodeActivite, positionDansAnnee, positionDuJour } from "~/lib/pta";
import { cn } from "~/lib/utils";

const CLASSES_BARRE = {
  a_faire: "border border-dashed border-navy/50 bg-navy/10",
  en_cours: "bg-navy/25",
  termine: "bg-status-ok",
  reporte: "border border-status-warn bg-status-warn/30",
  annule: "bg-muted",
} as const;

/**
 * Calendrier annuel : une ligne par activité, une barre sur les douze mois de l'année fiscale, la date du jour
 * en pointillés. La barre est une aide visuelle : période, statut et avancement sont écrits dans la colonne de
 * gauche, que lisent aussi les lecteurs d'écran. Sur petit écran, le calendrier défile horizontalement.
 */
export function CalendrierPta({
  activites,
  annee,
  moisDebut,
  aujourdhui,
  onOuvrir,
}: {
  activites: ActivitePta[];
  annee: number;
  moisDebut: number;
  aujourdhui: string;
  /** Ouvre l'édition d'une activité (éditeurs) ; absent en lecture seule. */
  onOuvrir?: (activite: ActivitePta) => void;
}) {
  const { t } = useTranslation();
  const mois = moisFiscaux(annee, moisDebut);
  const xAujourdhui = positionDuJour(aujourdhui, annee, moisDebut);

  const lignes = activites
    .map((a) => ({ activite: a, periode: periodeActivite(a, moisDebut) }))
    .sort((a, b) =>
      a.periode.debut < b.periode.debut
        ? -1
        : a.periode.debut > b.periode.debut
          ? 1
          : a.activite.intitule.localeCompare(b.activite.intitule, "fr"),
    );

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div
        className="min-w-[56rem] overflow-hidden rounded-2xl bg-card shadow-card"
        role="group"
        aria-label={t("pta.calendrier.alt")}
      >
        <div className="grid grid-cols-[16rem_minmax(0,1fr)] border-b border-border bg-subtle text-xs font-semibold text-navy">
          <div className="px-4 py-3 uppercase">{t("pta.colonnes.activite")}</div>
          <div className="grid grid-cols-12" aria-hidden>
            {mois.map((m) => (
              <div
                key={m.debut}
                className="border-s border-border px-1 py-3 text-center font-mono font-medium capitalize"
              >
                {formaterDate(m.debut, "MMM")}
              </div>
            ))}
          </div>
        </div>
        <ul>
          {lignes.map(({ activite, periode }) => {
            const position = positionDansAnnee(periode, annee, moisDebut);
            const retard = enRetard({ statut: activite.statut, echeance: periode.fin }, aujourdhui);
            const resume = `${t("pta.colonnes.periode")} : ${formaterDate(periode.debut)} – ${formaterDate(periode.fin)}`;
            return (
              <li
                key={activite.id}
                className="grid grid-cols-[16rem_minmax(0,1fr)] border-b border-border last:border-b-0"
              >
                <div className="grid min-w-0 content-center gap-1 px-4 py-3">
                  {onOuvrir ? (
                    <button
                      type="button"
                      onClick={() => onOuvrir(activite)}
                      className="rounded-md text-left text-sm font-semibold text-navy hover:underline"
                    >
                      {activite.intitule}
                    </button>
                  ) : (
                    <span className="text-sm font-semibold text-navy">{activite.intitule}</span>
                  )}
                  <span className="font-mono text-xs text-muted-foreground tabular">{resume}</span>
                  <BadgeStatutTravail statut={activite.statut} enRetard={retard} />
                  <span className="text-xs text-muted-foreground">
                    {activite.responsable ?? t("pta.sans_responsable")} · {Math.round(activite.pct_realisation)} %
                  </span>
                </div>
                <div className="relative" aria-hidden>
                  <div className="absolute inset-0 grid grid-cols-12">
                    {mois.map((m) => (
                      <div key={m.debut} className="border-s border-border/70" />
                    ))}
                  </div>
                  {xAujourdhui !== null && (
                    <div
                      className="absolute inset-y-0 w-px border-s border-dashed border-accent-ink"
                      style={{ left: `${xAujourdhui * 100}%` }}
                    />
                  )}
                  {position && (
                    <div
                      className={cn(
                        "absolute top-1/2 h-6 -translate-y-1/2 overflow-hidden rounded-full",
                        CLASSES_BARRE[activite.statut],
                      )}
                      style={{ left: `${position.gauche * 100}%`, width: `${Math.max(position.largeur * 100, 1.2)}%` }}
                      title={`${activite.intitule} — ${resume}`}
                    >
                      {activite.statut === "en_cours" && (
                        <div
                          className="h-full bg-navy"
                          style={{ width: `${Math.min(100, activite.pct_realisation)}%` }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {xAujourdhui !== null && (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-3 w-px border-s border-dashed border-accent-ink" aria-hidden />
          {t("pta.calendrier.aujourdhui")}
        </p>
      )}
    </div>
  );
}
