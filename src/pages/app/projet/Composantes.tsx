import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Layers, List, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BadgeStatutTravail } from "~/components/app/BadgeStatutTravail";
import { DialogueConfirmation } from "~/components/app/DialogueConfirmation";
import { DialogueComposante } from "~/components/app/composantes/DialogueComposante";
import { GanttComposantes } from "~/components/app/composantes/GanttComposantes";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur, EtatVide } from "~/components/app/Etats";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Skeleton } from "~/components/ui/skeleton";
import { useOrg } from "~/hooks/useContexteOrg";
import i18n from "~/i18n";
import { arrondirTaux, tauxPhysique } from "~/lib/avancement";
import { construirePlanning, type ComposantePlan } from "~/lib/composantes";
import {
  type ActivitePta,
  clesSe,
  type ComposanteProjet,
  useComposantes,
  useNomsMembres,
  usePta,
} from "~/lib/donnees-se";
import { formaterDate } from "~/lib/format";
import { aujourdhuiIso } from "~/lib/kpi";
import { getSupabase } from "~/lib/supabase";
import { cn } from "~/lib/utils";
import { useContexteProjet } from "../ProjetLayout";

export const meta = () => [{ title: i18n.t("composantes.meta") }];

type Vue = "planning" | "liste";

export default function Composantes() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const { projet } = useContexteProjet();
  const composantes = useComposantes(projet.id);
  const pta = usePta(projet.id);
  const membres = useNomsMembres(org.organisation.id);
  const peutModifier = org.peutEditer;
  const aujourdhui = aujourdhuiIso();

  const [vue, setVue] = useState<Vue>("planning");
  const [edition, setEdition] = useState<ComposanteProjet | "nouvelle" | null>(null);
  const [suppression, setSuppression] = useState<ComposanteProjet | null>(null);

  const liste = useMemo(() => composantes.data ?? [], [composantes.data]);
  const activites = useMemo(() => pta.data ?? [], [pta.data]);
  const planning = useMemo(
    () => construirePlanning(liste as ComposantePlan[], activites, aujourdhui),
    [liste, activites, aujourdhui],
  );
  const parComposante = useMemo(() => {
    const groupes = new Map<string, ActivitePta[]>();
    for (const a of activites) {
      if (a.composante_id) groupes.set(a.composante_id, [...(groupes.get(a.composante_id) ?? []), a]);
    }
    return groupes;
  }, [activites]);
  const responsables = useMemo(() => {
    const noms = new Set<string>();
    for (const m of membres.data ?? []) if (m.nom) noms.add(m.nom);
    for (const c of liste) if (c.responsable) noms.add(c.responsable);
    return [...noms].sort((a, b) => a.localeCompare(b, "fr"));
  }, [membres.data, liste]);
  const ordreSuivant = liste.reduce((max, c) => Math.max(max, c.ordre), 0) + 1;

  const supprimer = useMutation({
    mutationFn: async (c: ComposanteProjet) => {
      const { error } = await getSupabase().from("composantes").delete().eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("composantes.suppression.succes"));
      setSuppression(null);
      void queryClient.invalidateQueries({ queryKey: clesSe.composantes(projet.id) });
      void queryClient.invalidateQueries({ queryKey: clesSe.pta(projet.id) });
    },
    onError: gererErreur,
  });

  const chargement = composantes.isPending || pta.isPending;
  const erreur = composantes.error ?? pta.error;
  const vide = composantes.isSuccess && liste.length === 0;

  const actions =
    peutModifier && !vide && !chargement ? (
      <Button onClick={() => setEdition("nouvelle")}>
        <Plus aria-hidden />
        {t("composantes.ajouter")}
      </Button>
    ) : undefined;

  const ordonnees = [...planning.groupes.map((g) => g.composante), ...planning.aPlanifier];
  const detail = (c: ComposantePlan) => planning.groupes.find((g) => g.composante.id === c.id);

  return (
    <div className="grid grid-cols-1 gap-5">
      <EntetePage titre={t("composantes.titre")} description={t("composantes.description")} actions={actions} />

      {!peutModifier && org.peutEcrire && <Bandeau>{t("travail.lecture_seule_role")}</Bandeau>}
      {!org.peutEcrire && <Bandeau>{t("travail.lecture_seule_essai")}</Bandeau>}

      {chargement ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : erreur ? (
        <EtatErreur
          erreur={erreur}
          onReessayer={() => {
            void composantes.refetch();
            void pta.refetch();
          }}
        />
      ) : vide ? (
        <EtatVide
          visuel={<Layers className="size-10 text-navy/40" aria-hidden />}
          titre={t("composantes.vide.titre")}
          description={peutModifier ? t("composantes.vide.texte") : t("composantes.vide.texte_lecteur")}
          actions={
            peutModifier && (
              <Button onClick={() => setEdition("nouvelle")}>
                <Plus aria-hidden />
                {t("composantes.ajouter")}
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-navy" aria-live="polite">
              {t("composantes.resume", { count: liste.length })}
              {planning.nbEnRetard > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-status-alert-ink">
                    {t("composantes.resume_retard", { count: planning.nbEnRetard })}
                  </span>
                </>
              )}
            </p>
            <div
              role="group"
              aria-label={t("composantes.vues.libelle")}
              className="inline-flex rounded-xl border border-border bg-card p-1"
            >
              {(["planning", "liste"] as const).map((v) => {
                const Icone = v === "planning" ? CalendarDays : List;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={vue === v}
                    onClick={() => setVue(v)}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
                      vue === v ? "bg-navy text-white" : "text-muted-foreground hover:bg-subtle hover:text-foreground",
                    )}
                  >
                    <Icone className="size-4" aria-hidden />
                    {t(`composantes.vues.${v}`)}
                  </button>
                );
              })}
            </div>
          </div>

          {vue === "planning" && (
            <>
              {planning.periode ? (
                <GanttComposantes planning={planning} aujourdhui={aujourdhui} />
              ) : (
                <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground shadow-card">
                  {t("composantes.sans_dates")}
                </p>
              )}
              {planning.aPlanifier.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("composantes.a_planifier", {
                    count: planning.aPlanifier.length,
                    noms: planning.aPlanifier.map((c) => c.nom).join(", "),
                  })}
                </p>
              )}
              <p className="text-sm text-muted-foreground">{t("composantes.aide_planning")}</p>
            </>
          )}

          {vue === "liste" && (
            <ul className="grid grid-cols-1 gap-3">
              {ordonnees.map((c) => {
                const g = detail(c);
                const liees = parComposante.get(c.id) ?? [];
                const taux = tauxPhysique(liees).taux;
                const complete = liste.find((x) => x.id === c.id)!;
                return (
                  <li key={c.id} className="grid grid-cols-1 gap-3 rounded-2xl bg-card p-5 shadow-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid min-w-0 gap-1.5">
                        <h2 className="text-lg leading-snug font-bold text-navy">{c.nom}</h2>
                        <BadgeStatutTravail statut={c.statut} enRetard={g?.enRetard ?? false} />
                        <p className="text-sm text-muted-foreground">
                          {c.date_debut && c.date_fin
                            ? t("composantes.periode", {
                                debut: formaterDate(c.date_debut),
                                fin: formaterDate(c.date_fin),
                              })
                            : t("composantes.sans_dates_ligne")}
                          {c.responsable ? ` · ${c.responsable}` : ""}
                        </p>
                      </div>
                      <div className="flex items-start gap-1">
                        <p className="font-mono text-lg font-semibold text-navy tabular" aria-live="polite">
                          {taux === null ? (
                            <span title={t("composantes.aucune_activite")}>
                              <span aria-hidden>-</span>
                              <span className="sr-only">{t("composantes.aucune_activite")}</span>
                            </span>
                          ) : (
                            `${arrondirTaux(taux)} %`
                          )}
                        </p>
                        {peutModifier && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variante="fantome"
                                taille="icone"
                                className="-mt-1 -mr-2 size-9"
                                aria-label={t("composantes.actions", { nom: c.nom })}
                              >
                                <MoreHorizontal aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setEdition(complete)}>
                                <Pencil aria-hidden />
                                {t("cadre.actions.modifier")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => setSuppression(complete)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 aria-hidden className="!text-destructive" />
                                {t("cadre.actions.supprimer")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                    {complete.description && (
                      <p className="text-sm whitespace-pre-line text-foreground">{complete.description}</p>
                    )}
                    <div className="grid gap-1.5 border-t border-border pt-3">
                      <p className="text-sm font-semibold text-navy">
                        {liees.length === 0
                          ? t("composantes.activites_aucune")
                          : t("composantes.activites", { count: liees.length })}
                      </p>
                      {liees.length > 0 && (
                        <ul className="grid gap-1">
                          {liees.map((a) => (
                            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                              <span className="min-w-0 break-words">
                                {a.intitule}
                                {a.date_debut && a.date_fin && (
                                  <span className="ml-2 font-mono text-xs text-muted-foreground tabular">
                                    {formaterDate(a.date_debut)} → {formaterDate(a.date_fin)}
                                  </span>
                                )}
                              </span>
                              <span className="inline-flex items-center gap-2">
                                <BadgeStatutTravail statut={a.statut} />
                                <span className="font-mono text-xs tabular">{arrondirTaux(a.pct_realisation)} %</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {planning.sansComposante.length > 0 && vue === "liste" && (
            <section aria-labelledby="titre-sans-composante" className="grid gap-2">
              <h2 id="titre-sans-composante" className="text-base font-bold text-navy">
                {t("composantes.sans_composante")}
              </h2>
              <p className="text-sm text-muted-foreground">{t("composantes.sans_composante_aide")}</p>
              <ul className="grid gap-1 text-sm">
                {planning.sansComposante.map((a) => (
                  <li key={a.id}>{a.intitule}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <DialogueComposante
        ouvert={edition !== null}
        onFermer={() => setEdition(null)}
        projetId={projet.id}
        composante={edition && edition !== "nouvelle" ? edition : null}
        suggestionsResponsables={responsables}
        ordreSuivant={ordreSuivant}
      />
      <DialogueConfirmation
        ouvert={suppression !== null}
        onOuvertChange={(o) => !o && setSuppression(null)}
        titre={suppression ? t("composantes.suppression.titre", { nom: suppression.nom }) : ""}
        description={t("composantes.suppression.texte")}
        action={t("composantes.suppression.action")}
        enCours={supprimer.isPending}
        onConfirmer={() => suppression && supprimer.mutate(suppression)}
      />
    </div>
  );
}
