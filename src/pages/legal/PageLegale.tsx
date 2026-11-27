import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Logo } from "~/components/brand/Logo";

export function PageLegale({ titre, majLe, children }: { titre: string; majLe?: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-6 sm:px-6">
        <Link to="/" className="lift rounded-lg" aria-label={t("commun.accueil_logo")}>
          <Logo />
        </Link>
      </header>
      <main id="contenu" className="mx-auto grid max-w-3xl gap-8 px-4 pb-20 sm:px-6">
        <div className="grid gap-2">
          <h1 className="text-4xl font-extrabold text-navy">{titre}</h1>
          {majLe && <p className="font-mono text-xs text-muted-foreground">{majLe}</p>}
        </div>
        <div className="grid gap-8 text-[0.975rem] leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-navy [&_li]:ml-5 [&_li]:list-disc [&_section]:grid [&_section]:gap-3">
          {children}
        </div>
      </main>
    </div>
  );
}

/** Valeur légale à compléter : visible, jamais déguisée en vraie donnée (voir PLACEHOLDERS.md). */
export function ACompleter({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-status-warn/15 px-1 text-status-warn-ink">[{children} - à compléter]</mark>;
}
