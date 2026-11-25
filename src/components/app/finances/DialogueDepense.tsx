import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { deposerDocument, supprimerDocument } from "~/lib/documents";
import {
  clesSe,
  type DepenseProjet,
  type DocumentProjet,
  invaliderAvancement,
  type LigneBudgetProjet,
} from "~/lib/donnees-se";
import { aujourdhuiIso } from "~/lib/kpi";
import { EXTENSIONS_DOCUMENTS, verifierFichier } from "~/lib/suivi";
import { getSupabase } from "~/lib/supabase";
import { MONTANT_VALIDE, versMontant } from "./DialogueBudgetLigne";

/** Valeur de la liste « Justificatif » qui fait apparaître le choix d'un nouveau fichier. */
const NOUVEAU = "__nouveau";
const nettoyer = (v: string) => v.replace(/\s/g, "");

const schema = z.object({
  date: z.iso
    .date({ error: "finances.depense.validation.date" })
    .refine((v) => v <= aujourdhuiIso(), { error: "finances.depense.validation.date" }),
  libelle: z
    .string()
    .trim()
    .min(1, { error: "finances.depense.validation.libelle" })
    .max(200, { error: "finances.depense.validation.libelle" }),
  montant: z
    .string()
    .trim()
    .refine((v) => MONTANT_VALIDE.test(nettoyer(v)) && versMontant(v) > 0, {
      error: "finances.depense.validation.montant",
    }),
  ligneId: z.string().min(1, { error: "finances.depense.validation.ligne" }),
  fournisseur: z.string().trim().max(160, { error: "auth.validation.trop_long" }),
  reference: z.string().trim().max(80, { error: "auth.validation.trop_long" }),
  justificatif: z.string(),
});
type Valeurs = z.infer<typeof schema>;

type Props = {
  ouvert: boolean;
  onFermer: () => void;
  projet: { id: string; devise: string };
  /** Dépense à modifier ; absente pour un enregistrement. */
  depense: DepenseProjet | null;
  lignes: LigneBudgetProjet[];
  /** Documents du projet : un justificatif peut être l'un d'eux. */
  documents: DocumentProjet[];
  /** Ligne présélectionnée (enregistrement depuis une ligne du budget). */
  ligneId?: string;
};

/** Enregistrement ou modification d'une dépense, rattachée à une ligne du budget, avec son justificatif. */
export function DialogueDepense(props: Props) {
  const { ouvert, onFermer, depense } = props;
  return (
    <Drawer open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DrawerContent>
        {ouvert && <Corps key={depense?.id ?? `nouvelle-${props.ligneId ?? ""}`} {...props} />}
      </DrawerContent>
    </Drawer>
  );
}

function Corps({ onFermer, projet, depense, lignes, documents, ligneId = "" }: Props) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const [fichier, setFichier] = useState<File | null>(null);
  const [problemeFichier, setProblemeFichier] = useState<string | null>(null);
  const triees = useMemo(
    () => [...lignes].sort((a, b) => b.annee - a.annee || a.poste.localeCompare(b.poste, "fr")),
    [lignes],
  );
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<Valeurs>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: depense?.date ?? aujourdhuiIso(),
      libelle: depense?.libelle ?? "",
      montant: depense ? String(depense.montant).replace(".", ",") : "",
      ligneId: depense?.budget_ligne_id ?? ligneId,
      fournisseur: depense?.fournisseur ?? "",
      reference: depense?.reference ?? "",
      justificatif: depense?.document_id ?? "",
    },
  });
  const justificatif = useWatch({ control, name: "justificatif" });

  const choisir = (candidat: File | undefined) => {
    if (!candidat) return;
    const probleme = verifierFichier(candidat);
    if (probleme) {
      setFichier(null);
      setProblemeFichier(t(`documents.formulaire.fichier_${probleme}`));
      return;
    }
    setFichier(candidat);
    setProblemeFichier(null);
  };

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs) => {
      let documentId = v.justificatif && v.justificatif !== NOUVEAU ? v.justificatif : null;
      let depose: { id: string; storage_path: string } | null = null;
      if (v.justificatif === NOUVEAU && fichier) {
        depose = await deposerDocument({
          orgId: org.organisation.id,
          projetId: projet.id,
          fichier,
          nom: `${t("finances.depense.justificatif_nom")} — ${v.libelle}`.slice(0, 200),
          categorie: "justificatif",
          description: null,
          realisationId: null,
        });
        documentId = depose.id;
      }
      const champs = {
        budget_ligne_id: v.ligneId,
        date: v.date,
        libelle: v.libelle,
        montant: versMontant(v.montant),
        fournisseur: v.fournisseur || null,
        reference: v.reference || null,
        document_id: documentId,
      };
      const requete = depense
        ? getSupabase().from("depenses").update(champs).eq("id", depense.id)
        : getSupabase()
            .from("depenses")
            .insert({ project_id: projet.id, ...champs });
      const { error } = await requete;
      if (error) {
        // La dépense n'est pas enregistrée : le fichier qu'on vient de déposer pour elle ne doit pas rester.
        if (depose) await supprimerDocument(depose).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success(t(depense ? "finances.depense.formulaire.modifiee" : "finances.depense.formulaire.creee"));
      onFermer();
      void queryClient.invalidateQueries({ queryKey: clesSe.depenses(projet.id) });
      void queryClient.invalidateQueries({ queryKey: clesSe.documents(projet.id) });
      invaliderAvancement(queryClient, org.organisation.id);
    },
    onError: gererErreur,
  });

  const valider = (v: Valeurs) => {
    if (v.justificatif === NOUVEAU && !fichier) {
      setProblemeFichier(t("documents.formulaire.fichier_manquant"));
      return;
    }
    enregistrer.mutate(v);
  };

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);
  const formulaire = "formulaire-depense";
  return (
    <>
      <DrawerHeader>
        <DrawerTitle className="text-xl font-bold text-navy">
          {t(depense ? "finances.depense.formulaire.titre_modifier" : "finances.depense.formulaire.titre_creer")}
        </DrawerTitle>
        <DrawerDescription className="text-sm text-muted-foreground">
          {t("finances.depense.formulaire.description", { devise: projet.devise })}
        </DrawerDescription>
      </DrawerHeader>
      <DrawerBody>
        <form id={formulaire} onSubmit={handleSubmit(valider)} noValidate className="grid gap-4">
          <Champ
            id="depense-date"
            libelle={t("finances.depense.formulaire.date")}
            erreur={erreur(errors.date?.message)}
          >
            {(a) => <Input {...a} type="date" max={aujourdhuiIso()} {...register("date")} />}
          </Champ>
          <Champ
            id="depense-libelle"
            libelle={t("finances.depense.formulaire.libelle")}
            erreur={erreur(errors.libelle?.message)}
          >
            {(a) => <Input {...a} {...register("libelle")} />}
          </Champ>
          <Champ
            id="depense-montant"
            libelle={t("finances.depense.formulaire.montant", { devise: projet.devise })}
            erreur={erreur(errors.montant?.message)}
          >
            {(a) => <Input {...a} inputMode="decimal" placeholder="250 000" {...register("montant")} />}
          </Champ>
          <Champ
            id="depense-ligne"
            libelle={t("finances.depense.formulaire.ligne")}
            aide={t("finances.depense.formulaire.ligne_aide")}
            erreur={erreur(errors.ligneId?.message)}
          >
            {(a) => (
              <NativeSelect {...a} {...register("ligneId")}>
                <option value="">{t("finances.depense.formulaire.choisir_ligne")}</option>
                {triees.map((l) => (
                  <option key={l.id} value={l.id}>
                    {`${l.annee} — ${l.poste}`}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Champ>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ
              id="depense-fournisseur"
              libelle={t("finances.depense.formulaire.fournisseur")}
              optionnel
              erreur={erreur(errors.fournisseur?.message)}
            >
              {(a) => <Input {...a} {...register("fournisseur")} />}
            </Champ>
            <Champ
              id="depense-reference"
              libelle={t("finances.depense.formulaire.reference")}
              optionnel
              erreur={erreur(errors.reference?.message)}
            >
              {(a) => <Input {...a} placeholder="FAC-2026-014" {...register("reference")} />}
            </Champ>
          </div>
          <Champ
            id="depense-justificatif"
            libelle={t("finances.depense.formulaire.justificatif")}
            aide={t("finances.depense.formulaire.justificatif_aide")}
            optionnel
          >
            {(a) => (
              <NativeSelect {...a} {...register("justificatif")}>
                <option value="">{t("finances.depense.formulaire.aucun_justificatif")}</option>
                <option value={NOUVEAU}>{t("finances.depense.formulaire.nouveau_justificatif")}</option>
                {documents.length > 0 && (
                  <optgroup label={t("finances.depense.formulaire.documents_existants")}>
                    {documents.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nom}
                      </option>
                    ))}
                  </optgroup>
                )}
              </NativeSelect>
            )}
          </Champ>
          {justificatif === NOUVEAU && (
            <Champ
              id="depense-fichier"
              libelle={t("finances.depense.formulaire.fichier")}
              aide={t("documents.formulaire.description_depot")}
              erreur={problemeFichier ?? undefined}
            >
              {(a) => (
                <Input
                  {...a}
                  type="file"
                  accept={EXTENSIONS_DOCUMENTS.join(",")}
                  onChange={(e) => choisir(e.target.files?.[0])}
                />
              )}
            </Champ>
          )}
        </form>
      </DrawerBody>
      <DrawerFooter>
        <Button variante="contour" onClick={onFermer}>
          {t("commun.annuler")}
        </Button>
        <Button type="submit" form={formulaire} chargement={enregistrer.isPending}>
          {t(depense ? "finances.depense.formulaire.action_modifier" : "finances.depense.formulaire.action_creer")}
        </Button>
      </DrawerFooter>
    </>
  );
}
