import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FlaskConical, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, matchPath, NavLink, Outlet, useLocation, useOutletContext, useParams } from "react-router";
import { toast } from "sonner";
import { EtatErreur, EtatVide } from "~/components/app/Etats";
import { JaugeSegmentee } from "~/components/app/kpi/JaugeSegmentee";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { EtiquettesProjet } from "~/components/app/suivi/EtiquettesProjet";
import { STATUTS_PROJET, StatutProjet } from "~/components/app/StatutProjet";
import { TauxAvancement } from "~/components/app/TauxAvancement";
import { Badge } from "~/components/ui/badge";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import { NativeSelect } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { useOrg } from "~/hooks/useContexteOrg";
import {
  cles,
  type Kpi,
  type Projet,
  type SaisieLigne,
  useAvancements,
  useKpis,
  useProgrammes,
  useProjet,
  useSaisies,
  useSaisiesTempsReel,
  useSeuils,
} from "~/lib/donnees";
import { formaterMontant, formaterPeriode } from "~/lib/format";
import { aujourdhuiIso, evaluerProjet } from "~/lib/kpi";
import { getSupabase } from "~/lib/supabase";
import { cn } from "~/lib/utils";

export type ContexteProjet = { projet: Projet; kpis: Kpi[]; saisies: SaisieLigne[] };

/** Données du projet courant, partagées par ses onglets. */
export function useContexteProjet(): ContexteProjet {
  return useOutletContext<ContexteProjet>();
}

export default function ProjetLayout() {
  const { projetId = "" } = useParams();
  const { t } = useTranslation();
  const org = useOrg();
  const projet = useProjet(projetId);
  const kpis = useKpis(projetId);
  const saisies = useSaisies(projetId);
  useSaisiesTempsReel(org.organisation.id);

  const requetes = [projet, kpis, saisies];
  const erreur = requetes.find((r) => r.isError)?.error;
  if (erreur) {
    return <EtatErreur erreur={erreur} onReessayer={() => requetes.forEach((r) => void r.refetch())} />;
  }
  if (requetes.some((r) => r.isPending)) return <SqueletteProjet />;
  if (!projet.data) {
    return (
      <EtatVide
        titre={t("projet.introuvable_titre")}
        description={t("projet.introuvable_texte")}
        actions={
          <Button asChild>
            <Link to="/app">{t("projet.retour")}</Link>
          </Button>
        }
      />
    );
  }

  return <ProjetCharge projet={projet.data} kpis={kpis.data!} saisies={saisies.data!} />;
}

function ProjetCharge({ projet, kpis, saisies }: ContexteProjet) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const aujourdhui = aujourdhuiIso();
  const seuils = useSeuils(org.organisation.id);
  const programmes = useProgrammes(org.organisation.id);
  const avancements = useAvancements(org.organisation.id);

  const global = useMemo(
    () => evaluerProjet(kpis, saisies, { projet, periode: { debut: null, fin: aujourdhui }, aujourdhui, seuils }),
    [kpis, saisies, projet, aujourdhui, seuils],
  );

  const changerStatut = useMutation({
    mutationFn: async (statut: Projet["statut"]) => {
      const { error } = await getSupabase().from("projects").update({ statut }).eq("id", projet.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("projet.statut_modifie"));
      void queryClient.invalidateQueries({ queryKey: cles.projet(projet.id) });
      void queryClient.invalidateQueries({ queryKey: cles.projets(org.organisation.id) });
    },
    onError: gererErreur,
  });

  const changerProgramme = useMutation({
    mutationFn: async (programmeId: string) => {
      const { error } = await getSupabase()
        .from("projects")
        .update({ programme_id: programmeId || null })
        .eq("id", projet.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("programmes.modifie_projet"));
      void queryClient.invalidateQueries({ queryKey: cles.projet(projet.id) });
      void queryClient.invalidateQueries({ queryKey: cles.projets(org.organisation.id) });
      void queryClient.invalidateQueries({ queryKey: cles.avancements(org.organisation.id) });
      void queryClient.invalidateQueries({ queryKey: cles.avancementsProgrammes(org.organisation.id) });
      void queryClient.invalidateQueries({ queryKey: ["projets", org.organisation.id, "programme"] });
    },
    onError: gererErreur,
  });

  const modifiable = org.peutEditer && !projet.is_demo;
  const avancement = avancements.data?.get(projet.id);
  const programme = programmes.data?.find((p) => p.id === projet.programme_id);
  const suggererRetard = modifiable && projet.statut === "en_cours" && global.statut === "alert";
  // Sur téléphone, la barre d'onglets défile : l'onglet actif doit rester visible.
  const barreOnglets = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    barreOnglets.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  // Dix-sept pages : trop pour une seule barre. Trois rubriques (une barre), puis les pages de la rubrique ouverte (l'autre).
  const racine = `/app/projets/${projet.id}`;
  const page = (chemin: string, cle: string) => ({
    vers: chemin ? `${racine}/${chemin}` : racine,
    libelle: t(`projet.onglets.${cle}`),
    fin: chemin === "",
  });
  const rubriques = [
    {
      cle: "pilotage",
      pages: [
        page("", "dashboard"),
        page("indicateurs", "indicateurs"),
        page("saisie", "saisie"),
        page("import", "import"),
        page("rapports", "rapports"),
      ],
    },
    {
      cle: "planification",
      pages: [
        page("cadre-logique", "cadre"),
        page("composantes", "composantes"),
        page("plan-de-travail", "pta"),
        page("phases", "phases"),
        page("acteurs", "acteurs"),
        page("zones", "zones"),
      ],
    },
    {
      cle: "mise_en_oeuvre",
      pages: [
        page("realisations", "realisations"),
        page("prochaines-etapes", "prochaines"),
        page("etats-avancement", "etats"),
        page("documents", "documents"),
        page("finances", "finances"),
        page("beneficiaires", "beneficiaires"),
      ],
    },
  ];
  const rubriqueOuverte =
    rubriques.find((r) => r.pages.some((p) => matchPath({ path: p.vers, end: p.fin }, pathname))) ?? rubriques[0]!;
  const onglets = rubriqueOuverte.pages;

  return (
    <>
      <div className="grid grid-cols-1 gap-5">
        <Link
          to="/app"
          className="lift inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-accent-ink hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t("projet.retour")}
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid min-w-0 gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatutProjet statut={projet.statut} />
              {projet.is_demo && (
                <Badge variante="exemple">
                  <FlaskConical aria-hidden />
                  {t("projets.exemple.badge")}
                </Badge>
              )}
            </div>
            <h1 className="text-3xl font-extrabold text-navy sm:text-4xl">{projet.nom}</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono tabular">{formaterPeriode(projet.date_debut, projet.date_fin)}</span>
              {projet.secteur && <> · {projet.secteur.libelle}</>}
              {programme && (
                <>
                  {" · "}
                  <Link to={`/app/programmes/${programme.id}`} className="font-medium text-accent-ink hover:underline">
                    {programme.nom}
                  </Link>
                </>
              )}
              {projet.budget !== null && <> · {formaterMontant(projet.budget, projet.devise)}</>}
            </p>
            {projet.description && <p className="max-w-3xl text-sm text-foreground">{projet.description}</p>}
            <EtiquettesProjet projetId={projet.id} modifiable={org.peutEditer} />
          </div>

          <div className="grid w-full gap-2 rounded-2xl bg-card p-4 shadow-card lg:w-80 lg:shrink-0">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-navy">{t("projet.progression")}</p>
              <p className="font-mono text-lg font-semibold text-navy tabular">
                {global.progression === null ? t("projet.progression_aucune") : `${Math.round(global.progression)} %`}
              </p>
            </div>
            <JaugeSegmentee statuts={global.evaluations.map((e) => e.statut)} />
            <TauxAvancement
              resultats={global.progression}
              physique={avancement?.taux_physique ?? null}
              financier={avancement?.taux_financier ?? null}
              className="mt-1 border-t border-border pt-3"
            />
            {modifiable && programmes.data && (programmes.data.length > 0 || projet.programme_id) && (
              <label className="mt-1 grid gap-1 text-xs font-semibold text-muted-foreground">
                {t("programmes.champ_projet")}
                <NativeSelect
                  value={projet.programme_id ?? ""}
                  onChange={(e) => changerProgramme.mutate(e.target.value)}
                  disabled={changerProgramme.isPending}
                  className="h-10 text-sm font-normal text-foreground"
                >
                  <option value="">{t("programmes.aucun")}</option>
                  {programmes.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            )}
            {modifiable && (
              <label className="mt-1 grid gap-1 text-xs font-semibold text-muted-foreground">
                {t("projets.champs.statut")}
                <NativeSelect
                  value={projet.statut}
                  onChange={(e) => changerStatut.mutate(e.target.value as Projet["statut"])}
                  disabled={changerStatut.isPending}
                  className="h-10 text-sm font-normal text-foreground"
                >
                  {STATUTS_PROJET.map((s) => (
                    <option key={s} value={s}>
                      {t(`projets.statuts.${s}`)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            )}
          </div>
        </div>

        {suggererRetard && (
          <Bandeau variante="vigilance" className="flex-wrap items-center">
            <TriangleAlert aria-hidden />
            <p className="min-w-0 flex-1">{t("projet.suggestion_retard")}</p>
            <Button
              variante="contour"
              taille="sm"
              onClick={() => changerStatut.mutate("en_retard")}
              chargement={changerStatut.isPending}
            >
              {t("projet.suggestion_action")}
            </Button>
          </Bandeau>
        )}

        {projet.is_demo && <Bandeau>{t("projet.exemple_info")}</Bandeau>}

        <div className="grid gap-3">
          <nav aria-label={t("projet.rubriques.libelle")}>
            <ul className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
              {rubriques.map((r) => {
                const ouverte = r === rubriqueOuverte;
                return (
                  <li key={r.cle}>
                    <Link
                      to={r.pages[0]!.vers}
                      aria-current={ouverte ? "true" : undefined}
                      className={cn(
                        "inline-flex min-h-9 w-full items-center justify-center rounded-full px-2 py-1.5 text-center text-sm leading-tight font-semibold transition-colors sm:w-auto sm:px-4 sm:whitespace-nowrap",
                        ouverte ? "bg-navy text-white" : "bg-subtle text-navy hover:bg-navy/10",
                      )}
                    >
                      {t(`projet.rubriques.${r.cle}`)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <nav
            ref={barreOnglets}
            aria-label={t("projet.navigation")}
            className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
          >
            <ul className="flex gap-1 border-b border-border">
              {onglets.map((onglet) => (
                <li key={onglet.vers}>
                  <NavLink
                    to={onglet.vers}
                    end={onglet.fin}
                    className={({ isActive }) =>
                      cn(
                        "-mb-px inline-flex h-11 items-center border-b-2 px-4 text-sm font-semibold whitespace-nowrap transition-colors",
                        isActive
                          ? "border-accent-ink text-navy"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )
                    }
                  >
                    {onglet.libelle}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      <Outlet context={{ projet, kpis, saisies } satisfies ContexteProjet} />
    </>
  );
}

function SqueletteProjet() {
  return (
    <div className="grid grid-cols-1 gap-5" aria-busy>
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-11 w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-56 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
