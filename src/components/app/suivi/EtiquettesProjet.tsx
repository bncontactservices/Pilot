import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Tag, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useOrg } from "~/hooks/useContexteOrg";
import { clesSe, useEtiquettes, useEtiquettesOrg } from "~/lib/donnees-se";
import { ETIQUETTE_LONGUEUR_MAX, ETIQUETTES_MAX, normaliserEtiquette } from "~/lib/suivi";
import { getSupabase } from "~/lib/supabase";

/**
 * Étiquettes libres d'un projet (typologie d'intervention : formation, infrastructure, plaidoyer…).
 * Dix au plus, en minuscules ; les étiquettes déjà utilisées dans l'organisation sont proposées.
 */
export function EtiquettesProjet({ projetId, modifiable }: { projetId: string; modifiable: boolean }) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const etiquettes = useEtiquettes(projetId);
  const deLOrganisation = useEtiquettesOrg(org.organisation.id);
  const [saisie, setSaisie] = useState("");
  const [probleme, setProbleme] = useState<string | null>(null);

  const liste = etiquettes.data ?? [];
  const suggestions = [...new Set((deLOrganisation.data ?? []).map((l) => l.etiquette))].filter(
    (e) => !liste.includes(e),
  );
  const complet = liste.length >= ETIQUETTES_MAX;

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: clesSe.etiquettes(projetId) });
    void queryClient.invalidateQueries({ queryKey: clesSe.etiquettesOrg(org.organisation.id) });
  };

  const ajouter = useMutation({
    mutationFn: async (etiquette: string) => {
      const { error } = await getSupabase().from("projet_etiquettes").insert({ project_id: projetId, etiquette });
      if (error) throw error;
    },
    onSuccess: () => {
      setSaisie("");
      rafraichir();
    },
    onError: gererErreur,
  });

  const retirer = useMutation({
    mutationFn: async (etiquette: string) => {
      const { error } = await getSupabase()
        .from("projet_etiquettes")
        .delete()
        .eq("project_id", projetId)
        .eq("etiquette", etiquette);
      if (error) throw error;
    },
    onSuccess: rafraichir,
    onError: gererErreur,
  });

  const valider = (e: FormEvent) => {
    e.preventDefault();
    const etiquette = normaliserEtiquette(saisie);
    if (etiquette === "") return setProbleme(t("etiquettes.validation.vide"));
    if (etiquette.length > ETIQUETTE_LONGUEUR_MAX) return setProbleme(t("etiquettes.validation.longue"));
    if (liste.includes(etiquette)) return setProbleme(t("etiquettes.validation.doublon", { etiquette }));
    setProbleme(null);
    ajouter.mutate(etiquette);
  };

  if (!modifiable && liste.length === 0) return null;
  return (
    <div className="grid gap-1.5">
      <div role="group" aria-label={t("etiquettes.titre")} className="flex flex-wrap items-center gap-2">
        {liste.map((etiquette) => (
          <span
            key={etiquette}
            className="inline-flex items-center gap-1 rounded-full bg-subtle py-0.5 pl-2.5 text-xs font-semibold text-navy"
            style={{ paddingRight: modifiable ? "0.125rem" : "0.625rem" }}
          >
            <Tag className="size-3.5" aria-hidden />
            {etiquette}
            {modifiable && (
              <button
                type="button"
                onClick={() => retirer.mutate(etiquette)}
                disabled={retirer.isPending}
                aria-label={t("etiquettes.retirer", { etiquette })}
                className="grid size-6 place-items-center rounded-full text-navy/70 transition-colors hover:bg-navy/10 hover:text-navy disabled:opacity-50"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </span>
        ))}
        {liste.length === 0 && <span className="text-xs text-muted-foreground">{t("etiquettes.aucune")}</span>}
        {modifiable && !complet && (
          <form onSubmit={valider} noValidate className="flex items-center gap-1.5">
            <Input
              value={saisie}
              onChange={(e) => {
                setSaisie(e.target.value);
                setProbleme(null);
              }}
              list="etiquettes-suggestions"
              autoComplete="off"
              maxLength={ETIQUETTE_LONGUEUR_MAX + 10}
              placeholder={t("etiquettes.placeholder")}
              aria-label={t("etiquettes.ajouter_libelle")}
              aria-invalid={probleme ? true : undefined}
              className="h-8 w-48 rounded-full px-3 text-sm"
            />
            {suggestions.length > 0 && (
              <datalist id="etiquettes-suggestions">
                {suggestions.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            )}
            <Button type="submit" variante="contour" taille="sm" className="h-8" chargement={ajouter.isPending}>
              <Plus aria-hidden />
              {t("etiquettes.ajouter")}
            </Button>
          </form>
        )}
        {modifiable && complet && <span className="text-xs text-muted-foreground">{t("etiquettes.max")}</span>}
      </div>
      {probleme && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {probleme}
        </p>
      )}
    </div>
  );
}
