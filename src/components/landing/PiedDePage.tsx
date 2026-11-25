import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Logo } from "~/components/brand/Logo";
import { lienEmailEquipe, lienWhatsAppEquipe } from "~/lib/contact";
import { env, supabaseConfigure } from "~/lib/env";
import { cn } from "~/lib/utils";

type EtatService = "verification" | "ok" | "perturbe";

/**
 * Contrôle de santé réel du backend, lancé après le premier rendu : l'endpoint de santé d'Auth répond 200 quand le
 * service est joignable. Un délai dépassé ou une erreur donne « Service perturbé ».
 */
function useEtatService(): EtatService {
  const [etat, setEtat] = useState<EtatService>("verification");
  useEffect(() => {
    if (!supabaseConfigure) return;
    const controleur = new AbortController();
    const delai = window.setTimeout(() => controleur.abort(), 6000);
    fetch(`${env.supabaseUrl}/auth/v1/health`, { headers: { apikey: env.supabaseAnonKey! }, signal: controleur.signal })
      .then((reponse) => setEtat(reponse.ok ? "ok" : "perturbe"))
      .catch(() => setEtat("perturbe"))
      .finally(() => window.clearTimeout(delai));
    return () => {
      controleur.abort();
      window.clearTimeout(delai);
    };
  }, []);
  return etat;
}

export function PiedDePage() {
  const { t } = useTranslation();
  const etat = useEtatService();
  const whatsapp = lienWhatsAppEquipe(t("landing.contact.whatsapp_message"));
  const email = lienEmailEquipe(t("landing.contact.email_sujet"));
  const lien = "lift text-white/80 hover:text-white";

  return (
    <footer className="rounded-t-[4rem] bg-navy px-4 pt-16 pb-8 text-white sm:px-6">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="grid content-start gap-4">
          <Logo ton="sombre" />
          <p className="max-w-xs text-sm text-white/80">{t("landing.pied.texte")}</p>
          {env.editeur && (
            <p className="text-sm text-white/70">{t("landing.pied.edite_par", { editeur: env.editeur })}</p>
          )}
        </div>
        <nav aria-label={t("landing.pied.produit")} className="grid content-start gap-2.5 text-sm">
          <p className="font-bold">{t("landing.pied.produit")}</p>
          {(["probleme", "solution", "demo", "tarifs", "faq"] as const).map((ancre) => (
            <a key={ancre} href={`#${ancre}`} className={lien}>
              {t(`landing.nav.${ancre}`)}
            </a>
          ))}
          <Link to="/connexion" className={lien}>
            {t("landing.nav.connexion")}
          </Link>
          <Link to="/inscription" className={lien}>
            {t("landing.pied.creer")}
          </Link>
        </nav>
        <nav aria-label={t("landing.pied.legal")} className="grid content-start gap-2.5 text-sm">
          <p className="font-bold">{t("landing.pied.legal")}</p>
          <Link to="/mentions-legales" className={lien}>
            {t("legal.mentions")}
          </Link>
          <Link to="/confidentialite" className={lien}>
            {t("legal.confidentialite")}
          </Link>
          <Link to="/conditions-utilisation" className={lien}>
            {t("legal.conditions")}
          </Link>
          {email && (
            <a href={email} className={lien}>
              {env.contactEmail}
            </a>
          )}
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noreferrer" className={lien}>
              WhatsApp
            </a>
          )}
        </nav>
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-3 border-t border-white/15 pt-6 font-mono text-xs text-white/75 sm:flex-row sm:items-center sm:justify-between">
        <p>{t("landing.pied.droits", { annee: 2026 })}</p>
        {supabaseConfigure && (
          <p role="status" className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full",
                etat === "ok" ? "animate-pulse bg-status-ok" : etat === "perturbe" ? "bg-status-none" : "bg-white/40",
              )}
            />
            {t(`landing.pied.etat.${etat}`)}
          </p>
        )}
      </div>
    </footer>
  );
}
