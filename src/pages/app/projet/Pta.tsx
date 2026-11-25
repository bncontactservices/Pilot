import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, List, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BadgeStatutTravail } from "~/components/app/BadgeStatutTravail";
import { DialogueConfirmation } from "~/components/app/DialogueConfirmation";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur, EtatVide } from "~/components/app/Etats";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { CalendrierPta } from "~/components/app/pta/CalendrierPta";
import { DialogueActivite } from "~/components/app/pta/DialogueActivite";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { NativeSelect } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { useOrg } from "~/hooks/useContexteOrg";
import i18n from "~/i18n";
import { arrondirTaux, enRetard, STATUTS_TRAVAIL, type StatutTravail, tauxPhysique } from "~/lib/avancement";
import { useParametresSe } from "~/lib/donnees";
import { type ActivitePta, clesSe, invaliderAvancement, useNoeuds, usePhases, usePta } from "~/lib/donnees-se";
import { formaterDate, formaterMontant } from "~/lib/format";
import { aujourdhuiIso } from "~/lib/kpi";
import { anneeParDefaut, anneesProposees, periodeActivite, pourcentSelonStatut } from "~/lib/pta";
import { getSupabase } from "~/lib/supabase";
import { cn } from "~/lib/utils";
import { useContexteProjet } from "../ProjetLayout";

export const meta = () => [{ title: i18n.t("pta.meta") }];

type Vue = "calendrier" | "liste";

export default function Pta() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const { projet } = useContexteProjet();
  const activites = usePta(projet.id);
  const noeuds = useNoeuds(projet.id);
  const phases = usePhases(projet.id);
  const parametres = useParametresSe(org.organisation.id);
  const aujourdhui = aujourdhuiIso();
  const moisDebut = parametres.data?.mois_debut_annee_fiscale ?? 1;
  const peutModifier = org.peutEditer;

  const membres = useQuery({
    queryKey: ["membres-noms", org.organisation.id],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase().from("profiles").select("nom, email");
      if (error) throw error;
      return data;
    },
  });

  const annees = useMemo(
    () => anneesProposees(projet, activites.data ?? [], moisDebut, aujourdhui),
    [projet, activites.data, moisDebut, aujourdhui],
  );
  const [anneeChoisie, setAnneeChoisie] = useState<number | null>(null);
  const annee = anneeChoisie ?? anneeParDefaut(annees, aujourdhui, moisDebut);
  const [vue, setVue] = useState<Vue>("calendrier");
  const [edition, setEdition] = useState<ActivitePta | "nouvelle" | null>(null);
  const [suppression, setSuppression] = useState<ActivitePta | null>(null);

  const delAnnee = useMemo(() => (activites.data ?? []).filter((a) => a.annee === annee), [activites.data, annee]);
  const physique = tauxPhysique(delAnnee);
  const budgetTotal = delAnnee
    .filter((a) => a.statut !== "annule")
    .reduce((total, a) => total + (a.budget_prevu ?? 0), 0);
  const responsables = useMemo(() => {
    const noms = new Set<string>();
    for (const m of membres.data ?? []) if (m.nom) noms.add(m.nom);
    for (const a of activites.data ?? []) if (a.responsable) noms.add(a.responsable);
    return [...noms].sort((a, b) => a.localeCompare(b, "fr"));
  }, [membres.data, activites.data]);

  const libelleAnnee = (a: number) => (moisDebut === 1 ? String(a) : `${a}–${a + 1}`);

  const changerStatut = useMutation({
    mutationFn: async ({ activite, statut }: { activite: ActivitePta; statut: StatutTravail }) => {
      const { error } = await getSupabase()
        .from("pta_activites")
        .update({ statut, pct_realisation: pourcentSelonStatut(statut, activite.pct_realisation) })
        .eq("id", activite.id);
      if (error) throw error;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: clesSe.pta(projet.id) });
      invaliderAvancement(queryClient, org.organisation.id);
    },
    onError: gererErreur,
  });

  const supprimer = useMutation({
    mutationFn: async (activite: ActivitePta) => {
      const { error } = await getSupabase().from("pta_activites").delete().eq("id", activite.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("pta.suppression.succes"));
      setSuppression(null);
      void queryClient.invalidateQueries({ queryKey: clesSe.pta(projet.id) });
      invaliderAvancement(queryClient, org.organisation.id);
    },
    onError: gererErreur,
  });

  const chargement = activites.isPending;
  const periodeTexte = (a: ActivitePta) => {
    const p = periodeActivite(a, moisDebut);
    return a.date_debut
      ? `${formaterDate(p.debut)} – ${formaterDate(p.fin)}`
      : t("pta.trimestre_annee", { numero: a.trimestre, annee: libelleAnnee(a.annee) });
  };

  const menu = (activite: ActivitePta) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variante="fantome"
          taille="icone"
          className="size-9"
          aria-label={t("pta.actions", { nom: activite.intitule })}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setEdition(activite)}>
          <Pencil aria-hidden />
          {t("cadre.actions.modifier")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setSuppression(activite)} className="text-destructive focus:text-destructive">
          <Trash2 aria-hidden className="!text-destructive" />
          {t("cadre.actions.supprimer")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const actions = peutModifier ? (
    <Button onClick={() => setEdition("nouvelle")}>
      <Plus aria-hidden />
      {t("pta.planifier")}
    </Button>
  ) : undefined;

  return (
    <div className="grid gap-5">
      <EntetePage titre={t("pta.titre")} description={t("pta.description")} actions={actions} />

      {!peutModifier && org.peutEcrire && <Bandeau>{t("travail.lecture_seule_role")}</Bandeau>}
      {!org.peutEcrire && <Bandeau>{t("travail.lecture_seule_essai")}</Bandeau>}

      {activites.isError ? (
        <EtatErreur erreur={activites.error} onReessayer={() => void activites.refetch()} />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="grid gap-1 text-sm font-semibold text-foreground">
              {t("pta.annee")}
              <NativeSelect
                value={annee}
                onChange={(e) => setAnneeChoisie(Number(e.target.value))}
                className="h-10 w-auto min-w-40"
              >
                {annees.map((a) => (
                  <option key={a} value={a}>
                    {t("pta.annee_option", { libelle: libelleAnnee(a) })}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <div
              role="group"
              aria-label={t("pta.vues.libelle")}
              className="inline-flex rounded-xl border border-border bg-card p-1"
            >
              {(["calendrier", "liste"] as const).map((v) => {
                const Icone = v === "calendrier" ? CalendarDays : List;
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
                    {t(`pta.vues.${v}`)}
                  </button>
                );
              })}
            </div>
          </div>

          {chargement ? (
            <div className="grid gap-3" aria-busy>
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
            </div>
          ) : delAnnee.length === 0 ? (
            <EtatVide
              visuel={<CalendarDays className="size-10 text-navy/40" aria-hidden />}
              titre={t("pta.vide.titre")}
              description={peutModifier ? t("pta.vide.texte") : t("pta.vide.texte_lecteur")}
              actions={
                peutModifier && (
                  <Button onClick={() => setEdition("nouvelle")}>
                    <Plus aria-hidden />
                    {t("pta.planifier")}
                  </Button>
                )
              }
            />
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { cle: "activites", valeur: String(physique.nombre) },
                  { cle: "terminees", valeur: `${physique.realisees} / ${physique.nombre}` },
                  {
                    cle: "avancement",
                    valeur: physique.taux === null ? t("pta.resume.aucune") : `${arrondirTaux(physique.taux)} %`,
                  },
                  {
                    cle: "budget",
                    valeur: budgetTotal > 0 ? formaterMontant(budgetTotal, projet.devise) : t("pta.resume.aucune"),
                  },
                ].map(({ cle, valeur }) => (
                  <div
                    key={cle}
                    className={cn(
                      "grid min-w-0 gap-0.5 rounded-2xl bg-card p-4 shadow-card",
                      cle === "budget" && "col-span-2 sm:col-span-1",
                    )}
                  >
                    <dt className="text-xs font-semibold text-muted-foreground">{t(`pta.resume.${cle}`)}</dt>
                    <dd className="font-mono text-lg font-semibold text-navy tabular">{valeur}</dd>
                  </div>
                ))}
              </dl>

              {vue === "calendrier" ? (
                <CalendrierPta
                  activites={delAnnee}
                  annee={annee}
                  moisDebut={moisDebut}
                  aujourdhui={aujourdhui}
                  onOuvrir={peutModifier ? (a) => setEdition(a) : undefined}
                />
              ) : (
                <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                  <table className="w-full min-w-[52rem] border-separate border-spacing-0 overflow-hidden rounded-2xl bg-card text-left text-sm shadow-card">
                    <thead>
                      <tr className="bg-subtle text-xs font-semibold tracking-wide text-navy uppercase">
                        <th scope="col" className="px-4 py-3">
                          {t("pta.colonnes.activite")}
                        </th>
                        <th scope="col" className="px-4 py-3">
                          {t("pta.colonnes.responsable")}
                        </th>
                        <th scope="col" className="px-4 py-3">
                          {t("pta.colonnes.periode")}
                        </th>
                        <th scope="col" className="px-4 py-3">
                          {t("pta.colonnes.statut")}
                        </th>
                        <th scope="col" className="px-4 py-3 text-right">
                          {t("pta.colonnes.avancement")}
                        </th>
                        <th scope="col" className="px-4 py-3 text-right">
                          {t("pta.colonnes.budget")}
                        </th>
                        {peutModifier && (
                          <th scope="col" className="px-4 py-3">
                            <span className="sr-only">{t("pta.colonnes.actions")}</span>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {[...delAnnee]
                        .sort((a, b) =>
                          periodeActivite(a, moisDebut).debut.localeCompare(periodeActivite(b, moisDebut).debut),
                        )
                        .map((a) => {
                          const retard = enRetard(
                            { statut: a.statut, echeance: periodeActivite(a, moisDebut).fin },
                            aujourdhui,
                          );
                          const noeud = (noeuds.data ?? []).find((n) => n.id === a.noeud_id);
                          return (
                            <tr key={a.id}>
                              <th scope="row" className="border-t border-border px-4 py-3 align-top font-normal">
                                <span className="block font-semibold text-navy">{a.intitule}</span>
                                {noeud && (
                                  <span className="block text-xs text-muted-foreground">
                                    {t("pta.lien_cadre", { code: noeud.code })}
                                  </span>
                                )}
                              </th>
                              <td className="border-t border-border px-4 py-3 align-top">
                                {a.responsable ?? (
                                  <span className="text-muted-foreground">{t("pta.sans_responsable")}</span>
                                )}
                              </td>
                              <td className="border-t border-border px-4 py-3 align-top font-mono text-xs tabular">
                                {periodeTexte(a)}
                              </td>
                              <td className="border-t border-border px-4 py-3 align-top">
                                {peutModifier ? (
                                  <div className="grid gap-1.5">
                                    <NativeSelect
                                      aria-label={t("pta.statut_pour", { nom: a.intitule })}
                                      value={a.statut}
                                      onChange={(e) =>
                                        changerStatut.mutate({ activite: a, statut: e.target.value as StatutTravail })
                                      }
                                      className="h-9 w-auto min-w-36 text-sm"
                                    >
                                      {STATUTS_TRAVAIL.map((s) => (
                                        <option key={s} value={s}>
                                          {t(`travail.statuts.${s}`)}
                                        </option>
                                      ))}
                                    </NativeSelect>
                                    {retard && (
                                      <span className="text-xs font-semibold text-status-alert-ink">
                                        {t("travail.en_retard")}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <BadgeStatutTravail statut={a.statut} enRetard={retard} />
                                )}
                              </td>
                              <td className="border-t border-border px-4 py-3 text-right align-top font-mono tabular">
                                {Math.round(a.pct_realisation)} %
                              </td>
                              <td className="border-t border-border px-4 py-3 text-right align-top font-mono text-xs tabular">
                                {a.budget_prevu === null ? "—" : formaterMontant(a.budget_prevu, projet.devise)}
                              </td>
                              {peutModifier && (
                                <td className="border-t border-border px-2 py-2 align-top">{menu(a)}</td>
                              )}
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      <DialogueActivite
        ouvert={edition !== null}
        onFermer={() => setEdition(null)}
        projet={projet}
        activite={edition && edition !== "nouvelle" ? edition : null}
        annee={annee}
        annees={annees}
        moisDebut={moisDebut}
        noeuds={noeuds.data ?? []}
        phases={phases.data ?? []}
        suggestionsResponsables={responsables}
      />
      <DialogueConfirmation
        ouvert={suppression !== null}
        onOuvertChange={(o) => !o && setSuppression(null)}
        titre={suppression ? t("pta.suppression.titre", { nom: suppression.intitule }) : ""}
        description={t("pta.suppression.texte")}
        action={t("pta.suppression.action")}
        enCours={supprimer.isPending}
        onConfirmer={() => suppression && supprimer.mutate(suppression)}
      />
    </div>
  );
}
