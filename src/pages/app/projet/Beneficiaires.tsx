import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DialogueEffectif } from "~/components/app/beneficiaires/DialogueEffectif";
import { DialogueConfirmation } from "~/components/app/DialogueConfirmation";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur, EtatVide } from "~/components/app/Etats";
import { useGestionErreur } from "~/components/app/LimitePlan";
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
  categories,
  clePeriode,
  dePeriode,
  matriceAgeSexe,
  periodeDeCle,
  periodes,
  SEXES,
  synthese,
} from "~/lib/beneficiaires";
import { clesSe, type EffectifBeneficiaires, useEffectifsBeneficiaires } from "~/lib/donnees-se";
import { formaterDate, formaterNombre } from "~/lib/format";
import { aujourdhuiIso } from "~/lib/kpi";
import { getSupabase } from "~/lib/supabase";
import { useContexteProjet } from "../ProjetLayout";

export const meta = () => [{ title: i18n.t("beneficiaires.meta") }];

/** Valeur du filtre de période qui regroupe toutes les périodes (le cumul, avec son avertissement). */
const TOUTES = "toutes";

export default function Beneficiaires() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const { projet } = useContexteProjet();
  const effectifs = useEffectifsBeneficiaires(projet.id);
  const peutModifier = org.peutEditer;

  const [periodeChoisie, setPeriodeChoisie] = useState<string | null>(null);
  const [categorie, setCategorie] = useState("");
  const [edition, setEdition] = useState<EffectifBeneficiaires | "nouveau" | null>(null);
  const [suppression, setSuppression] = useState<EffectifBeneficiaires | null>(null);

  const liste = useMemo(() => effectifs.data ?? [], [effectifs.data]);
  const toutesPeriodes = useMemo(() => periodes(liste), [liste]);
  const toutesCategories = useMemo(() => categories(liste), [liste]);
  // Par défaut, la période la plus récente : les effectifs de périodes différentes ne s'additionnent pas toujours.
  const cle = periodeChoisie ?? (toutesPeriodes[0] ? clePeriode(toutesPeriodes[0]) : TOUTES);
  const cumul = cle === TOUTES;
  const filtres = useMemo(() => {
    const base = cumul ? liste : dePeriode(liste, periodeDeCle(cle));
    return categorie ? base.filter((e) => e.categorie === categorie) : base;
  }, [liste, cle, cumul, categorie]);
  const resume = useMemo(() => synthese(filtres), [filtres]);
  const matrice = useMemo(() => matriceAgeSexe(filtres), [filtres]);
  const periodeSuggeree = useMemo(() => {
    const derniere = toutesPeriodes[0];
    return derniere
      ? { debut: derniere.debut, fin: derniere.fin }
      : { debut: `${aujourdhuiIso().slice(0, 4)}-01-01`, fin: aujourdhuiIso() };
  }, [toutesPeriodes]);

  const supprimer = useMutation({
    mutationFn: async (e: EffectifBeneficiaires) => {
      const { error } = await getSupabase().from("beneficiaires_effectifs").delete().eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("beneficiaires.suppression.succes"));
      setSuppression(null);
      void queryClient.invalidateQueries({ queryKey: clesSe.effectifs(projet.id) });
    },
    onError: gererErreur,
  });

  const chargement = effectifs.isPending;
  const vide = effectifs.isSuccess && liste.length === 0;
  const actions =
    peutModifier && !vide && !chargement ? (
      <Button onClick={() => setEdition("nouveau")}>
        <Plus aria-hidden />
        {t("beneficiaires.ajouter")}
      </Button>
    ) : undefined;
  const periodeTexte = (p: { debut: string; fin: string }) => `${formaterDate(p.debut)} → ${formaterDate(p.fin)}`;

  return (
    <div className="grid grid-cols-1 gap-5">
      <EntetePage titre={t("beneficiaires.titre")} description={t("beneficiaires.description")} actions={actions} />

      {!peutModifier && org.peutEcrire && <Bandeau>{t("travail.lecture_seule_role")}</Bandeau>}
      {!org.peutEcrire && <Bandeau>{t("travail.lecture_seule_essai")}</Bandeau>}

      {chargement ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : effectifs.error ? (
        <EtatErreur erreur={effectifs.error} onReessayer={() => void effectifs.refetch()} />
      ) : vide ? (
        <EtatVide
          visuel={<UsersRound className="size-10 text-navy/40" aria-hidden />}
          titre={t("beneficiaires.vide.titre")}
          description={peutModifier ? t("beneficiaires.vide.texte") : t("beneficiaires.vide.texte_lecteur")}
          actions={
            peutModifier && (
              <Button onClick={() => setEdition("nouveau")}>
                <Plus aria-hidden />
                {t("beneficiaires.ajouter")}
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
              {t("beneficiaires.filtre_periode")}
              <NativeSelect value={cle} onChange={(e) => setPeriodeChoisie(e.target.value)}>
                {toutesPeriodes.map((p) => (
                  <option key={clePeriode(p)} value={clePeriode(p)}>
                    {periodeTexte(p)}
                  </option>
                ))}
                {toutesPeriodes.length > 1 && <option value={TOUTES}>{t("beneficiaires.toutes_periodes")}</option>}
              </NativeSelect>
            </label>
            {toutesCategories.length > 1 && (
              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                {t("beneficiaires.filtre_categorie")}
                <NativeSelect value={categorie} onChange={(e) => setCategorie(e.target.value)}>
                  <option value="">{t("beneficiaires.toutes_categories")}</option>
                  {toutesCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            )}
          </div>

          {cumul && <Bandeau>{t("beneficiaires.avertissement_cumul")}</Bandeau>}

          <section
            aria-labelledby="titre-synthese-beneficiaires"
            className="grid gap-3 rounded-2xl bg-card p-5 shadow-card"
          >
            <h2 id="titre-synthese-beneficiaires" className="sr-only">
              {t("beneficiaires.synthese.titre")}
            </h2>
            <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Chiffre
                libelle={cumul ? t("beneficiaires.synthese.total_cumule") : t("beneficiaires.synthese.total")}
                valeur={formaterNombre(resume.total)}
              />
              <Chiffre libelle={t("beneficiaires.sexes.femme")} valeur={formaterNombre(resume.parSexe.femme)} />
              <Chiffre libelle={t("beneficiaires.sexes.homme")} valeur={formaterNombre(resume.parSexe.homme)} />
              <Chiffre
                libelle={t("beneficiaires.synthese.part_femmes")}
                valeur={resume.partFemmes === null ? "-" : `${arrondirTaux(resume.partFemmes)} %`}
              />
            </dl>
            {resume.partNonVentile !== null && resume.partNonVentile > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("beneficiaires.synthese.non_ventile", { part: arrondirTaux(resume.partNonVentile) })}
              </p>
            )}
          </section>

          {matrice.length > 0 && (
            <section aria-labelledby="titre-matrice" className="grid gap-2 rounded-2xl bg-card p-5 shadow-card">
              <h2 id="titre-matrice" className="text-lg font-bold text-navy">
                {t("beneficiaires.matrice.titre")}
              </h2>
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <caption className="sr-only">{t("beneficiaires.matrice.legende")}</caption>
                  <thead>
                    <tr className="border-b border-border text-xs font-semibold text-muted-foreground">
                      <th scope="col" className="py-2 pr-3">
                        {t("beneficiaires.matrice.tranche")}
                      </th>
                      {SEXES.map((s) => (
                        <th key={s} scope="col" className="px-3 py-2 text-right">
                          {t(`beneficiaires.sexes.${s}`)}
                        </th>
                      ))}
                      <th scope="col" className="py-2 pl-3 text-right">
                        {t("beneficiaires.matrice.total")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrice.map((l) => (
                      <tr key={l.tranche} className="border-b border-border last:border-0">
                        <th scope="row" className="py-2 pr-3 font-semibold text-navy">
                          {t(`beneficiaires.tranches.${l.tranche}`)}
                        </th>
                        {SEXES.map((s) => (
                          <td key={s} className="px-3 py-2 text-right font-mono tabular">
                            {formaterNombre(l[s])}
                          </td>
                        ))}
                        <td className="py-2 pl-3 text-right font-mono font-semibold tabular">
                          {formaterNombre(l.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {resume.parCategorie.length > 1 && (
            <section aria-labelledby="titre-categories" className="grid gap-2 rounded-2xl bg-card p-5 shadow-card">
              <h2 id="titre-categories" className="text-lg font-bold text-navy">
                {t("beneficiaires.categories.titre")}
              </h2>
              <ul className="grid gap-1 text-sm">
                {resume.parCategorie.map((c) => (
                  <li key={c.categorie} className="flex items-baseline justify-between gap-3">
                    <span>{c.categorie}</span>
                    <span className="font-mono font-semibold tabular">{formaterNombre(c.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="titre-detail" className="grid gap-2">
            <h2 id="titre-detail" className="text-lg font-bold text-navy">
              {t("beneficiaires.detail.titre")}
            </h2>
            <div className="relative overflow-x-auto rounded-2xl bg-card p-5 shadow-card">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <caption className="sr-only">{t("beneficiaires.detail.legende")}</caption>
                <thead>
                  <tr className="border-b border-border text-xs font-semibold text-muted-foreground">
                    <th scope="col" className="py-2 pr-3">
                      {t("beneficiaires.detail.periode")}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {t("beneficiaires.detail.categorie")}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {t("beneficiaires.detail.sexe")}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {t("beneficiaires.detail.tranche")}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {t("beneficiaires.detail.lieu")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      {t("beneficiaires.detail.effectif")}
                    </th>
                    {peutModifier && (
                      <th scope="col" className="w-12 py-2 pl-3">
                        <span className="sr-only">{t("beneficiaires.detail.actions")}</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtres.map((e) => (
                    <tr key={e.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs tabular">
                        {periodeTexte({ debut: e.periode_debut, fin: e.periode_fin })}
                      </td>
                      <th scope="row" className="px-3 py-2 font-semibold text-navy">
                        {e.categorie}
                      </th>
                      <td className="px-3 py-2">{t(`beneficiaires.sexes.${e.sexe}`)}</td>
                      <td className="px-3 py-2">{t(`beneficiaires.tranches.${e.tranche_age}`)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{e.lieu ?? "-"}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold tabular">
                        {formaterNombre(e.effectif)}
                      </td>
                      {peutModifier && (
                        <td className="py-1 pl-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variante="fantome"
                                taille="icone"
                                className="size-9"
                                aria-label={t("beneficiaires.detail.actions_ligne", {
                                  categorie: e.categorie,
                                  sexe: t(`beneficiaires.sexes.${e.sexe}`),
                                  tranche: t(`beneficiaires.tranches.${e.tranche_age}`),
                                })}
                              >
                                <MoreHorizontal aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setEdition(e)}>
                                <Pencil aria-hidden />
                                {t("cadre.actions.modifier")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => setSuppression(e)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 aria-hidden className="!text-destructive" />
                                {t("cadre.actions.supprimer")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <DialogueEffectif
        ouvert={edition !== null}
        onFermer={() => setEdition(null)}
        projetId={projet.id}
        effectif={edition && edition !== "nouveau" ? edition : null}
        categoriesExistantes={toutesCategories}
        periodeSuggeree={periodeSuggeree}
      />
      <DialogueConfirmation
        ouvert={suppression !== null}
        onOuvertChange={(o) => !o && setSuppression(null)}
        titre={suppression ? t("beneficiaires.suppression.titre", { categorie: suppression.categorie }) : ""}
        description={t("beneficiaires.suppression.texte")}
        action={t("beneficiaires.suppression.action")}
        enCours={supprimer.isPending}
        onConfirmer={() => suppression && supprimer.mutate(suppression)}
      />
    </div>
  );
}

function Chiffre({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="text-xs font-semibold text-muted-foreground">{libelle}</dt>
      <dd className="font-mono text-xl font-semibold tabular text-navy">{valeur}</dd>
    </div>
  );
}
