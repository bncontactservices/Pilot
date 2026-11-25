import { cn } from "~/lib/utils";

/** Monogramme : une jauge segmentée, l'instrument de pilotage. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8 shrink-0", className)} aria-hidden focusable="false">
      <rect width="32" height="32" rx="9" fill="#0B2545" />
      <g fill="none" strokeWidth="3.2" strokeLinecap="round">
        <path d="M7 19 A9 9 0 0 1 10.46 11.91" stroke="#ffffff" strokeOpacity="0.35" />
        <path d="M11.77 11.05 A9 9 0 0 1 19.66 10.78" stroke="#ffffff" strokeOpacity="0.65" />
        <path d="M21.03 11.54 A9 9 0 0 1 25 19" stroke="#12B886" />
      </g>
      <path d="M16 19 L20.98 14.82" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="19" r="1.8" fill="#ffffff" />
    </svg>
  );
}

export function Logo({ ton = "clair", className }: { ton?: "clair" | "sombre"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span
        className={cn(
          "text-lg leading-none font-extrabold tracking-tight",
          ton === "sombre" ? "text-white" : "text-navy",
        )}
      >
        Pilot{" "}
        <span
          className={cn("font-mono text-[0.95em] font-medium", ton === "sombre" ? "text-accent" : "text-accent-ink")}
        >
          M&amp;E
        </span>
      </span>
    </span>
  );
}
