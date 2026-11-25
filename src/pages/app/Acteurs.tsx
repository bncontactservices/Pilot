import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Handshake, Mail, MoreHorizontal, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { DialogueActeur } from "~/components/app/acteurs/DialogueActeur";
import { DialogueConfirmation } from "~/components/app/DialogueConfirmation";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur, EtatVide } from "~/components/app/Etats";
import { useGestionErreur } from "~/components/app/LimitePlan";
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
import { Input, NativeSelect } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { useOrg } from "~/hooks/useContexteOrg";
import i18n from "~/i18n";
import { filtrerActeurs, rolesParActeur, type TypeActeur, TYPES_ACTEUR } from "~/lib/acteurs";
import { type Acteur, clesSe, useActeurs, useProjetsNoms, useRolesActeurs } from "~/lib/donnees-se";
import { getSupabase } from "~/lib/supabase";

export const meta = () => [{ title: i18n.t("acteurs.meta") }];

export default function Acteurs() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const acteurs = useActeurs(org.organisation.id);
  const roles = useRolesActeurs(org.organisation.id);
  const projets = useProjetsNoms(org.organisation.id);
  // Créer et modifier : admin et éditeur ; supprimer (ce qui retire aussi ses rôles) : admin.
  const peutModifier = org.peutEditer;
  const peutSupprimer = org.peutEcrire && org.estAdmin;

  const [recherche, setRecherche] = useState("");
  const [type, setType] = useState<TypeActeur | "">("");
  const [edition, setEdition] = useState<Acteur | "nouveau" | null>(null);
  const [suppression, setSuppression] = useState<Acteur | null>(null);

  const liste = useMemo(() => acteurs.data ?? [], [acteurs.data]);
  const affiches = useMemo(() => filtrerActeurs(liste, { type, recherche }), [liste, type, recherche]);
  const parActeur = useMemo(() => rolesParActeur(roles.data ?? []), [roles.data]);
  const nomsProjets = useMemo(() => new Map((projets.data ?? []).map((p) => [p.id, p.nom])), [projets.data]);

  const supprimer = useMutation({
    mutationFn: async (a: Acteur) => {
      const { error } = await getSupabase().from("acteurs").delete().eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("acteurs.suppression.succes"));
      setSuppression(null);
      void queryClient.invalidateQueries({ queryKey: clesSe.acteurs(org.organisation.id) });
      void queryClient.invalidateQueries({ queryKey: clesSe.rolesActeurs(org.organisation.id) });
    },
    onError: gererErreur,
  });

  const chargement = acteurs.isPending;
  const vide = acteurs.isSuccess && liste.length === 0;
  const actions =
    peutModifier && !vide && !chargement ? (
      <Button onClick={() => setEdition("nouveau")}>
        <Plus aria-hidden />
        {t("acteurs.ajouter")}
      </Button>
    ) : undefined;

  return (
    <div className="grid grid-cols-1 gap-5">
      <EntetePage titre={t("acteurs.titre")} description={t("acteurs.description")} actions={actions} />

      {!peutModifier && org.peutEcrire && <Bandeau>{t("travail.lecture_seule_role")}</Bandeau>}
      {!org.peutEcrire && <Bandeau>{t("travail.lecture_seule_essai")}</Bandeau>}

      {chargement ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : acteurs.error ? (
        <EtatErreur erreur={acteurs.error} onReessayer={() => void acteurs.refetch()} />
      ) : vide ? (
        <EtatVide
          visuel={<Handshake className="size-10 text-navy/40" aria-hidden />}
          titre={t("acteurs.vide.titre")}
          description={peutModifier ? t("acteurs.vide.texte") : t("acteurs.vide.texte_lecteur")}
          actions={
            peutModifier && (
              <Button onClick={() => setEdition("nouveau")}>
                <Plus aria-hidden />
                {t("acteurs.ajouter")}
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-56 flex-1 gap-1 text-xs font-semibold text-muted-foreground">
              {t("acteurs.recherche")}
              <span className="relative">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  className="pl-9"
                  autoComplete="off"
                />
              </span>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
              {t("acteurs.filtre_type")}
              <NativeSelect value={type} onChange={(e) => setType(e.target.value as TypeActeur | "")}>
                <option value="">{t("acteurs.tous_types")}</option>
                {TYPES_ACTEUR.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(`acteurs.types.${ty}`)}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          <p className="text-sm font-medium text-navy" aria-live="polite">
            {t("acteurs.resume", { count: affiches.length })}
          </p>

          {affiches.length === 0 ? (
            <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground shadow-card">
              {t("acteurs.aucun_resultat")}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3">
              {affiches.map((a) => {
                const roles = parActeur.get(a.id) ?? [];
                return (
                  <li key={a.id} className="grid grid-cols-1 gap-3 rounded-2xl bg-card p-5 shadow-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid min-w-0 gap-1.5">
                        <h2 className="text-lg leading-snug font-bold text-navy">{a.nom}</h2>
                        <p className="flex flex-wrap items-center gap-2">
                          <Badge variante="contour">{t(`acteurs.types.${a.type}`)}</Badge>
                          {a.exemple && <Badge variante="exemple">{t("acteurs.exemple")}</Badge>}
                        </p>
                      </div>
                      {peutModifier && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variante="fantome"
                              taille="icone"
                              className="-mt-1 -mr-2 size-9"
                              aria-label={t("acteurs.actions", { nom: a.nom })}
                            >
                              <MoreHorizontal aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEdition(a)}>
                              <Pencil aria-hidden />
                              {t("cadre.actions.modifier")}
                            </DropdownMenuItem>
                            {peutSupprimer && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => setSuppression(a)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 aria-hidden className="!text-destructive" />
                                  {t("cadre.actions.supprimer")}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    {a.description && <p className="text-sm whitespace-pre-line text-foreground">{a.description}</p>}
                    {(a.contact || a.email || a.telephone) && (
                      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {a.contact && <li>{a.contact}</li>}
                        {a.email && (
                          <li className="inline-flex items-center gap-1.5">
                            <Mail className="size-3.5" aria-hidden />
                            <a href={`mailto:${a.email}`} className="text-accent-ink hover:underline">
                              {a.email}
                            </a>
                          </li>
                        )}
                        {a.telephone && (
                          <li className="inline-flex items-center gap-1.5">
                            <Phone className="size-3.5" aria-hidden />
                            {a.telephone}
                          </li>
                        )}
                      </ul>
                    )}
                    <div className="grid gap-1.5 border-t border-border pt-3">
                      <p className="text-sm font-semibold text-navy">
                        {roles.length === 0 ? t("acteurs.aucun_projet") : t("acteurs.projets", { count: roles.length })}
                      </p>
                      {roles.length > 0 && (
                        <ul className="grid gap-1 text-sm">
                          {roles.map((r) => (
                            <li key={r.id}>
                              <Link
                                to={`/app/projets/${r.project_id}/acteurs`}
                                className="font-medium text-accent-ink hover:underline"
                              >
                                {nomsProjets.get(r.project_id) ?? t("acteurs.projet_inconnu")}
                              </Link>
                              <span className="text-muted-foreground"> · {r.role}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <DialogueActeur
        ouvert={edition !== null}
        onFermer={() => setEdition(null)}
        acteur={edition && edition !== "nouveau" ? edition : null}
      />
      <DialogueConfirmation
        ouvert={suppression !== null}
        onOuvertChange={(o) => !o && setSuppression(null)}
        titre={suppression ? t("acteurs.suppression.titre", { nom: suppression.nom }) : ""}
        description={t("acteurs.suppression.texte")}
        action={t("acteurs.suppression.action")}
        enCours={supprimer.isPending}
        onConfirmer={() => suppression && supprimer.mutate(suppression)}
      />
    </div>
  );
}
