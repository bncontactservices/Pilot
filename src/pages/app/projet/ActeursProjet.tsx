import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Handshake, Mail, MoreHorizontal, Pencil, Phone, Plus, Trash2, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { DialogueActeur } from "~/components/app/acteurs/DialogueActeur";
import { DialogueRoleActeur } from "~/components/app/acteurs/DialogueRoleActeur";
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
import { Skeleton } from "~/components/ui/skeleton";
import { useOrg } from "~/hooks/useContexteOrg";
import i18n from "~/i18n";
import { acteursRattachables, TYPES_ACTEUR } from "~/lib/acteurs";
import { type Acteur, clesSe, type RoleActeur, useActeurs, useRolesActeurs } from "~/lib/donnees-se";
import { getSupabase } from "~/lib/supabase";
import { useContexteProjet } from "../ProjetLayout";

export const meta = () => [{ title: i18n.t("acteurs.projet.meta") }];

export default function ActeursProjet() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const { projet } = useContexteProjet();
  const acteurs = useActeurs(org.organisation.id);
  const roles = useRolesActeurs(org.organisation.id);
  const peutModifier = org.peutEditer;

  const [role, setRole] = useState<{ role: RoleActeur | null; acteurId?: string } | null>(null);
  const [creation, setCreation] = useState(false);
  const [retrait, setRetrait] = useState<RoleActeur | null>(null);

  const parId = useMemo(() => new Map((acteurs.data ?? []).map((a) => [a.id, a])), [acteurs.data]);
  const duProjet = useMemo(() => (roles.data ?? []).filter((r) => r.project_id === projet.id), [roles.data, projet.id]);
  // Les acteurs sont triés par type (financeurs d'abord) puis par nom.
  const lignes = useMemo(
    () =>
      duProjet
        .map((r) => ({ role: r, acteur: parId.get(r.acteur_id) }))
        .filter((l): l is { role: RoleActeur; acteur: Acteur } => l.acteur !== undefined)
        .sort(
          (a, b) =>
            TYPES_ACTEUR.indexOf(a.acteur.type) - TYPES_ACTEUR.indexOf(b.acteur.type) ||
            a.acteur.nom.localeCompare(b.acteur.nom, "fr"),
        ),
    [duProjet, parId],
  );
  const rattachables = useMemo(() => acteursRattachables(acteurs.data ?? [], duProjet), [acteurs.data, duProjet]);

  const retirer = useMutation({
    mutationFn: async (r: RoleActeur) => {
      const { error } = await getSupabase().from("projet_acteurs").delete().eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("acteurs.projet.retire"));
      setRetrait(null);
      void queryClient.invalidateQueries({ queryKey: clesSe.rolesActeurs(org.organisation.id) });
    },
    onError: gererErreur,
  });

  const chargement = acteurs.isPending || roles.isPending;
  const erreur = acteurs.error ?? roles.error;
  const vide = acteurs.isSuccess && roles.isSuccess && lignes.length === 0;

  const actions =
    peutModifier && !chargement ? (
      <div className="flex flex-wrap gap-2">
        <Button variante="contour" onClick={() => setCreation(true)}>
          <UserPlus aria-hidden />
          {t("acteurs.projet.creer")}
        </Button>
        <Button onClick={() => setRole({ role: null })}>
          <Plus aria-hidden />
          {t("acteurs.projet.rattacher")}
        </Button>
      </div>
    ) : undefined;

  return (
    <div className="grid grid-cols-1 gap-5">
      <EntetePage
        titre={t("acteurs.projet.titre")}
        description={
          <>
            {t("acteurs.projet.description")}{" "}
            <Link to="/app/acteurs" className="font-medium text-accent-ink hover:underline">
              {t("acteurs.projet.vers_annuaire")}
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
            void acteurs.refetch();
            void roles.refetch();
          }}
        />
      ) : vide ? (
        <EtatVide
          visuel={<Handshake className="size-10 text-navy/40" aria-hidden />}
          titre={t("acteurs.projet.vide.titre")}
          description={peutModifier ? t("acteurs.projet.vide.texte") : t("acteurs.projet.vide.texte_lecteur")}
          actions={
            peutModifier && (
              <Button onClick={() => (rattachables.length > 0 ? setRole({ role: null }) : setCreation(true))}>
                <Plus aria-hidden />
                {rattachables.length > 0 ? t("acteurs.projet.rattacher") : t("acteurs.projet.creer")}
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="text-sm font-medium text-navy" aria-live="polite">
            {t("acteurs.projet.resume", { count: lignes.length })}
          </p>
          <ul className="grid grid-cols-1 gap-3">
            {lignes.map(({ role: r, acteur: a }) => (
              <li key={r.id} className="grid grid-cols-1 gap-2 rounded-2xl bg-card p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-1.5">
                    <h2 className="text-lg leading-snug font-bold text-navy">{a.nom}</h2>
                    <p className="flex flex-wrap items-center gap-2">
                      <Badge variante="contour">{t(`acteurs.types.${a.type}`)}</Badge>
                      {a.exemple && <Badge variante="exemple">{t("acteurs.exemple")}</Badge>}
                    </p>
                    <p className="text-sm font-semibold text-foreground">{r.role}</p>
                  </div>
                  {peutModifier && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variante="fantome"
                          taille="icone"
                          className="-mt-1 -mr-2 size-9"
                          aria-label={t("acteurs.projet.actions", { nom: a.nom })}
                        >
                          <MoreHorizontal aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setRole({ role: r })}>
                          <Pencil aria-hidden />
                          {t("acteurs.projet.modifier_role")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => setRetrait(r)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 aria-hidden className="!text-destructive" />
                          {t("acteurs.projet.retirer")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {r.notes && <p className="text-sm whitespace-pre-line text-foreground">{r.notes}</p>}
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
              </li>
            ))}
          </ul>
        </>
      )}

      <DialogueActeur
        ouvert={creation}
        onFermer={() => setCreation(false)}
        acteur={null}
        onCree={(id) => setRole({ role: null, acteurId: id })}
      />
      <DialogueRoleActeur
        ouvert={role !== null}
        onFermer={() => setRole(null)}
        projetId={projet.id}
        role={role?.role ?? null}
        rattachables={rattachables}
        acteurId={role?.acteurId}
      />
      <DialogueConfirmation
        ouvert={retrait !== null}
        onOuvertChange={(o) => !o && setRetrait(null)}
        titre={retrait ? t("acteurs.projet.retrait_titre", { nom: parId.get(retrait.acteur_id)?.nom ?? "" }) : ""}
        description={t("acteurs.projet.retrait_texte")}
        action={t("acteurs.projet.retrait_action")}
        enCours={retirer.isPending}
        onConfirmer={() => retrait && retirer.mutate(retrait)}
      />
    </div>
  );
}
