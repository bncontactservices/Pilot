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
import { type Acteur, clesSe, type RoleActeur } from "~/lib/donnees-se";
import { getSupabase } from "~/lib/supabase";

const schema = z.object({
  acteurId: z.string().min(1, { error: "acteurs.role.validation.acteur" }),
  role: z
    .string()
    .trim()
    .min(1, { error: "acteurs.role.validation.role" })
    .max(120, { error: "acteurs.role.validation.role" }),
  notes: z.string().trim().max(1000, { error: "auth.validation.trop_long" }),
});
type Valeurs = z.infer<typeof schema>;

/** Rôles proposés à la saisie : ceux des acteurs de l'annuaire, mais le champ reste libre. */
const SUGGESTIONS = [
  "Bailleur principal",
  "Cofinanceur",
  "Partenaire de mise en œuvre",
  "Prestataire",
  "Autorité locale",
];

type Props = {
  ouvert: boolean;
  onFermer: () => void;
  projetId: string;
  /** Rôle à modifier ; absent pour rattacher un acteur au projet. */
  role: RoleActeur | null;
  /** Acteurs de l'annuaire qu'on peut encore rattacher au projet (ceux qui n'y ont pas de rôle). */
  rattachables: Pick<Acteur, "id" | "nom" | "type">[];
  /** Acteur présélectionné (juste après sa création). */
  acteurId?: string;
};

/** Rattache un acteur de l'annuaire au projet avec son rôle, ou modifie ce rôle. */
export function DialogueRoleActeur(props: Props) {
  const { ouvert, onFermer, role } = props;
  return (
    <Drawer open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DrawerContent>
        {/* Remonté une fois quand l'acteur qu'on vient de créer apparaît dans la liste : la présélection y est alors valide. */}
        {ouvert && (
          <Corps
            key={
              role?.id ?? `nouveau-${props.acteurId ?? ""}-${props.rattachables.some((a) => a.id === props.acteurId)}`
            }
            {...props}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function Corps({ onFermer, projetId, role, rattachables, acteurId = "" }: Props) {
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
    defaultValues: { acteurId: role?.acteur_id ?? acteurId, role: role?.role ?? "", notes: role?.notes ?? "" },
  });

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs) => {
      const requete = role
        ? getSupabase()
            .from("projet_acteurs")
            .update({ role: v.role, notes: v.notes || null })
            .eq("id", role.id)
        : getSupabase()
            .from("projet_acteurs")
            .insert({ project_id: projetId, acteur_id: v.acteurId, role: v.role, notes: v.notes || null });
      const { error } = await requete;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t(role ? "acteurs.role.modifie" : "acteurs.role.ajoute"));
      onFermer();
      void queryClient.invalidateQueries({ queryKey: clesSe.rolesActeurs(org.organisation.id) });
    },
    onError: gererErreur,
  });

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);
  const formulaire = "formulaire-role-acteur";
  return (
    <>
      <DrawerHeader>
        <DrawerTitle className="text-xl font-bold text-navy">
          {t(role ? "acteurs.role.titre_modifier" : "acteurs.role.titre_ajouter")}
        </DrawerTitle>
        <DrawerDescription className="text-sm text-muted-foreground">{t("acteurs.role.description")}</DrawerDescription>
      </DrawerHeader>
      <DrawerBody>
        <form id={formulaire} onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate className="grid gap-4">
          {!role && (
            <Champ
              id="role-acteur"
              libelle={t("acteurs.role.acteur")}
              aide={rattachables.length === 0 ? t("acteurs.role.aucun_rattachable") : undefined}
              erreur={erreur(errors.acteurId?.message)}
            >
              {(a) => (
                <NativeSelect {...a} {...register("acteurId")}>
                  <option value="">{t("acteurs.role.choisir")}</option>
                  {rattachables.map((ac) => (
                    <option key={ac.id} value={ac.id}>
                      {`${ac.nom} - ${t(`acteurs.types.${ac.type}`)}`}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Champ>
          )}
          <Champ
            id="role-libelle"
            libelle={t("acteurs.role.role")}
            aide={t("acteurs.role.role_aide")}
            erreur={erreur(errors.role?.message)}
          >
            {(a) => <Input {...a} list="role-suggestions" autoComplete="off" {...register("role")} />}
          </Champ>
          <datalist id="role-suggestions">
            {SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <Champ id="role-notes" libelle={t("acteurs.role.notes")} optionnel erreur={erreur(errors.notes?.message)}>
            {(a) => <Textarea {...a} rows={3} {...register("notes")} />}
          </Champ>
        </form>
      </DrawerBody>
      <DrawerFooter>
        <Button variante="contour" onClick={onFermer}>
          {t("commun.annuler")}
        </Button>
        <Button type="submit" form={formulaire} chargement={enregistrer.isPending}>
          {t(role ? "acteurs.role.action_modifier" : "acteurs.role.action_ajouter")}
        </Button>
      </DrawerFooter>
    </>
  );
}
