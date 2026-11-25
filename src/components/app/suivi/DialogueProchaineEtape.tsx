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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Champ } from "~/components/ui/field";
import { Input, NativeSelect, Textarea } from "~/components/ui/input";
import { useOrg } from "~/hooks/useContexteOrg";
import { STATUTS_TRAVAIL } from "~/lib/avancement";
import { clesSe, type ProchaineEtape, useNomsMembres } from "~/lib/donnees-se";
import { suggestionsResponsables } from "~/lib/suivi";
import { getSupabase } from "~/lib/supabase";

const schema = z.object({
  libelle: z
    .string()
    .trim()
    .min(2, { error: "prochaines.formulaire.validation.libelle" })
    .max(300, { error: "prochaines.formulaire.validation.libelle" }),
  responsable: z.string().trim().max(120, { error: "auth.validation.trop_long" }),
  echeance: z.union([z.literal(""), z.iso.date({ error: "prochaines.formulaire.validation.date" })]),
  statut: z.enum(STATUTS_TRAVAIL as [string, ...string[]]),
  kpiId: z.string(),
});
type Valeurs = z.infer<typeof schema>;

/** Départ d'une prochaine étape créée depuis l'alerte d'un indicateur. */
export type DepartProchaineEtape = { libelle: string; kpiId: string };

type Props = {
  ouvert: boolean;
  onFermer: () => void;
  projetId: string;
  /** Action à modifier ; absente pour une création. */
  etape?: ProchaineEtape | null;
  depart?: DepartProchaineEtape | null;
  kpis: { id: string; nom: string }[];
  /** Responsables déjà saisis sur ce projet, proposés avec les noms des membres. */
  responsablesExistants?: (string | null)[];
};

/** Création ou modification d'une prochaine étape (action de court terme). */
export function DialogueProchaineEtape(props: Props) {
  const { ouvert, onFermer, etape, depart } = props;
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="sm:max-w-lg">
        {/* Monté à chaque ouverture : le formulaire repart des valeurs de l'action ou de l'alerte. */}
        {ouvert && <Corps key={etape?.id ?? `nouvelle-${depart?.kpiId ?? ""}`} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function Corps({ onFermer, projetId, etape, depart, kpis, responsablesExistants }: Props) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const membres = useNomsMembres(org.organisation.id);
  const suggestions = useMemo(
    () => suggestionsResponsables(membres.data, responsablesExistants),
    [membres.data, responsablesExistants],
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Valeurs>({
    resolver: zodResolver(schema),
    defaultValues: {
      libelle: etape?.libelle ?? depart?.libelle ?? "",
      responsable: etape?.responsable ?? "",
      echeance: etape?.echeance ?? "",
      statut: etape?.statut ?? "a_faire",
      kpiId: etape?.kpi_id ?? depart?.kpiId ?? "",
    },
  });

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs) => {
      const champs = {
        libelle: v.libelle,
        responsable: v.responsable || null,
        echeance: v.echeance || null,
        statut: v.statut as ProchaineEtape["statut"],
        kpi_id: v.kpiId || null,
      };
      const requete = etape
        ? getSupabase().from("prochaines_etapes").update(champs).eq("id", etape.id)
        : getSupabase()
            .from("prochaines_etapes")
            .insert({ project_id: projetId, ...champs });
      const { error } = await requete;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t(etape ? "prochaines.formulaire.modifiee" : "prochaines.formulaire.creee"));
      onFermer();
      void queryClient.invalidateQueries({ queryKey: clesSe.prochaines(projetId) });
    },
    onError: gererErreur,
  });

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);
  const formulaire = "formulaire-prochaine-etape";
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t(etape ? "prochaines.formulaire.titre_modifier" : "prochaines.formulaire.titre_creer")}
        </DialogTitle>
        <DialogDescription>
          {depart ? t("prochaines.formulaire.depuis_alerte") : t("prochaines.formulaire.description")}
        </DialogDescription>
      </DialogHeader>
      <form id={formulaire} onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate className="grid gap-4">
        <Champ
          id="prochaine-libelle"
          libelle={t("prochaines.formulaire.libelle")}
          erreur={erreur(errors.libelle?.message)}
        >
          {(a) => <Textarea {...a} rows={3} {...register("libelle")} />}
        </Champ>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Champ
            id="prochaine-responsable"
            libelle={t("prochaines.formulaire.responsable")}
            optionnel
            erreur={erreur(errors.responsable?.message)}
          >
            {(a) => <Input {...a} list="prochaine-responsables" autoComplete="off" {...register("responsable")} />}
          </Champ>
          <Champ
            id="prochaine-echeance"
            libelle={t("prochaines.formulaire.echeance")}
            optionnel
            erreur={erreur(errors.echeance?.message)}
          >
            {(a) => <Input {...a} type="date" {...register("echeance")} />}
          </Champ>
        </div>
        {suggestions.length > 0 && (
          <datalist id="prochaine-responsables">
            {suggestions.map((nom) => (
              <option key={nom} value={nom} />
            ))}
          </datalist>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Champ id="prochaine-statut" libelle={t("prochaines.formulaire.statut")}>
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
          <Champ id="prochaine-kpi" libelle={t("prochaines.formulaire.indicateur")} optionnel>
            {(a) => (
              <NativeSelect {...a} {...register("kpiId")}>
                <option value="">{t("prochaines.formulaire.aucun_indicateur")}</option>
                {kpis.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nom}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Champ>
        </div>
      </form>
      <DialogFooter>
        <Button variante="contour" onClick={onFermer}>
          {t("commun.annuler")}
        </Button>
        <Button type="submit" form={formulaire} chargement={enregistrer.isPending}>
          {t(etape ? "prochaines.formulaire.action_modifier" : "prochaines.formulaire.action_creer")}
        </Button>
      </DialogFooter>
    </>
  );
}
