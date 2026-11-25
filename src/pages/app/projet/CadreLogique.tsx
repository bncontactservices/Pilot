import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ListTree, Plus, Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DialogueConfirmation } from "~/components/app/DialogueConfirmation";
import { DialogueNoeud, type ModeNoeud } from "~/components/app/cadre/DialogueNoeud";
import { IndicateursNoeud, type IndicateurRelie } from "~/components/app/cadre/IndicateursNoeud";
import { MenuNoeud } from "~/components/app/cadre/MenuNoeud";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur, EtatVide } from "~/components/app/Etats";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { Badge } from "~/components/ui/badge";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { useOrg } from "~/hooks/useContexteOrg";
import i18n from "~/i18n";
import {
  aplatir,
  compterDescendants,
  construireArbre,
  deplacer,
  type Noeud,
  type NoeudArbre,
  typeEnfant,
} from "~/lib/cadre-logique";
import { cles, useSeuils } from "~/lib/donnees";
import { clesSe, useNoeuds } from "~/lib/donnees-se";
import { aujourdhuiIso, evaluerProjet } from "~/lib/kpi";
import { getSupabase } from "~/lib/supabase";
import { cn } from "~/lib/utils";
import { useContexteProjet } from "../ProjetLayout";

export const meta = () => [{ title: i18n.t("cadre.meta") }];

type Vue = "arbre" | "matrice";

export default function CadreLogique() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const { projet, kpis, saisies } = useContexteProjet();
  const noeuds = useNoeuds(projet.id);
  const seuils = useSeuils(org.organisation.id);
  const [vue, setVue] = useState<Vue>("arbre");
  const [edition, setEdition] = useState<ModeNoeud | null>(null);
  const [suppression, setSuppression] = useState<NoeudArbre | null>(null);
  const [repliees, setRepliees] = useState<Set<string>>(new Set());
  const peutModifier = org.peutEditer;

  const arbre = useMemo(() => construireArbre(noeuds.data ?? []), [noeuds.data]);
  const lignes = useMemo(() => aplatir(arbre, vue === "arbre" ? repliees : new Set()), [arbre, repliees, vue]);

  // Indicateurs par ligne, avec leur statut du moment.
  const indicateurs = useMemo(() => {
    const aujourdhui = aujourdhuiIso();
    const evaluation = evaluerProjet(kpis, saisies, {
      projet,
      periode: { debut: null, fin: aujourdhui },
      aujourdhui,
      seuils,
    });
    const statuts = new Map(evaluation.evaluations.map((e) => [e.id, e.statut]));
    const parNoeud = new Map<string, IndicateurRelie[]>();
    for (const k of [...kpis].sort((a, b) => a.ordre - b.ordre)) {
      if (!k.noeud_id) continue;
      parNoeud.set(k.noeud_id, [
        ...(parNoeud.get(k.noeud_id) ?? []),
        { id: k.id, nom: k.nom, statut: statuts.get(k.id) ?? "none" },
      ]);
    }
    return parNoeud;
  }, [kpis, saisies, projet, seuils]);

  const freresDe = (noeud: Noeud) => (noeuds.data ?? []).filter((n) => n.parent_id === noeud.parent_id);

  const deplacerNoeud = useMutation({
    mutationFn: async ({ noeud, sens }: { noeud: Noeud; sens: -1 | 1 }) => {
      const changements = deplacer(freresDe(noeud), noeud.id, sens);
      if (!changements) return;
      for (const c of changements) {
        const { error } = await getSupabase().from("cadre_logique_noeuds").update({ ordre: c.ordre }).eq("id", c.id);
        if (error) throw error;
      }
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: clesSe.noeuds(projet.id) }),
    onError: gererErreur,
  });

  const supprimer = useMutation({
    mutationFn: async (noeud: Noeud) => {
      const { error } = await getSupabase().from("cadre_logique_noeuds").delete().eq("id", noeud.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("cadre.suppression.succes"));
      setSuppression(null);
      void queryClient.invalidateQueries({ queryKey: clesSe.noeuds(projet.id) });
      void queryClient.invalidateQueries({ queryKey: cles.kpis(projet.id) });
      void queryClient.invalidateQueries({ queryKey: cles.orgKpis(org.organisation.id) });
    },
    onError: gererErreur,
  });

  const basculerReplie = (id: string) =>
    setRepliees((precedent) => {
      const suivant = new Set(precedent);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  const menu = (noeud: NoeudArbre) => {
    const freres = freresDe(noeud).sort((a, b) => a.ordre - b.ordre || (a.created_at < b.created_at ? -1 : 1));
    const position = freres.findIndex((f) => f.id === noeud.id);
    return (
      <MenuNoeud
        code={noeud.code}
        peutMonter={position > 0}
        peutDescendre={position >= 0 && position < freres.length - 1}
        onModifier={() => setEdition({ mode: "modifier", noeud })}
        onMonter={() => deplacerNoeud.mutate({ noeud, sens: -1 })}
        onDescendre={() => deplacerNoeud.mutate({ noeud, sens: 1 })}
        onSupprimer={() => setSuppression(noeud)}
      />
    );
  };

  const boutonAjouter = (noeud: NoeudArbre) => {
    const enfant = typeEnfant(noeud.type);
    if (!enfant || !peutModifier) return null;
    return (
      <Button
        variante="contour"
        taille="sm"
        onClick={() => setEdition({ mode: "creer", type: enfant, parentId: noeud.id })}
      >
        <Plus aria-hidden />
        {t(`cadre.ajouter.${enfant}`)}
      </Button>
    );
  };

  return (
    <div className="grid gap-5">
      <EntetePage
        titre={t("cadre.titre")}
        description={t("cadre.description")}
        actions={
          arbre.length > 0 ? (
            <div
              role="group"
              aria-label={t("cadre.vues.libelle")}
              className="inline-flex rounded-xl border border-border bg-card p-1"
            >
              {(["arbre", "matrice"] as const).map((v) => {
                const Icone = v === "arbre" ? ListTree : Table2;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={vue === v}
                    onClick={() => setVue(v)}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
                      vue === v ? "bg-navy text-white" : "text-muted-foreground hover:bg-subtle hover:text-foreground",
                    )}
                  >
                    <Icone className="size-4" aria-hidden />
                    {t(`cadre.vues.${v}`)}
                  </button>
                );
              })}
            </div>
          ) : undefined
        }
      />

      {!peutModifier && org.peutEcrire && <Bandeau>{t("travail.lecture_seule_role")}</Bandeau>}
      {!org.peutEcrire && <Bandeau>{t("travail.lecture_seule_essai")}</Bandeau>}

      {noeuds.isPending ? (
        <div className="grid gap-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : noeuds.isError ? (
        <EtatErreur erreur={noeuds.error} onReessayer={() => void noeuds.refetch()} />
      ) : arbre.length === 0 ? (
        <EtatVide
          visuel={<ListTree className="size-10 text-navy/40" aria-hidden />}
          titre={t("cadre.vide.titre")}
          description={peutModifier ? t("cadre.vide.texte") : t("cadre.vide.texte_lecteur")}
          actions={
            peutModifier && (
              <Button onClick={() => setEdition({ mode: "creer", type: "objectif_global", parentId: null })}>
                <Plus aria-hidden />
                {t("cadre.ajouter.objectif_global")}
              </Button>
            )
          }
        />
      ) : vue === "arbre" ? (
        <ul className="grid gap-2">
          {lignes.map((noeud) => {
            const replie = repliees.has(noeud.id);
            const ajout = boutonAjouter(noeud);
            return (
              <li key={noeud.id} style={{ marginInlineStart: `${noeud.profondeur * 1.25}rem` }}>
                <div className="grid gap-3 rounded-2xl bg-card p-4 shadow-card">
                  <div className="flex items-start gap-3">
                    {noeud.enfants.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => basculerReplie(noeud.id)}
                        aria-expanded={!replie}
                        aria-label={t(replie ? "cadre.actions.deplier" : "cadre.actions.replier", { code: noeud.code })}
                        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-subtle hover:text-foreground"
                      >
                        {replie ? (
                          <ChevronRight className="size-4" aria-hidden />
                        ) : (
                          <ChevronDown className="size-4" aria-hidden />
                        )}
                      </button>
                    ) : (
                      <span className="size-7 shrink-0" aria-hidden />
                    )}
                    <div className="grid min-w-0 flex-1 gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variante="marque" className="font-mono">
                          {noeud.code}
                        </Badge>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {t(`cadre.types.${noeud.type}`)}
                        </span>
                      </div>
                      <p className="font-medium text-foreground">{noeud.libelle}</p>
                    </div>
                    {peutModifier && menu(noeud)}
                  </div>
                  <div className="ms-10 grid gap-2">
                    <IndicateursNoeud indicateurs={indicateurs.get(noeud.id) ?? []} />
                    {ajout && <div>{ajout}</div>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[56rem] table-fixed border-separate border-spacing-0 overflow-hidden rounded-2xl bg-card text-left text-sm shadow-card">
            <thead>
              <tr className="bg-subtle text-xs font-semibold tracking-wide text-navy uppercase">
                <th scope="col" className="w-[34%] px-4 py-3">
                  {t("cadre.colonnes.logique")}
                </th>
                <th scope="col" className="w-[22%] px-4 py-3">
                  {t("cadre.colonnes.indicateurs")}
                </th>
                <th scope="col" className="w-[22%] px-4 py-3">
                  {t("cadre.colonnes.moyens")}
                </th>
                <th scope="col" className="w-[22%] px-4 py-3">
                  {t("cadre.colonnes.hypotheses")}
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((noeud) => (
                <tr key={noeud.id} className={cn(noeud.type === "objectif_global" && "bg-navy/[0.03]")}>
                  <th scope="row" className="border-t border-border px-4 py-3 align-top font-normal">
                    <div
                      className="flex items-start gap-2"
                      style={{ paddingInlineStart: `${noeud.profondeur * 0.75}rem` }}
                    >
                      <Badge variante="marque" className="mt-0.5 font-mono">
                        {noeud.code}
                      </Badge>
                      <div className="grid min-w-0 flex-1 gap-0.5">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {t(`cadre.types.${noeud.type}`)}
                        </span>
                        <span className="font-medium text-foreground">{noeud.libelle}</span>
                      </div>
                      {peutModifier && menu(noeud)}
                    </div>
                  </th>
                  <td className="border-t border-border px-4 py-3 align-top">
                    <IndicateursNoeud indicateurs={indicateurs.get(noeud.id) ?? []} />
                  </td>
                  <td className="border-t border-border px-4 py-3 align-top whitespace-pre-line text-foreground">
                    {noeud.moyens_verification || (
                      <span className="text-muted-foreground">{t("cadre.non_renseigne")}</span>
                    )}
                  </td>
                  <td className="border-t border-border px-4 py-3 align-top whitespace-pre-line text-foreground">
                    {noeud.hypotheses || <span className="text-muted-foreground">{t("cadre.non_renseigne")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DialogueNoeud
        mode={edition}
        onFermer={() => setEdition(null)}
        projetId={projet.id}
        noeuds={noeuds.data ?? []}
        kpis={kpis}
      />
      <DialogueConfirmation
        ouvert={suppression !== null}
        onOuvertChange={(o) => !o && setSuppression(null)}
        titre={suppression ? t("cadre.suppression.titre", { code: suppression.code }) : ""}
        description={
          suppression
            ? compterDescendants(suppression) === 0
              ? t("cadre.suppression.texte_seule")
              : t("cadre.suppression.texte_branche", { count: compterDescendants(suppression) })
            : ""
        }
        action={t("cadre.suppression.action")}
        enCours={supprimer.isPending}
        onConfirmer={() => suppression && supprimer.mutate(suppression)}
      />
    </div>
  );
}
