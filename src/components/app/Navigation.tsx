import { ChevronsUpDown, FolderKanban, Handshake, Layers, LogOut, MapPin, Settings, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation } from "react-router";
import { Logo } from "~/components/brand/Logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useOrg } from "~/hooks/useContexteOrg";
import { useAuth } from "~/lib/auth";
import { initiales } from "~/lib/format";
import { cn } from "~/lib/utils";

const LIENS = [
  { vers: "/app", cle: "nav.projets", icone: FolderKanban, fin: true },
  { vers: "/app/programmes", cle: "nav.programmes", icone: Layers, fin: false },
  { vers: "/app/acteurs", cle: "nav.acteurs", icone: Handshake, fin: false },
  { vers: "/app/localites", cle: "nav.localites", icone: MapPin, fin: false },
  { vers: "/app/equipe", cle: "nav.equipe", icone: Users, fin: false },
  { vers: "/app/parametres", cle: "nav.parametres", icone: Settings, fin: false },
] as const;

export function Navigation({ onNaviguer }: { onNaviguer?: () => void }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // « Projets » reste actif dans le détail d'un projet.
  const estActif = (vers: string, actifParDefaut: boolean) =>
    vers === "/app" ? pathname === "/app" || pathname.startsWith("/app/projets") : actifParDefaut;
  return (
    <div className="flex h-full flex-col gap-8 px-4 py-6">
      <Link to="/app" onClick={onNaviguer} className="px-2" aria-label={t("nav.accueil_app")}>
        <Logo ton="sombre" />
      </Link>
      <nav aria-label={t("nav.principale")} className="grid gap-1">
        {LIENS.map(({ vers, cle, icone: Icone, fin }) => (
          <NavLink
            key={vers}
            to={vers}
            end={fin}
            onClick={onNaviguer}
            className={({ isActive }) =>
              cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors duration-200",
                estActif(vers, isActive) ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
              )
            }
          >
            {({ isActive }) => (
              <>
                {estActif(vers, isActive) && (
                  <span aria-hidden className="absolute top-2 bottom-2 left-0 w-1 rounded-full bg-accent" />
                )}
                <Icone className="size-[1.125rem]" aria-hidden />
                {t(cle)}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto grid gap-3">
        <CarteOrganisation />
        <MenuUtilisateur />
      </div>
    </div>
  );
}

function CarteOrganisation() {
  const { t } = useTranslation();
  const org = useOrg();
  const jours = org.joursEssaiRestants;
  return (
    <div className="rounded-2xl bg-white/5 px-3 py-3">
      <p className="truncate text-sm font-bold text-white">{org.organisation.nom}</p>
      <p className="mt-0.5 font-mono text-xs text-white/70">
        {t(`plans.${org.organisation.plan}`)}
        {org.enEssai && jours !== null && (
          <> · {org.peutEcrire ? t("essai.jours_court", { count: Math.max(jours, 0) }) : t("essai.termine_court")}</>
        )}
      </p>
    </div>
  );
}

function MenuUtilisateur() {
  const { t } = useTranslation();
  const { seDeconnecter } = useAuth();
  const org = useOrg();
  const nom = org.profil.nom || org.profil.email || "";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5 focus-visible:outline-accent">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent font-mono text-xs font-semibold text-navy">
          {initiales(org.profil.nom, org.profil.email)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{nom}</span>
          <span className="block truncate text-xs text-white/70">{t(`roles.${org.role}`)}</span>
        </span>
        <ChevronsUpDown className="size-4 text-white/60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuLabel>
          <span className="block truncate font-semibold">{nom}</span>
          <span className="block truncate text-xs text-muted-foreground">{org.profil.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/app/parametres">
            <Settings aria-hidden />
            {t("nav.parametres")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void seDeconnecter()}>
          <LogOut aria-hidden />
          {t("auth.deconnexion")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
