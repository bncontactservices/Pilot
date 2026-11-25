import { Link } from "react-router";
import { Logo } from "~/components/brand/Logo";
import { Button } from "~/components/ui/button";
import i18n from "~/i18n";

/** Page d'erreur autonome (utilisable hors de tout contexte React Query ou Auth). */
export function PageErreur({ introuvable }: { introuvable: boolean }) {
  const t = i18n.t.bind(i18n);
  return (
    <main id="contenu" className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="grid max-w-lg gap-6">
        <Link to="/" className="lift w-fit rounded-lg" aria-label={t("commun.accueil_logo")}>
          <Logo />
        </Link>
        <p className="font-mono text-sm text-muted-foreground">{introuvable ? "404" : t("etats.erreur_code")}</p>
        <h1 className="text-4xl font-extrabold text-navy">
          {introuvable ? t("etats.introuvable_titre") : t("etats.erreur_page_titre")}
        </h1>
        <p className="text-muted-foreground">
          {introuvable ? t("etats.introuvable_texte") : t("etats.erreur_page_texte")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/">{t("commun.accueil")}</Link>
          </Button>
          <Button asChild variante="contour">
            <Link to="/app">{t("etats.vers_app")}</Link>
          </Button>
          {!introuvable && (
            <Button variante="fantome" onClick={() => window.location.reload()}>
              {t("commun.reessayer")}
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
