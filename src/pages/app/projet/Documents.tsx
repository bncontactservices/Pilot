import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  File as IconeFichier,
  FileImage,
  FileText,
  FolderOpen,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DialogueConfirmation } from "~/components/app/DialogueConfirmation";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur, EtatVide } from "~/components/app/Etats";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { CATEGORIES_DOCUMENT, DialogueDocument } from "~/components/app/suivi/DialogueDocument";
import { useTelechargement } from "~/components/app/suivi/useTelechargement";
import { Badge } from "~/components/ui/badge";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { NativeSelect } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { useOrg } from "~/hooks/useContexteOrg";
import i18n from "~/i18n";
import { supprimerDocument } from "~/lib/documents";
import { clesSe, type DocumentProjet, useDocuments, useRealisations } from "~/lib/donnees-se";
import { formaterDate, formaterTaille } from "~/lib/format";
import { useContexteProjet } from "../ProjetLayout";

export const meta = () => [{ title: i18n.t("documents.meta") }];

function IconeDocument({ type }: { type: string | null }) {
  const Icone = type?.startsWith("image/") ? FileImage : type ? FileText : IconeFichier;
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-subtle text-navy">
      <Icone className="size-5" aria-hidden />
    </span>
  );
}

export default function Documents() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const { projet } = useContexteProjet();
  const documents = useDocuments(projet.id);
  const realisations = useRealisations(projet.id);
  const { telecharger, enCours } = useTelechargement();
  const peutModifier = org.peutEditer;

  const [categorie, setCategorie] = useState<DocumentProjet["categorie"] | "">("");
  const [edition, setEdition] = useState<DocumentProjet | "depot" | null>(null);
  const [suppression, setSuppression] = useState<DocumentProjet | null>(null);

  const liste = useMemo(() => documents.data ?? [], [documents.data]);
  const affiches = categorie ? liste.filter((d) => d.categorie === categorie) : liste;
  const taille = liste.reduce((total, d) => total + (d.taille_octets ?? 0), 0);
  const titresRealisations = useMemo(
    () => new Map((realisations.data ?? []).map((r) => [r.id, r.titre])),
    [realisations.data],
  );

  const supprimer = useMutation({
    mutationFn: supprimerDocument,
    onSuccess: (fichierRetire) => {
      if (fichierRetire) toast.success(t("documents.suppression.succes"));
      else toast.warning(t("documents.suppression.fichier_restant"));
      setSuppression(null);
      void queryClient.invalidateQueries({ queryKey: clesSe.documents(projet.id) });
    },
    onError: gererErreur,
  });

  const chargement = documents.isPending;
  const vide = documents.isSuccess && liste.length === 0;
  const actions =
    peutModifier && !vide && !chargement ? (
      <Button onClick={() => setEdition("depot")}>
        <Plus aria-hidden />
        {t("documents.deposer")}
      </Button>
    ) : undefined;

  return (
    <div className="grid gap-5">
      <EntetePage titre={t("documents.titre")} description={t("documents.description")} actions={actions} />

      {!peutModifier && org.peutEcrire && <Bandeau>{t("travail.lecture_seule_role")}</Bandeau>}
      {!org.peutEcrire && <Bandeau>{t("travail.lecture_seule_essai")}</Bandeau>}

      {chargement ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      ) : documents.error ? (
        <EtatErreur erreur={documents.error} onReessayer={() => void documents.refetch()} />
      ) : vide ? (
        <EtatVide
          visuel={<FolderOpen className="size-10 text-navy/40" aria-hidden />}
          titre={t("documents.vide.titre")}
          description={peutModifier ? t("documents.vide.texte") : t("documents.vide.texte_lecteur")}
          actions={
            peutModifier && (
              <Button onClick={() => setEdition("depot")}>
                <Plus aria-hidden />
                {t("documents.deposer")}
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="text-sm font-medium text-navy" aria-live="polite">
              {t("documents.resume", { count: liste.length, taille: formaterTaille(taille) })}
            </p>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground sm:w-56">
              {t("documents.filtre")}
              <NativeSelect
                value={categorie}
                onChange={(e) => setCategorie(e.target.value as typeof categorie)}
                className="h-10 text-sm font-normal text-foreground"
              >
                <option value="">{t("documents.toutes_categories")}</option>
                {CATEGORIES_DOCUMENT.map((c) => (
                  <option key={c} value={c}>
                    {t(`documents.categories.${c}`)}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>

          {affiches.length === 0 ? (
            <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground shadow-card">
              {t("documents.filtre_vide")}
            </p>
          ) : (
            <ul className="grid gap-3">
              {affiches.map((d) => {
                const preuveDe = d.realisation_id ? titresRealisations.get(d.realisation_id) : undefined;
                return (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-start gap-4 rounded-2xl bg-card p-5 shadow-card sm:flex-nowrap"
                  >
                    <IconeDocument type={d.mime_type} />
                    <div className="grid min-w-0 flex-1 gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold break-words text-navy">{d.nom}</h2>
                        <Badge variante="contour">{t(`documents.categories.${d.categorie}`)}</Badge>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground tabular">
                        {d.taille_octets !== null && <>{formaterTaille(d.taille_octets)} · </>}
                        {t("documents.depose_le", { date: formaterDate(d.created_at.slice(0, 10)) })}
                      </p>
                      {d.description && <p className="text-sm text-foreground">{d.description}</p>}
                      {preuveDe && (
                        <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Paperclip className="size-3.5" aria-hidden />
                          {t("documents.preuve_de", { titre: preuveDe })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variante="contour"
                        taille="sm"
                        onClick={() => void telecharger(d)}
                        chargement={enCours === d.id}
                        aria-label={t("documents.telecharger_pour", { nom: d.nom })}
                      >
                        <Download aria-hidden />
                        {t("documents.telecharger")}
                      </Button>
                      {peutModifier && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variante="fantome"
                              taille="icone"
                              className="size-9"
                              aria-label={t("documents.actions", { nom: d.nom })}
                            >
                              <MoreHorizontal aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEdition(d)}>
                              <Pencil aria-hidden />
                              {t("cadre.actions.modifier")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => setSuppression(d)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 aria-hidden className="!text-destructive" />
                              {t("cadre.actions.supprimer")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <DialogueDocument
        ouvert={edition !== null}
        onFermer={() => setEdition(null)}
        projetId={projet.id}
        document={edition && edition !== "depot" ? edition : null}
        realisations={realisations.data ?? []}
      />
      <DialogueConfirmation
        ouvert={suppression !== null}
        onOuvertChange={(o) => !o && setSuppression(null)}
        titre={suppression ? t("documents.suppression.titre", { nom: suppression.nom }) : ""}
        description={t("documents.suppression.texte")}
        action={t("documents.suppression.action")}
        enCours={supprimer.isPending}
        onConfirmer={() => suppression && supprimer.mutate(suppression)}
      />
    </div>
  );
}
