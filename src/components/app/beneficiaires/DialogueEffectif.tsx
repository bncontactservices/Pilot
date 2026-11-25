import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import { Champ } from "~/components/ui/field";
import { Input, NativeSelect } from "~/components/ui/input";
import { SEXES, TRANCHES_AGE } from "~/lib/beneficiaires";
import { clesSe, type EffectifBeneficiaires } from "~/lib/donnees-se";
import { aujourdhuiIso } from "~/lib/kpi";
import { getSupabase } from "~/lib/supabase";

const nettoyer = (v: string) => v.replace(/\s/g, "");

const schema = z
  .object({
    periodeDebut: z.iso.date({ error: "beneficiaires.formulaire.validation.date" }),
    periodeFin: z.iso.date({ error: "beneficiaires.formulaire.validation.date" }),
    categorie: z
      .string()
      .trim()
      .min(1, { error: "beneficiaires.formulaire.validation.categorie" })
      .max(120, { error: "beneficiaires.formulaire.validation.categorie" }),
    sexe: z.enum(SEXES as [string, ...string[]]),
    trancheAge: z.enum(TRANCHES_AGE as [string, ...string[]]),
    effectif: z.string().refine((v) => /^\d{1,9}$/.test(nettoyer(v)) && Number(nettoyer(v)) <= 100_000_000, {
      error: "beneficiaires.formulaire.validation.effectif",
    }),
    lieu: z.string().trim().max(160, { error: "auth.validation.trop_long" }),
  })
  .superRefine((v, ctx) => {
    if (v.periodeDebut && v.periodeFin && v.periodeFin < v.periodeDebut) {
      ctx.addIssue({ code: "custom", path: ["periodeFin"], message: "beneficiaires.formulaire.validation.periode" });
    }
  });
type Valeurs = z.infer<typeof schema>;

type Props = {
  ouvert: boolean;
  onFermer: () => void;
  projetId: string;
  /** Effectif à modifier ; absent pour une saisie. */
  effectif: EffectifBeneficiaires | null;
  /** Catégories déjà saisies, proposées pour garder les mêmes intitulés d'une période à l'autre. */
  categoriesExistantes: string[];
  /** Période proposée à une nouvelle saisie : celle de la dernière ligne. */
  periodeSuggeree: { debut: string; fin: string };
};

/** Saisie ou modification d'un effectif agrégé de bénéficiaires (jamais une personne). */
export function DialogueEffectif(props: Props) {
  const { ouvert, onFermer, effectif } = props;
  return (
    <Drawer open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DrawerContent>{ouvert && <Corps key={effectif?.id ?? "nouveau"} {...props} />}</DrawerContent>
    </Drawer>
  );
}

function Corps({ onFermer, projetId, effectif, categoriesExistantes, periodeSuggeree }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Valeurs>({
    resolver: zodResolver(schema),
    defaultValues: {
      periodeDebut: effectif?.periode_debut ?? periodeSuggeree.debut,
      periodeFin: effectif?.periode_fin ?? periodeSuggeree.fin,
      categorie: effectif?.categorie ?? "",
      sexe: effectif?.sexe ?? "non_precise",
      trancheAge: effectif?.tranche_age ?? "non_precise",
      effectif: effectif ? String(effectif.effectif) : "",
      lieu: effectif?.lieu ?? "",
    },
  });

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs) => {
      const champs = {
        periode_debut: v.periodeDebut,
        periode_fin: v.periodeFin,
        categorie: v.categorie,
        sexe: v.sexe as EffectifBeneficiaires["sexe"],
        tranche_age: v.trancheAge as EffectifBeneficiaires["tranche_age"],
        effectif: Number(nettoyer(v.effectif)),
        lieu: v.lieu || null,
      };
      const requete = effectif
        ? getSupabase().from("beneficiaires_effectifs").update(champs).eq("id", effectif.id)
        : getSupabase()
            .from("beneficiaires_effectifs")
            .insert({ project_id: projetId, ...champs });
      const { error } = await requete;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t(effectif ? "beneficiaires.formulaire.modifie" : "beneficiaires.formulaire.cree"));
      onFermer();
      void queryClient.invalidateQueries({ queryKey: clesSe.effectifs(projetId) });
    },
    onError: (erreur) => {
      // La même combinaison ne se saisit qu'une fois : on le dit précisément plutôt que « existe déjà ».
      if ((erreur as { code?: string }).code === "23505") toast.error(t("beneficiaires.formulaire.doublon"));
      else gererErreur(erreur);
    },
  });

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);
  const formulaire = "formulaire-effectif";
  return (
    <>
      <DrawerHeader>
        <DrawerTitle className="text-xl font-bold text-navy">
          {t(effectif ? "beneficiaires.formulaire.titre_modifier" : "beneficiaires.formulaire.titre_creer")}
        </DrawerTitle>
        <DrawerDescription className="text-sm text-muted-foreground">
          {t("beneficiaires.formulaire.description")}
        </DrawerDescription>
      </DrawerHeader>
      <DrawerBody>
        <form id={formulaire} onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate className="grid gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ
              id="effectif-debut"
              libelle={t("beneficiaires.formulaire.debut")}
              erreur={erreur(errors.periodeDebut?.message)}
            >
              {(a) => <Input {...a} type="date" max={aujourdhuiIso()} {...register("periodeDebut")} />}
            </Champ>
            <Champ
              id="effectif-fin"
              libelle={t("beneficiaires.formulaire.fin")}
              erreur={erreur(errors.periodeFin?.message)}
            >
              {(a) => <Input {...a} type="date" max={aujourdhuiIso()} {...register("periodeFin")} />}
            </Champ>
          </div>
          <Champ
            id="effectif-categorie"
            libelle={t("beneficiaires.formulaire.categorie")}
            aide={t("beneficiaires.formulaire.categorie_aide")}
            erreur={erreur(errors.categorie?.message)}
          >
            {(a) => <Input {...a} list="effectif-categories" autoComplete="off" {...register("categorie")} />}
          </Champ>
          {categoriesExistantes.length > 0 && (
            <datalist id="effectif-categories">
              {categoriesExistantes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ id="effectif-sexe" libelle={t("beneficiaires.formulaire.sexe")}>
              {(a) => (
                <NativeSelect {...a} {...register("sexe")}>
                  {SEXES.map((s) => (
                    <option key={s} value={s}>
                      {t(`beneficiaires.sexes.${s}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Champ>
            <Champ id="effectif-tranche" libelle={t("beneficiaires.formulaire.tranche")}>
              {(a) => (
                <NativeSelect {...a} {...register("trancheAge")}>
                  {TRANCHES_AGE.map((tr) => (
                    <option key={tr} value={tr}>
                      {t(`beneficiaires.tranches.${tr}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Champ>
          </div>
          <Champ
            id="effectif-nombre"
            libelle={t("beneficiaires.formulaire.effectif")}
            aide={t("beneficiaires.formulaire.effectif_aide")}
            erreur={erreur(errors.effectif?.message)}
          >
            {(a) => <Input {...a} inputMode="numeric" placeholder="1 250" {...register("effectif")} />}
          </Champ>
          <Champ
            id="effectif-lieu"
            libelle={t("beneficiaires.formulaire.lieu")}
            aide={t("beneficiaires.formulaire.lieu_aide")}
            optionnel
            erreur={erreur(errors.lieu?.message)}
          >
            {(a) => <Input {...a} {...register("lieu")} />}
          </Champ>
        </form>
      </DrawerBody>
      <DrawerFooter>
        <Button variante="contour" onClick={onFermer}>
          {t("commun.annuler")}
        </Button>
        <Button type="submit" form={formulaire} chargement={enregistrer.isPending}>
          {t(effectif ? "beneficiaires.formulaire.action_modifier" : "beneficiaires.formulaire.action_creer")}
        </Button>
      </DrawerFooter>
    </>
  );
}
