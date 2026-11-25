import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { STATUTS_PROJET } from "~/components/app/StatutProjet";
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
import { Input, NativeSelect, Textarea } from "~/components/ui/input";
import { useOrg } from "~/hooks/useContexteOrg";
import { useProgrammes } from "~/lib/donnees";
import { getSupabase } from "~/lib/supabase";

export const DEVISES = ["XOF", "XAF", "EUR", "USD", "GNF"] as const;

const schema = z
  .object({
    nom: z.string().trim().min(2, { error: "projets.validation.nom" }).max(160, { error: "auth.validation.trop_long" }),
    description: z.string().trim().max(4000, { error: "auth.validation.trop_long" }),
    dateDebut: z.iso.date({ error: "projets.validation.date" }),
    dateFin: z.iso.date({ error: "projets.validation.date" }),
    secteurId: z.string(),
    programmeId: z.string(),
    statut: z.enum(STATUTS_PROJET as [string, ...string[]]),
    budget: z
      .string()
      .trim()
      .refine(
        (v) =>
          v === "" ||
          (/^\d+([.,]\d{1,2})?$/.test(v.replace(/\s/g, "")) && Number(v.replace(/\s/g, "").replace(",", ".")) >= 0),
        {
          error: "projets.validation.budget",
        },
      ),
    devise: z.enum(DEVISES),
  })
  .refine((v) => v.dateFin >= v.dateDebut, { path: ["dateFin"], error: "projets.validation.dates" });
type Valeurs = z.infer<typeof schema>;

export function DialogueNouveauProjet({
  ouvert,
  onOuvertChange,
}: {
  ouvert: boolean;
  onOuvertChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();

  const programmes = useProgrammes(org.organisation.id);
  const secteurs = useQuery({
    queryKey: ["secteurs"],
    staleTime: Infinity,
    enabled: ouvert,
    queryFn: async () => {
      const { data, error } = await getSupabase().from("secteurs").select("id, libelle").order("ordre");
      if (error) throw error;
      return data;
    },
  });

  const valeursInitiales: Valeurs = {
    nom: "",
    description: "",
    dateDebut: "",
    dateFin: "",
    secteurId: "",
    programmeId: "",
    statut: "non_demarre",
    budget: "",
    devise: (DEVISES as readonly string[]).includes(org.organisation.devise_defaut)
      ? (org.organisation.devise_defaut as Valeurs["devise"])
      : "XOF",
  };
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: valeursInitiales });

  useEffect(() => {
    if (ouvert) reset(valeursInitiales);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  const creation = useMutation({
    mutationFn: async (v: Valeurs) => {
      const { error } = await getSupabase()
        .from("projects")
        .insert({
          org_id: org.organisation.id,
          nom: v.nom,
          description: v.description || null,
          date_debut: v.dateDebut,
          date_fin: v.dateFin,
          secteur_id: v.secteurId ? Number(v.secteurId) : null,
          programme_id: v.programmeId || null,
          statut: v.statut as (typeof STATUTS_PROJET)[number],
          budget: v.budget ? Number(v.budget.replace(/\s/g, "").replace(",", ".")) : null,
          devise: v.devise,
        });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(t("projets.creation.succes", { nom: v.nom }));
      onOuvertChange(false);
      void queryClient.invalidateQueries({ queryKey: ["projets", org.organisation.id] });
      void queryClient.invalidateQueries({ queryKey: ["avancements", org.organisation.id] });
      void queryClient.invalidateQueries({ queryKey: ["avancements-programmes", org.organisation.id] });
    },
    onError: gererErreur,
  });

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("projets.creation.titre")}</DialogTitle>
          <DialogDescription>{t("projets.creation.description")}</DialogDescription>
        </DialogHeader>
        <form id="nouveau-projet" onSubmit={handleSubmit((v) => creation.mutate(v))} noValidate className="grid gap-4">
          <Champ id="projet-nom" libelle={t("projets.champs.nom")} erreur={erreur(errors.nom?.message)}>
            {(a) => <Input {...a} {...register("nom")} />}
          </Champ>
          <Champ
            id="projet-description"
            libelle={t("projets.champs.description")}
            optionnel
            erreur={erreur(errors.description?.message)}
          >
            {(a) => <Textarea {...a} rows={3} {...register("description")} />}
          </Champ>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ
              id="projet-debut"
              libelle={t("projets.champs.date_debut")}
              erreur={erreur(errors.dateDebut?.message)}
            >
              {(a) => <Input {...a} type="date" {...register("dateDebut")} />}
            </Champ>
            <Champ id="projet-fin" libelle={t("projets.champs.date_fin")} erreur={erreur(errors.dateFin?.message)}>
              {(a) => <Input {...a} type="date" {...register("dateFin")} />}
            </Champ>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ id="projet-secteur" libelle={t("projets.champs.secteur")} optionnel>
              {(a) => (
                <NativeSelect {...a} {...register("secteurId")} disabled={secteurs.isPending}>
                  <option value="">{secteurs.isPending ? t("commun.chargement") : t("projets.choisir_secteur")}</option>
                  {secteurs.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.libelle}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Champ>
            <Champ id="projet-statut" libelle={t("projets.champs.statut")}>
              {(a) => (
                <NativeSelect {...a} {...register("statut")}>
                  {STATUTS_PROJET.map((s) => (
                    <option key={s} value={s}>
                      {t(`projets.statuts.${s}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Champ>
          </div>
          {programmes.data && programmes.data.length > 0 && (
            <Champ id="projet-programme" libelle={t("programmes.champ_projet")} optionnel>
              {(a) => (
                <NativeSelect {...a} {...register("programmeId")}>
                  <option value="">{t("programmes.aucun")}</option>
                  {programmes.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Champ>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-4">
            <Champ
              id="projet-budget"
              libelle={t("projets.champs.budget")}
              optionnel
              erreur={erreur(errors.budget?.message)}
            >
              {(a) => <Input {...a} inputMode="decimal" placeholder="25 000 000" {...register("budget")} />}
            </Champ>
            <Champ id="projet-devise" libelle={t("projets.champs.devise")}>
              {(a) => (
                <NativeSelect {...a} {...register("devise")}>
                  {DEVISES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Champ>
          </div>
        </form>
        <DialogFooter>
          <Button variante="contour" onClick={() => onOuvertChange(false)}>
            {t("commun.annuler")}
          </Button>
          <Button type="submit" form="nouveau-projet" chargement={creation.isPending}>
            {t("projets.creation.action")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
