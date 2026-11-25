import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Champ } from "~/components/ui/field";
import { Input, Textarea } from "~/components/ui/input";
import { useOrg } from "~/hooks/useContexteOrg";
import { cles, type Programme } from "~/lib/donnees";
import { getSupabase } from "~/lib/supabase";

const schema = z
  .object({
    nom: z
      .string()
      .trim()
      .min(2, { error: "programmes.validation.nom" })
      .max(160, { error: "auth.validation.trop_long" }),
    description: z.string().trim().max(4000, { error: "auth.validation.trop_long" }),
    dateDebut: z.union([z.literal(""), z.iso.date({ error: "projets.validation.date" })]),
    dateFin: z.union([z.literal(""), z.iso.date({ error: "projets.validation.date" })]),
  })
  .refine((v) => v.dateDebut === "" || v.dateFin === "" || v.dateFin >= v.dateDebut, {
    path: ["dateFin"],
    error: "programmes.validation.dates",
  });
type Valeurs = z.infer<typeof schema>;

const valeursDe = (programme?: Programme): Valeurs => ({
  nom: programme?.nom ?? "",
  description: programme?.description ?? "",
  dateDebut: programme?.date_debut ?? "",
  dateFin: programme?.date_fin ?? "",
});

/** Création ou modification d'un programme (admin et éditeur). */
export function DialogueProgramme({
  ouvert,
  onOuvertChange,
  programme,
}: {
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
  programme?: Programme;
}) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: valeursDe(programme) });

  useEffect(() => {
    if (ouvert) reset(valeursDe(programme));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, programme?.id]);

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs) => {
      const valeurs = {
        nom: v.nom,
        description: v.description || null,
        date_debut: v.dateDebut || null,
        date_fin: v.dateFin || null,
      };
      const requete = programme
        ? getSupabase().from("programmes").update(valeurs).eq("id", programme.id)
        : getSupabase()
            .from("programmes")
            .insert({ org_id: org.organisation.id, ...valeurs });
      const { error } = await requete;
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(programme ? t("programmes.modification.succes") : t("programmes.creation.succes", { nom: v.nom }));
      onOuvertChange(false);
      void queryClient.invalidateQueries({ queryKey: cles.programmes(org.organisation.id) });
      void queryClient.invalidateQueries({ queryKey: cles.avancementsProgrammes(org.organisation.id) });
    },
    onError: gererErreur,
  });

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);
  const formulaire = "formulaire-programme";

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{programme ? t("programmes.modification.titre") : t("programmes.creation.titre")}</DialogTitle>
          <DialogDescription>{programme ? programme.nom : t("programmes.creation.description")}</DialogDescription>
        </DialogHeader>
        <form id={formulaire} onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate className="grid gap-4">
          <Champ id="programme-nom" libelle={t("programmes.champs.nom")} erreur={erreur(errors.nom?.message)}>
            {(a) => <Input {...a} {...register("nom")} />}
          </Champ>
          <Champ
            id="programme-description"
            libelle={t("programmes.champs.description")}
            optionnel
            erreur={erreur(errors.description?.message)}
          >
            {(a) => <Textarea {...a} rows={3} {...register("description")} />}
          </Champ>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ
              id="programme-debut"
              libelle={t("programmes.champs.date_debut")}
              optionnel
              erreur={erreur(errors.dateDebut?.message)}
            >
              {(a) => <Input {...a} type="date" {...register("dateDebut")} />}
            </Champ>
            <Champ
              id="programme-fin"
              libelle={t("programmes.champs.date_fin")}
              optionnel
              erreur={erreur(errors.dateFin?.message)}
            >
              {(a) => <Input {...a} type="date" {...register("dateFin")} />}
            </Champ>
          </div>
        </form>
        <DialogFooter>
          <Button variante="contour" onClick={() => onOuvertChange(false)}>
            {t("commun.annuler")}
          </Button>
          <Button type="submit" form={formulaire} chargement={enregistrer.isPending}>
            {programme ? t("programmes.modification.action") : t("programmes.creation.action")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
