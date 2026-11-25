import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { EtatErreur } from "~/components/app/Etats";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Champ } from "~/components/ui/field";
import { Input, NativeSelect } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { useOrg } from "~/hooks/useContexteOrg";
import { cles, type ParametresSe, useParametresSe } from "~/lib/donnees";
import { getSupabase } from "~/lib/supabase";

// -----------------------------------------------------------------------------
// Réglages du suivi-évaluation (seuils des statuts, fréquence par défaut, unités, année fiscale)
// -----------------------------------------------------------------------------

const FREQUENCES = ["hebdomadaire", "mensuelle", "trimestrielle", "annuelle"] as const;
const MOIS = Array.from({ length: 12 }, (_, i) => i + 1);
const nomMois = (mois: number) => new Intl.DateTimeFormat("fr", { month: "long" }).format(new Date(2026, mois - 1, 1));

const nombreEntier = z
  .string()
  .trim()
  .refine((v) => /^\d+([.,]\d{1,2})?$/.test(v), { error: "parametres.se.seuils_invalides" });
const versNombre = (texte: string) => Number(texte.replace(",", "."));

const schemaSe = z
  .object({
    seuilVert: nombreEntier,
    seuilAmbre: nombreEntier,
    frequence: z.enum(FREQUENCES),
    moisFiscal: z.string(),
    unites: z.string().trim(),
  })
  .refine(
    (v) =>
      versNombre(v.seuilAmbre) > 0 &&
      versNombre(v.seuilAmbre) < versNombre(v.seuilVert) &&
      versNombre(v.seuilVert) <= 100,
    {
      path: ["seuilAmbre"],
      error: "parametres.se.seuils_invalides",
    },
  )
  .refine((v) => decouperUnites(v.unites).length <= 30 && decouperUnites(v.unites).every((u) => u.length <= 40), {
    path: ["unites"],
    error: "parametres.se.unites_invalides",
  });
type ValeursSe = z.infer<typeof schemaSe>;

function decouperUnites(texte: string): string[] {
  return [
    ...new Set(
      texte
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean),
    ),
  ];
}

const valeursSeDe = (p: ParametresSe | null | undefined): ValeursSe => ({
  seuilVert: String(p?.seuil_vert ?? 90).replace(".", ","),
  seuilAmbre: String(p?.seuil_ambre ?? 60).replace(".", ","),
  frequence: p?.frequence_defaut ?? "mensuelle",
  moisFiscal: String(p?.mois_debut_annee_fiscale ?? 1),
  unites: (p?.unites_perso ?? []).join(", "),
});

export function CarteSuiviEvaluation() {
  const { t } = useTranslation();
  const org = useOrg();
  const parametres = useParametresSe(org.organisation.id);
  const lectureSeule = !org.estAdmin || !org.peutEcrire;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("parametres.se.titre")}</CardTitle>
        <CardDescription>
          {lectureSeule ? t("parametres.se.lecture_seule") : t("parametres.se.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {parametres.isPending ? (
          <div className="grid gap-3" aria-busy>
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        ) : parametres.isError ? (
          <EtatErreur erreur={parametres.error} onReessayer={() => void parametres.refetch()} />
        ) : (
          <FormulaireSuiviEvaluation parametres={parametres.data} lectureSeule={lectureSeule} />
        )}
      </CardContent>
    </Card>
  );
}

function FormulaireSuiviEvaluation({
  parametres,
  lectureSeule,
}: {
  parametres: ParametresSe | null;
  lectureSeule: boolean;
}) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ValeursSe>({ resolver: zodResolver(schemaSe), defaultValues: valeursSeDe(parametres) });

  const enregistrer = useMutation({
    mutationFn: async (v: ValeursSe) => {
      const { error } = await getSupabase()
        .from("parametres_se")
        .update({
          seuil_vert: versNombre(v.seuilVert),
          seuil_ambre: versNombre(v.seuilAmbre),
          frequence_defaut: v.frequence,
          mois_debut_annee_fiscale: Number(v.moisFiscal),
          unites_perso: decouperUnites(v.unites),
        })
        .eq("org_id", org.organisation.id);
      if (error) throw error;
      return v;
    },
    onSuccess: (v) => {
      toast.success(t("parametres.enregistre"));
      reset({ ...v, unites: decouperUnites(v.unites).join(", ") });
      void queryClient.invalidateQueries({ queryKey: cles.parametresSe(org.organisation.id) });
      void queryClient.invalidateQueries({ queryKey: cles.avancements(org.organisation.id) });
      void queryClient.invalidateQueries({ queryKey: cles.avancementsProgrammes(org.organisation.id) });
    },
    onError: gererErreur,
  });

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);
  return (
    <form onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate className="grid grid-cols-1 gap-4">
      <fieldset disabled={lectureSeule} className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <Champ
            id="se-vert"
            libelle={t("parametres.se.seuil_vert")}
            aide={t("parametres.se.seuil_vert_aide")}
            erreur={erreur(errors.seuilVert?.message)}
          >
            {(a) => <Input {...a} inputMode="decimal" {...register("seuilVert")} />}
          </Champ>
          <Champ
            id="se-ambre"
            libelle={t("parametres.se.seuil_ambre")}
            aide={t("parametres.se.seuil_ambre_aide")}
            erreur={erreur(errors.seuilAmbre?.message)}
          >
            {(a) => <Input {...a} inputMode="decimal" {...register("seuilAmbre")} />}
          </Champ>
        </div>
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <Champ id="se-frequence" libelle={t("parametres.se.frequence")} aide={t("parametres.se.frequence_aide")}>
            {(a) => (
              <NativeSelect {...a} {...register("frequence")}>
                {FREQUENCES.map((f) => (
                  <option key={f} value={f}>
                    {t(`kpi.frequences.${f}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Champ>
          <Champ id="se-mois" libelle={t("parametres.se.mois_fiscal")} aide={t("parametres.se.mois_fiscal_aide")}>
            {(a) => (
              <NativeSelect {...a} {...register("moisFiscal")}>
                {MOIS.map((m) => (
                  <option key={m} value={m}>
                    {nomMois(m)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Champ>
        </div>
        <Champ
          id="se-unites"
          libelle={t("parametres.se.unites")}
          aide={t("parametres.se.unites_aide")}
          optionnel
          erreur={erreur(errors.unites?.message)}
        >
          {(a) => <Input {...a} placeholder="forages, comités, ménages" {...register("unites")} />}
        </Champ>
      </fieldset>
      <p className="text-xs text-muted-foreground">{t("parametres.se.devise_note")}</p>
      {!lectureSeule && (
        <Button type="submit" className="w-fit" disabled={!isDirty} chargement={enregistrer.isPending}>
          {t("commun.enregistrer")}
        </Button>
      )}
    </form>
  );
}
