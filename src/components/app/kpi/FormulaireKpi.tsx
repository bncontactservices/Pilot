import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { Input, NativeSelect, Textarea } from "~/components/ui/input";
import { useOrg } from "~/hooks/useContexteOrg";
import { cles, type Kpi, type Projet, useParametresSe } from "~/lib/donnees";
import { getSupabase } from "~/lib/supabase";

const FREQUENCES = ["hebdomadaire", "mensuelle", "trimestrielle", "annuelle"] as const;
const SENS = ["croissant", "decroissant"] as const;
const AGREGATIONS = ["cumul", "dernier", "moyenne"] as const;

const nombre = z
  .string()
  .trim()
  .refine((v) => /^-?\d+([.,]\d+)?$/.test(v), { error: "kpi.formulaire.validation.nombre" });

const schema = z
  .object({
    nom: z
      .string()
      .trim()
      .min(1, { error: "kpi.formulaire.validation.nom" })
      .max(160, { error: "auth.validation.trop_long" }),
    description: z.string().trim().max(2000, { error: "auth.validation.trop_long" }),
    unite: z.string().trim().max(40, { error: "auth.validation.trop_long" }),
    cible: nombre,
    valeurBase: nombre,
    frequence: z.enum(FREQUENCES),
    agregation: z.enum(AGREGATIONS),
    sens: z.enum(SENS),
  })
  .refine((v) => !(v.agregation === "cumul" && v.sens === "decroissant"), {
    path: ["sens"],
    error: "kpi.formulaire.validation.cumul_decroissant",
  });
type Valeurs = z.infer<typeof schema>;

const versNombre = (texte: string) => Number(texte.replace(",", "."));
const versTexte = (valeur: number) => String(valeur).replace(".", ",");

const VALEURS_VIDES: Valeurs = {
  nom: "",
  description: "",
  unite: "",
  cible: "",
  valeurBase: "0",
  frequence: "mensuelle",
  agregation: "cumul",
  sens: "croissant",
};

function valeursDe(kpi: Kpi | null, frequenceDefaut: Valeurs["frequence"] = "mensuelle"): Valeurs {
  if (!kpi) return { ...VALEURS_VIDES, frequence: frequenceDefaut };
  return {
    nom: kpi.nom,
    description: kpi.description ?? "",
    unite: kpi.unite,
    cible: versTexte(kpi.cible),
    valeurBase: versTexte(kpi.valeur_base),
    frequence: kpi.frequence,
    agregation: kpi.type_agregation,
    sens: kpi.sens,
  };
}

/** Création et modification d'un indicateur, dans un panneau latéral. */
export function FormulaireKpi({
  ouvert,
  onOuvertChange,
  projet,
  kpi,
  kpis,
}: {
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
  projet: Projet;
  kpi: Kpi | null;
  kpis: Kpi[];
}) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  // Réglages S&E de l'organisation : fréquence proposée et unités personnalisées.
  const parametres = useParametresSe(org.organisation.id).data;
  const frequenceDefaut = parametres?.frequence_defaut ?? "mensuelle";

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: valeursDe(kpi, frequenceDefaut) });
  const agregation = useWatch({ control, name: "agregation" });

  useEffect(() => {
    if (ouvert) reset(valeursDe(kpi, frequenceDefaut));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, kpi?.id]);

  // Un cumul ne peut que croître : on aligne le sens dès que ce calcul est choisi.
  useEffect(() => {
    if (agregation === "cumul") setValue("sens", "croissant");
  }, [agregation, setValue]);

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs) => {
      const champs = {
        nom: v.nom,
        description: v.description || null,
        unite: v.unite,
        cible: versNombre(v.cible),
        valeur_base: versNombre(v.valeurBase),
        frequence: v.frequence,
        sens: v.sens,
        type_agregation: v.agregation,
      };
      const supabase = getSupabase();
      if (kpi) {
        const { error } = await supabase.from("kpis").update(champs).eq("id", kpi.id);
        if (error) throw error;
      } else {
        const ordre = kpis.reduce((max, k) => Math.max(max, k.ordre), 0) + 1;
        const { error } = await supabase.from("kpis").insert({ project_id: projet.id, ...champs, ordre });
        if (error) throw error;
      }
    },
    onSuccess: (_resultat, v) => {
      toast.success(t(kpi ? "kpi.formulaire.modifie" : "kpi.formulaire.cree", { nom: v.nom }));
      onOuvertChange(false);
      void queryClient.invalidateQueries({ queryKey: cles.kpis(projet.id) });
      void queryClient.invalidateQueries({ queryKey: cles.orgKpis(org.organisation.id) });
    },
    onError: gererErreur,
  });

  const message = (cle?: string) => (cle ? t(cle) : undefined);

  return (
    <Drawer open={ouvert} onOpenChange={onOuvertChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold text-navy">
            {t(kpi ? "kpi.formulaire.titre_modifier" : "kpi.formulaire.titre_creer")}
          </DrawerTitle>
          <DrawerDescription className="text-sm text-muted-foreground">
            {t("kpi.formulaire.description")}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <form
            id="formulaire-kpi"
            onSubmit={handleSubmit((v) => enregistrer.mutate(v))}
            noValidate
            className="grid gap-4"
          >
            <Champ id="kpi-nom" libelle={t("kpi.formulaire.nom")} erreur={message(errors.nom?.message)}>
              {(a) => <Input {...a} {...register("nom")} />}
            </Champ>
            <Champ
              id="kpi-description"
              libelle={t("kpi.formulaire.description_champ")}
              optionnel
              erreur={message(errors.description?.message)}
            >
              {(a) => <Textarea {...a} rows={2} {...register("description")} />}
            </Champ>
            <div className="grid grid-cols-2 gap-4">
              <Champ id="kpi-cible" libelle={t("kpi.formulaire.cible")} erreur={message(errors.cible?.message)}>
                {(a) => <Input {...a} inputMode="decimal" {...register("cible")} />}
              </Champ>
              <Champ id="kpi-base" libelle={t("kpi.formulaire.base")} erreur={message(errors.valeurBase?.message)}>
                {(a) => <Input {...a} inputMode="decimal" {...register("valeurBase")} />}
              </Champ>
            </div>
            <Champ
              id="kpi-unite"
              libelle={t("kpi.formulaire.unite")}
              aide={t("kpi.formulaire.unite_aide")}
              optionnel
              erreur={message(errors.unite?.message)}
            >
              {(a) => <Input {...a} list="kpi-unites" autoComplete="off" {...register("unite")} />}
            </Champ>
            {parametres && parametres.unites_perso.length > 0 && (
              <datalist id="kpi-unites">
                {parametres.unites_perso.map((unite) => (
                  <option key={unite} value={unite} />
                ))}
              </datalist>
            )}
            <Champ id="kpi-frequence" libelle={t("kpi.formulaire.frequence")} aide={t("kpi.formulaire.frequence_aide")}>
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
            <Champ
              id="kpi-agregation"
              libelle={t("kpi.formulaire.agregation")}
              aide={t(`kpi.formulaire.agregation_aide.${agregation}`)}
            >
              {(a) => (
                <NativeSelect {...a} {...register("agregation")}>
                  {AGREGATIONS.map((g) => (
                    <option key={g} value={g}>
                      {t(`kpi.agregations.${g}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Champ>
            <Champ
              id="kpi-sens"
              libelle={t("kpi.formulaire.sens")}
              aide={t("kpi.formulaire.sens_aide")}
              erreur={message(errors.sens?.message)}
            >
              {(a) => (
                <NativeSelect {...a} {...register("sens")} disabled={agregation === "cumul"}>
                  {SENS.map((s) => (
                    <option key={s} value={s}>
                      {t(`kpi.sens.${s}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Champ>
          </form>
        </DrawerBody>
        <DrawerFooter>
          <Button variante="contour" onClick={() => onOuvertChange(false)}>
            {t("commun.annuler")}
          </Button>
          <Button type="submit" form="formulaire-kpi" chargement={enregistrer.isPending}>
            {t(kpi ? "commun.enregistrer" : "kpi.formulaire.action_creer")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
