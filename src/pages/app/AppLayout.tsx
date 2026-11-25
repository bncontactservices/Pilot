import { LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet, useLocation } from "react-router";
import { BandeauEssai } from "~/components/app/BandeauEssai";
import { EtatErreur } from "~/components/app/Etats";
import { LimitePlanProvider } from "~/components/app/LimitePlan";
import { Navigation } from "~/components/app/Navigation";
import { Logo } from "~/components/brand/Logo";
import { Button } from "~/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "~/components/ui/sheet";
import { Skeleton } from "~/components/ui/skeleton";
import { ContexteOrgProvider, useRequeteContexteOrg } from "~/hooks/useContexteOrg";
import { useNettoyageFichiers } from "~/hooks/useNettoyageFichiers";
import { useAuth } from "~/lib/auth";

export default function AppLayout() {
  const { statut } = useAuth();
  const location = useLocation();
  if (statut === "non_configure") return <Navigate to="/connexion" replace />;
  if (statut === "anonyme") {
    return <Navigate to={`/connexion?suite=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (statut === "chargement") return <SqueletteApp />;
  return <AppAvecOrganisation />;
}

function AppAvecOrganisation() {
  const requete = useRequeteContexteOrg();
  if (requete.isPending) return <SqueletteApp />;
  if (requete.isError) {
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <EtatErreur erreur={requete.error} onReessayer={() => void requete.refetch()} className="max-w-md" />
      </div>
    );
  }
  if (!requete.data) return <SansOrganisation />;
  return (
    <ContexteOrgProvider valeur={requete.data}>
      <LimitePlanProvider>
        <Coquille />
      </LimitePlanProvider>
    </ContexteOrgProvider>
  );
}

function Coquille() {
  const { t } = useTranslation();
  const [menuOuvert, setMenuOuvert] = useState(false);
  useNettoyageFichiers();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <a
        href="#contenu"
        className="sr-only z-50 rounded-xl bg-card px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("nav.aller_contenu")}
      </a>
      <aside className="sticky top-0 hidden h-dvh bg-navy lg:block">
        <Navigation />
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between bg-navy px-4 text-white lg:hidden">
          <Logo ton="sombre" />
          <Sheet open={menuOuvert} onOpenChange={setMenuOuvert}>
            <SheetTrigger asChild>
              <Button
                variante="fantome"
                taille="icone"
                className="text-white hover:bg-white/10"
                aria-label={t("nav.ouvrir_menu")}
              >
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetTitle className="sr-only">{t("nav.principale")}</SheetTitle>
              <SheetDescription className="sr-only">{t("nav.description_menu")}</SheetDescription>
              <Navigation onNaviguer={() => setMenuOuvert(false)} />
            </SheetContent>
          </Sheet>
        </header>
        <main
          id="contenu"
          className="mx-auto grid w-full max-w-6xl content-start gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-10"
        >
          <BandeauEssai />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SqueletteApp() {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]" aria-busy>
      <div className="hidden bg-navy lg:block" />
      <div className="h-14 bg-navy lg:hidden" />
      <div className="mx-auto grid w-full max-w-6xl content-start gap-6 px-4 py-10 sm:px-6 lg:px-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96 max-w-full" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    </div>
  );
}

function SansOrganisation() {
  const { t } = useTranslation();
  const { seDeconnecter } = useAuth();
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="grid max-w-md gap-5 rounded-[1.5rem] bg-card p-8 shadow-card">
        <Logo />
        <h1 className="text-2xl font-extrabold text-navy">{t("app.sans_organisation.titre")}</h1>
        <p className="text-muted-foreground">{t("app.sans_organisation.texte")}</p>
        <Button variante="contour" className="w-fit" onClick={() => void seDeconnecter()}>
          <LogOut aria-hidden />
          {t("auth.deconnexion")}
        </Button>
      </div>
    </div>
  );
}
