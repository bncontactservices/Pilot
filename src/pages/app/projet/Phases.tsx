import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarRange, Diamond, MoreHorizontal, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BadgeStatutTravail } from "~/components/app/BadgeStatutTravail";
import { DialogueConfirmation } from "~/components/app/DialogueConfirmation";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur, EtatVide } from "~/components/app/Etats";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { Chronologie } from "~/components/app/phases/Chronologie";
import { DialogueEtape } from "~/components/app/phases/DialogueEtape";
import { DialoguePhase } from "~/components/app/phases/DialoguePhase";
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
import { enRetard, resumeEtapes, STATUTS_TRAVAIL, type StatutTravail } from "~/lib/avancement";
import { deplacer } from "~/lib/cadre-logique";
import { clesSe, type Etape, invaliderAvancement, type Phase, useEtapes, usePhases } from "~/lib/donnees-se";
import { formaterDate, formaterPeriode } from "~/lib/format";
import { aujourdhuiIso, numeroJour } from "~/lib/kpi";
import { getSupabase } from "~/lib/supabase";
import { useContexteProjet } from "../ProjetLayout";

export const meta = () => [{ title: i18n.t("phases.meta") }];

const PHASES_TYPES = ["conception", "demarrage", "mise_en_oeuvre", "suivi_evaluation", "cloture"] as const;

export default function Phases() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const { projet } = useContexteProjet();
  const phases = usePhases(projet.id);
  const etapes = useEtapes(projet.id);
  const aujourdhui = aujourdhuiIso();
  const peutModifier = org.peutEditer;

  const [editionPhase, setEditionPhase] = useState<Phase | "nouvelle" | null>(null);
  const [editionEtape, setEditionEtape] = useState<{ etape: Etape | null; phaseId: string } | null>(null);
  const [suppressionPhase, setSuppressionPhase] = useState<Phase | null>(null);
  const [suppressionEtape, setSuppressionEtape] = useState<Etape | null>(null);

  const etapesParPhase = useMemo(() => {
    const groupes = new Map<string, Etape[]>();
    for (const e of etapes.data ?? []) {
      const cle = e.phase_id ?? "";
      groupes.set(cle, [...(groupes.get(cle) ?? []), e]);
    }
    return groupes;
  }, [etapes.data]);

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: clesSe.phases(projet.id) });
    void queryClient.invalidateQueries({ queryKey: clesSe.etapes(projet.id) });
    invaliderAvancement(queryClient, org.organisation.id);
  };

  const ajouterPhasesTypes = useMutation({
    mutationFn: async () => {
      const lignes = PHASES_TYPES.map((cle, i) => ({
        project_id: projet.id,
        nom: t(`phases.defaut.${cle}`),
        ordre: i + 1,
      }));
      const { error } = await getSupabase().from("phases").insert(lignes);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("phases.defaut_ajoutees"));
      rafraichir();
    },
    onError: gererErreur,
  });

  const deplacerPhase = useMutation({
    mutationFn: async ({ phase, sens }: { phase: Phase; sens: -1 | 1 }) => {
      const changements = deplacer(phases.data ?? [], phase.id, sens);
      if (!changements) return;
      for (const c of changements) {
        const { error } = await getSupabase().from("phases").update({ ordre: c.ordre }).eq("id", c.id);
        if (error) throw error;
      }
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: clesSe.phases(projet.id) }),
    onError: gererErreur,
  });

  const changerStatutEtape = useMutation({
    mutationFn: async ({ etape, statut }: { etape: Etape; statut: StatutTravail }) => {
      const { error } = await getSupabase()
        .from("etapes")
        .update({ statut, ...(statut === "termine" && !etape.date_reelle ? { date_reelle: aujourdhui } : {}) })
        .eq("id", etape.id);
      if (error) throw error;
    },
    onSettled: rafraichir,
    onError: gererErreur,
  });

  const supprimerPhase = useMutation({
    mutationFn: async (phase: Phase) => {
      const { error } = await getSupabase().from("phases").delete().eq("id", phase.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("phases.suppression_phase.succes"));
      setSuppressionPhase(null);
      rafraichir();
      void queryClient.invalidateQueries({ queryKey: clesSe.pta(projet.id) });
    },
    onError: gererErreur,
  });

  const supprimerEtape = useMutation({
    mutationFn: async (etape: Etape) => {
      const { error } = await getSupabase().from("etapes").delete().eq("id", etape.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("phases.suppression_etape.succes"));
      setSuppressionEtape(null);
      rafraichir();
    },
    onError: gererErreur,
  });

  const chargement = phases.isPending || etapes.isPending;
  const erreur = phases.error ?? etapes.error;
  const vide = phases.isSuccess && etapes.isSuccess && phases.data.length === 0 && etapes.data.length === 0;
  const sansPhase = etapesParPhase.get("") ?? [];

  const ligneEtape = (etape: Etape) => {
    const retard = enRetard({ statut: etape.statut, echeance: etape.date_prevue }, aujourdhui);
    const jours = numeroJour(aujourdhui) - numeroJour(etape.date_prevue);
    const Icone = etape.type === "jalon" ? Diamond : Package;
    return (
      <li key={etape.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variante="contour">
              <Icone aria-hidden />
              {t(`phases.type.${etape.type}`)}
            </Badge>
            <span className="font-medium text-foreground">{etape.nom}</span>
          </div>
          <p className="font-mono text-xs text-muted-foreground tabular">
            {etape.date_reelle && etape.statut === "termine"
              ? t("phases.etape.atteinte_le", { date: formaterDate(etape.date_reelle) })
              : t("phases.etape.prevue_le", { date: formaterDate(etape.date_prevue) })}
            {retard && <> · {t("travail.retard_jours", { count: jours })}</>}
          </p>
          {etape.description && <p className="text-sm text-muted-foreground">{etape.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {peutModifier ? (
            <>
              <NativeSelect
                aria-label={t("phases.etape.statut_pour", { nom: etape.nom })}
                value={etape.statut}
                onChange={(e) => changerStatutEtape.mutate({ etape, statut: e.target.value as StatutTravail })}
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
                    aria-label={t("phases.etape.actions", { nom: etape.nom })}
                  >
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditionEtape({ etape, phaseId: etape.phase_id ?? "" })}>
                    <Pencil aria-hidden />
                    {t("cadre.actions.modifier")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setSuppressionEtape(etape)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 aria-hidden className="!text-destructive" />
                    {t("cadre.actions.supprimer")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <BadgeStatutTravail statut={etape.statut} enRetard={retard} />
          )}
        </div>
      </li>
    );
  };

  const actions =
    peutModifier && !vide && !chargement ? (
      <>
        <Button variante="contour" onClick={() => setEditionPhase("nouvelle")}>
          <Plus aria-hidden />
          {t("phases.ajouter_phase")}
        </Button>
        <Button onClick={() => setEditionEtape({ etape: null, phaseId: "" })}>
          <Plus aria-hidden />
          {t("phases.ajouter_etape")}
        </Button>
      </>
    ) : undefined;

  return (
    <div className="grid gap-5">
      <EntetePage titre={t("phases.titre")} description={t("phases.description")} actions={actions} />

      {!peutModifier && org.peutEcrire && <Bandeau>{t("travail.lecture_seule_role")}</Bandeau>}
      {!org.peutEcrire && <Bandeau>{t("travail.lecture_seule_essai")}</Bandeau>}

      {chargement ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : erreur ? (
        <EtatErreur
          erreur={erreur}
          onReessayer={() => {
            void phases.refetch();
            void etapes.refetch();
          }}
        />
      ) : vide ? (
        <EtatVide
          visuel={<CalendarRange className="size-10 text-navy/40" aria-hidden />}
          titre={t("phases.vide.titre")}
          description={peutModifier ? t("phases.vide.texte") : t("phases.vide.texte_lecteur")}
          actions={
            peutModifier && (
              <>
                <Button onClick={() => ajouterPhasesTypes.mutate()} chargement={ajouterPhasesTypes.isPending}>
                  <Plus aria-hidden />
                  {t("phases.vide.action_types")}
                </Button>
                <Button variante="contour" onClick={() => setEditionPhase("nouvelle")}>
                  {t("phases.ajouter_phase")}
                </Button>
              </>
            )
          }
        />
      ) : (
        <>
          <section aria-labelledby="titre-chronologie" className="grid gap-3">
            <h2 id="titre-chronologie" className="text-xl font-bold text-navy">
              {t("phases.chronologie.titre")}
            </h2>
            <Chronologie projet={projet} phases={phases.data!} etapes={etapes.data!} aujourdhui={aujourdhui} />
          </section>

          <ol className="grid gap-4">
            {phases.data!.map((phase, position) => {
              const liste = etapesParPhase.get(phase.id) ?? [];
              const resume = resumeEtapes(liste, aujourdhui);
              return (
                <li key={phase.id} className="grid gap-3 rounded-2xl bg-card p-5 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-1">
                      <h3 className="text-lg font-bold text-navy">{phase.nom}</h3>
                      <p className="font-mono text-xs text-muted-foreground tabular">
                        {phase.date_debut && phase.date_fin
                          ? formaterPeriode(phase.date_debut, phase.date_fin)
                          : t("phases.phase.dates_a_preciser")}
                      </p>
                      {phase.description && <p className="text-sm text-muted-foreground">{phase.description}</p>}
                    </div>
                    {peutModifier && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variante="fantome"
                            taille="icone"
                            className="-mt-1 -mr-2 size-9"
                            aria-label={t("phases.phase.actions", { nom: phase.nom })}
                          >
                            <MoreHorizontal aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditionPhase(phase)}>
                            <Pencil aria-hidden />
                            {t("cadre.actions.modifier")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={position === 0}
                            onSelect={() => deplacerPhase.mutate({ phase, sens: -1 })}
                          >
                            {t("cadre.actions.monter")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={position === phases.data!.length - 1}
                            onSelect={() => deplacerPhase.mutate({ phase, sens: 1 })}
                          >
                            {t("cadre.actions.descendre")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => setSuppressionPhase(phase)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 aria-hidden className="!text-destructive" />
                            {t("cadre.actions.supprimer")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  {liste.length === 0 ? (
                    <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                      {t("phases.phase.aucune_etape")}
                    </p>
                  ) : (
                    <>
                      <p className="border-t border-border pt-3 text-sm font-medium text-navy">
                        {t("phases.phase.etapes_terminees", { terminees: resume.terminees, count: resume.nombre })}
                      </p>
                      <ul className="divide-y divide-border">{liste.map(ligneEtape)}</ul>
                    </>
                  )}
                  {peutModifier && (
                    <div>
                      <Button
                        variante="contour"
                        taille="sm"
                        onClick={() => setEditionEtape({ etape: null, phaseId: phase.id })}
                      >
                        <Plus aria-hidden />
                        {t("phases.ajouter_etape")}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {sansPhase.length > 0 && (
            <section aria-labelledby="titre-sans-phase" className="grid gap-2 rounded-2xl bg-card p-5 shadow-card">
              <h3 id="titre-sans-phase" className="text-lg font-bold text-navy">
                {t("phases.sans_phase")}
              </h3>
              <ul className="divide-y divide-border">{sansPhase.map(ligneEtape)}</ul>
            </section>
          )}
        </>
      )}

      <DialoguePhase
        ouvert={editionPhase !== null}
        onFermer={() => setEditionPhase(null)}
        projetId={projet.id}
        phase={editionPhase && editionPhase !== "nouvelle" ? editionPhase : null}
        phases={phases.data ?? []}
      />
      <DialogueEtape
        ouvert={editionEtape !== null}
        onFermer={() => setEditionEtape(null)}
        projetId={projet.id}
        etape={editionEtape?.etape ?? null}
        phases={phases.data ?? []}
        phaseParDefaut={editionEtape?.phaseId ?? ""}
      />
      <DialogueConfirmation
        ouvert={suppressionPhase !== null}
        onOuvertChange={(o) => !o && setSuppressionPhase(null)}
        titre={suppressionPhase ? t("phases.suppression_phase.titre", { nom: suppressionPhase.nom }) : ""}
        description={t("phases.suppression_phase.texte")}
        action={t("phases.suppression_phase.action")}
        enCours={supprimerPhase.isPending}
        onConfirmer={() => suppressionPhase && supprimerPhase.mutate(suppressionPhase)}
      />
      <DialogueConfirmation
        ouvert={suppressionEtape !== null}
        onOuvertChange={(o) => !o && setSuppressionEtape(null)}
        titre={suppressionEtape ? t("phases.suppression_etape.titre", { nom: suppressionEtape.nom }) : ""}
        description={t("phases.suppression_etape.texte")}
        action={t("phases.suppression_etape.action")}
        enCours={supprimerEtape.isPending}
        onConfirmer={() => suppressionEtape && supprimerEtape.mutate(suppressionEtape)}
      />
    </div>
  );
}
