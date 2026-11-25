import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Pencil, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { EtatVide, JaugeVide } from "~/components/app/Etats";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { ChampLocalite } from "~/components/app/zones/ChampLocalite";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
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
import i18n from "~/i18n";
import { cles, type SaisieLigne } from "~/lib/donnees";
import { useLocalites } from "~/lib/donnees-se";
import { analyserErreur } from "~/lib/errors";
import { formaterDate, formaterValeur } from "~/lib/format";
import { aujourdhuiIso, detecterAberrant } from "~/lib/kpi";
import { indexer, libelleLieu } from "~/lib/localites";
import { getSupabase } from "~/lib/supabase";
import { useContexteProjet } from "../ProjetLayout";

export const meta = () => [{ title: i18n.t("saisie.meta") }];

const nombre = z
  .string()
  .trim()
  .refine((v) => /^-?\d+([.,]\d+)?$/.test(v), { error: "saisie.validation.valeur" });
const versNombre = (texte: string) => Number(texte.replace(",", "."));
const versTexte = (valeur: number) => String(valeur).replace(".", ",");

const COLONNES = "id, kpi_id, date, valeur, commentaire, localite_id, created_at, updated_at";
const PAGE = 25;

type Etape = { type: "aberrant" | "remplacer"; valeurs: Valeurs } | null;

const schema = z.object({
  kpiId: z.string().min(1, { error: "saisie.validation.kpi" }),
  date: z.iso.date({ error: "saisie.validation.date" }),
  valeur: nombre,
  commentaire: z.string().trim().max(2000, { error: "auth.validation.trop_long" }),
  localiteId: z.string(),
});
type Valeurs = z.infer<typeof schema>;

export default function Saisie() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const { projet, kpis, saisies } = useContexteProjet();
  const [params] = useSearchParams();
  const aujourdhui = aujourdhuiIso();
  const [etape, setEtape] = useState<Etape>(null);
  const [affichees, setAffichees] = useState(PAGE);
  const [aModifier, setAModifier] = useState<SaisieLigne | null>(null);
  const [aSupprimer, setASupprimer] = useState<SaisieLigne | null>(null);

  const kpiInitial = kpis.find((k) => k.id === params.get("kpi"))?.id ?? kpis[0]?.id ?? "";
  const {
    register,
    handleSubmit,
    control,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<Valeurs>({
    resolver: zodResolver(schema),
    defaultValues: { kpiId: kpiInitial, date: aujourdhui, valeur: "", commentaire: "", localiteId: "" },
  });
  const kpiId = useWatch({ control, name: "kpiId" });
  const date = useWatch({ control, name: "date" });
  const localiteId = useWatch({ control, name: "localiteId" });
  const localites = useLocalites(org.organisation.id);
  const indexLocalites = useMemo(() => indexer(localites.data ?? []), [localites.data]);
  const kpi = kpis.find((k) => k.id === kpiId);

  const historique = useMemo(
    () => saisies.filter((s) => s.kpi_id === kpiId).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [saisies, kpiId],
  );
  const existante = historique.find((s) => s.date === date);
  const derniere = historique[0];

  const cleSaisies = cles.saisies(projet.id);
  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: cleSaisies });
    void queryClient.invalidateQueries({ queryKey: cles.orgSaisies(org.organisation.id) });
  };
  const reessayerSiReseau = (tentatives: number, erreur: unknown) =>
    tentatives < 2 && analyserErreur(erreur).cle === "erreurs.reseau";

  /** Mise à jour optimiste : la saisie apparaît tout de suite, et disparaît si la base la refuse. */
  const optimiste = async (transformer: (lignes: SaisieLigne[]) => SaisieLigne[]) => {
    await queryClient.cancelQueries({ queryKey: cleSaisies });
    const precedent = queryClient.getQueryData<SaisieLigne[]>(cleSaisies);
    queryClient.setQueryData<SaisieLigne[]>(cleSaisies, (lignes = []) => transformer(lignes));
    return { precedent };
  };
  const annuler = (_erreur: unknown, _v: unknown, contexte?: { precedent?: SaisieLigne[] }) =>
    queryClient.setQueryData(cleSaisies, contexte?.precedent);

  const insertion = useMutation({
    retry: reessayerSiReseau,
    mutationFn: async (v: Valeurs) => {
      const { data, error } = await getSupabase()
        .from("kpi_entries")
        .insert({
          kpi_id: v.kpiId,
          date: v.date,
          valeur: versNombre(v.valeur),
          commentaire: v.commentaire || null,
          localite_id: v.localiteId || null,
        })
        .select(COLONNES)
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: (v) =>
      optimiste((lignes) => [
        ...lignes,
        {
          id: `provisoire-${Date.now()}`,
          kpi_id: v.kpiId,
          date: v.date,
          valeur: versNombre(v.valeur),
          commentaire: v.commentaire || null,
          localite_id: v.localiteId || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]),
    onError: (erreur, v, contexte) => {
      annuler(erreur, v, contexte);
      gererErreur(erreur);
    },
    onSuccess: (_d, v) => {
      toast.success(t("saisie.enregistree", { valeur: formaterValeur(versNombre(v.valeur), kpi?.unite ?? "") }));
      reset({ kpiId: v.kpiId, date: v.date, valeur: "", commentaire: "", localiteId: v.localiteId });
      setTimeout(() => setFocus("valeur"), 0);
    },
    onSettled: rafraichir,
  });

  const remplacement = useMutation({
    retry: reessayerSiReseau,
    // La localité n'est transmise que par le formulaire rapide : corriger une valeur dans l'historique ne la touche pas.
    mutationFn: async ({
      id,
      valeur,
      commentaire,
      localite_id,
    }: {
      id: string;
      valeur: number;
      commentaire: string | null;
      localite_id?: string | null;
    }) => {
      const { error } = await getSupabase()
        .from("kpi_entries")
        .update({ valeur, commentaire, ...(localite_id !== undefined ? { localite_id } : {}) })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, valeur, commentaire, localite_id }) =>
      optimiste((lignes) =>
        lignes.map((l) =>
          l.id === id ? { ...l, valeur, commentaire, ...(localite_id !== undefined ? { localite_id } : {}) } : l,
        ),
      ),
    onError: (erreur, v, contexte) => {
      annuler(erreur, v, contexte);
      gererErreur(erreur);
    },
    onSuccess: () => {
      toast.success(t("saisie.remplacee"));
      // Le formulaire rapide n'est vidé que si c'est lui qui a déclenché le remplacement.
      if (etape?.type === "remplacer") reset({ kpiId, date, valeur: "", commentaire: "", localiteId });
      setEtape(null);
      setAModifier(null);
    },
    onSettled: rafraichir,
  });

  const suppression = useMutation({
    mutationFn: async (ligne: SaisieLigne) => {
      const { error } = await getSupabase().from("kpi_entries").delete().eq("id", ligne.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("saisie.supprimee"));
      setASupprimer(null);
    },
    onError: gererErreur,
    onSettled: rafraichir,
  });

  /** Enchaîne les contrôles : valeur aberrante (confirmable), puis valeur déjà saisie à cette date (remplaçable). */
  const enregistrer = (v: Valeurs) => {
    if (historique.some((s) => s.date === v.date)) {
      setEtape({ type: "remplacer", valeurs: v });
      return;
    }
    insertion.mutate(v);
  };
  const soumettre = handleSubmit((v) => {
    const precedentes = historique
      .filter((s) => s.date !== v.date)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((s) => s.valeur);
    if (detecterAberrant(precedentes, versNombre(v.valeur))) {
      setEtape({ type: "aberrant", valeurs: v });
      return;
    }
    enregistrer(v);
  });

  if (kpis.length === 0) {
    return <EtatVide visuel={<JaugeVide />} titre={t("saisie.vide.titre")} description={t("saisie.vide.texte")} />;
  }

  const enFutur = date > aujourdhui;
  const avantProjet = kpi?.type_agregation === "cumul" && date < projet.date_debut;
  const visibles = historique.slice(0, affichees);
  // La colonne « Localité » n'apparaît que si au moins une saisie affichée en a une.
  const avecLocalites = visibles.some((s) => s.localite_id);

  return (
    <div className="grid grid-cols-1 gap-6">
      {!org.peutEcrire && <Bandeau variante="alerte">{t("saisie.essai_termine")}</Bandeau>}
      {org.peutEcrire && !org.peutEditer && <Bandeau>{t("saisie.lecture_seule")}</Bandeau>}

      {org.peutEditer && (
        <Card>
          <CardHeader>
            <CardTitle>{t("saisie.titre")}</CardTitle>
            <CardDescription>{t("saisie.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={soumettre} noValidate className="grid grid-cols-1 gap-4">
              <Champ
                id="saisie-kpi"
                libelle={t("saisie.colonnes.indicateur")}
                erreur={errors.kpiId?.message && t(errors.kpiId.message)}
              >
                {(a) => (
                  <NativeSelect
                    {...a}
                    {...register("kpiId", {
                      onChange: () => {
                        setEtape(null);
                        setAffichees(PAGE);
                      },
                    })}
                  >
                    {kpis.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nom}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Champ>

              {kpi?.type_agregation === "cumul" && <Bandeau>{t("saisie.cumul_info")}</Bandeau>}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Champ
                  id="saisie-date"
                  libelle={t("saisie.colonnes.date")}
                  erreur={errors.date?.message && t(errors.date.message)}
                  aide={
                    enFutur
                      ? undefined
                      : avantProjet
                        ? t("saisie.avant_projet")
                        : existante
                          ? t("saisie.existe_deja", { valeur: formaterValeur(existante.valeur, kpi?.unite ?? "") })
                          : undefined
                  }
                >
                  {(a) => (
                    <Input
                      {...a}
                      type="date"
                      max={aujourdhui}
                      {...register("date", { onChange: () => setEtape(null) })}
                    />
                  )}
                </Champ>
                <Champ
                  id="saisie-valeur"
                  libelle={kpi?.unite ? `${t("saisie.colonnes.valeur")} (${kpi.unite})` : t("saisie.colonnes.valeur")}
                  erreur={errors.valeur?.message && t(errors.valeur.message)}
                  aide={
                    derniere
                      ? t("saisie.derniere_valeur", {
                          valeur: formaterValeur(derniere.valeur, kpi?.unite ?? ""),
                          date: formaterDate(derniere.date),
                        })
                      : undefined
                  }
                >
                  {(a) => (
                    <Input
                      {...a}
                      inputMode="decimal"
                      autoComplete="off"
                      autoFocus
                      {...register("valeur", { onChange: () => setEtape(null) })}
                    />
                  )}
                </Champ>
              </div>

              <ChampLocalite
                id="saisie-localite"
                projetId={projet.id}
                libelle={t("saisie.localite")}
                aide={t("saisie.localite_aide")}
                aucune={t("saisie.localite_aucune")}
                inscription={register("localiteId")}
              />

              <Champ
                id="saisie-commentaire"
                libelle={t("saisie.colonnes.commentaire")}
                optionnel
                erreur={errors.commentaire?.message && t(errors.commentaire.message)}
              >
                {(a) => <Textarea {...a} rows={2} {...register("commentaire")} />}
              </Champ>

              {enFutur && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {t("saisie.validation.futur")}
                </p>
              )}

              {etape?.type === "aberrant" && (
                <Bandeau variante="vigilance" className="flex-wrap items-center" role="alert">
                  <CircleAlert aria-hidden />
                  <p className="min-w-0 flex-1">
                    {t("saisie.aberrante", {
                      valeur: formaterValeur(versNombre(etape.valeurs.valeur), kpi?.unite ?? ""),
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variante="contour"
                      taille="sm"
                      onClick={() => {
                        setEtape(null);
                        setFocus("valeur");
                      }}
                    >
                      {t("saisie.corriger")}
                    </Button>
                    <Button
                      variante="primaire"
                      taille="sm"
                      onClick={() => {
                        const valeurs = etape.valeurs;
                        setEtape(null);
                        enregistrer(valeurs);
                      }}
                    >
                      {t("saisie.confirmer")}
                    </Button>
                  </div>
                </Bandeau>
              )}

              <Button
                type="submit"
                taille="lg"
                className="w-full sm:w-fit"
                chargement={insertion.isPending}
                disabled={enFutur || etape?.type === "aberrant"}
              >
                <Save aria-hidden />
                {t("saisie.enregistrer")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("saisie.historique")}</CardTitle>
          <CardDescription>{kpi?.nom}</CardDescription>
        </CardHeader>
        <CardContent>
          {historique.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("saisie.historique_vide")}</p>
          ) : (
            <>
              <div className="relative -mx-2 overflow-x-auto px-2">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th scope="col" className="py-2 pr-4 font-semibold">
                        {t("saisie.colonnes.date")}
                      </th>
                      <th scope="col" className="py-2 pr-4 text-right font-semibold">
                        {t("saisie.colonnes.valeur")}
                      </th>
                      {avecLocalites && (
                        <th scope="col" className="py-2 pr-4 font-semibold">
                          {t("saisie.colonnes.localite")}
                        </th>
                      )}
                      <th scope="col" className="py-2 pr-4 font-semibold">
                        {t("saisie.colonnes.commentaire")}
                      </th>
                      {org.peutEditer && (
                        <th scope="col" className="py-2 text-right font-semibold">
                          <span className="sr-only">{t("saisie.colonnes.actions")}</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibles.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2.5 pr-4 font-mono text-xs whitespace-nowrap tabular">
                          {formaterDate(s.date)}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono whitespace-nowrap tabular">
                          {formaterValeur(s.valeur, kpi?.unite ?? "")}
                        </td>
                        {avecLocalites && (
                          <td className="py-2.5 pr-4">
                            {s.localite_id ? libelleLieu(indexLocalites, s.localite_id, 1) : ""}
                          </td>
                        )}
                        <td className="py-2.5 pr-4 text-muted-foreground">{s.commentaire}</td>
                        {org.peutEditer && (
                          <td className="py-1.5 text-right whitespace-nowrap">
                            <Button
                              variante="fantome"
                              taille="icone"
                              className="size-9"
                              onClick={() => setAModifier(s)}
                              aria-label={t("saisie.modifier", { date: formaterDate(s.date) })}
                            >
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                            <Button
                              variante="fantome"
                              taille="icone"
                              className="size-9"
                              onClick={() => setASupprimer(s)}
                              aria-label={t("saisie.supprimer", { date: formaterDate(s.date) })}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {historique.length > affichees && (
                <Button variante="contour" taille="sm" className="mt-4" onClick={() => setAffichees((n) => n + PAGE)}>
                  {t("saisie.voir_plus", { count: historique.length - affichees })}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={etape?.type === "remplacer"} onOpenChange={(ouvert) => !ouvert && setEtape(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saisie.remplacer_titre")}</DialogTitle>
            <DialogDescription>
              {t("saisie.remplacer_texte", {
                valeur: formaterValeur(existante?.valeur ?? 0, kpi?.unite ?? ""),
                date: formaterDate(date),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variante="contour" onClick={() => setEtape(null)}>
              {t("commun.annuler")}
            </Button>
            <Button
              onClick={() =>
                etape &&
                existante &&
                remplacement.mutate({
                  id: existante.id,
                  valeur: versNombre(etape.valeurs.valeur),
                  commentaire: etape.valeurs.commentaire || null,
                  localite_id: etape.valeurs.localiteId || null,
                })
              }
              chargement={remplacement.isPending}
            >
              {t("saisie.remplacer_action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DialogueModification
        ligne={aModifier}
        unite={kpi?.unite ?? ""}
        enCours={remplacement.isPending}
        onFermer={() => setAModifier(null)}
        onEnregistrer={(ligne, valeur, commentaire) => remplacement.mutate({ id: ligne.id, valeur, commentaire })}
      />

      <Dialog open={aSupprimer !== null} onOpenChange={(ouvert) => !ouvert && setASupprimer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saisie.suppression_titre")}</DialogTitle>
            <DialogDescription>
              {aSupprimer &&
                t("saisie.suppression_texte", {
                  valeur: formaterValeur(aSupprimer.valeur, kpi?.unite ?? ""),
                  date: formaterDate(aSupprimer.date),
                })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variante="contour" onClick={() => setASupprimer(null)}>
              {t("commun.annuler")}
            </Button>
            <Button
              variante="danger"
              onClick={() => aSupprimer && suppression.mutate(aSupprimer)}
              chargement={suppression.isPending}
            >
              <Trash2 aria-hidden />
              {t("saisie.suppression_action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Correction de la valeur et du commentaire d'une saisie de l'historique. */
function DialogueModification({
  ligne,
  unite,
  enCours,
  onFermer,
  onEnregistrer,
}: {
  ligne: SaisieLigne | null;
  unite: string;
  enCours: boolean;
  onFermer: () => void;
  onEnregistrer: (ligne: SaisieLigne, valeur: number, commentaire: string | null) => void;
}) {
  const { t } = useTranslation();
  const schemaModification = z.object({
    valeur: nombre,
    commentaire: z.string().trim().max(2000, { error: "auth.validation.trop_long" }),
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schemaModification>>({
    resolver: zodResolver(schemaModification),
    values: { valeur: ligne ? versTexte(ligne.valeur) : "", commentaire: ligne?.commentaire ?? "" },
  });

  return (
    <Dialog open={ligne !== null} onOpenChange={(ouvert) => !ouvert && onFermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("saisie.modification_titre", { date: ligne ? formaterDate(ligne.date) : "" })}</DialogTitle>
          <DialogDescription>{t("saisie.modification_texte")}</DialogDescription>
        </DialogHeader>
        <form
          id="modifier-saisie"
          noValidate
          className="grid grid-cols-1 gap-4"
          onSubmit={handleSubmit((v) => ligne && onEnregistrer(ligne, versNombre(v.valeur), v.commentaire || null))}
        >
          <Champ
            id="modifier-valeur"
            libelle={unite ? `${t("saisie.colonnes.valeur")} (${unite})` : t("saisie.colonnes.valeur")}
            erreur={errors.valeur?.message && t(errors.valeur.message)}
          >
            {(a) => <Input {...a} inputMode="decimal" autoComplete="off" {...register("valeur")} />}
          </Champ>
          <Champ
            id="modifier-commentaire"
            libelle={t("saisie.colonnes.commentaire")}
            optionnel
            erreur={errors.commentaire?.message && t(errors.commentaire.message)}
          >
            {(a) => <Textarea {...a} rows={2} {...register("commentaire")} />}
          </Champ>
        </form>
        <DialogFooter>
          <Button variante="contour" onClick={onFermer}>
            {t("commun.annuler")}
          </Button>
          <Button type="submit" form="modifier-saisie" chargement={enCours}>
            {t("commun.enregistrer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
