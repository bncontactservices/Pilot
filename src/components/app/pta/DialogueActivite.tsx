import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { Button } from "~/components/ui/button";
import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "~/components/ui/drawer";
import { Champ } from "~/components/ui/field";
import { Input, NativeSelect, Textarea } from "~/components/ui/input";
import { useOrg } from "~/hooks/useContexteOrg";
import { STATUTS_TRAVAIL, type StatutTravail } from "~/lib/avancement";
import type { Noeud } from "~/lib/cadre-logique";
import { type ActivitePta, clesSe, invaliderAvancement, type Phase, type ComposanteProjet } from "~/lib/donnees-se";
import { formaterDate } from "~/lib/format";
import { anneeFiscale, pourcentSelonStatut, trimestresFiscaux } from "~/lib/pta";
import { getSupabase } from "~/lib/supabase";

const nombreOuVide = (cle: string) =>
  z
    .string()
    .trim()
    .refine(
      (v) =>
        v === "" ||
        (/^\d+([.,]\d{1,2})?$/.test(v.replace(/\s/g, "")) && Number(v.replace(/\s/g, "").replace(",", ".")) >= 0),
      { error: cle },
    );
const versNombre = (texte: string) => Number(texte.replace(/\s/g, "").replace(",", "."));

const schema = z
  .object({
    intitule: z
      .string()
      .trim()
      .min(2, { error: "pta.formulaire.validation.intitule" })
      .max(200, { error: "pta.formulaire.validation.intitule" }),
    description: z.string().trim().max(2000, { error: "auth.validation.trop_long" }),
    mode: z.enum(["trimestre", "dates"]),
    annee: z.string(),
    trimestre: z.enum(["1", "2", "3", "4"]),
    dateDebut: z.string(),
    dateFin: z.string(),
    responsable: z.string().trim().max(120, { error: "auth.validation.trop_long" }),
    budget: nombreOuVide("pta.formulaire.validation.budget"),
    statut: z.enum(STATUTS_TRAVAIL as [string, ...string[]]),
    pourcent: z
      .string()
      .trim()
      .refine((v) => /^\d+([.,]\d{1,2})?$/.test(v) && versNombre(v) <= 100, {
        error: "pta.formulaire.validation.pourcent",
      }),
    noeudId: z.string(),
    phaseId: z.string(),
    composanteId: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.mode !== "dates") return;
    for (const champ of ["dateDebut", "dateFin"] as const) {
      if (!z.iso.date().safeParse(v[champ]).success)
        ctx.addIssue({ code: "custom", path: [champ], message: "pta.formulaire.validation.date" });
    }
    if (
      z.iso.date().safeParse(v.dateDebut).success &&
      z.iso.date().safeParse(v.dateFin).success &&
      v.dateFin < v.dateDebut
    ) {
      ctx.addIssue({ code: "custom", path: ["dateFin"], message: "pta.formulaire.validation.dates" });
    }
  });
type Valeurs = z.infer<typeof schema>;

function valeursDe(activite: ActivitePta | null, annee: number): Valeurs {
  if (!activite) {
    return {
      intitule: "",
      description: "",
      mode: "trimestre",
      annee: String(annee),
      trimestre: "1",
      dateDebut: "",
      dateFin: "",
      responsable: "",
      budget: "",
      statut: "a_faire",
      pourcent: "0",
      noeudId: "",
      phaseId: "",
      composanteId: "",
    };
  }
  return {
    intitule: activite.intitule,
    description: activite.description ?? "",
    mode: activite.date_debut ? "dates" : "trimestre",
    annee: String(activite.annee),
    trimestre: String(activite.trimestre ?? 1) as Valeurs["trimestre"],
    dateDebut: activite.date_debut ?? "",
    dateFin: activite.date_fin ?? "",
    responsable: activite.responsable ?? "",
    budget: activite.budget_prevu === null ? "" : String(activite.budget_prevu).replace(".", ","),
    statut: activite.statut,
    pourcent: String(activite.pct_realisation).replace(".", ","),
    noeudId: activite.noeud_id ?? "",
    phaseId: activite.phase_id ?? "",
    composanteId: activite.composante_id ?? "",
  };
}

/** Création ou modification d'une activité du plan de travail annuel. */
export function DialogueActivite({
  ouvert,
  onFermer,
  projet,
  activite,
  annee,
  annees,
  moisDebut,
  noeuds,
  phases,
  composantes = [],
  suggestionsResponsables,
}: {
  ouvert: boolean;
  onFermer: () => void;
  projet: { id: string; devise: string };
  activite: ActivitePta | null;
  /** Année fiscale affichée : proposée pour une nouvelle activité. */
  annee: number;
  annees: number[];
  moisDebut: number;
  noeuds: Noeud[];
  phases: Pick<Phase, "id" | "nom">[];
  /** Composantes du projet : l'activité peut être rattachée à l'une d'elles. */
  composantes?: Pick<ComposanteProjet, "id" | "nom">[];
  suggestionsResponsables: string[];
}) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: valeursDe(activite, annee) });
  const mode = useWatch({ control, name: "mode" });
  const anneeChoisie = useWatch({ control, name: "annee" });

  useEffect(() => {
    if (ouvert) reset(valeursDe(activite, annee));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, activite?.id, annee]);

  const activitesCadre = noeuds
    .filter((n) => n.type === "activite")
    .sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }));
  const trimestres = trimestresFiscaux(Number(anneeChoisie) || annee, moisDebut);

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs) => {
      const parDates = v.mode === "dates";
      const champs = {
        intitule: v.intitule,
        description: v.description || null,
        annee: parDates ? anneeFiscale(v.dateDebut, moisDebut) : Number(v.annee),
        trimestre: parDates ? null : Number(v.trimestre),
        date_debut: parDates ? v.dateDebut : null,
        date_fin: parDates ? v.dateFin : null,
        responsable: v.responsable || null,
        budget_prevu: v.budget ? versNombre(v.budget) : null,
        statut: v.statut as ActivitePta["statut"],
        pct_realisation: pourcentSelonStatut(v.statut as ActivitePta["statut"], versNombre(v.pourcent)),
        noeud_id: v.noeudId || null,
        phase_id: v.phaseId || null,
        composante_id: v.composanteId || null,
      };
      const requete = activite
        ? getSupabase().from("pta_activites").update(champs).eq("id", activite.id)
        : getSupabase()
            .from("pta_activites")
            .insert({ project_id: projet.id, ...champs });
      const { error } = await requete;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t(activite ? "pta.formulaire.modifie" : "pta.formulaire.cree"));
      onFermer();
      void queryClient.invalidateQueries({ queryKey: clesSe.pta(projet.id) });
      invaliderAvancement(queryClient, org.organisation.id);
    },
    onError: gererErreur,
  });

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);
  const formulaire = "formulaire-activite";

  return (
    <Drawer open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold text-navy">
            {t(activite ? "pta.formulaire.titre_modifier" : "pta.formulaire.titre_creer")}
          </DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <form id={formulaire} onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate className="grid gap-4">
            <Champ
              id="activite-intitule"
              libelle={t("pta.formulaire.intitule")}
              erreur={erreur(errors.intitule?.message)}
            >
              {(a) => <Input {...a} {...register("intitule")} />}
            </Champ>
            <Champ
              id="activite-description"
              libelle={t("pta.formulaire.description")}
              optionnel
              erreur={erreur(errors.description?.message)}
            >
              {(a) => <Textarea {...a} rows={2} {...register("description")} />}
            </Champ>

            <fieldset className="grid gap-3">
              <legend className="text-sm font-semibold text-foreground">{t("pta.formulaire.periode")}</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {(["trimestre", "dates"] as const).map((m) => (
                  <label key={m} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="radio" value={m} className="size-4 accent-[var(--navy)]" {...register("mode")} />
                    {t(`pta.formulaire.mode_${m}`)}
                  </label>
                ))}
              </div>
              {mode === "trimestre" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Champ id="activite-annee" libelle={t("pta.formulaire.annee")}>
                    {(a) => (
                      <NativeSelect {...a} {...register("annee")}>
                        {annees.map((an) => (
                          <option key={an} value={an}>
                            {moisDebut === 1 ? an : `${an}–${an + 1}`}
                          </option>
                        ))}
                      </NativeSelect>
                    )}
                  </Champ>
                  <Champ id="activite-trimestre" libelle={t("pta.formulaire.trimestre")}>
                    {(a) => (
                      <NativeSelect {...a} {...register("trimestre")}>
                        {trimestres.map((tr) => (
                          <option key={tr.numero} value={tr.numero}>
                            {`${t("pta.trimestre", { numero: tr.numero })} (${formaterDate(tr.debut, "MMM")} – ${formaterDate(tr.fin, "MMM")})`}
                          </option>
                        ))}
                      </NativeSelect>
                    )}
                  </Champ>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Champ
                    id="activite-debut"
                    libelle={t("pta.formulaire.date_debut")}
                    erreur={erreur(errors.dateDebut?.message)}
                  >
                    {(a) => <Input {...a} type="date" {...register("dateDebut")} />}
                  </Champ>
                  <Champ
                    id="activite-fin"
                    libelle={t("pta.formulaire.date_fin")}
                    erreur={erreur(errors.dateFin?.message)}
                  >
                    {(a) => <Input {...a} type="date" {...register("dateFin")} />}
                  </Champ>
                </div>
              )}
            </fieldset>

            <Champ
              id="activite-responsable"
              libelle={t("pta.formulaire.responsable")}
              aide={t("pta.formulaire.responsable_aide")}
              optionnel
              erreur={erreur(errors.responsable?.message)}
            >
              {(a) => <Input {...a} list="activite-responsables" autoComplete="off" {...register("responsable")} />}
            </Champ>
            {suggestionsResponsables.length > 0 && (
              <datalist id="activite-responsables">
                {suggestionsResponsables.map((nom) => (
                  <option key={nom} value={nom} />
                ))}
              </datalist>
            )}
            <Champ
              id="activite-budget"
              libelle={t("pta.formulaire.budget", { devise: projet.devise })}
              optionnel
              erreur={erreur(errors.budget?.message)}
            >
              {(a) => <Input {...a} inputMode="decimal" placeholder="1 500 000" {...register("budget")} />}
            </Champ>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Champ id="activite-statut" libelle={t("pta.formulaire.statut")}>
                {(a) => (
                  <NativeSelect
                    {...a}
                    {...register("statut", {
                      onChange: (e) =>
                        setValue(
                          "pourcent",
                          String(
                            pourcentSelonStatut(
                              e.target.value as StatutTravail,
                              versNombre(getValues("pourcent")) || 0,
                            ),
                          ).replace(".", ","),
                          {
                            shouldValidate: true,
                          },
                        ),
                    })}
                  >
                    {STATUTS_TRAVAIL.map((s) => (
                      <option key={s} value={s}>
                        {t(`travail.statuts.${s}`)}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Champ>
              <Champ
                id="activite-pourcent"
                libelle={t("pta.formulaire.pourcent")}
                aide={t("pta.formulaire.pourcent_aide")}
                erreur={erreur(errors.pourcent?.message)}
              >
                {(a) => <Input {...a} inputMode="decimal" {...register("pourcent")} />}
              </Champ>
            </div>
            <Champ id="activite-noeud" libelle={t("pta.formulaire.noeud")} optionnel>
              {(a) => (
                <NativeSelect {...a} {...register("noeudId")}>
                  <option value="">{t("pta.formulaire.aucun_noeud")}</option>
                  {activitesCadre.map((n) => (
                    <option key={n.id} value={n.id}>
                      {`${n.code} — ${n.libelle.length > 60 ? `${n.libelle.slice(0, 60)}…` : n.libelle}`}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Champ>
            {composantes.length > 0 && (
              <Champ id="activite-composante" libelle={t("pta.formulaire.composante")} optionnel>
                {(a) => (
                  <NativeSelect {...a} {...register("composanteId")}>
                    <option value="">{t("pta.formulaire.aucune_composante")}</option>
                    {composantes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Champ>
            )}
            <Champ id="activite-phase" libelle={t("pta.formulaire.phase")} optionnel>
              {(a) => (
                <NativeSelect {...a} {...register("phaseId")}>
                  <option value="">{t("pta.formulaire.aucune_phase")}</option>
                  {phases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Champ>
          </form>
        </DrawerBody>
        <DrawerFooter>
          <Button variante="contour" onClick={onFermer}>
            {t("commun.annuler")}
          </Button>
          <Button type="submit" form={formulaire} chargement={enregistrer.isPending}>
            {t(activite ? "pta.formulaire.action_modifier" : "pta.formulaire.action_creer")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
