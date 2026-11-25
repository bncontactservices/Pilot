import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Logo } from "~/components/brand/Logo";
import { Magnetique } from "~/components/landing/Magnetique";
import { Button } from "~/components/ui/button";
import { evenement } from "~/lib/analytics";
import { cn } from "~/lib/utils";

const ANCRES = ["probleme", "solution", "demo", "tarifs", "faq"] as const;

/**
 * Pilule flottante : transparente sur le hero, puis translucide avec flou et bordure dès que la page défile
 * (IntersectionObserver sur un repère placé tout en haut de la page). Sur mobile, menu repliable au clavier.
 */
export function Navbar() {
  const { t } = useTranslation();
  const [defile, setDefile] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const repere = document.getElementById("debut");
    if (!repere || !("IntersectionObserver" in window)) return;
    const observateur = new IntersectionObserver(([entree]) => setDefile(!entree!.isIntersecting));
    observateur.observe(repere);
    return () => observateur.disconnect();
  }, []);

  useEffect(() => {
    if (!ouvert) return;
    const fermerAvecEchap = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOuvert(false);
        bouton.current?.focus();
      }
    };
    document.addEventListener("keydown", fermerAvecEchap);
    return () => document.removeEventListener("keydown", fermerAvecEchap);
  }, [ouvert]);

  const sombre = !defile && !ouvert;
  const lien = cn(
    "lift rounded-full px-3 py-2 text-sm font-semibold transition-colors",
    sombre ? "text-white/85 hover:text-white" : "text-navy/80 hover:text-navy",
  );

  return (
    <header className="fixed inset-x-0 top-3 z-50 flex justify-center px-3 sm:top-4">
      <div className="relative w-full max-w-5xl">
        <nav
          aria-label={t("landing.nav.label")}
          className={cn(
            "flex items-center justify-between gap-2 rounded-full border px-3 py-2 transition-[background-color,border-color,backdrop-filter,box-shadow] duration-300 sm:px-4",
            sombre ? "border-transparent bg-transparent" : "border-border bg-sand/70 shadow-card backdrop-blur-xl",
          )}
        >
          <a href="#debut" aria-label={t("landing.nav.accueil")} className="lift rounded-full px-1">
            <Logo ton={sombre ? "sombre" : "clair"} />
          </a>
          <ul className="hidden items-center gap-1 lg:flex">
            {ANCRES.map((ancre) => (
              <li key={ancre}>
                <a href={`#${ancre}`} className={lien}>
                  {t(`landing.nav.${ancre}`)}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-1.5">
            <Button
              asChild
              variante="fantome"
              taille="sm"
              className={cn("hidden sm:inline-flex", sombre ? "text-white hover:bg-white/10" : "text-navy")}
            >
              <Link to="/connexion">{t("landing.nav.connexion")}</Link>
            </Button>
            <Magnetique>
              <Button asChild variante="accent" taille="sm">
                <a href="#contact" onClick={() => evenement("Demo CTA Click", { emplacement: "navbar" })}>
                  {t("landing.nav.demander_demo")}
                </a>
              </Button>
            </Magnetique>
            <Button
              ref={bouton}
              variante="fantome"
              taille="icone"
              className={cn("size-9 lg:hidden", sombre ? "text-white hover:bg-white/10" : "text-navy")}
              aria-expanded={ouvert}
              aria-controls="menu-mobile"
              aria-label={ouvert ? t("landing.nav.fermer") : t("landing.nav.ouvrir")}
              onClick={() => setOuvert((o) => !o)}
            >
              {ouvert ? <X aria-hidden /> : <Menu aria-hidden />}
            </Button>
          </div>
        </nav>
        {ouvert && (
          <div
            id="menu-mobile"
            className="absolute top-full right-0 left-0 mt-2 rounded-[2rem] border border-border bg-card p-3 shadow-card-hover lg:hidden"
          >
            <ul className="grid gap-1">
              {ANCRES.map((ancre) => (
                <li key={ancre}>
                  <a
                    href={`#${ancre}`}
                    onClick={() => setOuvert(false)}
                    className="block rounded-2xl px-4 py-3 text-base font-semibold text-navy hover:bg-subtle"
                  >
                    {t(`landing.nav.${ancre}`)}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  to="/connexion"
                  className="block rounded-2xl px-4 py-3 text-base font-semibold text-navy hover:bg-subtle"
                >
                  {t("landing.nav.connexion")}
                </Link>
              </li>
            </ul>
          </div>
        )}
      </div>
    </header>
  );
}
