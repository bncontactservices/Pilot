import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { TauxAvancement } from "~/components/app/TauxAvancement";
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
import { Input, Textarea } from "~/components/ui/input";
import { clesSe, type EtatAvancement, type Realisation } from "~/lib/donnees-se";
import { formaterDate } from "~/lib/format";
import { dansLaPeriode } from "~/lib/suivi";
import { getSupabase } from "~/lib/supabase";

const schema = z
  .object({
    titre: z
      .string()
      .trim()
      .min(2, { error: "etatsAvancement.formulaire.validation.titre" })
      .max(160, { error: "etatsAvancement.formulaire.validation.titre" }),
    periodeDebut: z.iso.date({ error: "etatsAvancement.formulaire.validation.date" }),
    periodeFin: z.iso.date({ error: "etatsAvancement.formulaire.validation.date" }),
    faits: z.string().trim().max(8000, { error: "auth.validation.trop_long" }),
    difficultes: z.string().trim().max(8000, { error: "auth.validation.trop_long" }),
    risques: z.string().trim().max(8000, { error: "auth.validation.trop_long" }),
  })
  .refine((v) => !v.periodeDebut || !v.periodeFin || v.periodeFin >= v.periodeDebut, {
    path: ["periodeFin"],
    error: "etatsAvancement.formulaire.validation.periode",
  });
type Valeurs = z.infer<typeof schema>;

type Props = {
  ouvert: boolean;
  onFermer: () => void;
  projetId: string;
  etat: EtatAvancement | null;
  /** Période et titre proposés pour un nouvel état. */
  depart: { debut: string; fin: string; titre: string };
  /** Taux affichés aujourd'hui : ceux que la base enregistrera avec le nouvel état. */
  tauxActuels: { resultats: number | null; physique: number | null };
  realisations: Pick<Realisation, "date">[];
};

/** Rédaction d'un état d'avancement : une période, ce qui s'est passé, ce qui bloque, ce qui menace. */
export function DialogueEtat(props: Props) {
  const { ouvert, onFermer, etat } = props;
  return (
    <Drawer open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DrawerContent>{ouvert && <Corps key={etat?.id ?? "nouvel"} {...props} />}</DrawerContent>
    </Drawer>
  );
}

function Corps({ onFermer, projetId, etat, depart, tauxActuels, realisations }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<Valeurs>({
    resolver: zodResolver(schema),
    defaultValues: {
      titre: etat?.titre ?? depart.titre,
      periodeDebut: etat?.periode_debut ?? depart.debut,
      periodeFin: etat?.periode_fin ?? depart.fin,
      faits: etat?.faits_marquants ?? "",
      difficultes: etat?.difficultes ?? "",
      risques: etat?.risques ?? "",
    },
  });
  const [debut, fin] = useWatch({ control, name: ["periodeDebut", "periodeFin"] });
  const dansPeriode = debut && fin ? dansLaPeriode(realisations, debut, fin).length : 0;

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs) => {
      const champs = {
        titre: v.titre,
        periode_debut: v.periodeDebut,
        periode_fin: v.periodeFin,
        faits_marquants: v.faits || null,
        difficultes: v.difficultes || null,
        risques: v.risques || null,
      };
      const requete = etat
        ? getSupabase().from("etats_avancement").update(champs).eq("id", etat.id)
        : getSupabase()
            .from("etats_avancement")
            .insert({ project_id: projetId, ...champs });
      const { error } = await requete;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t(etat ? "etatsAvancement.formulaire.modifie" : "etatsAvancement.formulaire.cree"));
      onFermer();
      void queryClient.invalidateQueries({ queryKey: clesSe.etats(projetId) });
    },
    onError: gererErreur,
  });

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);
  const formulaire = "formulaire-etat";
  return (
    <>
      <DrawerHeader>
        <DrawerTitle className="text-xl font-bold text-navy">
          {t(etat ? "etatsAvancement.formulaire.titre_modifier" : "etatsAvancement.formulaire.titre_creer")}
        </DrawerTitle>
        <DrawerDescription className="text-sm text-muted-foreground">
          {t("etatsAvancement.formulaire.description")}
        </DrawerDescription>
      </DrawerHeader>
      <DrawerBody>
        <form id={formulaire} onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate className="grid gap-4">
          <div className="grid gap-2 rounded-xl bg-subtle p-4">
            {etat ? (
              <>
                <p className="text-sm font-semibold text-navy">
                  {t("etatsAvancement.formulaire.taux_figes", { date: formaterDate(etat.created_at.slice(0, 10)) })}
                </p>
                <TauxAvancement
                  resultats={etat.taux_resultats === null ? null : Number(etat.taux_resultats)}
                  physique={etat.taux_physique === null ? null : Number(etat.taux_physique)}
                />
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-navy">{t("etatsAvancement.formulaire.taux_actuels")}</p>
                <TauxAvancement resultats={tauxActuels.resultats} physique={tauxActuels.physique} />
                <p className="text-xs text-muted-foreground">{t("etatsAvancement.formulaire.taux_aide")}</p>
              </>
            )}
          </div>

          <Champ id="etat-titre" libelle={t("etatsAvancement.formulaire.titre")} erreur={erreur(errors.titre?.message)}>
            {(a) => <Input {...a} {...register("titre")} />}
          </Champ>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ
              id="etat-debut"
              libelle={t("etatsAvancement.formulaire.debut")}
              erreur={erreur(errors.periodeDebut?.message)}
            >
              {(a) => <Input {...a} type="date" {...register("periodeDebut")} />}
            </Champ>
            <Champ
              id="etat-fin"
              libelle={t("etatsAvancement.formulaire.fin")}
              erreur={erreur(errors.periodeFin?.message)}
            >
              {(a) => <Input {...a} type="date" {...register("periodeFin")} />}
            </Champ>
          </div>
          <p className="-mt-2 text-sm text-muted-foreground" aria-live="polite">
            {t("etatsAvancement.formulaire.realisations_periode", { count: dansPeriode })}
          </p>
          <Champ
            id="etat-faits"
            libelle={t("etatsAvancement.formulaire.faits")}
            aide={t("etatsAvancement.formulaire.faits_aide")}
            optionnel
            erreur={erreur(errors.faits?.message)}
          >
            {(a) => <Textarea {...a} rows={5} {...register("faits")} />}
          </Champ>
          <Champ
            id="etat-difficultes"
            libelle={t("etatsAvancement.formulaire.difficultes")}
            aide={t("etatsAvancement.formulaire.difficultes_aide")}
            optionnel
            erreur={erreur(errors.difficultes?.message)}
          >
            {(a) => <Textarea {...a} rows={4} {...register("difficultes")} />}
          </Champ>
          <Champ
            id="etat-risques"
            libelle={t("etatsAvancement.formulaire.risques")}
            aide={t("etatsAvancement.formulaire.risques_aide")}
            optionnel
            erreur={erreur(errors.risques?.message)}
          >
            {(a) => <Textarea {...a} rows={4} {...register("risques")} />}
          </Champ>
        </form>
      </DrawerBody>
      <DrawerFooter>
        <Button variante="contour" onClick={onFermer}>
          {t("commun.annuler")}
        </Button>
        <Button type="submit" form={formulaire} chargement={enregistrer.isPending}>
          {t(etat ? "etatsAvancement.formulaire.action_modifier" : "etatsAvancement.formulaire.action_creer")}
        </Button>
      </DrawerFooter>
    </>
  );
}
