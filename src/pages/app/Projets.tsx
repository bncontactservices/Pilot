import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, MoreHorizontal, Plus, Tag, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { DialogueNouveauProjet } from "~/components/app/DialogueNouveauProjet";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur, EtatVide, JaugeVide } from "~/components/app/Etats";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { JaugeSegmentee } from "~/components/app/kpi/JaugeSegmentee";
import { StatutProjet } from "~/components/app/StatutProjet";
import { Badge } from "~/components/ui/badge";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { NativeSelect } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { useOrg } from "~/hooks/useContexteOrg";
import i18n from "~/i18n";
import { type Avancement, useAvancements, useEvaluationsProjets } from "~/lib/donnees";
import { arrondirTaux } from "~/lib/avancement";
import { retirerFichiersOrphelins } from "~/lib/documents";
import { useEtiquettesOrg } from "~/lib/donnees-se";
import { formaterPeriode } from "~/lib/format";
import type { EvaluationProjet } from "~/lib/kpi";
import { getSupabase } from "~/lib/supabase";

export const meta = () => [{ title: i18n.t("projets.meta") }];

export type ProjetListe = Awaited<ReturnType<typeof chargerProjets>>[number];

async function chargerProjets(orgId: string) {
  const { data, error } = await getSupabase()
    .from("projects")
    .select(
      "id, nom, description, date_debut, date_fin, statut, is_demo, secteur:secteurs(libelle), programme:programmes(id, nom)",
    )
    .eq("org_id", orgId)
    .order("is_demo", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export default function Projets() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const [creation, setCreation] = useState(false);
  const cle = ["projets", org.organisation.id];

  const projets = useQuery({ queryKey: cle, queryFn: () => chargerProjets(org.organisation.id) });
  const { evaluations, chargement: evaluationsEnCours } = useEvaluationsProjets(org.organisation.id, projets.data);
  const avancements = useAvancements(org.organisation.id);
  const etiquettesOrg = useEtiquettesOrg(org.organisation.id);
  const [etiquetteChoisie, setEtiquetteChoisie] = useState("");
  const etiquettesParProjet = useMemo(() => {
    const groupes = new Map<string, string[]>();
    for (const l of etiquettesOrg.data ?? [])
      groupes.set(l.project_id, [...(groupes.get(l.project_id) ?? []), l.etiquette]);
    return groupes;
  }, [etiquettesOrg.data]);
  const toutesEtiquettes = useMemo(
    () => [...new Set((etiquettesOrg.data ?? []).map((l) => l.etiquette))].sort((a, b) => a.localeCompare(b, "fr")),
    [etiquettesOrg.data],
  );
  // Une étiquette qui n'existe plus (retirée du dernier projet qui la portait) ne doit pas laisser une liste vide.
  const etiquetteActive = toutesEtiquettes.includes(etiquetteChoisie) ? etiquetteChoisie : "";
  const exempleCharge = projets.data?.some((p) => p.is_demo) ?? false;
  const nbReels = projets.data?.filter((p) => !p.is_demo).length ?? 0;

  const chargerExemple = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabase().rpc("charger_projet_exemple");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("projets.exemple.charge"));
      void queryClient.invalidateQueries({ queryKey: cle });
      void queryClient.invalidateQueries({ queryKey: ["avancements", org.organisation.id] });
      void queryClient.invalidateQueries({ queryKey: ["avancements-programmes", org.organisation.id] });
    },
    onError: gererErreur,
  });

  const actions = org.peutEditer ? (
    <>
      {projets.isSuccess && !exempleCharge && projets.data.length > 0 && (
        <Button variante="contour" onClick={() => chargerExemple.mutate()} chargement={chargerExemple.isPending}>
          <FlaskConical aria-hidden />
          {t("projets.exemple.action")}
        </Button>
      )}
      <Button onClick={() => setCreation(true)}>
        <Plus aria-hidden />
        {t("projets.nouveau")}
      </Button>
    </>
  ) : undefined;

  return (
    <>
      <EntetePage
        titre={t("projets.titre")}
        description={
          projets.isSuccess &&
          (org.limites.projects === null
            ? t("projets.quota_illimite", { count: nbReels })
            : t("projets.quota", {
                count: nbReels,
                limite: org.limites.projects,
                plan: t(`plans.${org.organisation.plan}`),
              }))
        }
        actions={actions}
      />

      {!org.peutEditer && org.peutEcrire && <Bandeau>{t("projets.lecture_seule_role")}</Bandeau>}

      {projets.isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : projets.isError ? (
        <EtatErreur erreur={projets.error} onReessayer={() => void projets.refetch()} />
      ) : projets.data.length === 0 ? (
        <EtatVide
          visuel={<JaugeVide />}
          titre={t("projets.vide.titre")}
          description={org.peutEditer ? t("projets.vide.texte") : t("projets.vide.texte_lecteur")}
          actions={
            org.peutEditer && (
              <>
                <Button onClick={() => setCreation(true)}>
                  <Plus aria-hidden />
                  {t("projets.nouveau")}
                </Button>
                <Button
                  variante="contour"
                  onClick={() => chargerExemple.mutate()}
                  chargement={chargerExemple.isPending}
                >
                  <FlaskConical aria-hidden />
                  {t("projets.exemple.action")}
                </Button>
              </>
            )
          }
        />
      ) : (
        <>
          {toutesEtiquettes.length > 0 && (
            <label className="grid w-full gap-1 text-xs font-semibold text-muted-foreground sm:w-64">
              {t("etiquettes.filtre")}
              <NativeSelect
                value={etiquetteActive}
                onChange={(e) => setEtiquetteChoisie(e.target.value)}
                className="h-10 text-sm font-normal text-foreground"
              >
                <option value="">{t("etiquettes.toutes")}</option>
                {toutesEtiquettes.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projets.data
              .filter((p) => !etiquetteActive || (etiquettesParProjet.get(p.id) ?? []).includes(etiquetteActive))
              .map((projet) => (
                <li key={projet.id}>
                  <CarteProjet
                    projet={projet}
                    evaluation={evaluations.get(projet.id)}
                    evaluationEnCours={evaluationsEnCours}
                    avancement={avancements.data?.get(projet.id)}
                    etiquettes={etiquettesParProjet.get(projet.id) ?? []}
                  />
                </li>
              ))}
          </ul>
        </>
      )}

      <DialogueNouveauProjet ouvert={creation} onOuvertChange={setCreation} />
    </>
  );
}

function CarteProjet({
  projet,
  evaluation,
  evaluationEnCours,
  avancement,
  etiquettes,
}: {
  projet: ProjetListe;
  evaluation?: EvaluationProjet;
  evaluationEnCours: boolean;
  avancement?: Avancement;
  etiquettes: string[];
}) {
  const { t } = useTranslation();
  const org = useOrg();
  const [suppression, setSuppression] = useState(false);
  const peutSupprimer = org.estAdmin && org.peutEcrire;

  return (
    <article className="group flex h-full flex-col gap-4 rounded-2xl bg-card p-5 shadow-card transition-[box-shadow,transform] duration-300 ease-soft hover:scale-[1.01] hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
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
          <h2 className="text-lg leading-snug font-bold text-navy">
            <Link to={`/app/projets/${projet.id}`} className="rounded-md hover:underline">
              {projet.nom}
            </Link>
          </h2>
        </div>
        {peutSupprimer && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variante="fantome"
                taille="icone"
                className="-mt-1 -mr-2 size-9"
                aria-label={t("projets.actions", { nom: projet.nom })}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => setSuppression(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 aria-hidden className="!text-destructive" />
                {t("commun.supprimer")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {projet.description && <p className="line-clamp-2 text-sm text-muted-foreground">{projet.description}</p>}
      {etiquettes.length > 0 && (
        <ul aria-label={t("etiquettes.titre")} className="flex flex-wrap gap-1.5">
          {etiquettes.map((e) => (
            <li key={e}>
              <Badge variante="neutre">
                <Tag aria-hidden />
                {e}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2">
        {evaluationEnCours ? (
          <Skeleton className="h-2.5 w-full rounded-full" />
        ) : evaluation ? (
          <>
            <JaugeSegmentee statuts={evaluation.evaluations.map((e) => e.statut)} />
            <p className="flex justify-between gap-3 text-sm text-muted-foreground">
              <span>{t("projets.indicateurs_compte", { count: evaluation.evaluations.length })}</span>
              <span className="font-mono tabular">
                {evaluation.progression === null
                  ? t("projet.progression_aucune")
                  : `${Math.round(evaluation.progression)} %`}
              </span>
            </p>
          </>
        ) : null}
      </div>
      <dl className="mt-auto grid gap-1 border-t border-border pt-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("projets.champs.secteur")}</dt>
          <dd className="truncate font-medium">{projet.secteur?.libelle ?? t("projets.sans_secteur")}</dd>
        </div>
        {projet.programme && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("programmes.champ_projet")}</dt>
            <dd className="truncate font-medium">
              <Link to={`/app/programmes/${projet.programme.id}`} className="rounded-md hover:underline">
                {projet.programme.nom}
              </Link>
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("avancement.physique")}</dt>
          <dd
            className={
              avancement?.taux_physique == null ? "text-sm font-medium" : "font-mono text-xs font-medium tabular"
            }
          >
            {avancement?.taux_physique == null
              ? t("avancement.aucune_activite")
              : `${arrondirTaux(avancement.taux_physique)} %`}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("projets.periode")}</dt>
          <dd className="font-mono text-xs font-medium tabular">
            {formaterPeriode(projet.date_debut, projet.date_fin)}
          </dd>
        </div>
      </dl>
      <DialogueSuppressionProjet projet={projet} ouvert={suppression} onOuvertChange={setSuppression} />
    </article>
  );
}

function DialogueSuppressionProjet({
  projet,
  ouvert,
  onOuvertChange,
}: {
  projet: ProjetListe;
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
}) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const suppression = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabase().from("projects").delete().eq("id", projet.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("projets.suppression.succes", { nom: projet.nom }));
      onOuvertChange(false);
      void queryClient.invalidateQueries({ queryKey: ["projets", org.organisation.id] });
      // Les documents du projet sont supprimés avec lui : on retire aussi leurs fichiers du stockage.
      void retirerFichiersOrphelins();
    },
    onError: gererErreur,
  });

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("projets.suppression.titre", { nom: projet.nom })}</DialogTitle>
          <DialogDescription>
            {projet.is_demo ? t("projets.suppression.texte_exemple") : t("projets.suppression.texte")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variante="contour" onClick={() => onOuvertChange(false)}>
            {t("commun.annuler")}
          </Button>
          <Button variante="danger" onClick={() => suppression.mutate()} chargement={suppression.isPending}>
            <Trash2 aria-hidden />
            {t("projets.suppression.action")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
