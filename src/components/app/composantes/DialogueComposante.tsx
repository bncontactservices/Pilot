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
import { STATUTS_TRAVAIL } from "~/lib/avancement";
import { type ComposanteProjet, clesSe } from "~/lib/donnees-se";
import { getSupabase } from "~/lib/supabase";

const schema = z
  .object({
    nom: z
      .string()
      .trim()
      .min(2, { error: "composantes.formulaire.validation.nom" })
      .max(160, { error: "composantes.formulaire.validation.nom" }),
    description: z.string().trim().max(1000, { error: "auth.validation.trop_long" }),
    responsable: z.string().trim().max(120, { error: "auth.validation.trop_long" }),
    dateDebut: z.string(),
    dateFin: z.string(),
    statut: z.enum(STATUTS_TRAVAIL as [string, ...string[]]),
  })
  .superRefine((v, ctx) => {
    const debut = v.dateDebut !== "";
    const fin = v.dateFin !== "";
    if (debut !== fin) {
      ctx.addIssue({
        code: "custom",
        path: [debut ? "dateFin" : "dateDebut"],
        message: "composantes.formulaire.validation.paire",
      });
      return;
    }
    if (!debut) return;
    for (const champ of ["dateDebut", "dateFin"] as const) {
      if (!z.iso.date().safeParse(v[champ]).success) {
        ctx.addIssue({ code: "custom", path: [champ], message: "composantes.formulaire.validation.date" });
        return;
      }
    }
    if (v.dateFin < v.dateDebut) {
      ctx.addIssue({ code: "custom", path: ["dateFin"], message: "composantes.formulaire.validation.dates" });
    }
  });
type Valeurs = z.infer<typeof schema>;

type Props = {
  ouvert: boolean;
  onFermer: () => void;
  projetId: string;
  /** Composante à modifier ; absente pour une création. */
  composante: ComposanteProjet | null;
  /** Noms des membres et responsables déjà saisis, proposés pour le champ « Responsable ». */
  suggestionsResponsables: string[];
  /** Ordre proposé à une nouvelle composante : à la suite des autres. */
  ordreSuivant: number;
};

/** Création ou modification d'une composante : un axe du projet, avec ses dates et son statut. */
export function DialogueComposante(props: Props) {
  const { ouvert, onFermer, composante } = props;
  return (
    <Drawer open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DrawerContent>{ouvert && <Corps key={composante?.id ?? "nouvelle"} {...props} />}</DrawerContent>
    </Drawer>
  );
}

function Corps({ onFermer, projetId, composante, suggestionsResponsables, ordreSuivant }: Props) {
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
      nom: composante?.nom ?? "",
      description: composante?.description ?? "",
      responsable: composante?.responsable ?? "",
      dateDebut: composante?.date_debut ?? "",
      dateFin: composante?.date_fin ?? "",
      statut: composante?.statut ?? "a_faire",
    },
  });

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs) => {
      const champs = {
        nom: v.nom,
        description: v.description || null,
        responsable: v.responsable || null,
        date_debut: v.dateDebut || null,
        date_fin: v.dateFin || null,
        statut: v.statut as ComposanteProjet["statut"],
      };
      const requete = composante
        ? getSupabase().from("composantes").update(champs).eq("id", composante.id)
        : getSupabase()
            .from("composantes")
            .insert({ project_id: projetId, ordre: ordreSuivant, ...champs });
      const { error } = await requete;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t(composante ? "composantes.formulaire.modifiee" : "composantes.formulaire.creee"));
      onFermer();
      void queryClient.invalidateQueries({ queryKey: clesSe.composantes(projetId) });
    },
    onError: (erreur) => {
      // Un nom n'existe qu'une fois par projet : on le dit précisément plutôt que « existe déjà ».
      if ((erreur as { code?: string }).code === "23505") toast.error(t("composantes.formulaire.doublon"));
      else gererErreur(erreur);
    },
  });

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);
  const formulaire = "formulaire-composante";
  return (
    <>
      <DrawerHeader>
        <DrawerTitle className="text-xl font-bold text-navy">
          {t(composante ? "composantes.formulaire.titre_modifier" : "composantes.formulaire.titre_creer")}
        </DrawerTitle>
        <DrawerDescription className="text-sm text-muted-foreground">
          {t("composantes.formulaire.description")}
        </DrawerDescription>
      </DrawerHeader>
      <DrawerBody>
        <form id={formulaire} onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate className="grid gap-4">
          <Champ id="composante-nom" libelle={t("composantes.formulaire.nom")} erreur={erreur(errors.nom?.message)}>
            {(a) => <Input {...a} {...register("nom")} />}
          </Champ>
          <Champ
            id="composante-description"
            libelle={t("composantes.formulaire.details")}
            optionnel
            erreur={erreur(errors.description?.message)}
          >
            {(a) => <Textarea {...a} rows={3} {...register("description")} />}
          </Champ>
          <Champ
            id="composante-responsable"
            libelle={t("composantes.formulaire.responsable")}
            optionnel
            erreur={erreur(errors.responsable?.message)}
          >
            {(a) => <Input {...a} list="composante-responsables" autoComplete="off" {...register("responsable")} />}
          </Champ>
          {suggestionsResponsables.length > 0 && (
            <datalist id="composante-responsables">
              {suggestionsResponsables.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ
              id="composante-debut"
              libelle={t("composantes.formulaire.debut")}
              optionnel
              erreur={erreur(errors.dateDebut?.message)}
            >
              {(a) => <Input {...a} type="date" {...register("dateDebut")} />}
            </Champ>
            <Champ
              id="composante-fin"
              libelle={t("composantes.formulaire.fin")}
              optionnel
              erreur={erreur(errors.dateFin?.message)}
            >
              {(a) => <Input {...a} type="date" {...register("dateFin")} />}
            </Champ>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t("composantes.formulaire.dates_aide")}</p>
          <Champ id="composante-statut" libelle={t("composantes.formulaire.statut")}>
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
      </DrawerBody>
      <DrawerFooter>
        <Button variante="contour" onClick={onFermer}>
          {t("commun.annuler")}
        </Button>
        <Button type="submit" form={formulaire} chargement={enregistrer.isPending}>
          {t(composante ? "composantes.formulaire.action_modifier" : "composantes.formulaire.action_creer")}
        </Button>
      </DrawerFooter>
    </>
  );
}
