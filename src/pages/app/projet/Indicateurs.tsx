import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EtatVide, JaugeVide } from "~/components/app/Etats";
import { FormulaireKpi } from "~/components/app/kpi/FormulaireKpi";
import { useGestionErreur } from "~/components/app/LimitePlan";
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
import { useOrg } from "~/hooks/useContexteOrg";
import i18n from "~/i18n";
import { MAX_KPI_EPINGLES } from "~/lib/constants";
import { cles, type Kpi } from "~/lib/donnees";
import { formaterNombre } from "~/lib/format";
import { getSupabase } from "~/lib/supabase";
import { cn } from "~/lib/utils";
import { useContexteProjet } from "../ProjetLayout";

export const meta = () => [{ title: i18n.t("kpi.meta") }];

export default function Indicateurs() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const { projet, kpis, saisies } = useContexteProjet();
  const [edition, setEdition] = useState<Kpi | "nouveau" | null>(null);
  const [suppression, setSuppression] = useState<Kpi | null>(null);

  const ordonnes = useMemo(
    () => [...kpis].sort((a, b) => a.ordre - b.ordre || (a.created_at < b.created_at ? -1 : 1)),
    [kpis],
  );
  const nbEpingles = kpis.filter((k) => k.epingle).length;
  const limite = org.limites.kpis;
  const peutModifier = org.peutEditer && !projet.is_demo;

  const capteurs = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: cles.kpis(projet.id) });
    void queryClient.invalidateQueries({ queryKey: cles.orgKpis(org.organisation.id) });
  };

  const reordonner = useMutation({
    mutationFn: async (liste: Kpi[]) => {
      const modifies = liste.filter((k) => kpis.find((x) => x.id === k.id)?.ordre !== k.ordre);
      await Promise.all(
        modifies.map(async (k) => {
          const { error } = await getSupabase().from("kpis").update({ ordre: k.ordre }).eq("id", k.id);
          if (error) throw error;
        }),
      );
    },
    onMutate: async (liste) => {
      await queryClient.cancelQueries({ queryKey: cles.kpis(projet.id) });
      const precedent = queryClient.getQueryData<Kpi[]>(cles.kpis(projet.id));
      queryClient.setQueryData(cles.kpis(projet.id), liste);
      return { precedent };
    },
    onError: (erreur, _liste, contexte) => {
      queryClient.setQueryData(cles.kpis(projet.id), contexte?.precedent);
      gererErreur(erreur);
    },
    onSettled: rafraichir,
  });

  const epingler = useMutation({
    mutationFn: async ({ kpi, epingle }: { kpi: Kpi; epingle: boolean }) => {
      const { error } = await getSupabase().from("kpis").update({ epingle }).eq("id", kpi.id);
      if (error) throw error;
    },
    onError: gererErreur,
    onSettled: rafraichir,
  });

  const supprimer = useMutation({
    mutationFn: async (kpi: Kpi) => {
      const { error } = await getSupabase().from("kpis").delete().eq("id", kpi.id);
      if (error) throw error;
      return kpi;
    },
    onSuccess: (kpi) => {
      toast.success(t("kpi.suppression.succes", { nom: kpi.nom }));
      setSuppression(null);
      void queryClient.invalidateQueries({ queryKey: cles.saisies(projet.id) });
      rafraichir();
    },
    onError: gererErreur,
  });

  function surFinDeplacement({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ancien = ordonnes.findIndex((k) => k.id === active.id);
    const nouveau = ordonnes.findIndex((k) => k.id === over.id);
    reordonner.mutate(arrayMove(ordonnes, ancien, nouveau).map((k, i) => ({ ...k, ordre: i + 1 })));
  }

  function basculerEpingle(kpi: Kpi) {
    if (!kpi.epingle && nbEpingles >= MAX_KPI_EPINGLES) {
      toast.error(t("erreurs.KPI_EPINGLES_MAX"));
      return;
    }
    epingler.mutate({ kpi, epingle: !kpi.epingle });
  }

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-1">
          <h2 className="text-xl font-bold text-navy">{t("kpi.titre")}</h2>
          <p className="text-sm text-muted-foreground">
            {projet.is_demo
              ? t("kpi.compte_exemple", { count: kpis.length })
              : limite === null
                ? t("kpi.quota_illimite", { count: kpis.length })
                : t("kpi.quota", { count: kpis.length, limite })}
            {" · "}
            {t("kpi.epingles", { count: nbEpingles, max: MAX_KPI_EPINGLES })}
          </p>
        </div>
        {peutModifier && (
          <Button onClick={() => setEdition("nouveau")}>
            <Plus aria-hidden />
            {t("kpi.nouveau")}
          </Button>
        )}
      </div>

      {projet.is_demo && org.peutEditer && <Bandeau>{t("kpi.exemple_info")}</Bandeau>}
      {!org.peutEditer && <Bandeau>{t("kpi.lecture_seule")}</Bandeau>}

      {ordonnes.length === 0 ? (
        <EtatVide
          visuel={<JaugeVide />}
          titre={t("kpi.vide.titre")}
          description={peutModifier ? t("kpi.vide.texte") : t("kpi.vide.texte_lecture")}
          actions={
            peutModifier && (
              <Button onClick={() => setEdition("nouveau")}>
                <Plus aria-hidden />
                {t("kpi.nouveau")}
              </Button>
            )
          }
        />
      ) : (
        <DndContext sensors={capteurs} collisionDetection={closestCenter} onDragEnd={surFinDeplacement}>
          <SortableContext items={ordonnes.map((k) => k.id)} strategy={verticalListSortingStrategy}>
            <ul className="grid grid-cols-1 gap-3">
              {ordonnes.map((kpi) => (
                <LigneKpi
                  key={kpi.id}
                  kpi={kpi}
                  deplacable={org.peutEditer}
                  modifiable={peutModifier}
                  onEpingler={() => basculerEpingle(kpi)}
                  onModifier={() => setEdition(kpi)}
                  onSupprimer={() => setSuppression(kpi)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <FormulaireKpi
        ouvert={edition !== null}
        onOuvertChange={(ouvert) => !ouvert && setEdition(null)}
        projet={projet}
        kpi={edition === "nouveau" ? null : edition}
        kpis={kpis}
      />

      <Dialog open={suppression !== null} onOpenChange={(ouvert) => !ouvert && setSuppression(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("kpi.suppression.titre", { nom: suppression?.nom })}</DialogTitle>
            <DialogDescription>
              {t("kpi.suppression.texte", { count: saisies.filter((s) => s.kpi_id === suppression?.id).length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variante="contour" onClick={() => setSuppression(null)}>
              {t("commun.annuler")}
            </Button>
            <Button
              variante="danger"
              onClick={() => suppression && supprimer.mutate(suppression)}
              chargement={supprimer.isPending}
            >
              <Trash2 aria-hidden />
              {t("kpi.suppression.action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LigneKpi({
  kpi,
  deplacable,
  modifiable,
  onEpingler,
  onModifier,
  onSupprimer,
}: {
  kpi: Kpi;
  deplacable: boolean;
  modifiable: boolean;
  onEpingler: () => void;
  onModifier: () => void;
  onSupprimer: () => void;
}) {
  const { t } = useTranslation();
  const org = useOrg();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: kpi.id,
    disabled: !deplacable,
  });
  const unite = kpi.unite ? ` ${kpi.unite}` : "";

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-start gap-3 rounded-2xl bg-card p-4 shadow-card",
        isDragging && "relative z-10 shadow-card-hover",
      )}
    >
      {deplacable && (
        <button
          type="button"
          className="mt-0.5 -ml-1 cursor-grab touch-none rounded-lg p-1.5 text-muted-foreground hover:bg-subtle hover:text-foreground active:cursor-grabbing"
          aria-label={t("kpi.deplacer", { nom: kpi.nom })}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" aria-hidden />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-bold text-navy">{kpi.nom}</p>
        {kpi.description && <p className="mt-0.5 text-sm text-muted-foreground">{kpi.description}</p>}
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <Fait libelle={t("kpi.champs.base")} valeur={`${formaterNombre(kpi.valeur_base)}${unite}`} mono />
          <Fait libelle={t("kpi.champs.cible")} valeur={`${formaterNombre(kpi.cible)}${unite}`} mono />
          <Fait libelle={t("kpi.champs.frequence")} valeur={t(`kpi.frequences.${kpi.frequence}`)} />
          <Fait libelle={t("kpi.champs.calcul")} valeur={t(`kpi.agregations.${kpi.type_agregation}`)} />
          <Fait libelle={t("kpi.champs.sens")} valeur={t(`kpi.sens.${kpi.sens}`)} />
        </dl>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {org.peutEditer ? (
          <Button
            variante="fantome"
            taille="icone"
            className="size-9"
            onClick={onEpingler}
            aria-pressed={kpi.epingle}
            aria-label={t(kpi.epingle ? "kpi.desepingler" : "kpi.epingler", { nom: kpi.nom })}
          >
            <Star className={cn("size-[1.125rem]", kpi.epingle && "fill-accent text-accent-ink")} aria-hidden />
          </Button>
        ) : (
          kpi.epingle && (
            <Star className="mr-2 size-[1.125rem] fill-accent text-accent-ink" aria-label={t("kpi.epingle")} />
          )
        )}
        {modifiable && (
          <>
            <Button
              variante="fantome"
              taille="icone"
              className="size-9"
              onClick={onModifier}
              aria-label={t("kpi.modifier", { nom: kpi.nom })}
            >
              <Pencil className="size-[1.125rem]" aria-hidden />
            </Button>
            <Button
              variante="fantome"
              taille="icone"
              className="size-9"
              onClick={onSupprimer}
              aria-label={t("kpi.supprimer", { nom: kpi.nom })}
            >
              <Trash2 className="size-[1.125rem]" aria-hidden />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function Fait({ libelle, valeur, mono }: { libelle: string; valeur: string; mono?: boolean }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted-foreground">{libelle}</dt>
      <dd className={cn("font-medium", mono && "font-mono text-xs leading-5 tabular")}>{valeur}</dd>
    </div>
  );
}
