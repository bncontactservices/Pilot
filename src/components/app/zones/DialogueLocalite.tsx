import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
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
import { Input, NativeSelect } from "~/components/ui/input";
import { useOrg } from "~/hooks/useContexteOrg";
import { clesSe, type Localite } from "~/lib/donnees-se";
import {
  indexer,
  libelleLieu,
  lireLatitude,
  lireLongitude,
  NIVEAUX,
  type NiveauLocalite,
  parentsPossibles,
} from "~/lib/localites";
import { getSupabase } from "~/lib/supabase";

const schema = z
  .object({
    nom: z
      .string()
      .trim()
      .min(2, { error: "localites.formulaire.validation.nom" })
      .max(160, { error: "localites.formulaire.validation.nom" }),
    niveau: z.enum(NIVEAUX as [string, ...string[]], { error: "localites.formulaire.validation.niveau" }),
    parentId: z.string(),
    latitude: z.string(),
    longitude: z.string(),
    source: z.string().trim().max(400, { error: "auth.validation.trop_long" }),
  })
  .superRefine((v, ctx) => {
    const lat = lireLatitude(v.latitude);
    const lon = lireLongitude(v.longitude);
    if (lat.etat === "invalide")
      ctx.addIssue({ code: "custom", path: ["latitude"], message: "localites.formulaire.validation.latitude" });
    if (lon.etat === "invalide")
      ctx.addIssue({ code: "custom", path: ["longitude"], message: "localites.formulaire.validation.longitude" });
    if (lat.etat !== "invalide" && lon.etat !== "invalide" && (lat.etat === "absent") !== (lon.etat === "absent")) {
      ctx.addIssue({
        code: "custom",
        path: [lat.etat === "absent" ? "latitude" : "longitude"],
        message: "localites.formulaire.validation.paire",
      });
    }
  });
type Valeurs = z.infer<typeof schema>;

type Props = {
  ouvert: boolean;
  onFermer: () => void;
  /** Localité de l'organisation à modifier ; absente pour une création. */
  localite: Localite | null;
  /** Toutes les localités visibles : elles servent de parents possibles et à situer la localité modifiée. */
  localites: Localite[];
  /** Parent proposé d'office (par exemple la commune d'une zone déjà choisie). */
  parentInitial?: string;
  /** Appelé avec l'identifiant de la localité créée : permet de l'ajouter aussitôt aux zones d'un projet. */
  onCree?: (id: string) => void;
};

const texteDegres = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

/** Création ou modification d'une localité de l'organisation (le référentiel de la plateforme n'est pas modifiable). */
export function DialogueLocalite(props: Props) {
  const { ouvert, onFermer, localite } = props;
  return (
    <Drawer open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DrawerContent>{ouvert && <Corps key={localite?.id ?? "nouvelle"} {...props} />}</DrawerContent>
    </Drawer>
  );
}

function Corps({ onFermer, localite, localites, parentInitial = "", onCree }: Props) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    control,
    formState: { errors },
  } = useForm<Valeurs>({
    resolver: zodResolver(schema),
    defaultValues: {
      nom: localite?.nom ?? "",
      niveau: localite?.niveau ?? "village",
      parentId: localite?.parent_id ?? parentInitial,
      latitude: texteDegres(localite?.latitude ?? null),
      longitude: texteDegres(localite?.longitude ?? null),
      source: localite?.source ?? "",
    },
  });
  const niveau = useWatch({ control, name: "niveau" }) as NiveauLocalite;
  const index = useMemo(() => indexer(localites), [localites]);
  const parents = useMemo(
    () =>
      parentsPossibles(localites, niveau).sort((a, b) =>
        libelleLieu(index, a.id, 1).localeCompare(libelleLieu(index, b.id, 1), "fr"),
      ),
    [localites, niveau, index],
  );

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs): Promise<string> => {
      const lat = lireLatitude(v.latitude);
      const lon = lireLongitude(v.longitude);
      const coordonnees = {
        latitude: lat.etat === "ok" ? lat.valeur : null,
        longitude: lon.etat === "ok" ? lon.valeur : null,
      };
      if (localite) {
        const { error } = await getSupabase()
          .from("localites")
          .update({ nom: v.nom, ...coordonnees, source: v.source || null })
          .eq("id", localite.id);
        if (error) throw error;
        return localite.id;
      }
      const { data, error } = await getSupabase()
        .from("localites")
        .insert({
          org_id: org.organisation.id,
          parent_id: v.parentId || null,
          niveau: v.niveau as NiveauLocalite,
          nom: v.nom,
          ...coordonnees,
          source: v.source || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success(t(localite ? "localites.modifiee" : "localites.ajoutee"));
      onFermer();
      void queryClient.invalidateQueries({ queryKey: clesSe.localites(org.organisation.id) });
      if (!localite) onCree?.(id);
    },
    onError: (erreur) => {
      // Un nom n'existe qu'une fois sous un même parent : on le dit précisément plutôt que « existe déjà ».
      if ((erreur as { code?: string }).code === "23505") toast.error(t("localites.formulaire.doublon"));
      else gererErreur(erreur);
    },
  });

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);
  const formulaire = "formulaire-localite";
  return (
    <>
      <DrawerHeader>
        <DrawerTitle className="text-xl font-bold text-navy">
          {t(localite ? "localites.formulaire.titre_modifier" : "localites.formulaire.titre_creer")}
        </DrawerTitle>
        <DrawerDescription className="text-sm text-muted-foreground">
          {t("localites.formulaire.description")}
        </DrawerDescription>
      </DrawerHeader>
      <DrawerBody>
        <form id={formulaire} onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate className="grid gap-4">
          <Champ id="localite-nom" libelle={t("localites.formulaire.nom")} erreur={erreur(errors.nom?.message)}>
            {(a) => <Input {...a} autoComplete="off" {...register("nom")} />}
          </Champ>
          {localite ? (
            <p className="text-sm text-muted-foreground">
              {t(`localites.niveaux.${localite.niveau}`)}
              {localite.parent_id && ` — ${libelleLieu(index, localite.parent_id, 3)}`}
            </p>
          ) : (
            <>
              <Champ
                id="localite-niveau"
                libelle={t("localites.formulaire.niveau")}
                erreur={erreur(errors.niveau?.message)}
              >
                {(a) => (
                  <NativeSelect
                    {...a}
                    {...register("niveau", {
                      // Un parent doit être plus large que la localité : on vide le choix s'il ne l'est plus.
                      onChange: (e) => {
                        const rang = NIVEAUX.indexOf(e.target.value as NiveauLocalite);
                        const courant = localites.find((l) => l.id === getValues("parentId"));
                        if (courant && NIVEAUX.indexOf(courant.niveau) >= rang) setValue("parentId", "");
                      },
                    })}
                  >
                    {NIVEAUX.map((n) => (
                      <option key={n} value={n}>
                        {t(`localites.niveaux.${n}`)}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Champ>
              <Champ
                id="localite-parent"
                libelle={t("localites.formulaire.parent")}
                aide={t("localites.formulaire.parent_aide")}
              >
                {(a) => (
                  <NativeSelect {...a} {...register("parentId")}>
                    <option value="">{t("localites.formulaire.parent_aucun")}</option>
                    {parents.map((p) => (
                      <option key={p.id} value={p.id}>
                        {`${libelleLieu(index, p.id, 1)} (${t(`localites.niveaux.${p.niveau}`)})`}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Champ>
            </>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ
              id="localite-latitude"
              libelle={t("localites.formulaire.latitude")}
              optionnel
              erreur={erreur(errors.latitude?.message)}
            >
              {(a) => <Input {...a} inputMode="decimal" autoComplete="off" {...register("latitude")} />}
            </Champ>
            <Champ
              id="localite-longitude"
              libelle={t("localites.formulaire.longitude")}
              optionnel
              erreur={erreur(errors.longitude?.message)}
            >
              {(a) => <Input {...a} inputMode="decimal" autoComplete="off" {...register("longitude")} />}
            </Champ>
          </div>
          <p className="-mt-2 text-sm text-muted-foreground">{t("localites.formulaire.coordonnees_aide")}</p>
          <Champ
            id="localite-source"
            libelle={t("localites.formulaire.source")}
            aide={t("localites.formulaire.source_aide")}
            optionnel
            erreur={erreur(errors.source?.message)}
          >
            {(a) => <Input {...a} autoComplete="off" {...register("source")} />}
          </Champ>
        </form>
      </DrawerBody>
      <DrawerFooter>
        <Button variante="contour" onClick={onFermer}>
          {t("commun.annuler")}
        </Button>
        <Button type="submit" form={formulaire} chargement={enregistrer.isPending}>
          {t(localite ? "localites.formulaire.enregistrer" : "localites.formulaire.ajouter")}
        </Button>
      </DrawerFooter>
    </>
  );
}
