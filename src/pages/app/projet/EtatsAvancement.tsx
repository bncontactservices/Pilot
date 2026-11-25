import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DialogueConfirmation } from "~/components/app/DialogueConfirmation";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur, EtatVide } from "~/components/app/Etats";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { DialogueEtat } from "~/components/app/suivi/DialogueEtat";
import { TauxAvancement } from "~/components/app/TauxAvancement";
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
import { useAvancements, useSeuils } from "~/lib/donnees";
import { clesSe, type EtatAvancement, useEtats, useRealisations } from "~/lib/donnees-se";
import { formaterDate, formaterPeriode } from "~/lib/format";
import { aujourdhuiIso, evaluerProjet } from "~/lib/kpi";
import { periodeSuggeree } from "~/lib/suivi";
import { getSupabase } from "~/lib/supabase";
import { useContexteProjet } from "../ProjetLayout";

export const meta = () => [{ title: i18n.t("etatsAvancement.meta") }];

const RUBRIQUES = [
  { cle: "faits", champ: "faits_marquants" },
  { cle: "difficultes", champ: "difficultes" },
  { cle: "risques", champ: "risques" },
] as const;

const periodeLisible = (debut: string, fin: string) => `${formaterDate(debut)} – ${formaterDate(fin)}`;

export default function EtatsAvancement() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const { projet, kpis, saisies } = useContexteProjet();
  const etats = useEtats(projet.id);
  const realisations = useRealisations(projet.id);
  const avancements = useAvancements(org.organisation.id);
  const seuils = useSeuils(org.organisation.id);
  const aujourdhui = aujourdhuiIso();
  const peutModifier = org.peutEditer;

  const [edition, setEdition] = useState<EtatAvancement | "nouvel" | null>(null);
  const [suppression, setSuppression] = useState<EtatAvancement | null>(null);

  const liste = useMemo(() => etats.data ?? [], [etats.data]);
  const tauxActuels = useMemo(() => {
    const global = evaluerProjet(kpis, saisies, {
      projet,
      periode: { debut: null, fin: aujourdhui },
      aujourdhui,
      seuils,
    });
    const taux = avancements.data?.get(projet.id);
    return {
      resultats: global.progression,
      physique: taux?.taux_physique == null ? null : Number(taux.taux_physique),
      financier: taux?.taux_financier == null ? null : Number(taux.taux_financier),
    };
  }, [kpis, saisies, projet, aujourdhui, seuils, avancements.data]);

  const depart = useMemo(() => {
    const { debut, fin } = periodeSuggeree(liste, projet, aujourdhui);
    return {
      debut,
      fin,
      titre: t("etatsAvancement.formulaire.titre_defaut", { periode: formaterPeriode(debut, fin) }),
    };
  }, [liste, projet, aujourdhui, t]);

  const supprimer = useMutation({
    mutationFn: async (etat: EtatAvancement) => {
      const { error } = await getSupabase().from("etats_avancement").delete().eq("id", etat.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("etatsAvancement.suppression.succes"));
      setSuppression(null);
      void queryClient.invalidateQueries({ queryKey: clesSe.etats(projet.id) });
    },
    onError: gererErreur,
  });

  const chargement = etats.isPending;
  const vide = etats.isSuccess && liste.length === 0;
  const actions =
    peutModifier && !vide && !chargement ? (
      <Button onClick={() => setEdition("nouvel")}>
        <Plus aria-hidden />
        {t("etatsAvancement.ajouter")}
      </Button>
    ) : undefined;

  return (
    <div className="grid gap-5">
      <EntetePage titre={t("etatsAvancement.titre")} description={t("etatsAvancement.description")} actions={actions} />

      {!peutModifier && org.peutEcrire && <Bandeau>{t("travail.lecture_seule_role")}</Bandeau>}
      {!org.peutEcrire && <Bandeau>{t("travail.lecture_seule_essai")}</Bandeau>}

      {chargement ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : etats.error ? (
        <EtatErreur erreur={etats.error} onReessayer={() => void etats.refetch()} />
      ) : vide ? (
        <EtatVide
          visuel={<ClipboardList className="size-10 text-navy/40" aria-hidden />}
          titre={t("etatsAvancement.vide.titre")}
          description={peutModifier ? t("etatsAvancement.vide.texte") : t("etatsAvancement.vide.texte_lecteur")}
          actions={
            peutModifier && (
              <Button onClick={() => setEdition("nouvel")}>
                <Plus aria-hidden />
                {t("etatsAvancement.ajouter")}
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("etatsAvancement.taux_figes_aide")}</p>
          <ul className="grid gap-4">
            {liste.map((etat) => (
              <li key={etat.id} className="grid gap-4 rounded-2xl bg-card p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-1">
                    <h2 className="text-lg leading-snug font-bold text-navy">{etat.titre}</h2>
                    <p className="font-mono text-xs text-muted-foreground tabular">
                      {t("etatsAvancement.periode", { periode: periodeLisible(etat.periode_debut, etat.periode_fin) })}
                      {" · "}
                      {t("etatsAvancement.redige_le", { date: formaterDate(etat.created_at.slice(0, 10)) })}
                    </p>
                  </div>
                  {peutModifier && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variante="fantome"
                          taille="icone"
                          className="-mt-1 -mr-2 size-9"
                          aria-label={t("etatsAvancement.actions", { titre: etat.titre })}
                        >
                          <MoreHorizontal aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEdition(etat)}>
                          <Pencil aria-hidden />
                          {t("cadre.actions.modifier")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => setSuppression(etat)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 aria-hidden className="!text-destructive" />
                          {t("cadre.actions.supprimer")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                <TauxAvancement
                  resultats={etat.taux_resultats === null ? null : Number(etat.taux_resultats)}
                  physique={etat.taux_physique === null ? null : Number(etat.taux_physique)}
                  financier={etat.taux_financier === null ? null : Number(etat.taux_financier)}
                  className="rounded-xl bg-subtle p-4"
                />

                <div className="grid gap-4 md:grid-cols-3">
                  {RUBRIQUES.map(({ cle, champ }) => (
                    <section key={cle} className="grid content-start gap-1.5">
                      <h3 className="text-sm font-bold text-navy">{t(`etatsAvancement.rubriques.${cle}`)}</h3>
                      {etat[champ] ? (
                        <p className="text-sm whitespace-pre-line text-foreground">{etat[champ]}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t("etatsAvancement.non_renseigne")}</p>
                      )}
                    </section>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <DialogueEtat
        ouvert={edition !== null}
        onFermer={() => setEdition(null)}
        projetId={projet.id}
        etat={edition && edition !== "nouvel" ? edition : null}
        depart={depart}
        tauxActuels={tauxActuels}
        realisations={realisations.data ?? []}
      />
      <DialogueConfirmation
        ouvert={suppression !== null}
        onOuvertChange={(o) => !o && setSuppression(null)}
        titre={suppression ? t("etatsAvancement.suppression.titre", { titre: suppression.titre }) : ""}
        description={t("etatsAvancement.suppression.texte")}
        action={t("etatsAvancement.suppression.action")}
        enCours={supprimer.isPending}
        onConfirmer={() => suppression && supprimer.mutate(suppression)}
      />
    </div>
  );
}
