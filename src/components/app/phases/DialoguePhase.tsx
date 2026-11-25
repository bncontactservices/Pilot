import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Champ } from "~/components/ui/field";
import { Input, Textarea } from "~/components/ui/input";
import { prochainOrdre } from "~/lib/cadre-logique";
import { clesSe, type Phase } from "~/lib/donnees-se";
import { getSupabase } from "~/lib/supabase";

const dateFacultative = z.union([z.literal(""), z.iso.date({ error: "projets.validation.date" })]);
const schema = z
  .object({
    nom: z
      .string()
      .trim()
      .min(2, { error: "phases.formulaire_phase.validation.nom" })
      .max(120, { error: "phases.formulaire_phase.validation.nom" }),
    description: z.string().trim().max(2000, { error: "auth.validation.trop_long" }),
    dateDebut: dateFacultative,
    dateFin: dateFacultative,
  })
  .refine((v) => v.dateDebut === "" || v.dateFin === "" || v.dateFin >= v.dateDebut, {
    path: ["dateFin"],
    error: "phases.formulaire_phase.validation.dates",
  });
type Valeurs = z.infer<typeof schema>;

const valeursDe = (phase: Phase | null): Valeurs => ({
  nom: phase?.nom ?? "",
  description: phase?.description ?? "",
  dateDebut: phase?.date_debut ?? "",
  dateFin: phase?.date_fin ?? "",
});

/** Création ou modification d'une phase (grande période du projet). */
export function DialoguePhase({
  ouvert,
  onFermer,
  projetId,
  phase,
  phases,
}: {
  ouvert: boolean;
  onFermer: () => void;
  projetId: string;
  phase: Phase | null;
  phases: Phase[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: valeursDe(phase) });

  useEffect(() => {
    if (ouvert) reset(valeursDe(phase));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, phase?.id]);

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs) => {
      const champs = {
        nom: v.nom,
        description: v.description || null,
        date_debut: v.dateDebut || null,
        date_fin: v.dateFin || null,
      };
      const requete = phase
        ? getSupabase().from("phases").update(champs).eq("id", phase.id)
        : getSupabase()
            .from("phases")
            .insert({ project_id: projetId, ...champs, ordre: prochainOrdre(phases) });
      const { error } = await requete;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t(phase ? "phases.formulaire_phase.modifie" : "phases.formulaire_phase.cree"));
      onFermer();
      void queryClient.invalidateQueries({ queryKey: clesSe.phases(projetId) });
    },
    onError: gererErreur,
  });

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(phase ? "phases.formulaire_phase.titre_modifier" : "phases.formulaire_phase.titre_creer")}
          </DialogTitle>
        </DialogHeader>
        <form
          id="formulaire-phase"
          onSubmit={handleSubmit((v) => enregistrer.mutate(v))}
          noValidate
          className="grid gap-4"
        >
          <Champ id="phase-nom" libelle={t("phases.formulaire_phase.nom")} erreur={erreur(errors.nom?.message)}>
            {(a) => <Input {...a} {...register("nom")} />}
          </Champ>
          <Champ
            id="phase-description"
            libelle={t("phases.formulaire_phase.description")}
            optionnel
            erreur={erreur(errors.description?.message)}
          >
            {(a) => <Textarea {...a} rows={2} {...register("description")} />}
          </Champ>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ
              id="phase-debut"
              libelle={t("phases.formulaire_phase.date_debut")}
              optionnel
              erreur={erreur(errors.dateDebut?.message)}
            >
              {(a) => <Input {...a} type="date" {...register("dateDebut")} />}
            </Champ>
            <Champ
              id="phase-fin"
              libelle={t("phases.formulaire_phase.date_fin")}
              optionnel
              erreur={erreur(errors.dateFin?.message)}
            >
              {(a) => <Input {...a} type="date" {...register("dateFin")} />}
            </Champ>
          </div>
        </form>
        <DialogFooter>
          <Button variante="contour" onClick={onFermer}>
            {t("commun.annuler")}
          </Button>
          <Button type="submit" form="formulaire-phase" chargement={enregistrer.isPending}>
            {t(phase ? "phases.formulaire_phase.action_modifier" : "phases.formulaire_phase.action_creer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
