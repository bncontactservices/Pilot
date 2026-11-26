import type { ReactNode } from "react";
import { Logo } from "~/components/brand/Logo";
import { cn } from "~/lib/utils";

export const NOMBRE_DIAPOS = 10;

/**
 * Cadre commun d'une diapositive : 80 × 45 rem, soit 1280 × 720 px à la taille de référence (16:9). L'unité rem est
 * mise à l'échelle par la page (voir Deck.tsx) : toute la mise en page se règle en rem et suit l'écran ou la page imprimée.
 */
export function Diapo({
  n,
  etiquette,
  sombre = false,
  actif,
  titre,
  children,
}: {
  n: number;
  etiquette: string;
  sombre?: boolean;
  actif: boolean;
  /** Titre lu par les lecteurs d'écran quand la diapositive devient active. */
  titre: string;
  children: ReactNode;
}) {
  return (
    <section
      data-diapo={n}
      aria-roledescription="diapositive"
      aria-label={`${n} sur ${NOMBRE_DIAPOS} : ${titre}`}
      aria-hidden={!actif}
      className={cn(
        // Une seule diapositive à l'écran ; toutes à l'impression, une par page.
        actif ? "flex" : "hidden print:flex",
        "relative h-[45rem] w-[80rem] shrink-0 flex-col overflow-hidden px-[4.5rem] pt-[3.5rem] pb-[3rem] print:break-after-page [print-color-adjust:exact] [-webkit-print-color-adjust:exact] last:print:break-after-auto",
        sombre ? "fond-hero text-white" : "bg-sand text-foreground",
      )}
    >
      <header className="flex items-center justify-between">
        <p
          className={cn(
            "font-mono text-[0.8rem] tracking-[0.2em] uppercase",
            sombre ? "text-accent" : "text-accent-ink",
          )}
        >
          {String(n).padStart(2, "0")} - {etiquette}
        </p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col pt-[1.4rem]">{children}</div>
      <footer
        className={cn(
          "flex items-center justify-between pt-[1rem] text-[0.8rem]",
          sombre ? "text-white/70" : "text-muted-foreground",
        )}
      >
        <Logo ton={sombre ? "sombre" : "clair"} className="origin-left scale-[0.8]" />
        <span className="font-mono">
          {n} / {NOMBRE_DIAPOS}
        </span>
      </footer>
    </section>
  );
}

/** Mention « à valider » : toute hypothèse ou donnée non établie est marquée comme telle dans le deck (brief, règle d'or 2). */
export function AValider({
  className,
  children = "à valider",
  surSombre = false,
}: {
  className?: string;
  children?: ReactNode;
  surSombre?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-dashed px-[0.6rem] py-[0.1rem] font-mono text-[0.7rem] font-semibold whitespace-nowrap uppercase",
        surSombre
          ? "border-[#ffa45c] bg-white/10 text-[#ffc59e]"
          : "border-status-warn bg-status-warn/10 text-status-warn-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Emplacement à compléter : visible, jamais déguisé en vraie donnée (voir PLACEHOLDERS.md). */
export function ACompleterDeck({
  children,
  className,
  surSombre = false,
}: {
  children: ReactNode;
  className?: string;
  surSombre?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-md border border-dashed px-[0.5rem] py-[0.15rem]",
        surSombre
          ? "border-[#ffa45c] bg-white/10 text-[#ffc59e]"
          : "border-status-warn bg-status-warn/10 text-status-warn-ink",
        className,
      )}
    >
      [{children} - à compléter]
    </span>
  );
}
