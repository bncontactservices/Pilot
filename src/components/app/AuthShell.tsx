import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Logo } from "~/components/brand/Logo";
import { Bandeau } from "~/components/ui/banner";
import { supabaseConfigure } from "~/lib/env";

/** Écran partagé des pages d'authentification : formulaire à gauche, marque à droite. */
export function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-10 lg:px-16">
        <header>
          <Link to="/" className="lift inline-flex rounded-lg" aria-label={t("commun.accueil_logo")}>
            <Logo />
          </Link>
        </header>
        <main id="contenu" className="flex flex-1 items-center py-10">
          <div className="mx-auto w-full max-w-md">
            {!supabaseConfigure && (
              <Bandeau variante="vigilance" className="mb-6">
                {t("auth.non_configure")}
              </Bandeau>
            )}
            {children}
          </div>
        </main>
        <footer className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <Link to="/confidentialite" className="lift hover:text-foreground">
            {t("legal.confidentialite")}
          </Link>
          <Link to="/conditions-utilisation" className="lift hover:text-foreground">
            {t("legal.conditions")}
          </Link>
          <Link to="/mentions-legales" className="lift hover:text-foreground">
            {t("legal.mentions")}
          </Link>
        </footer>
      </div>
      <PanneauMarque />
    </div>
  );
}

function PanneauMarque() {
  const { t } = useTranslation();
  return (
    <aside className="relative hidden overflow-hidden bg-navy text-white lg:flex lg:flex-col lg:justify-between lg:p-14 xl:p-20">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -bottom-40 size-[36rem] rounded-full bg-[radial-gradient(closest-side,rgb(18_184_134/0.22),transparent)]"
      />
      <p className="font-mono text-xs tracking-[0.18em] text-white/70 uppercase">{t("auth.marque.surtitre")}</p>
      <div className="relative grid gap-10">
        <h2 className="max-w-lg text-4xl leading-[1.08] font-extrabold xl:text-5xl">
          {t("auth.marque.titre_debut")}{" "}
          <em className="font-serif text-[1.15em] font-semibold text-accent italic">{t("auth.marque.titre_mot")}</em>
          {t("auth.marque.titre_fin")}
        </h2>
        <JaugeMarque />
      </div>
      <p className="relative mx-auto max-w-sm text-center text-sm text-pretty text-white/75">
        {t("auth.marque.citation")}
      </p>
    </aside>
  );
}

/** Une jauge segmentée par indicateur : où nous en sommes, l'écart, quoi faire. */
function JaugeMarque() {
  const { t } = useTranslation();
  const lignes = [
    { cle: "position", segments: 5, pleins: 5 },
    { cle: "ecart", segments: 5, pleins: 3 },
    { cle: "action", segments: 5, pleins: 1 },
  ] as const;
  return (
    <ul className="grid max-w-md gap-4">
      {lignes.map((ligne, index) => (
        <li key={ligne.cle} className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
          <span className="font-mono text-xs text-white/60">0{index + 1}</span>
          <span className="text-sm font-semibold">{t(`auth.marque.${ligne.cle}`)}</span>
          <span />
          <span aria-hidden className="flex gap-1">
            {Array.from({ length: ligne.segments }, (_, i) => (
              <span
                key={i}
                className={
                  i < ligne.pleins ? "h-1.5 flex-1 rounded-full bg-accent" : "h-1.5 flex-1 rounded-full bg-white/15"
                }
              />
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
