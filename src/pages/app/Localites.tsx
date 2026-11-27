import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DialogueConfirmation } from "~/components/app/DialogueConfirmation";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur, EtatVide } from "~/components/app/Etats";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { DialogueLocalite } from "~/components/app/zones/DialogueLocalite";
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
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { useOrg } from "~/hooks/useContexteOrg";
import i18n from "~/i18n";
import { clesSe, type Localite, useLocalites } from "~/lib/donnees-se";
import {
  aDesCoordonnees,
  aplatir,
  contexte,
  estReferentiel,
  formaterCoordonnees,
  indexer,
  rechercher,
} from "~/lib/localites";
import { getSupabase } from "~/lib/supabase";

export const meta = () => [{ title: i18n.t("localites.meta") }];

/** Les localités visibles de l'organisation : le référentiel de la plateforme (lecture seule) et les siennes. */
export default function Localites() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const localites = useLocalites(org.organisation.id);
  const peutModifier = org.peutEditer;

  const [recherche, setRecherche] = useState("");
  const [edition, setEdition] = useState<Localite | "nouvelle" | null>(null);
  const [suppression, setSuppression] = useState<Localite | null>(null);

  const liste = useMemo(() => localites.data ?? [], [localites.data]);
  const index = useMemo(() => indexer(liste), [liste]);
  const lignes = useMemo(() => aplatir(rechercher(liste, recherche)), [liste, recherche]);

  const supprimer = useMutation({
    mutationFn: async (l: Localite) => {
      const { error } = await getSupabase().from("localites").delete().eq("id", l.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("localites.supprimee"));
      setSuppression(null);
      void queryClient.invalidateQueries({ queryKey: clesSe.localites(org.organisation.id) });
    },
    onError: gererErreur,
  });

  const actions =
    peutModifier && localites.isSuccess ? (
      <Button onClick={() => setEdition("nouvelle")}>
        <Plus aria-hidden />
        {t("localites.creer")}
      </Button>
    ) : undefined;

  return (
    <div className="grid grid-cols-1 gap-5">
      <EntetePage titre={t("localites.titre")} description={t("localites.description")} actions={actions} />

      {!peutModifier && org.peutEcrire && <Bandeau>{t("travail.lecture_seule_role")}</Bandeau>}
      {!org.peutEcrire && <Bandeau>{t("travail.lecture_seule_essai")}</Bandeau>}
      {/* Aucune localité n'est préchargée : l'explication n'a de sens que si la plateforme en a chargé. */}
      {liste.some(estReferentiel) && <Bandeau>{t("localites.referentiel_aide")}</Bandeau>}

      {localites.isPending ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      ) : localites.error ? (
        <EtatErreur erreur={localites.error} onReessayer={() => void localites.refetch()} />
      ) : liste.length === 0 ? (
        <EtatVide
          visuel={<MapPin className="size-10 text-navy/40" aria-hidden />}
          titre={t("localites.vide.titre")}
          description={peutModifier ? t("localites.vide.texte") : t("localites.vide.texte_lecteur")}
          actions={
            peutModifier && (
              <Button onClick={() => setEdition("nouvelle")}>
                <Plus aria-hidden />
                {t("localites.creer")}
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="relative max-w-md">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              className="pl-9"
              aria-label={t("localites.recherche")}
              placeholder={t("localites.recherche")}
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <p className="text-sm font-medium text-navy" aria-live="polite">
            {t("localites.resume", { count: lignes.length })}
          </p>
          {lignes.length === 0 ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("localites.aucun_resultat", { recherche })}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {lignes.map(({ localite: l, profondeur }) => {
                const lieu = recherche ? contexte(index, l.id, 3).join(", ") : "";
                return (
                  <li
                    key={l.id}
                    className="grid gap-1 rounded-2xl bg-card px-4 py-3 shadow-card"
                    style={{ marginLeft: recherche ? 0 : `${Math.min(profondeur, 5) * 0.75}rem` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid min-w-0 gap-1">
                        <h2 className="flex flex-wrap items-center gap-2 text-base font-bold text-navy">
                          {l.nom}
                          <Badge variante="contour">{t(`localites.niveaux.${l.niveau}`)}</Badge>
                          {estReferentiel(l) ? (
                            <Badge variante="exemple">{t("localites.referentiel")}</Badge>
                          ) : (
                            <Badge variante="neutre">{t("localites.propre")}</Badge>
                          )}
                        </h2>
                        {lieu && <p className="text-sm text-muted-foreground">{lieu}</p>}
                        <p className="flex flex-wrap items-center gap-1.5 text-sm text-foreground">
                          <MapPin className="size-3.5 text-muted-foreground" aria-hidden />
                          {aDesCoordonnees(l)
                            ? formaterCoordonnees(l.latitude!, l.longitude!)
                            : t("localites.sans_coordonnees")}
                        </p>
                        {l.source && (
                          <p className="text-xs text-muted-foreground">{t("localites.source", { source: l.source })}</p>
                        )}
                      </div>
                      {peutModifier && !estReferentiel(l) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variante="fantome"
                              taille="icone"
                              className="-mt-1 -mr-2 size-9"
                              aria-label={t("localites.actions", { nom: l.nom })}
                            >
                              <MoreHorizontal aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEdition(l)}>
                              <Pencil aria-hidden />
                              {t("localites.modifier")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => setSuppression(l)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 aria-hidden className="!text-destructive" />
                              {t("localites.supprimer")}
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

      <DialogueLocalite
        ouvert={edition !== null}
        onFermer={() => setEdition(null)}
        localite={edition === "nouvelle" ? null : edition}
        localites={liste}
      />
      <DialogueConfirmation
        ouvert={suppression !== null}
        onOuvertChange={(o) => !o && setSuppression(null)}
        titre={suppression ? t("localites.suppression_titre", { nom: suppression.nom }) : ""}
        description={t("localites.suppression_texte")}
        action={t("localites.suppression_action")}
        enCours={supprimer.isPending}
        onConfirmer={() => suppression && supprimer.mutate(suppression)}
      />
    </div>
  );
}
