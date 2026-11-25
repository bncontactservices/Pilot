import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { ChampLocalite } from "~/components/app/zones/ChampLocalite";
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
import { aplatir, construireArbre, type Noeud } from "~/lib/cadre-logique";
import { type ActivitePta, clesSe, type Realisation } from "~/lib/donnees-se";
import { useParametresSe } from "~/lib/donnees";
import { aujourdhuiIso } from "~/lib/kpi";
import { getSupabase } from "~/lib/supabase";

const nettoyer = (v: string) => v.replace(/\s/g, "");
const versNombre = (texte: string) => Number(nettoyer(texte).replace(",", "."));
const schema = z.object({
  date: z.iso.date({ error: "realisations.formulaire.validation.date" }),
  titre: z
    .string()
    .trim()
    .min(2, { error: "realisations.formulaire.validation.titre" })
    .max(200, { error: "realisations.formulaire.validation.titre" }),
  description: z.string().trim().max(4000, { error: "auth.validation.trop_long" }),
  quantite: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+([.,]\d{1,2})?$/.test(nettoyer(v)), {
      error: "realisations.formulaire.validation.quantite",
    }),
  unite: z.string().trim().max(40, { error: "auth.validation.trop_long" }),
  lieu: z.string().trim().max(160, { error: "auth.validation.trop_long" }),
  localiteId: z.string(),
  noeudId: z.string(),
  ptaId: z.string(),
});
type Valeurs = z.infer<typeof schema>;

type Props = {
  ouvert: boolean;
  onFermer: () => void;
  projetId: string;
  realisation: Realisation | null;
  noeuds: Noeud[];
  activitesPta: Pick<ActivitePta, "id" | "intitule" | "annee">[];
  /** Unités déjà utilisées sur ce projet, proposées avec celles des paramètres S&E. */
  unitesExistantes: string[];
};

/** Création ou modification d'une réalisation (extrant constaté). */
export function DialogueRealisation(props: Props) {
  const { ouvert, onFermer, realisation } = props;
  return (
    <Drawer open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DrawerContent>{ouvert && <Corps key={realisation?.id ?? "nouvelle"} {...props} />}</DrawerContent>
    </Drawer>
  );
}

function Corps({ onFermer, projetId, realisation, noeuds, activitesPta, unitesExistantes }: Props) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const parametres = useParametresSe(org.organisation.id);
  const unites = useMemo(
    () =>
      [...new Set([...(parametres.data?.unites_perso ?? []), ...unitesExistantes])].sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [parametres.data, unitesExistantes],
  );
  // Une réalisation se rattache à un résultat ou à une activité du cadre logique, dans l'ordre de l'arbre.
  const lignes = useMemo(
    () => aplatir(construireArbre(noeuds)).filter((n) => n.type === "resultat" || n.type === "activite"),
    [noeuds],
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Valeurs>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: realisation?.date ?? aujourdhuiIso(),
      titre: realisation?.titre ?? "",
      description: realisation?.description ?? "",
      quantite: realisation?.quantite == null ? "" : String(realisation.quantite).replace(".", ","),
      unite: realisation?.unite ?? "",
      lieu: realisation?.lieu ?? "",
      localiteId: realisation?.localite_id ?? "",
      noeudId: realisation?.noeud_id ?? "",
      ptaId: realisation?.pta_activite_id ?? "",
    },
  });

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs) => {
      const champs = {
        date: v.date,
        titre: v.titre,
        description: v.description || null,
        quantite: v.quantite ? versNombre(v.quantite) : null,
        unite: v.unite || null,
        lieu: v.lieu || null,
        localite_id: v.localiteId || null,
        noeud_id: v.noeudId || null,
        pta_activite_id: v.ptaId || null,
      };
      const requete = realisation
        ? getSupabase().from("realisations").update(champs).eq("id", realisation.id)
        : getSupabase()
            .from("realisations")
            .insert({ project_id: projetId, ...champs });
      const { error } = await requete;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t(realisation ? "realisations.formulaire.modifiee" : "realisations.formulaire.creee"));
      onFermer();
      void queryClient.invalidateQueries({ queryKey: clesSe.realisations(projetId) });
    },
    onError: gererErreur,
  });

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);
  const formulaire = "formulaire-realisation";
  const court = (texte: string) => (texte.length > 70 ? `${texte.slice(0, 70)}…` : texte);
  return (
    <>
      <DrawerHeader>
        <DrawerTitle className="text-xl font-bold text-navy">
          {t(realisation ? "realisations.formulaire.titre_modifier" : "realisations.formulaire.titre_creer")}
        </DrawerTitle>
        <DrawerDescription className="text-sm text-muted-foreground">
          {t("realisations.formulaire.description")}
        </DrawerDescription>
      </DrawerHeader>
      <DrawerBody>
        <form id={formulaire} onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate className="grid gap-4">
          <Champ
            id="realisation-date"
            libelle={t("realisations.formulaire.date")}
            erreur={erreur(errors.date?.message)}
          >
            {(a) => <Input {...a} type="date" {...register("date")} />}
          </Champ>
          <Champ
            id="realisation-titre"
            libelle={t("realisations.formulaire.titre")}
            erreur={erreur(errors.titre?.message)}
          >
            {(a) => <Input {...a} {...register("titre")} />}
          </Champ>
          <Champ
            id="realisation-description"
            libelle={t("realisations.formulaire.details")}
            optionnel
            erreur={erreur(errors.description?.message)}
          >
            {(a) => <Textarea {...a} rows={3} {...register("description")} />}
          </Champ>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ
              id="realisation-quantite"
              libelle={t("realisations.formulaire.quantite")}
              optionnel
              erreur={erreur(errors.quantite?.message)}
            >
              {(a) => <Input {...a} inputMode="decimal" placeholder="12" {...register("quantite")} />}
            </Champ>
            <Champ
              id="realisation-unite"
              libelle={t("realisations.formulaire.unite")}
              optionnel
              erreur={erreur(errors.unite?.message)}
            >
              {(a) => <Input {...a} list="realisation-unites" autoComplete="off" {...register("unite")} />}
            </Champ>
          </div>
          {unites.length > 0 && (
            <datalist id="realisation-unites">
              {unites.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          )}
          <ChampLocalite
            id="realisation-localite"
            projetId={projetId}
            libelle={t("realisations.formulaire.localite")}
            aide={t("realisations.formulaire.localite_aide")}
            aucune={t("realisations.formulaire.localite_aucune")}
            inscription={register("localiteId")}
            courante={realisation?.localite_id}
          />
          <Champ
            id="realisation-lieu"
            libelle={t("realisations.formulaire.lieu")}
            aide={t("realisations.formulaire.lieu_aide")}
            optionnel
            erreur={erreur(errors.lieu?.message)}
          >
            {(a) => <Input {...a} {...register("lieu")} />}
          </Champ>
          <Champ
            id="realisation-noeud"
            libelle={t("realisations.formulaire.noeud")}
            aide={lignes.length === 0 ? t("realisations.formulaire.noeud_vide") : undefined}
            optionnel
          >
            {(a) => (
              <NativeSelect {...a} {...register("noeudId")}>
                <option value="">{t("realisations.formulaire.aucun")}</option>
                {lignes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {`${n.code} — ${court(n.libelle)}`}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Champ>
          <Champ id="realisation-pta" libelle={t("realisations.formulaire.pta")} optionnel>
            {(a) => (
              <NativeSelect {...a} {...register("ptaId")}>
                <option value="">{t("realisations.formulaire.aucune")}</option>
                {activitesPta.map((p) => (
                  <option key={p.id} value={p.id}>
                    {`${p.annee} — ${court(p.intitule)}`}
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
          {t(realisation ? "realisations.formulaire.action_modifier" : "realisations.formulaire.action_creer")}
        </Button>
      </DrawerFooter>
    </>
  );
}
