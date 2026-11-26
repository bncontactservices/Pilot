import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { type DragEvent, useId, useRef, useState } from "react";
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
import { deposerDocument } from "~/lib/documents";
import { clesSe, type DocumentProjet, type Realisation } from "~/lib/donnees-se";
import { formaterDate, formaterTaille } from "~/lib/format";
import { EXTENSIONS_DOCUMENTS, nomDocumentSuggere, verifierFichier } from "~/lib/suivi";
import { getSupabase } from "~/lib/supabase";
import { cn } from "~/lib/utils";

export const CATEGORIES_DOCUMENT: DocumentProjet["categorie"][] = ["rapport", "contrat", "justificatif", "autre"];

const schema = z.object({
  nom: z
    .string()
    .trim()
    .min(1, { error: "documents.formulaire.validation.nom" })
    .max(200, { error: "documents.formulaire.validation.nom" }),
  categorie: z.enum(CATEGORIES_DOCUMENT as [string, ...string[]]),
  description: z.string().trim().max(1000, { error: "auth.validation.trop_long" }),
  realisationId: z.string(),
});
type Valeurs = z.infer<typeof schema>;

type Props = {
  ouvert: boolean;
  onFermer: () => void;
  projetId: string;
  /** Document à modifier ; absent pour un dépôt. */
  document?: DocumentProjet | null;
  realisations: Pick<Realisation, "id" | "titre" | "date">[];
  /** Réalisation présélectionnée (dépôt d'une preuve depuis la liste des réalisations). */
  realisationId?: string;
};

/** Dépôt d'un fichier (avec sa catégorie) ou modification de ses informations. */
export function DialogueDocument(props: Props) {
  const { ouvert, onFermer, document } = props;
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="sm:max-w-lg">
        {ouvert && <Corps key={document?.id ?? `depot-${props.realisationId ?? ""}`} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function Corps({ onFermer, projetId, document, realisations, realisationId = "" }: Props) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const idFichier = useId();
  const champFichier = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [problemeFichier, setProblemeFichier] = useState<string | null>(null);
  const [survol, setSurvol] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<Valeurs>({
    resolver: zodResolver(schema),
    defaultValues: {
      nom: document?.nom ?? "",
      categorie: document?.categorie ?? "autre",
      description: document?.description ?? "",
      realisationId: document?.realisation_id ?? realisationId,
    },
  });

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
    if (!getValues("nom").trim()) setValue("nom", nomDocumentSuggere(candidat.name), { shouldValidate: true });
  };
  const deposer = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setSurvol(false);
    choisir(e.dataTransfer.files[0]);
  };

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs) => {
      const champs = {
        nom: v.nom,
        categorie: v.categorie as DocumentProjet["categorie"],
        description: v.description || null,
        realisation_id: v.realisationId || null,
      };
      if (document) {
        const { error } = await getSupabase().from("documents").update(champs).eq("id", document.id);
        if (error) throw error;
        return;
      }
      if (!fichier) throw new Error("FICHIER_MANQUANT");
      await deposerDocument({
        orgId: org.organisation.id,
        projetId,
        fichier,
        nom: champs.nom,
        categorie: champs.categorie,
        description: champs.description,
        realisationId: champs.realisation_id,
      });
    },
    onSuccess: () => {
      toast.success(t(document ? "documents.formulaire.modifie" : "documents.formulaire.depose"));
      onFermer();
      void queryClient.invalidateQueries({ queryKey: clesSe.documents(projetId) });
    },
    onError: gererErreur,
  });

  const envoyer = (v: Valeurs) => {
    if (!document && !fichier) {
      setProblemeFichier(t("documents.formulaire.fichier_manquant"));
      return;
    }
    enregistrer.mutate(v);
  };

  const erreur = (cle?: string) => (cle ? t(cle) : undefined);
  const formulaire = "formulaire-document";
  const idProbleme = `${idFichier}-probleme`;
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t(document ? "documents.formulaire.titre_modifier" : "documents.formulaire.titre_deposer")}
        </DialogTitle>
        <DialogDescription>{document ? document.nom : t("documents.formulaire.description_depot")}</DialogDescription>
      </DialogHeader>
      <form id={formulaire} onSubmit={handleSubmit(envoyer)} noValidate className="grid gap-4">
        {!document && (
          <div className="grid gap-2">
            <span className="text-sm font-semibold text-foreground">{t("documents.formulaire.fichier")}</span>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setSurvol(true);
              }}
              onDragLeave={() => setSurvol(false)}
              onDrop={deposer}
              className={cn(
                "flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors",
                survol ? "border-accent-ink bg-accent/10" : "border-navy/20 bg-card/60",
              )}
            >
              <FileUp className="size-6 text-navy" aria-hidden />
              {fichier ? (
                <p className="text-sm font-medium break-all text-foreground">
                  {fichier.name}{" "}
                  <span className="font-mono text-muted-foreground tabular">· {formaterTaille(fichier.size)}</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t("documents.formulaire.fichier_aide")}</p>
              )}
              <input
                ref={champFichier}
                id={idFichier}
                type="file"
                accept={EXTENSIONS_DOCUMENTS.join(",")}
                aria-label={t("documents.formulaire.fichier")}
                aria-describedby={problemeFichier ? idProbleme : undefined}
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  choisir(e.target.files?.[0]);
                  e.target.value = ""; // permet de rechoisir le même fichier après correction
                }}
              />
              <Button type="button" variante="contour" taille="sm" onClick={() => champFichier.current?.click()}>
                {t(fichier ? "documents.formulaire.changer" : "documents.formulaire.choisir")}
              </Button>
            </div>
            {problemeFichier && (
              <p id={idProbleme} role="alert" className="text-sm font-medium text-destructive">
                {problemeFichier}
              </p>
            )}
          </div>
        )}
        <Champ id="document-nom" libelle={t("documents.formulaire.nom")} erreur={erreur(errors.nom?.message)}>
          {(a) => <Input {...a} {...register("nom")} />}
        </Champ>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Champ id="document-categorie" libelle={t("documents.formulaire.categorie")}>
            {(a) => (
              <NativeSelect {...a} {...register("categorie")}>
                {CATEGORIES_DOCUMENT.map((c) => (
                  <option key={c} value={c}>
                    {t(`documents.categories.${c}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Champ>
          <Champ id="document-realisation" libelle={t("documents.formulaire.realisation")} optionnel>
            {(a) => (
              <NativeSelect {...a} {...register("realisationId")}>
                <option value="">{t("documents.formulaire.aucune_realisation")}</option>
                {realisations.map((r) => (
                  <option key={r.id} value={r.id}>
                    {`${formaterDate(r.date)} - ${r.titre.length > 50 ? `${r.titre.slice(0, 50)}…` : r.titre}`}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Champ>
        </div>
        <Champ
          id="document-description"
          libelle={t("documents.formulaire.details")}
          optionnel
          erreur={erreur(errors.description?.message)}
        >
          {(a) => <Textarea {...a} rows={2} {...register("description")} />}
        </Champ>
      </form>
      <DialogFooter>
        <Button variante="contour" onClick={onFermer}>
          {t("commun.annuler")}
        </Button>
        <Button type="submit" form={formulaire} chargement={enregistrer.isPending}>
          {t(document ? "documents.formulaire.action_modifier" : "documents.formulaire.action_deposer")}
        </Button>
      </DialogFooter>
    </>
  );
}
