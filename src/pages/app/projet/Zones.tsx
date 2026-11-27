import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { DialogueConfirmation } from "~/components/app/DialogueConfirmation";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur, EtatVide } from "~/components/app/Etats";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { DialogueLocalite } from "~/components/app/zones/DialogueLocalite";
import { DialogueZone } from "~/components/app/zones/DialogueZone";
import type { PointCarte } from "~/components/app/zones/CarteZones";
import { Badge } from "~/components/ui/badge";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Skeleton } from "~/components/ui/skeleton";
import { useOrg } from "~/hooks/useContexteOrg";
import i18n from "~/i18n";
import { clesSe, useLocalites, useRealisations, useZonesProjet, type ZoneProjet } from "~/lib/donnees-se";
import { aDesCoordonnees, contexte, estReferentiel, formaterCoordonnees, indexer } from "~/lib/localites";
import { getSupabase } from "~/lib/supabase";
import { useContexteProjet } from "../ProjetLayout";

// Leaflet n'est chargé qu'à l'affichage de cette page.
const CarteZones = lazy(() => import("~/components/app/zones/CarteZones"));

export const meta = () => [{ title: i18n.t("zones.meta") }];

export default function Zones() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const { projet, saisies } = useContexteProjet();
  const localites = useLocalites(org.organisation.id);
  const zones = useZonesProjet(projet.id);
  const realisations = useRealisations(projet.id);
  const peutModifier = org.peutEditer;

  const [ajout, setAjout] = useState(false);
  const [creation, setCreation] = useState(false);
  const [retrait, setRetrait] = useState<ZoneProjet | null>(null);

  const index = useMemo(() => indexer(localites.data ?? []), [localites.data]);
  const duProjet = useMemo(() => (zones.data ?? []).filter((z) => z.project_id === projet.id), [zones.data, projet.id]);
  const lignes = useMemo(
    () =>
      duProjet
        .map((z) => ({ zone: z, localite: index.get(z.localite_id) }))
        .filter((l): l is { zone: ZoneProjet; localite: NonNullable<typeof l.localite> } => l.localite !== undefined)
        .sort((a, b) => a.localite.nom.localeCompare(b.localite.nom, "fr")),
    [duProjet, index],
  );
  const zonesIds = useMemo(() => new Set(duProjet.map((z) => z.localite_id)), [duProjet]);

  // Nombre de saisies et de réalisations rattachées à chaque localité de ce projet.
  const usage = useMemo(() => {
    const comptes = new Map<string, { saisies: number; realisations: number }>();
    const ajouter = (id: string | null | undefined, cle: "saisies" | "realisations") => {
      if (!id) return;
      const courant = comptes.get(id) ?? { saisies: 0, realisations: 0 };
      courant[cle] += 1;
      comptes.set(id, courant);
    };
    for (const s of saisies) ajouter(s.localite_id, "saisies");
    for (const r of (realisations.data ?? []).filter((r) => r.project_id === projet.id))
      ajouter(r.localite_id, "realisations");
    return comptes;
  }, [saisies, realisations.data, projet.id]);

  const points = useMemo<PointCarte[]>(
    () =>
      lignes
        .filter(({ localite }) => aDesCoordonnees(localite))
        .map(({ localite }) => ({
          id: localite.id,
          nom: localite.nom,
          contexte: contexte(index, localite.id, 3).join(", "),
          latitude: localite.latitude!,
          longitude: localite.longitude!,
        })),
    [lignes, index],
  );
  const sansCoordonnees = lignes.length - points.length;

  const ajouterZone = useMutation({
    mutationFn: async (localiteId: string) => {
      const { error } = await getSupabase()
        .from("projet_localites")
        .insert({ project_id: projet.id, localite_id: localiteId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("zones.ajoutee"));
      void queryClient.invalidateQueries({ queryKey: clesSe.zones(projet.id) });
    },
    onError: gererErreur,
  });

  const retirer = useMutation({
    mutationFn: async (z: ZoneProjet) => {
      const { error } = await getSupabase().from("projet_localites").delete().eq("id", z.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("zones.retiree"));
      setRetrait(null);
      void queryClient.invalidateQueries({ queryKey: clesSe.zones(projet.id) });
    },
    onError: gererErreur,
  });

  const chargement = localites.isPending || zones.isPending;
  const erreur = localites.error ?? zones.error;
  const vide = localites.isSuccess && zones.isSuccess && lignes.length === 0;
  // Aucune localité n'est préchargée : tant que l'organisation n'a pas créé les siennes, il n'y a rien à choisir.
  const sansLocalite = localites.isSuccess && localites.data.length === 0;

  const actions =
    peutModifier && !chargement ? (
      <div className="flex flex-wrap gap-2">
        <Button variante="contour" onClick={() => setCreation(true)}>
          {t("zones.creer")}
        </Button>
        <Button onClick={() => setAjout(true)}>
          <Plus aria-hidden />
          {t("zones.ajouter")}
        </Button>
      </div>
    ) : undefined;

  return (
    <div className="grid grid-cols-1 gap-5">
      <EntetePage
        titre={t("zones.titre")}
        description={
          <>
            {t("zones.description")}{" "}
            <Link to="/app/localites" className="font-medium text-accent-ink hover:underline">
              {t("zones.vers_localites")}
            </Link>
          </>
        }
        actions={actions}
      />

      {!peutModifier && org.peutEcrire && <Bandeau>{t("travail.lecture_seule_role")}</Bandeau>}
      {!org.peutEcrire && <Bandeau>{t("travail.lecture_seule_essai")}</Bandeau>}

      {chargement ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : erreur ? (
        <EtatErreur
          erreur={erreur}
          onReessayer={() => {
            void localites.refetch();
            void zones.refetch();
          }}
        />
      ) : vide ? (
        <EtatVide
          visuel={<MapPin className="size-10 text-navy/40" aria-hidden />}
          titre={t("zones.vide.titre")}
          description={
            !peutModifier
              ? t("zones.vide.texte_lecteur")
              : sansLocalite
                ? t("zones.vide.texte_sans_localite")
                : t("zones.vide.texte")
          }
          actions={
            peutModifier &&
            (sansLocalite ? (
              <Button onClick={() => setCreation(true)}>
                <Plus aria-hidden />
                {t("zones.creer")}
              </Button>
            ) : (
              <Button onClick={() => setAjout(true)}>
                <Plus aria-hidden />
                {t("zones.ajouter")}
              </Button>
            ))
          }
        />
      ) : (
        <>
          <p className="text-sm font-medium text-navy" aria-live="polite">
            {t("zones.resume", { count: lignes.length })}
          </p>
          <ul aria-label={t("zones.liste")} className="grid grid-cols-1 gap-3">
            {lignes.map(({ zone: z, localite: l }) => {
              const lieu = contexte(index, l.id, 3).join(", ");
              const compte = usage.get(l.id);
              return (
                <li key={z.id} className="grid grid-cols-1 gap-2 rounded-2xl bg-card p-5 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-1.5">
                      <h2 className="text-lg leading-snug font-bold text-navy">{l.nom}</h2>
                      <p className="flex flex-wrap items-center gap-2">
                        <Badge variante="contour">{t(`localites.niveaux.${l.niveau}`)}</Badge>
                        {estReferentiel(l) ? (
                          <Badge variante="exemple">{t("localites.referentiel")}</Badge>
                        ) : (
                          <Badge variante="neutre">{t("localites.propre")}</Badge>
                        )}
                      </p>
                      {lieu && <p className="text-sm text-muted-foreground">{lieu}</p>}
                    </div>
                    {peutModifier && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variante="fantome"
                            taille="icone"
                            className="-mt-1 -mr-2 size-9"
                            aria-label={t("zones.actions", { nom: l.nom })}
                          >
                            <MoreHorizontal aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => setRetrait(z)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 aria-hidden className="!text-destructive" />
                            {t("zones.retirer")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <p className="text-sm text-foreground">
                    {aDesCoordonnees(l)
                      ? t("zones.coordonnees", { valeur: formaterCoordonnees(l.latitude!, l.longitude!) })
                      : t("zones.sans_coordonnees")}
                  </p>
                  {compte && (
                    <p className="text-sm text-muted-foreground">
                      {[
                        compte.saisies > 0 && t("zones.usage_saisies", { count: compte.saisies }),
                        compte.realisations > 0 && t("zones.usage_realisations", { count: compte.realisations }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  {z.notes && <p className="text-sm whitespace-pre-line text-foreground">{z.notes}</p>}
                </li>
              );
            })}
          </ul>

          <section aria-labelledby="titre-carte" className="grid gap-3">
            <h2 id="titre-carte" className="text-lg font-bold text-navy">
              {t("zones.carte.titre")}
            </h2>
            {points.length === 0 ? (
              <Bandeau>{t("zones.carte.aucune")}</Bandeau>
            ) : (
              <>
                <Suspense fallback={<Skeleton className="h-80 rounded-2xl sm:h-96" aria-busy />}>
                  <CarteZones points={points} />
                </Suspense>
                {sansCoordonnees > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("zones.carte.sans_coordonnees", { count: sansCoordonnees })}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{t("zones.carte.confidentialite")}</p>
              </>
            )}
          </section>
        </>
      )}

      <DialogueZone
        ouvert={ajout}
        onFermer={() => setAjout(false)}
        projetId={projet.id}
        localites={localites.data ?? []}
        zonesIds={zonesIds}
        onCreer={() => {
          setAjout(false);
          setCreation(true);
        }}
      />
      <DialogueLocalite
        ouvert={creation}
        onFermer={() => setCreation(false)}
        localite={null}
        localites={localites.data ?? []}
        onCree={(id) => ajouterZone.mutate(id)}
      />
      <DialogueConfirmation
        ouvert={retrait !== null}
        onOuvertChange={(o) => !o && setRetrait(null)}
        titre={retrait ? t("zones.retrait_titre", { nom: index.get(retrait.localite_id)?.nom ?? "" }) : ""}
        description={t("zones.retrait_texte")}
        action={t("zones.retrait_action")}
        enCours={retirer.isPending}
        onConfirmer={() => retrait && retirer.mutate(retrait)}
      />
    </div>
  );
}
