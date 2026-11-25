import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FileUp,
  MapPin,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Target,
  Trash2,
  Trophy,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DialogueConfirmation } from "~/components/app/DialogueConfirmation";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur, EtatVide } from "~/components/app/Etats";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { DialogueDocument } from "~/components/app/suivi/DialogueDocument";
import { DialogueRealisation } from "~/components/app/suivi/DialogueRealisation";
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
import { Skeleton } from "~/components/ui/skeleton";
import { useOrg } from "~/hooks/useContexteOrg";
import i18n from "~/i18n";
import {
  clesSe,
  type DocumentProjet,
  type Realisation,
  useDocuments,
  useLocalites,
  useNoeuds,
  usePta,
  useRealisations,
} from "~/lib/donnees-se";
import { formaterDate, formaterNombre, formaterTaille } from "~/lib/format";
import { indexer, libelleLieu } from "~/lib/localites";
import { getSupabase } from "~/lib/supabase";
import { useContexteProjet } from "../ProjetLayout";

export const meta = () => [{ title: i18n.t("realisations.meta") }];

export default function Realisations() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const { projet } = useContexteProjet();
  const realisations = useRealisations(projet.id);
  const documents = useDocuments(projet.id);
  const noeuds = useNoeuds(projet.id);
  const pta = usePta(projet.id);
  const localites = useLocalites(org.organisation.id);
  const indexLocalites = useMemo(() => indexer(localites.data ?? []), [localites.data]);
  const { telecharger, enCours } = useTelechargement();
  const peutModifier = org.peutEditer;

  const [edition, setEdition] = useState<Realisation | "nouvelle" | null>(null);
  const [suppression, setSuppression] = useState<Realisation | null>(null);
  const [preuveDe, setPreuveDe] = useState<Realisation | null>(null);

  const liste = useMemo(() => realisations.data ?? [], [realisations.data]);
  const preuves = useMemo(() => {
    const groupes = new Map<string, DocumentProjet[]>();
    for (const d of documents.data ?? []) {
      if (d.realisation_id) groupes.set(d.realisation_id, [...(groupes.get(d.realisation_id) ?? []), d]);
    }
    return groupes;
  }, [documents.data]);
  const avecPreuve = liste.filter((r) => (preuves.get(r.id)?.length ?? 0) > 0).length;
  const unites = useMemo(() => [...new Set(liste.map((r) => r.unite).filter((u): u is string => !!u))], [liste]);
  const codes = useMemo(() => new Map((noeuds.data ?? []).map((n) => [n.id, n])), [noeuds.data]);
  const activites = useMemo(() => new Map((pta.data ?? []).map((a) => [a.id, a])), [pta.data]);

  const supprimer = useMutation({
    mutationFn: async (r: Realisation) => {
      const { error } = await getSupabase().from("realisations").delete().eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("realisations.suppression.succes"));
      setSuppression(null);
      void queryClient.invalidateQueries({ queryKey: clesSe.realisations(projet.id) });
      void queryClient.invalidateQueries({ queryKey: clesSe.documents(projet.id) });
    },
    onError: gererErreur,
  });

  const chargement = realisations.isPending;
  const erreur = realisations.error;
  const vide = realisations.isSuccess && liste.length === 0;

  const actions =
    peutModifier && !vide && !chargement ? (
      <Button onClick={() => setEdition("nouvelle")}>
        <Plus aria-hidden />
        {t("realisations.ajouter")}
      </Button>
    ) : undefined;

  return (
    <div className="grid gap-5">
      <EntetePage titre={t("realisations.titre")} description={t("realisations.description")} actions={actions} />

      {!peutModifier && org.peutEcrire && <Bandeau>{t("travail.lecture_seule_role")}</Bandeau>}
      {!org.peutEcrire && <Bandeau>{t("travail.lecture_seule_essai")}</Bandeau>}

      {chargement ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : erreur ? (
        <EtatErreur erreur={erreur} onReessayer={() => void realisations.refetch()} />
      ) : vide ? (
        <EtatVide
          visuel={<Trophy className="size-10 text-navy/40" aria-hidden />}
          titre={t("realisations.vide.titre")}
          description={peutModifier ? t("realisations.vide.texte") : t("realisations.vide.texte_lecteur")}
          actions={
            peutModifier && (
              <Button onClick={() => setEdition("nouvelle")}>
                <Plus aria-hidden />
                {t("realisations.ajouter")}
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="text-sm font-medium text-navy" aria-live="polite">
            {t("realisations.resume", { count: liste.length, avecPreuve })}
          </p>
          <ul className="grid gap-3">
            {liste.map((r) => {
              const pieces = preuves.get(r.id) ?? [];
              const noeud = r.noeud_id ? codes.get(r.noeud_id) : undefined;
              const activite = r.pta_activite_id ? activites.get(r.pta_activite_id) : undefined;
              return (
                <li key={r.id} className="grid gap-3 rounded-2xl bg-card p-5 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-1">
                      <p className="font-mono text-xs text-muted-foreground tabular">{formaterDate(r.date)}</p>
                      <h2 className="text-lg leading-snug font-bold text-navy">{r.titre}</h2>
                      {(r.quantite !== null || r.lieu || r.localite_id) && (
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground">
                          {r.quantite !== null && (
                            <span className="font-mono font-semibold tabular">
                              {formaterNombre(Number(r.quantite))}
                              {r.unite && <span className="ml-1 font-sans font-medium">{r.unite}</span>}
                            </span>
                          )}
                          {(r.lieu || r.localite_id) && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <MapPin className="size-3.5" aria-hidden />
                              {[r.localite_id ? libelleLieu(indexLocalites, r.localite_id, 1) : "", r.lieu]
                                .filter(Boolean)
                                .join(" — ")}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    {peutModifier && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variante="fantome"
                            taille="icone"
                            className="-mt-1 -mr-2 size-9"
                            aria-label={t("realisations.actions", { titre: r.titre })}
                          >
                            <MoreHorizontal aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEdition(r)}>
                            <Pencil aria-hidden />
                            {t("cadre.actions.modifier")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setPreuveDe(r)}>
                            <FileUp aria-hidden />
                            {t("realisations.joindre")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => setSuppression(r)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 aria-hidden className="!text-destructive" />
                            {t("cadre.actions.supprimer")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {r.description && <p className="text-sm whitespace-pre-line text-foreground">{r.description}</p>}

                  {(noeud || activite) && (
                    <ul className="flex flex-wrap gap-2" aria-label={t("realisations.liens")}>
                      {noeud && (
                        <li>
                          <Badge variante="contour" className="max-w-full whitespace-normal">
                            <Target aria-hidden />
                            <span className="font-mono">{noeud.code}</span> · {noeud.libelle}
                          </Badge>
                        </li>
                      )}
                      {activite && (
                        <li>
                          <Badge variante="contour" className="max-w-full whitespace-normal">
                            {t("realisations.activite_pta", { intitule: activite.intitule })}
                          </Badge>
                        </li>
                      )}
                    </ul>
                  )}

                  <div className="grid gap-1.5 border-t border-border pt-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-navy">
                      <Paperclip className="size-4" aria-hidden />
                      {pieces.length === 0
                        ? t("realisations.preuves_aucune")
                        : t("realisations.preuves", { count: pieces.length })}
                    </p>
                    {pieces.length === 0 && peutModifier && (
                      <div>
                        <Button variante="contour" taille="sm" onClick={() => setPreuveDe(r)}>
                          <FileUp aria-hidden />
                          {t("realisations.joindre")}
                        </Button>
                      </div>
                    )}
                    {pieces.length > 0 && (
                      <ul className="grid gap-1">
                        {pieces.map((d) => (
                          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 break-words">
                              {d.nom}
                              {d.taille_octets !== null && (
                                <span className="ml-2 font-mono text-xs text-muted-foreground tabular">
                                  {formaterTaille(d.taille_octets)}
                                </span>
                              )}
                            </span>
                            <Button
                              variante="fantome"
                              taille="sm"
                              onClick={() => void telecharger(d)}
                              chargement={enCours === d.id}
                              aria-label={t("documents.telecharger_pour", { nom: d.nom })}
                            >
                              <Download aria-hidden />
                              {t("documents.telecharger")}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <DialogueRealisation
        ouvert={edition !== null}
        onFermer={() => setEdition(null)}
        projetId={projet.id}
        realisation={edition && edition !== "nouvelle" ? edition : null}
        noeuds={noeuds.data ?? []}
        activitesPta={pta.data ?? []}
        unitesExistantes={unites}
      />
      <DialogueDocument
        ouvert={preuveDe !== null}
        onFermer={() => setPreuveDe(null)}
        projetId={projet.id}
        realisations={liste}
        realisationId={preuveDe?.id}
      />
      <DialogueConfirmation
        ouvert={suppression !== null}
        onOuvertChange={(o) => !o && setSuppression(null)}
        titre={suppression ? t("realisations.suppression.titre", { titre: suppression.titre }) : ""}
        description={t("realisations.suppression.texte")}
        action={t("realisations.suppression.action")}
        enCours={supprimer.isPending}
        onConfirmer={() => suppression && supprimer.mutate(suppression)}
      />
    </div>
  );
}
