import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
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
import { clesSe, invaliderAvancement, type LigneBudgetProjet } from "~/lib/donnees-se";
import { anneesProposees } from "~/lib/finances";
import { aujourdhuiIso } from "~/lib/kpi";
import { getSupabase } from "~/lib/supabase";

const nettoyer = (v: string) => v.replace(/\s/g, "");
/** « 1 250 000 » et « 12,5 » : espaces ignorés, virgule ou point décimal, deux décimales au plus. */
export const MONTANT_VALIDE = /^\d{1,14}([.,]\d{1,2})?$/;
export const versMontant = (texte: string) => Number(nettoyer(texte).replace(",", "."));

const schema = z.object({
  annee: z.string().regex(/^\d{4}$/, { error: "finances.ligne.validation.annee" }),
  poste: z
    .string()
    .trim()
    .min(1, { error: "finances.ligne.validation.poste" })
    .max(160, { error: "finances.ligne.validation.poste" }),
  montant: z
    .string()
    .trim()
    .refine((v) => MONTANT_VALIDE.test(nettoyer(v)), {
      error: "finances.ligne.validation.montant",
    }),
  notes: z.string().trim().max(1000, { error: "auth.validation.trop_long" }),
});
type Valeurs = z.infer<typeof schema>;

type Props = {
  ouvert: boolean;
  onFermer: () => void;
  projet: { id: string; date_debut: string; date_fin: string; devise: string };
  /** Ligne à modifier ; absente pour une création. */
  ligne: LigneBudgetProjet | null;
  /** Postes déjà utilisés sur ce projet, proposés à la saisie. */
  postesExistants: string[];
};

/** Création ou modification d'une ligne budgétaire (un poste de dépense pour une année). */
export function DialogueBudgetLigne(props: Props) {
  const { ouvert, onFermer, ligne } = props;
  return (
    <Drawer open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DrawerContent>{ouvert && <Corps key={ligne?.id ?? "nouvelle"} {...props} />}</DrawerContent>
    </Drawer>
  );
}

function Corps({ onFermer, projet, ligne, postesExistants }: Props) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const annees = useMemo(() => {
    const liste = anneesProposees(projet.date_debut, projet.date_fin, aujourdhuiIso());
    return ligne && !liste.includes(ligne.annee) ? [ligne.annee, ...liste] : liste;
  }, [projet.date_debut, projet.date_fin, ligne]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Valeurs>({
    resolver: zodResolver(schema),
    defaultValues: {
      annee: String(ligne?.annee ?? annees[0] ?? new Date().getFullYear()),
      poste: ligne?.poste ?? "",
      montant: ligne ? String(ligne.montant_prevu).replace(".", ",") : "",
      notes: ligne?.notes ?? "",
    },
  });

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs) => {
      const champs = {
        annee: Number(v.annee),
        poste: v.poste,
        montant_prevu: versMontant(v.montant),
        notes: v.notes || null,
      };
      const requete = ligne
        ? getSupabase().from("budget_lignes").update(champs).eq("id", ligne.id)
        : getSupabase()
            .from("budget_lignes")
            .insert({ project_id: projet.id, ...champs });
      const { error } = await requete;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t(ligne ? "finances.ligne.formulaire.modifiee" : "finances.ligne.formulaire.creee"));
      onFermer();
      void queryClient.invalidateQueries({ queryKey: clesSe.budget(projet.id) });
      invaliderAvancement(queryClient, org.organisation.id);
    },
    onError: (erreur) => {
      // Un poste existe une seule fois par année : on le dit précisément plutôt que « existe déjà ».
      if ((erreur as { code?: string }).code === "23505") toast.error(t("finances.ligne.formulaire.doublon"));
      else gererErreur(erreur);
    },
  });

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);
  const formulaire = "formulaire-budget-ligne";
  return (
    <>
      <DrawerHeader>
        <DrawerTitle className="text-xl font-bold text-navy">
          {t(ligne ? "finances.ligne.formulaire.titre_modifier" : "finances.ligne.formulaire.titre_creer")}
        </DrawerTitle>
        <DrawerDescription className="text-sm text-muted-foreground">
          {t("finances.ligne.formulaire.description", { devise: projet.devise })}
        </DrawerDescription>
      </DrawerHeader>
      <DrawerBody>
        <form id={formulaire} onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate className="grid gap-4">
          <Champ id="ligne-annee" libelle={t("finances.ligne.formulaire.annee")} erreur={erreur(errors.annee?.message)}>
            {(a) => (
              <NativeSelect {...a} {...register("annee")}>
                {annees.map((annee) => (
                  <option key={annee} value={annee}>
                    {annee}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Champ>
          <Champ
            id="ligne-poste"
            libelle={t("finances.ligne.formulaire.poste")}
            aide={t("finances.ligne.formulaire.poste_aide")}
            erreur={erreur(errors.poste?.message)}
          >
            {(a) => <Input {...a} list="ligne-postes" autoComplete="off" {...register("poste")} />}
          </Champ>
          {postesExistants.length > 0 && (
            <datalist id="ligne-postes">
              {postesExistants.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          )}
          <Champ
            id="ligne-montant"
            libelle={t("finances.ligne.formulaire.montant", { devise: projet.devise })}
            erreur={erreur(errors.montant?.message)}
          >
            {(a) => <Input {...a} inputMode="decimal" placeholder="1 250 000" {...register("montant")} />}
          </Champ>
          <Champ
            id="ligne-notes"
            libelle={t("finances.ligne.formulaire.notes")}
            optionnel
            erreur={erreur(errors.notes?.message)}
          >
            {(a) => <Textarea {...a} rows={3} {...register("notes")} />}
          </Champ>
        </form>
      </DrawerBody>
      <DrawerFooter>
        <Button variante="contour" onClick={onFermer}>
          {t("commun.annuler")}
        </Button>
        <Button type="submit" form={formulaire} chargement={enregistrer.isPending}>
          {t(ligne ? "finances.ligne.formulaire.action_modifier" : "finances.ligne.formulaire.action_creer")}
        </Button>
      </DrawerFooter>
    </>
  );
}
