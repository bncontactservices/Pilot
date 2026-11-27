import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { Badge } from "~/components/ui/badge";
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
import { Input } from "~/components/ui/input";
import { clesSe, type Localite } from "~/lib/donnees-se";
import { aDesCoordonnees, aplatir, contexte, estReferentiel, indexer, rechercher } from "~/lib/localites";
import { useOrg } from "~/hooks/useContexteOrg";
import { getSupabase } from "~/lib/supabase";

type Props = {
  ouvert: boolean;
  onFermer: () => void;
  projetId: string;
  localites: Localite[];
  /** Localités qui sont déjà des zones du projet. */
  zonesIds: Set<string>;
  /** Ouvre le formulaire de création d'une localité de l'organisation. */
  onCreer: () => void;
};

/** Choisit, parmi les localités visibles, celles qui deviennent des zones d'intervention du projet. */
export function DialogueZone(props: Props) {
  const { ouvert, onFermer } = props;
  return (
    <Drawer open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DrawerContent>{ouvert && <Corps {...props} />}</DrawerContent>
    </Drawer>
  );
}

function Corps({ onFermer, projetId, localites, zonesIds, onCreer }: Props) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const [recherche, setRecherche] = useState("");
  const index = useMemo(() => indexer(localites), [localites]);
  const lignes = useMemo(() => aplatir(rechercher(localites, recherche)), [localites, recherche]);
  const toutesDejaZones = localites.length > 0 && localites.every((l) => zonesIds.has(l.id));

  const ajouter = useMutation({
    mutationFn: async (localiteId: string) => {
      const { error } = await getSupabase()
        .from("projet_localites")
        .insert({ project_id: projetId, localite_id: localiteId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("zones.ajoutee"));
      void queryClient.invalidateQueries({ queryKey: clesSe.zones(projetId) });
    },
    onError: gererErreur,
  });

  return (
    <>
      <DrawerHeader>
        <DrawerTitle className="text-xl font-bold text-navy">{t("zones.dialogue.titre")}</DrawerTitle>
        <DrawerDescription className="text-sm text-muted-foreground">
          {t("zones.dialogue.description")}
        </DrawerDescription>
      </DrawerHeader>
      <DrawerBody>
        <div className="grid gap-4">
          {localites.length > 0 && (
            <Champ id="zone-recherche" libelle={t("zones.dialogue.recherche")}>
              {(a) => (
                <Input
                  {...a}
                  type="search"
                  autoComplete="off"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
              )}
            </Champ>
          )}
          {toutesDejaZones && recherche === "" && (
            <p className="text-sm text-muted-foreground">{t("zones.dialogue.tout_ajoute")}</p>
          )}
          {localites.length === 0 ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("zones.dialogue.aucune_localite")}
            </p>
          ) : lignes.length === 0 ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("zones.dialogue.aucun_resultat", { recherche })}
            </p>
          ) : (
            <ul aria-label={t("zones.dialogue.liste")} className="grid gap-2">
              {lignes.slice(0, 200).map(({ localite: l, profondeur }) => {
                const deja = zonesIds.has(l.id);
                const proches = contexte(index, l.id, 2).join(", ");
                return (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2"
                    // Un léger décalage par niveau rend la hiérarchie lisible sans la réécrire sur chaque ligne.
                    style={{ marginLeft: `${Math.min(profondeur, 4) * 0.75}rem` }}
                  >
                    <div className="grid min-w-0 gap-0.5">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy">
                        {l.nom}
                        <Badge variante="contour">{t(`localites.niveaux.${l.niveau}`)}</Badge>
                        {estReferentiel(l) && <Badge variante="exemple">{t("localites.referentiel")}</Badge>}
                      </p>
                      {proches && <p className="truncate text-xs text-muted-foreground">{proches}</p>}
                      {!aDesCoordonnees(l) && (
                        <p className="text-xs text-muted-foreground">{t("localites.sans_coordonnees")}</p>
                      )}
                    </div>
                    {deja ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                        <MapPin className="size-3.5" aria-hidden />
                        {t("zones.dialogue.deja")}
                      </span>
                    ) : (
                      <Button
                        variante="contour"
                        taille="sm"
                        aria-label={`${t("zones.dialogue.ajouter")} : ${l.nom}`}
                        disabled={ajouter.isPending}
                        onClick={() => ajouter.mutate(l.id)}
                      >
                        <Plus aria-hidden />
                        {t("zones.dialogue.ajouter")}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {org.peutEditer && (
            <Button variante="contour" className="w-fit" onClick={onCreer}>
              {t("zones.dialogue.creer")}
            </Button>
          )}
        </div>
      </DrawerBody>
      <DrawerFooter>
        <Button onClick={onFermer}>{t("commun.fermer")}</Button>
      </DrawerFooter>
    </>
  );
}
