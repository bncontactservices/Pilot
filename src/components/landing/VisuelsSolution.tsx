import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

const NAVY = "#0B2545";
const EMERAUDE = "#0B7A57";

/** 1. Centraliser : la fiche d'un indicateur (nom, cible, unité, fréquence). */
export function VisuelCentraliser() {
  const { t } = useTranslation();
  const lignes = [
    ["nom", t("landing.solution.visuel.exemple_nom")],
    ["cible", t("landing.solution.visuel.exemple_cible")],
    ["unite", t("landing.solution.visuel.exemple_unite")],
    ["frequence", t("landing.solution.visuel.exemple_frequence")],
  ] as const;
  return (
    <div aria-hidden className="grid gap-2.5 rounded-3xl bg-sand p-5">
      {lignes.map(([cle, valeur]) => (
        <div key={cle} data-ligne className="grid gap-1">
          <span className="text-[0.7rem] font-semibold text-muted-foreground">
            {t(`landing.solution.visuel.${cle}`)}
          </span>
          <span className="rounded-xl border border-input bg-card px-3 py-2 text-sm font-semibold text-navy">
            {valeur}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 2. Saisir en 30 secondes : une valeur, un bouton, un minuteur qui se remplit. */
export function VisuelSaisir() {
  const { t } = useTranslation();
  return (
    <div aria-hidden className="grid gap-4 rounded-3xl bg-sand p-5">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 56 56" className="size-16 shrink-0 -rotate-90">
          <circle cx="28" cy="28" r="23" fill="none" stroke="#E4E0D7" strokeWidth="6" />
          <circle
            data-minuteur
            cx="28"
            cy="28"
            r="23"
            fill="none"
            stroke={EMERAUDE}
            strokeWidth="6"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
          />
        </svg>
        <span className="font-mono text-2xl font-semibold text-navy">{t("landing.solution.visuel.secondes")}</span>
      </div>
      <div className="grid gap-1">
        <span className="text-[0.7rem] font-semibold text-muted-foreground">{t("landing.solution.visuel.valeur")}</span>
        <span className="rounded-xl border border-input bg-card px-3 py-2 font-mono text-sm font-semibold text-navy">
          12
        </span>
      </div>
      <span className="w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
        {t("landing.solution.visuel.enregistrer")}
      </span>
      <span
        data-confirmation
        className="flex w-fit items-center gap-1.5 rounded-full bg-status-ok/10 px-3 py-1 text-xs font-semibold text-status-ok-ink"
      >
        <Check className="size-3.5" />
        {t("landing.solution.visuel.enregistre")}
      </span>
    </div>
  );
}

/** 3. Temps réel : la courbe reçoit un nouveau point, une pastille indique la mise à jour. */
export function VisuelTempsReel() {
  const { t } = useTranslation();
  const points = [
    [8, 74],
    [48, 66],
    [88, 60],
    [128, 48],
    [168, 40],
    [208, 28],
  ] as const;
  const chemin = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  return (
    <div aria-hidden className="grid gap-3 rounded-3xl bg-sand p-5">
      <span className="flex w-fit items-center gap-2 rounded-full bg-card px-3 py-1 text-xs font-semibold text-navy">
        <span data-pouls className="size-2 rounded-full bg-status-ok" />
        {t("landing.solution.visuel.mis_a_jour")}
      </span>
      <svg viewBox="0 0 224 92" className="h-auto w-full">
        <line x1="8" x2="216" y1="20" y2="20" stroke="#0B7A57" strokeWidth="1.8" strokeDasharray="6 4" />
        <line x1="8" x2="216" y1="84" y2="84" stroke="#E4E0D7" />
        <path
          d={chemin}
          data-trace2
          fill="none"
          stroke={NAVY}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
        />
        {points.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i === points.length - 1 ? 5 : 3}
            fill={NAVY}
            data-dernier={i === points.length - 1 ? "" : undefined}
          />
        ))}
      </svg>
    </div>
  );
}

/** 4. Rapports : une page de rapport avec son graphique, et le bouton PDF. */
export function VisuelRapport() {
  const { t } = useTranslation();
  return (
    <div aria-hidden className="relative grid place-items-center rounded-3xl bg-sand p-5">
      <div data-page className="w-full max-w-[15rem] rotate-[-2deg] rounded-xl bg-card p-4 shadow-card-hover">
        <p className="text-[0.7rem] font-bold text-navy">{t("landing.solution.visuel.rapport")}</p>
        <p className="font-mono text-[0.6rem] text-muted-foreground">{t("landing.solution.visuel.periode")}</p>
        <div className="mt-3 flex h-16 items-end gap-1.5">
          {[28, 40, 34, 52, 60, 64].map((h, i) => (
            <span key={i} className="flex-1 rounded-t bg-navy/80" style={{ height: `${h}px` }} />
          ))}
        </div>
        <div className="mt-3 grid gap-1.5">
          <span className="h-1.5 w-full rounded bg-border" />
          <span className="h-1.5 w-4/5 rounded bg-border" />
        </div>
      </div>
      <span
        data-bouton-pdf
        className="absolute right-6 bottom-4 rounded-xl bg-accent px-3.5 py-2 font-mono text-xs font-semibold text-accent-foreground shadow-card-hover"
      >
        {t("landing.solution.visuel.pdf")}
      </span>
    </div>
  );
}
