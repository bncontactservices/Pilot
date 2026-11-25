import { AlertTriangle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { analyserErreur } from "~/lib/errors";
import { cn } from "~/lib/utils";

export function EtatErreur({
  erreur,
  onReessayer,
  className,
}: {
  erreur: unknown;
  onReessayer?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div role="alert" className={cn("flex flex-col items-start gap-4 rounded-2xl bg-card p-6 shadow-card", className)}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-status-alert/10 text-status-alert-ink">
          <AlertTriangle className="size-5" aria-hidden />
        </span>
        <div className="grid gap-1">
          <p className="font-bold text-navy">{t("etats.erreur_titre")}</p>
          <p className="text-sm text-muted-foreground">{t(analyserErreur(erreur).cle)}</p>
        </div>
      </div>
      {onReessayer && (
        <Button variante="contour" taille="sm" onClick={onReessayer}>
          <RotateCw aria-hidden />
          {t("commun.reessayer")}
        </Button>
      )}
    </div>
  );
}

export function EtatVide({
  titre,
  description,
  visuel,
  actions,
  className,
}: {
  titre: string;
  description: ReactNode;
  visuel?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-5 rounded-[1.5rem] border border-dashed border-navy/20 bg-card/60 px-6 py-12 text-center",
        className,
      )}
    >
      {visuel}
      <div className="grid max-w-md gap-2">
        <h2 className="text-xl font-bold text-navy">{titre}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

/** Jauge segmentée grise : l'état « aucune donnée », motif récurrent du produit. */
export function JaugeVide({ segments = 6, className }: { segments?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("flex w-40 gap-1", className)}>
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className="h-2.5 flex-1 rounded-full bg-[repeating-linear-gradient(135deg,var(--status-none)_0_3px,transparent_3px_6px)] opacity-80"
        />
      ))}
    </div>
  );
}
