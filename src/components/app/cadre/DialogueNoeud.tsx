import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { NativeSelect, Textarea } from "~/components/ui/input";
import { useOrg } from "~/hooks/useContexteOrg";
import { type Noeud, parentsPossibles, prochainOrdre, type TypeNoeud } from "~/lib/cadre-logique";
import { cles, type Kpi } from "~/lib/donnees";
import { clesSe } from "~/lib/donnees-se";
import { getSupabase } from "~/lib/supabase";

const schema = z.object({
  libelle: z
    .string()
    .trim()
    .min(2, { error: "cadre.formulaire.validation.libelle" })
    .max(500, { error: "cadre.formulaire.validation.libelle" }),
  moyens: z.string().trim().max(2000, { error: "auth.validation.trop_long" }),
  hypotheses: z.string().trim().max(2000, { error: "auth.validation.trop_long" }),
  parentId: z.string(),
});
type Valeurs = z.infer<typeof schema>;

export type ModeNoeud =
  { mode: "creer"; type: TypeNoeud; parentId: string | null } | { mode: "modifier"; noeud: Noeud };

const valeursDe = (mode: ModeNoeud | null): Valeurs =>
  mode?.mode === "modifier"
    ? {
        libelle: mode.noeud.libelle,
        moyens: mode.noeud.moyens_verification ?? "",
        hypotheses: mode.noeud.hypotheses ?? "",
        parentId: mode.noeud.parent_id ?? "",
      }
    : { libelle: "", moyens: "", hypotheses: "", parentId: mode?.mode === "creer" ? (mode.parentId ?? "") : "" };

type Props = {
  mode: ModeNoeud | null;
  onFermer: () => void;
  projetId: string;
  noeuds: Noeud[];
  kpis: Kpi[];
};

/** Création ou modification d'une ligne du cadre logique, avec ses indicateurs reliés. */
export function DialogueNoeud(props: Props) {
  const { mode, onFermer } = props;
  return (
    <Drawer open={mode !== null} onOpenChange={(o) => !o && onFermer()}>
      <DrawerContent>
        {mode && (
          <CorpsNoeud
            key={mode.mode === "modifier" ? mode.noeud.id : `nouveau-${mode.type}-${mode.parentId}`}
            {...props}
            mode={mode}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

// Monté à chaque ouverture : l'état (indicateurs cochés) repart des valeurs de la ligne, sans effet de synchronisation.
function CorpsNoeud({ mode, onFermer, projetId, noeuds, kpis }: Props & { mode: ModeNoeud }) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const type: TypeNoeud = mode.mode === "creer" ? mode.type : mode.noeud.type;
  const noeudEdite = mode.mode === "modifier" ? mode.noeud : null;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: valeursDe(mode) });

  // Indicateurs cochés : par défaut ceux qui sont déjà reliés à cette ligne.
  const [reliesInitiaux] = useState<string[]>(() =>
    noeudEdite ? kpis.filter((k) => k.noeud_id === noeudEdite.id).map((k) => k.id) : [],
  );
  const [relies, setRelies] = useState<Set<string>>(() => new Set(reliesInitiaux));

  const parents = noeudEdite ? parentsPossibles(noeuds, type) : [];
  const codeDe = (noeudId: string | null) => noeuds.find((n) => n.id === noeudId)?.code ?? "";

  const enregistrer = useMutation({
    mutationFn: async (v: Valeurs) => {
      const supabase = getSupabase();
      const champs = {
        libelle: v.libelle,
        moyens_verification: v.moyens || null,
        hypotheses: v.hypotheses || null,
      };
      let id: string;
      if (noeudEdite) {
        const parent = v.parentId || null;
        const { error } = await supabase
          .from("cadre_logique_noeuds")
          .update({ ...champs, ...(parent !== noeudEdite.parent_id && parent !== null ? { parent_id: parent } : {}) })
          .eq("id", noeudEdite.id);
        if (error) throw error;
        id = noeudEdite.id;
      } else {
        const parentId = v.parentId || null;
        const freres = noeuds.filter((n) => n.parent_id === parentId);
        const { data, error } = await supabase
          .from("cadre_logique_noeuds")
          .insert({ project_id: projetId, type, parent_id: parentId, ...champs, ordre: prochainOrdre(freres) })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      }
      // Indicateurs : on ne touche que ceux dont l'état a changé.
      const aDeplacer = [...relies].filter((kpiId) => kpis.find((k) => k.id === kpiId)?.noeud_id !== id);
      const aDetacher = reliesInitiaux.filter((kpiId) => !relies.has(kpiId));
      for (const kpiId of aDeplacer) {
        const { error } = await supabase.from("kpis").update({ noeud_id: id }).eq("id", kpiId);
        if (error) throw error;
      }
      for (const kpiId of aDetacher) {
        const { error } = await supabase.from("kpis").update({ noeud_id: null }).eq("id", kpiId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t(noeudEdite ? "cadre.formulaire.modifie" : "cadre.formulaire.cree"));
      onFermer();
      void queryClient.invalidateQueries({ queryKey: clesSe.noeuds(projetId) });
      void queryClient.invalidateQueries({ queryKey: cles.kpis(projetId) });
      void queryClient.invalidateQueries({ queryKey: cles.orgKpis(org.organisation.id) });
    },
    onError: gererErreur,
  });

  const message = (cle?: string) => (cle ? t(cle) : undefined);
  const basculer = (kpiId: string, coche: boolean) =>
    setRelies((precedent) => {
      const suivant = new Set(precedent);
      if (coche) suivant.add(kpiId);
      else suivant.delete(kpiId);
      return suivant;
    });
  const formulaire = "formulaire-noeud";

  return (
    <>
      <DrawerHeader>
        <DrawerTitle className="text-xl font-bold text-navy">
          {noeudEdite
            ? t("cadre.formulaire.titre_modifier", { code: noeudEdite.code })
            : t("cadre.formulaire.titre_creer", { type: t(`cadre.types.${type}`).toLowerCase() })}
        </DrawerTitle>
        <DrawerDescription className="text-sm text-muted-foreground">{t(`cadre.types.${type}`)}</DrawerDescription>
      </DrawerHeader>
      <DrawerBody>
        <form id={formulaire} onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate className="grid gap-4">
          <Champ id="noeud-libelle" libelle={t("cadre.formulaire.libelle")} erreur={message(errors.libelle?.message)}>
            {(a) => <Textarea {...a} rows={3} {...register("libelle")} />}
          </Champ>
          {parents.length > 1 && (
            <Champ id="noeud-parent" libelle={t("cadre.formulaire.rattachement")}>
              {(a) => (
                <NativeSelect {...a} {...register("parentId")}>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {`${p.code} - ${p.libelle.length > 70 ? `${p.libelle.slice(0, 70)}…` : p.libelle}`}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Champ>
          )}
          <Champ
            id="noeud-moyens"
            libelle={t("cadre.formulaire.moyens")}
            aide={t("cadre.formulaire.moyens_aide")}
            optionnel
            erreur={message(errors.moyens?.message)}
          >
            {(a) => <Textarea {...a} rows={3} {...register("moyens")} />}
          </Champ>
          <Champ
            id="noeud-hypotheses"
            libelle={t("cadre.formulaire.hypotheses")}
            aide={t("cadre.formulaire.hypotheses_aide")}
            optionnel
            erreur={message(errors.hypotheses?.message)}
          >
            {(a) => <Textarea {...a} rows={3} {...register("hypotheses")} />}
          </Champ>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-semibold text-foreground">{t("cadre.formulaire.indicateurs")}</legend>
            <p className="text-sm text-muted-foreground">{t("cadre.formulaire.indicateurs_aide")}</p>
            {kpis.length === 0 ? (
              <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                {t("cadre.formulaire.indicateurs_vide")}
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {kpis.map((k) => {
                  const ailleurs = k.noeud_id && k.noeud_id !== noeudEdite?.id ? codeDe(k.noeud_id) : "";
                  const id = `noeud-kpi-${k.id}`;
                  return (
                    <li key={k.id}>
                      <label
                        htmlFor={id}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-sm has-[:checked]:border-navy/40 has-[:checked]:bg-subtle"
                      >
                        <input
                          id={id}
                          type="checkbox"
                          className="mt-0.5 size-4 shrink-0 accent-[var(--navy)]"
                          checked={relies.has(k.id)}
                          onChange={(e) => basculer(k.id, e.target.checked)}
                        />
                        <span className="grid min-w-0 gap-0.5">
                          <span className="font-medium text-foreground">{k.nom}</span>
                          {ailleurs && !relies.has(k.id) && (
                            <span className="text-xs text-muted-foreground">
                              {t("cadre.formulaire.relie_a", { code: ailleurs })}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
        </form>
      </DrawerBody>
      <DrawerFooter>
        <Button variante="contour" onClick={onFermer}>
          {t("commun.annuler")}
        </Button>
        <Button type="submit" form={formulaire} chargement={enregistrer.isPending}>
          {t(noeudEdite ? "cadre.formulaire.action_modifier" : "cadre.formulaire.action_creer")}
        </Button>
      </DrawerFooter>
    </>
  );
}
