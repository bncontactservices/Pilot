import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FileX,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DialogueConfirmation } from "~/components/app/DialogueConfirmation";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur, EtatVide } from "~/components/app/Etats";
import { DialogueBudgetLigne } from "~/components/app/finances/DialogueBudgetLigne";
import { DialogueDepense } from "~/components/app/finances/DialogueDepense";
import { useGestionErreur } from "~/components/app/LimitePlan";
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
import { arrondirTaux } from "~/lib/avancement";
import {
  clesSe,
  type DepenseProjet,
  invaliderAvancement,
  type LigneBudgetProjet,
  useBudgetLignes,
  useDepenses,
  useDocuments,
} from "~/lib/donnees-se";
import { ecartBudgetProjet, syntheseBudget, type SyntheseLigne } from "~/lib/finances";
import { formaterDate, formaterMontant, formaterMontantExact } from "~/lib/format";
import { getSupabase } from "~/lib/supabase";
import { cn } from "~/lib/utils";
import { useContexteProjet } from "../ProjetLayout";

export const meta = () => [{ title: i18n.t("finances.meta") }];

export default function Finances() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const { projet } = useContexteProjet();
  const budget = useBudgetLignes(projet.id);
  const depenses = useDepenses(projet.id);
  const documents = useDocuments(projet.id);
  const { telecharger, enCours } = useTelechargement();
  // Le budget se gère à plusieurs (admin et éditeur) ; les dépenses, qui relèvent de la comptabilité, sont réservées aux admins.
  const peutModifier = org.peutEditer;
  const peutDepenses = org.peutEcrire && org.estAdmin;
  const devise = projet.devise;

  const [ligneEnEdition, setLigneEnEdition] = useState<LigneBudgetProjet | "nouvelle" | null>(null);
  const [depenseEnEdition, setDepenseEnEdition] = useState<{ depense: DepenseProjet | null; ligneId?: string } | null>(
    null,
  );
  const [ligneASupprimer, setLigneASupprimer] = useState<LigneBudgetProjet | null>(null);
  const [depenseASupprimer, setDepenseASupprimer] = useState<DepenseProjet | null>(null);
  const [filtreLigne, setFiltreLigne] = useState("");

  const lignes = useMemo(() => budget.data ?? [], [budget.data]);
  const listeDepenses = useMemo(() => depenses.data ?? [], [depenses.data]);
  const synthese = useMemo(() => syntheseBudget(lignes, listeDepenses), [lignes, listeDepenses]);
  const parLigne = useMemo(() => new Map(lignes.map((l) => [l.id, l])), [lignes]);
  const parDocument = useMemo(() => new Map((documents.data ?? []).map((d) => [d.id, d])), [documents.data]);
  const postes = useMemo(
    () => [...new Set(lignes.map((l) => l.poste))].sort((a, b) => a.localeCompare(b, "fr")),
    [lignes],
  );
  const affichees = filtreLigne ? listeDepenses.filter((d) => d.budget_ligne_id === filtreLigne) : listeDepenses;
  const totalAffiche = affichees.reduce((somme, d) => somme + Number(d.montant), 0);
  const ecart = ecartBudgetProjet(projet.budget == null ? null : Number(projet.budget), synthese.prevu);

  const invalider = () => {
    void queryClient.invalidateQueries({ queryKey: clesSe.budget(projet.id) });
    void queryClient.invalidateQueries({ queryKey: clesSe.depenses(projet.id) });
    invaliderAvancement(queryClient, org.organisation.id);
  };
  const supprimerLigne = useMutation({
    mutationFn: async (l: LigneBudgetProjet) => {
      const { error } = await getSupabase().from("budget_lignes").delete().eq("id", l.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("finances.ligne.suppression.succes"));
      setLigneASupprimer(null);
      invalider();
    },
    onError: (erreur) => {
      setLigneASupprimer(null);
      gererErreur(erreur);
    },
  });
  const supprimerDepense = useMutation({
    mutationFn: async (d: DepenseProjet) => {
      const { error } = await getSupabase().from("depenses").delete().eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("finances.depense.suppression.succes"));
      setDepenseASupprimer(null);
      invalider();
    },
    onError: gererErreur,
  });

  const chargement = budget.isPending || depenses.isPending;
  const erreur = budget.error ?? depenses.error;
  const vide = budget.isSuccess && lignes.length === 0;

  const actions =
    peutModifier && !vide && !chargement ? (
      <div className="flex flex-wrap gap-2">
        <Button variante={peutDepenses ? "contour" : "primaire"} onClick={() => setLigneEnEdition("nouvelle")}>
          <Plus aria-hidden />
          {t("finances.ajouter_ligne")}
        </Button>
        {peutDepenses && (
          <Button onClick={() => setDepenseEnEdition({ depense: null })}>
            <Receipt aria-hidden />
            {t("finances.ajouter_depense")}
          </Button>
        )}
      </div>
    ) : undefined;

  return (
    <div className="grid grid-cols-1 gap-6">
      <EntetePage titre={t("finances.titre")} description={t("finances.description")} actions={actions} />

      {!peutModifier && org.peutEcrire && <Bandeau>{t("travail.lecture_seule_role")}</Bandeau>}
      {!org.peutEcrire && <Bandeau>{t("travail.lecture_seule_essai")}</Bandeau>}

      {chargement ? (
        <div className="grid grid-cols-1 gap-3" aria-busy>
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : erreur ? (
        <EtatErreur
          erreur={erreur}
          onReessayer={() => {
            void budget.refetch();
            void depenses.refetch();
          }}
        />
      ) : vide ? (
        <EtatVide
          visuel={<WalletCards className="size-10 text-navy/40" aria-hidden />}
          titre={t("finances.vide.titre")}
          description={peutModifier ? t("finances.vide.texte") : t("finances.vide.texte_lecteur")}
          actions={
            peutModifier && (
              <Button onClick={() => setLigneEnEdition("nouvelle")}>
                <Plus aria-hidden />
                {t("finances.ajouter_ligne")}
              </Button>
            )
          }
        />
      ) : (
        <>
          <section
            aria-labelledby="titre-synthese"
            className="grid grid-cols-1 gap-3 rounded-2xl bg-card p-5 shadow-card"
          >
            <h2 id="titre-synthese" className="sr-only">
              {t("finances.synthese.titre")}
            </h2>
            <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Chiffre libelle={t("finances.synthese.prevu")} valeur={formaterMontant(synthese.prevu, devise)} />
              <Chiffre libelle={t("finances.synthese.depense")} valeur={formaterMontant(synthese.depense, devise)} />
              {synthese.reste >= 0 ? (
                <Chiffre libelle={t("finances.synthese.reste")} valeur={formaterMontant(synthese.reste, devise)} />
              ) : (
                <Chiffre
                  libelle={t("finances.synthese.depassement")}
                  valeur={formaterMontant(-synthese.reste, devise)}
                  alerte
                />
              )}
              <Chiffre
                libelle={t("finances.synthese.taux")}
                valeur={synthese.taux === null ? "-" : `${arrondirTaux(synthese.taux)} %`}
                alerte={synthese.taux !== null && synthese.taux > 100}
              />
            </dl>
            {synthese.depassements > 0 && (
              <p className="flex items-start gap-2 text-sm font-medium text-status-alert-ink">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t("finances.synthese.postes_depasses", { count: synthese.depassements })}
              </p>
            )}
            {ecart !== null && (
              <p className="text-sm text-muted-foreground">
                {t("finances.synthese.ecart_projet", {
                  budget: formaterMontant(Number(projet.budget), devise),
                  lignes: formaterMontant(synthese.prevu, devise),
                  ecart: `${ecart > 0 ? "+" : "−"}${formaterMontant(Math.abs(ecart), devise)}`,
                })}
              </p>
            )}
          </section>

          <section aria-labelledby="titre-budget" className="grid grid-cols-1 gap-4">
            <h2 id="titre-budget" className="text-xl font-bold text-navy">
              {t("finances.budget.titre")}
            </h2>
            {synthese.annees.map((annee) => (
              <div key={annee.annee} className="grid grid-cols-1 gap-2 rounded-2xl bg-card p-5 shadow-card">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-lg font-bold text-navy">{t("finances.budget.annee", { annee: annee.annee })}</h3>
                  <p className="font-mono text-sm text-muted-foreground tabular">
                    {t("finances.budget.total_annee", {
                      depense: formaterMontant(annee.depense, devise),
                      prevu: formaterMontant(annee.prevu, devise),
                    })}
                  </p>
                </div>
                <div className="relative overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-left text-sm">
                    <caption className="sr-only">{t("finances.budget.legende", { annee: annee.annee })}</caption>
                    <thead>
                      <tr className="border-b border-border text-xs font-semibold text-muted-foreground">
                        <th scope="col" className="py-2 pr-3">
                          {t("finances.budget.poste")}
                        </th>
                        <th scope="col" className="px-3 py-2 text-right">
                          {t("finances.budget.prevu")}
                        </th>
                        <th scope="col" className="px-3 py-2 text-right">
                          {t("finances.budget.depense")}
                        </th>
                        <th scope="col" className="px-3 py-2 text-right">
                          {t("finances.budget.reste")}
                        </th>
                        <th scope="col" className="px-3 py-2 text-right">
                          {t("finances.budget.execution")}
                        </th>
                        {peutModifier && (
                          <th scope="col" className="w-12 py-2 pl-3">
                            <span className="sr-only">{t("finances.budget.actions")}</span>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {annee.lignes.map((l) => (
                        <LigneTableau
                          key={l.id}
                          ligne={l}
                          devise={devise}
                          peutModifier={peutModifier}
                          peutDepenses={peutDepenses}
                          onDepense={() => setDepenseEnEdition({ depense: null, ligneId: l.id })}
                          onModifier={() => setLigneEnEdition(lignes.find((x) => x.id === l.id) ?? null)}
                          onSupprimer={() => setLigneASupprimer(lignes.find((x) => x.id === l.id) ?? null)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>

          <section aria-labelledby="titre-depenses" className="grid grid-cols-1 gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="titre-depenses" className="text-xl font-bold text-navy">
                {t("finances.depenses.titre")}
              </h2>
              {listeDepenses.length > 0 && (
                <label className="grid grid-cols-1 gap-1 text-xs font-semibold text-muted-foreground">
                  {t("finances.depenses.filtre")}
                  <NativeSelect value={filtreLigne} onChange={(e) => setFiltreLigne(e.target.value)}>
                    <option value="">{t("finances.depenses.toutes")}</option>
                    {[...lignes]
                      .sort((a, b) => b.annee - a.annee || a.poste.localeCompare(b.poste, "fr"))
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {`${l.annee} - ${l.poste}`}
                        </option>
                      ))}
                  </NativeSelect>
                </label>
              )}
            </div>

            {peutModifier && !peutDepenses && org.peutEcrire && (
              <p className="text-sm text-muted-foreground">{t("finances.depenses.reservees")}</p>
            )}

            {listeDepenses.length === 0 ? (
              <EtatVide
                visuel={<Receipt className="size-10 text-navy/40" aria-hidden />}
                titre={t("finances.depenses.vide.titre")}
                description={
                  peutDepenses
                    ? t("finances.depenses.vide.texte")
                    : peutModifier
                      ? t("finances.depenses.vide.texte_editeur")
                      : t("finances.depenses.vide.texte_lecteur")
                }
                actions={
                  peutDepenses && (
                    <Button onClick={() => setDepenseEnEdition({ depense: null })}>
                      <Receipt aria-hidden />
                      {t("finances.ajouter_depense")}
                    </Button>
                  )
                }
              />
            ) : (
              <>
                <p className="text-sm font-medium text-navy" aria-live="polite">
                  {t("finances.depenses.resume", {
                    count: affichees.length,
                    total: formaterMontantExact(Math.round(totalAffiche * 100) / 100, devise),
                  })}
                </p>
                <ul className="grid grid-cols-1 gap-3">
                  {affichees.map((d) => {
                    const ligne = parLigne.get(d.budget_ligne_id);
                    const piece = d.document_id ? parDocument.get(d.document_id) : undefined;
                    return (
                      <li key={d.id} className="grid grid-cols-1 gap-2 rounded-2xl bg-card p-5 shadow-card">
                        <div className="flex items-start justify-between gap-3">
                          <div className="grid min-w-0 gap-1">
                            <p className="font-mono text-xs text-muted-foreground tabular">{formaterDate(d.date)}</p>
                            <h3 className="text-base leading-snug font-bold text-navy">{d.libelle}</h3>
                            <p className="text-sm text-muted-foreground">
                              {ligne ? `${ligne.annee} - ${ligne.poste}` : ""}
                              {d.fournisseur ? ` · ${d.fournisseur}` : ""}
                              {d.reference ? ` · ${t("finances.depenses.reference", { reference: d.reference })}` : ""}
                            </p>
                          </div>
                          <div className="flex items-start gap-1">
                            <p className="font-mono text-base font-semibold text-navy tabular">
                              {formaterMontantExact(Number(d.montant), devise)}
                            </p>
                            {peutDepenses && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variante="fantome"
                                    taille="icone"
                                    className="-mt-2 -mr-2 size-9"
                                    aria-label={t("finances.depense.actions", { libelle: d.libelle })}
                                  >
                                    <MoreHorizontal aria-hidden />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onSelect={() => setDepenseEnEdition({ depense: d })}>
                                    <Pencil aria-hidden />
                                    {t("cadre.actions.modifier")}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() => setDepenseASupprimer(d)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 aria-hidden className="!text-destructive" />
                                    {t("cadre.actions.supprimer")}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-sm">
                          {piece ? (
                            <Button
                              variante="fantome"
                              taille="sm"
                              onClick={() => void telecharger(piece)}
                              chargement={enCours === piece.id}
                              aria-label={t("finances.depenses.telecharger_pour", { nom: piece.nom })}
                            >
                              <Download aria-hidden />
                              {t("finances.depenses.justificatif")}
                            </Button>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              <FileX className="size-4" aria-hidden />
                              {t("finances.depenses.sans_justificatif")}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      <DialogueBudgetLigne
        ouvert={ligneEnEdition !== null}
        onFermer={() => setLigneEnEdition(null)}
        projet={projet}
        ligne={ligneEnEdition && ligneEnEdition !== "nouvelle" ? ligneEnEdition : null}
        postesExistants={postes}
      />
      <DialogueDepense
        ouvert={depenseEnEdition !== null}
        onFermer={() => setDepenseEnEdition(null)}
        projet={projet}
        depense={depenseEnEdition?.depense ?? null}
        ligneId={depenseEnEdition?.ligneId}
        lignes={lignes}
        documents={documents.data ?? []}
      />
      <DialogueConfirmation
        ouvert={ligneASupprimer !== null}
        onOuvertChange={(o) => !o && setLigneASupprimer(null)}
        titre={ligneASupprimer ? t("finances.ligne.suppression.titre", { poste: ligneASupprimer.poste }) : ""}
        description={t("finances.ligne.suppression.texte")}
        action={t("finances.ligne.suppression.action")}
        enCours={supprimerLigne.isPending}
        onConfirmer={() => ligneASupprimer && supprimerLigne.mutate(ligneASupprimer)}
      />
      <DialogueConfirmation
        ouvert={depenseASupprimer !== null}
        onOuvertChange={(o) => !o && setDepenseASupprimer(null)}
        titre={depenseASupprimer ? t("finances.depense.suppression.titre", { libelle: depenseASupprimer.libelle }) : ""}
        description={t("finances.depense.suppression.texte")}
        action={t("finances.depense.suppression.action")}
        enCours={supprimerDepense.isPending}
        onConfirmer={() => depenseASupprimer && supprimerDepense.mutate(depenseASupprimer)}
      />
    </div>
  );
}

function Chiffre({ libelle, valeur, alerte = false }: { libelle: string; valeur: string; alerte?: boolean }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="text-xs font-semibold text-muted-foreground">{libelle}</dt>
      <dd className={cn("font-mono text-xl font-semibold tabular", alerte ? "text-status-alert-ink" : "text-navy")}>
        {valeur}
      </dd>
    </div>
  );
}

function LigneTableau({
  ligne,
  devise,
  peutModifier,
  peutDepenses,
  onDepense,
  onModifier,
  onSupprimer,
}: {
  ligne: SyntheseLigne;
  devise: string;
  peutModifier: boolean;
  peutDepenses: boolean;
  onDepense: () => void;
  onModifier: () => void;
  onSupprimer: () => void;
}) {
  const { t } = useTranslation();
  return (
    <tr className="border-b border-border last:border-0">
      <th scope="row" className="py-2.5 pr-3 align-top font-semibold text-navy">
        {ligne.poste}
        <span className="block text-xs font-normal text-muted-foreground">
          {t("finances.budget.nb_depenses", { count: ligne.nbDepenses })}
        </span>
      </th>
      <td className="px-3 py-2.5 text-right align-top font-mono tabular">
        {formaterMontant(ligne.montant_prevu, devise)}
      </td>
      <td className="px-3 py-2.5 text-right align-top font-mono tabular">{formaterMontant(ligne.depense, devise)}</td>
      <td
        className={cn(
          "px-3 py-2.5 text-right align-top font-mono tabular",
          ligne.reste < 0 && "font-semibold text-status-alert-ink",
        )}
      >
        {ligne.reste < 0 ? `−${formaterMontant(-ligne.reste, devise)}` : formaterMontant(ligne.reste, devise)}
      </td>
      <td className="px-3 py-2.5 text-right align-top">
        <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
          <span className="font-mono tabular">{ligne.taux === null ? "-" : `${arrondirTaux(ligne.taux)} %`}</span>
          {ligne.depassement && (
            <Badge variante="alerte">
              <TriangleAlert aria-hidden />
              {t("finances.budget.depasse")}
            </Badge>
          )}
        </span>
      </td>
      {peutModifier && (
        <td className="py-1.5 pl-3 text-right align-top">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variante="fantome"
                taille="icone"
                className="size-9"
                aria-label={t("finances.ligne.actions", { poste: ligne.poste, annee: ligne.annee })}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {peutDepenses && (
                <DropdownMenuItem onSelect={onDepense}>
                  <Receipt aria-hidden />
                  {t("finances.ajouter_depense")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={onModifier}>
                <Pencil aria-hidden />
                {t("cadre.actions.modifier")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onSupprimer} className="text-destructive focus:text-destructive">
                <Trash2 aria-hidden className="!text-destructive" />
                {t("cadre.actions.supprimer")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      )}
    </tr>
  );
}
