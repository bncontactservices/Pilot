import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ListChecks, MoreHorizontal, Pencil, Plus, Target, Trash2, User } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BadgeStatutTravail } from "~/components/app/BadgeStatutTravail";
import { DialogueConfirmation } from "~/components/app/DialogueConfirmation";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur, EtatVide } from "~/components/app/Etats";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { DialogueProchaineEtape } from "~/components/app/suivi/DialogueProchaineEtape";
import { Badge } from "~/components/ui/badge";
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
import { enRetard, STATUTS_TRAVAIL, type StatutTravail } from "~/lib/avancement";
import { clesSe, type ProchaineEtape, useProchainesEtapes } from "~/lib/donnees-se";
import { formaterDate } from "~/lib/format";
import { aujourdhuiIso, numeroJour } from "~/lib/kpi";
import { estOuverte, resumeProchainesEtapes, trierProchainesEtapes } from "~/lib/suivi";
import { getSupabase } from "~/lib/supabase";
import { cn } from "~/lib/utils";
import { useContexteProjet } from "../ProjetLayout";

export const meta = () => [{ title: i18n.t("prochaines.meta") }];

type Filtre = "ouvertes" | "terminees" | "toutes";
const FILTRES: Filtre[] = ["ouvertes", "terminees", "toutes"];

export default function ProchainesEtapes() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const { projet, kpis } = useContexteProjet();
  const etapes = useProchainesEtapes(projet.id);
  const aujourdhui = aujourdhuiIso();
  const peutModifier = org.peutEditer;

  const [filtre, setFiltre] = useState<Filtre>("ouvertes");
  const [edition, setEdition] = useState<ProchaineEtape | "nouvelle" | null>(null);
  const [suppression, setSuppression] = useState<ProchaineEtape | null>(null);

  const toutes = etapes.data ?? [];
  const resume = resumeProchainesEtapes(
    toutes.map((e) => ({ statut: e.statut, echeance: e.echeance })),
    aujourdhui,
  );
  const triees = trierProchainesEtapes(toutes, aujourdhui);
  const affichees =
    filtre === "ouvertes"
      ? triees.filter((e) => estOuverte(e.statut))
      : filtre === "terminees"
        ? triees.filter((e) => !estOuverte(e.statut))
        : triees;
  const nomsKpi = new Map(kpis.map((k) => [k.id, k.nom]));

  const changerStatut = useMutation({
    mutationFn: async ({ etape, statut }: { etape: ProchaineEtape; statut: StatutTravail }) => {
      const { error } = await getSupabase().from("prochaines_etapes").update({ statut }).eq("id", etape.id);
      if (error) throw error;
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: clesSe.prochaines(projet.id) }),
    onError: gererErreur,
  });

  const supprimer = useMutation({
    mutationFn: async (etape: ProchaineEtape) => {
      const { error } = await getSupabase().from("prochaines_etapes").delete().eq("id", etape.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("prochaines.suppression.succes"));
      setSuppression(null);
      void queryClient.invalidateQueries({ queryKey: clesSe.prochaines(projet.id) });
    },
    onError: gererErreur,
  });

  const chargement = etapes.isPending;
  const vide = etapes.isSuccess && toutes.length === 0;
  const actions =
    peutModifier && !vide && !chargement ? (
      <Button onClick={() => setEdition("nouvelle")}>
        <Plus aria-hidden />
        {t("prochaines.ajouter")}
      </Button>
    ) : undefined;

  return (
    <div className="grid gap-5">
      <EntetePage titre={t("prochaines.titre")} description={t("prochaines.description")} actions={actions} />

      {!peutModifier && org.peutEcrire && <Bandeau>{t("travail.lecture_seule_role")}</Bandeau>}
      {!org.peutEcrire && <Bandeau>{t("travail.lecture_seule_essai")}</Bandeau>}

      {chargement ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      ) : etapes.error ? (
        <EtatErreur erreur={etapes.error} onReessayer={() => void etapes.refetch()} />
      ) : vide ? (
        <EtatVide
          visuel={<ListChecks className="size-10 text-navy/40" aria-hidden />}
          titre={t("prochaines.vide.titre")}
          description={peutModifier ? t("prochaines.vide.texte") : t("prochaines.vide.texte_lecteur")}
          actions={
            peutModifier && (
              <Button onClick={() => setEdition("nouvelle")}>
                <Plus aria-hidden />
                {t("prochaines.ajouter")}
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-navy" aria-live="polite">
              {t("prochaines.resume", { ouvertes: resume.ouvertes, retard: resume.enRetard })}
            </p>
            <div
              role="group"
              aria-label={t("prochaines.filtre.libelle")}
              className="inline-flex rounded-xl border border-border bg-card p-1"
            >
              {FILTRES.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filtre === f}
                  onClick={() => setFiltre(f)}
                  className={cn(
                    "inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold transition-colors",
                    filtre === f ? "bg-navy text-white" : "text-muted-foreground hover:bg-subtle hover:text-foreground",
                  )}
                >
                  {t(`prochaines.filtre.${f}`)}
                </button>
              ))}
            </div>
          </div>

          {affichees.length === 0 ? (
            <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground shadow-card">
              {t(`prochaines.filtre_vide.${filtre}`)}
            </p>
          ) : (
            <ul className="grid gap-3">
              {affichees.map((e) => {
                const retard = enRetard({ statut: e.statut, echeance: e.echeance }, aujourdhui);
                const jours = e.echeance ? numeroJour(aujourdhui) - numeroJour(e.echeance) : 0;
                const kpiNom = e.kpi_id ? nomsKpi.get(e.kpi_id) : undefined;
                return (
                  <li
                    key={e.id}
                    className="grid gap-3 rounded-2xl bg-card p-5 shadow-card sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                  >
                    <div className="grid min-w-0 gap-1.5">
                      <p
                        className={cn("font-medium text-foreground", !estOuverte(e.statut) && "text-muted-foreground")}
                      >
                        {e.libelle}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        {e.responsable && (
                          <span className="inline-flex items-center gap-1">
                            <User className="size-3.5" aria-hidden />
                            {e.responsable}
                          </span>
                        )}
                        <span className="font-mono text-xs tabular">
                          {e.echeance
                            ? t("prochaines.echeance", { date: formaterDate(e.echeance) })
                            : t("prochaines.sans_echeance")}
                          {retard && <> · {t("travail.retard_jours", { count: jours })}</>}
                        </span>
                      </p>
                      {kpiNom && (
                        <p>
                          <Badge variante="contour" className="max-w-full whitespace-normal">
                            <Target aria-hidden />
                            {t("prochaines.depuis_indicateur", { nom: kpiNom })}
                          </Badge>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {peutModifier ? (
                        <>
                          <NativeSelect
                            aria-label={t("prochaines.statut_pour", { libelle: e.libelle })}
                            value={e.statut}
                            onChange={(ev) =>
                              changerStatut.mutate({ etape: e, statut: ev.target.value as StatutTravail })
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
                            <Badge variante="alerte">
                              <AlertTriangle aria-hidden />
                              {t("travail.en_retard")}
                            </Badge>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variante="fantome"
                                taille="icone"
                                className="size-9"
                                aria-label={t("prochaines.actions", { libelle: e.libelle })}
                              >
                                <MoreHorizontal aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setEdition(e)}>
                                <Pencil aria-hidden />
                                {t("cadre.actions.modifier")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => setSuppression(e)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 aria-hidden className="!text-destructive" />
                                {t("cadre.actions.supprimer")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      ) : (
                        <BadgeStatutTravail statut={e.statut} enRetard={retard} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <DialogueProchaineEtape
        ouvert={edition !== null}
        onFermer={() => setEdition(null)}
        projetId={projet.id}
        etape={edition && edition !== "nouvelle" ? edition : null}
        kpis={kpis}
        responsablesExistants={toutes.map((e) => e.responsable)}
      />
      <DialogueConfirmation
        ouvert={suppression !== null}
        onOuvertChange={(o) => !o && setSuppression(null)}
        titre={t("prochaines.suppression.titre")}
        description={suppression ? t("prochaines.suppression.texte", { libelle: suppression.libelle }) : ""}
        action={t("prochaines.suppression.action")}
        enCours={supprimer.isPending}
        onConfirmer={() => suppression && supprimer.mutate(suppression)}
      />
    </div>
  );
}
