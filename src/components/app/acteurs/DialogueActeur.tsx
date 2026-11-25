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
import { Input, NativeSelect, Textarea } from "~/components/ui/input";
import { useOrg } from "~/hooks/useContexteOrg";
import { TYPES_ACTEUR } from "~/lib/acteurs";
import { type Acteur, clesSe } from "~/lib/donnees-se";
import { getSupabase } from "~/lib/supabase";

const schema = z.object({
  nom: z
    .string()
    .trim()
    .min(2, { error: "acteurs.formulaire.validation.nom" })
    .max(160, { error: "acteurs.formulaire.validation.nom" }),
  type: z.enum(TYPES_ACTEUR as [string, ...string[]]),
  description: z.string().trim().max(1000, { error: "auth.validation.trop_long" }),
  contact: z.string().trim().max(160, { error: "auth.validation.trop_long" }),
  email: z
    .string()
    .trim()
    .max(254, { error: "auth.validation.trop_long" })
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), { error: "acteurs.formulaire.validation.email" }),
  telephone: z.string().trim().max(40, { error: "auth.validation.trop_long" }),
  notes: z.string().trim().max(1000, { error: "auth.validation.trop_long" }),
});
type Valeurs = z.infer<typeof schema>;

type Props = {
  ouvert: boolean;
  onFermer: () => void;
  /** Acteur à modifier ; absent pour une création. */
  acteur: Acteur | null;
  /** Appelé avec l'identifiant de l'acteur créé : permet de le rattacher aussitôt à un projet. */
  onCree?: (id: string) => void;
};

/** Création ou modification d'un acteur de l'annuaire de l'organisation. */
export function DialogueActeur(props: Props) {
  const { ouvert, onFermer, acteur } = props;
  return (
    <Drawer open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DrawerContent>{ouvert && <Corps key={acteur?.id ?? "nouveau"} {...props} />}</DrawerContent>
    </Drawer>
  );
}

function Corps({ onFermer, acteur, onCree }: Props) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Valeurs>({
    resolver: zodResolver(schema),
    defaultValues: {
      nom: acteur?.nom ?? "",
      type: acteur?.type ?? "partenaire",
      description: acteur?.description ?? "",
      contact: acteur?.contact ?? "",
      email: acteur?.email ?? "",
      telephone: acteur?.telephone ?? "",
      notes: acteur?.notes ?? "",
    },
  });

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs): Promise<string> => {
      const champs = {
        nom: v.nom,
        type: v.type as Acteur["type"],
        description: v.description || null,
        contact: v.contact || null,
        email: v.email || null,
        telephone: v.telephone || null,
        notes: v.notes || null,
      };
      if (acteur) {
        const { error } = await getSupabase().from("acteurs").update(champs).eq("id", acteur.id);
        if (error) throw error;
        return acteur.id;
      }
      const { data, error } = await getSupabase()
        .from("acteurs")
        .insert({ org_id: org.organisation.id, ...champs })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success(t(acteur ? "acteurs.formulaire.modifie" : "acteurs.formulaire.cree"));
      onFermer();
      void queryClient.invalidateQueries({ queryKey: clesSe.acteurs(org.organisation.id) });
      if (!acteur) onCree?.(id);
    },
    onError: (erreur) => {
      // Un nom n'existe qu'une fois dans l'annuaire : on le dit précisément plutôt que « existe déjà ».
      if ((erreur as { code?: string }).code === "23505") toast.error(t("acteurs.formulaire.doublon"));
      else gererErreur(erreur);
    },
  });

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);
  const formulaire = "formulaire-acteur";
  return (
    <>
      <DrawerHeader>
        <DrawerTitle className="text-xl font-bold text-navy">
          {t(acteur ? "acteurs.formulaire.titre_modifier" : "acteurs.formulaire.titre_creer")}
        </DrawerTitle>
        <DrawerDescription className="text-sm text-muted-foreground">
          {t("acteurs.formulaire.description")}
        </DrawerDescription>
      </DrawerHeader>
      <DrawerBody>
        <form id={formulaire} onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate className="grid gap-4">
          <Champ id="acteur-nom" libelle={t("acteurs.formulaire.nom")} erreur={erreur(errors.nom?.message)}>
            {(a) => <Input {...a} {...register("nom")} />}
          </Champ>
          <Champ id="acteur-type" libelle={t("acteurs.formulaire.type")}>
            {(a) => (
              <NativeSelect {...a} {...register("type")}>
                {TYPES_ACTEUR.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(`acteurs.types.${ty}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Champ>
          <Champ
            id="acteur-description"
            libelle={t("acteurs.formulaire.details")}
            optionnel
            erreur={erreur(errors.description?.message)}
          >
            {(a) => <Textarea {...a} rows={3} {...register("description")} />}
          </Champ>
          <Champ
            id="acteur-contact"
            libelle={t("acteurs.formulaire.contact")}
            aide={t("acteurs.formulaire.contact_aide")}
            optionnel
            erreur={erreur(errors.contact?.message)}
          >
            {(a) => <Input {...a} autoComplete="off" {...register("contact")} />}
          </Champ>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ
              id="acteur-email"
              libelle={t("acteurs.formulaire.email")}
              optionnel
              erreur={erreur(errors.email?.message)}
            >
              {(a) => <Input {...a} type="email" autoComplete="off" {...register("email")} />}
            </Champ>
            <Champ
              id="acteur-telephone"
              libelle={t("acteurs.formulaire.telephone")}
              optionnel
              erreur={erreur(errors.telephone?.message)}
            >
              {(a) => <Input {...a} type="tel" autoComplete="off" {...register("telephone")} />}
            </Champ>
          </div>
          <Champ
            id="acteur-notes"
            libelle={t("acteurs.formulaire.notes")}
            optionnel
            erreur={erreur(errors.notes?.message)}
          >
            {(a) => <Textarea {...a} rows={2} {...register("notes")} />}
          </Champ>
        </form>
      </DrawerBody>
      <DrawerFooter>
        <Button variante="contour" onClick={onFermer}>
          {t("commun.annuler")}
        </Button>
        <Button type="submit" form={formulaire} chargement={enregistrer.isPending}>
          {t(acteur ? "acteurs.formulaire.action_modifier" : "acteurs.formulaire.action_creer")}
        </Button>
      </DrawerFooter>
    </>
  );
}
