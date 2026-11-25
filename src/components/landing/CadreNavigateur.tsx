import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

/** Cadre de fenêtre de navigateur : le décor de la maquette du hero et de la démo. */
export function CadreNavigateur({
  titre,
  etiquette,
  rayon = "2rem",
  className,
  children,
}: {
  titre: string;
  /** Mention affichée à droite de la barre (« Données de démonstration »). */
  etiquette?: string;
  rayon?: "2rem" | "3rem";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden bg-card text-card-foreground shadow-[0_40px_80px_-32px_rgb(0_0_0/0.55)] ring-1 ring-black/10",
        className,
      )}
      style={{ borderRadius: rayon }}
    >
      <div className="flex items-center gap-3 border-b border-border bg-subtle px-5 py-3">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-status-alert/70" />
          <span className="size-2.5 rounded-full bg-status-warn/70" />
          <span className="size-2.5 rounded-full bg-status-ok/70" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-navy">{titre}</span>
        {etiquette && (
          <span className="shrink-0 rounded-full bg-card px-2.5 py-1 font-mono text-[0.65rem] tracking-wide text-muted-foreground uppercase">
            {etiquette}
          </span>
        )}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}
