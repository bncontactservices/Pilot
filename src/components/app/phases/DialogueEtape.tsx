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
import { Input, NativeSelect, Textarea } from "~/components/ui/input";
import { useOrg } from "~/hooks/useContexteOrg";
import { STATUTS_TRAVAIL } from "~/lib/avancement";
import { clesSe, type Etape, invaliderAvancement, type Phase } from "~/lib/donnees-se";
import { getSupabase } from "~/lib/supabase";

const schema = z
  .object({
    nom: z
      .string()
      .trim()
      .min(2, { error: "phases.formulaire_etape.validation.nom" })
      .max(200, { error: "phases.formulaire_etape.validation.nom" }),
    description: z.string().trim().max(2000, { error: "auth.validation.trop_long" }),
    type: z.enum(["jalon", "livrable"]),
    phaseId: z.string(),
    datePrevue: z.iso.date({ error: "phases.formulaire_etape.validation.date" }),
    dateReelle: z.union([z.literal(""), z.iso.date({ error: "phases.formulaire_etape.validation.date" })]),
    statut: z.enum(STATUTS_TRAVAIL as [string, ...string[]]),
  })
  .strict();
type Valeurs = z.infer<typeof schema>;

const valeursDe = (etape: Etape | null, phaseId: string): Valeurs => ({
  nom: etape?.nom ?? "",
  description: etape?.description ?? "",
  type: etape?.type ?? "jalon",
  phaseId: etape ? (etape.phase_id ?? "") : phaseId,
  datePrevue: etape?.date_prevue ?? "",
  dateReelle: etape?.date_reelle ?? "",
  statut: etape?.statut ?? "a_faire",
});

/** Création ou modification d'une étape (jalon ou livrable daté, rattaché ou non à une phase). */
export function DialogueEtape({
  ouvert,
  onFermer,
  projetId,
  etape,
  phases,
  phaseParDefaut = "",
}: {
  ouvert: boolean;
  onFermer: () => void;
  projetId: string;
  etape: Etape | null;
  phases: Phase[];
  phaseParDefaut?: string;
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
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: valeursDe(etape, phaseParDefaut) });

  useEffect(() => {
    if (ouvert) reset(valeursDe(etape, phaseParDefaut));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, etape?.id, phaseParDefaut]);

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs) => {
      const champs = {
        nom: v.nom,
        description: v.description || null,
        type: v.type,
        phase_id: v.phaseId || null,
        date_prevue: v.datePrevue,
        date_reelle: v.dateReelle || null,
        statut: v.statut as Etape["statut"],
      };
      const requete = etape
        ? getSupabase().from("etapes").update(champs).eq("id", etape.id)
        : getSupabase()
            .from("etapes")
            .insert({ project_id: projetId, ...champs });
      const { error } = await requete;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t(etape ? "phases.formulaire_etape.modifie" : "phases.formulaire_etape.cree"));
      onFermer();
      void queryClient.invalidateQueries({ queryKey: clesSe.etapes(projetId) });
      invaliderAvancement(queryClient, org.organisation.id);
    },
    onError: gererErreur,
  });

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(etape ? "phases.formulaire_etape.titre_modifier" : "phases.formulaire_etape.titre_creer")}
          </DialogTitle>
        </DialogHeader>
        <form
          id="formulaire-etape"
          onSubmit={handleSubmit((v) => enregistrer.mutate(v))}
          noValidate
          className="grid gap-4"
        >
          <Champ id="etape-nom" libelle={t("phases.formulaire_etape.nom")} erreur={erreur(errors.nom?.message)}>
            {(a) => <Input {...a} {...register("nom")} />}
          </Champ>
          <Champ
            id="etape-description"
            libelle={t("phases.formulaire_etape.description")}
            optionnel
            erreur={erreur(errors.description?.message)}
          >
            {(a) => <Textarea {...a} rows={2} {...register("description")} />}
          </Champ>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ id="etape-type" libelle={t("phases.formulaire_etape.type")}>
              {(a) => (
                <NativeSelect {...a} {...register("type")}>
                  <option value="jalon">{t("phases.type.jalon")}</option>
                  <option value="livrable">{t("phases.type.livrable")}</option>
                </NativeSelect>
              )}
            </Champ>
            <Champ id="etape-phase" libelle={t("phases.formulaire_etape.phase")}>
              {(a) => (
                <NativeSelect {...a} {...register("phaseId")}>
                  <option value="">{t("phases.formulaire_etape.aucune_phase")}</option>
                  {phases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Champ>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ
              id="etape-prevue"
              libelle={t("phases.formulaire_etape.date_prevue")}
              erreur={erreur(errors.datePrevue?.message)}
            >
              {(a) => <Input {...a} type="date" {...register("datePrevue")} />}
            </Champ>
            <Champ
              id="etape-reelle"
              libelle={t("phases.formulaire_etape.date_reelle")}
              aide={t("phases.formulaire_etape.date_reelle_aide")}
              optionnel
              erreur={erreur(errors.dateReelle?.message)}
            >
              {(a) => <Input {...a} type="date" {...register("dateReelle")} />}
            </Champ>
          </div>
          <Champ id="etape-statut" libelle={t("phases.formulaire_etape.statut")}>
            {(a) => (
              <NativeSelect {...a} {...register("statut")}>
                {STATUTS_TRAVAIL.map((s) => (
                  <option key={s} value={s}>
                    {t(`travail.statuts.${s}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Champ>
        </form>
        <DialogFooter>
          <Button variante="contour" onClick={onFermer}>
            {t("commun.annuler")}
          </Button>
          <Button type="submit" form="formulaire-etape" chargement={enregistrer.isPending}>
            {t(etape ? "phases.formulaire_etape.action_modifier" : "phases.formulaire_etape.action_creer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
