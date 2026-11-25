import { zodResolver } from "@hookform/resolvers/zod";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Mail, MailWarning, MessageCircle, Send, UserMinus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur } from "~/components/app/Etats";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { Badge } from "~/components/ui/badge";
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
import { Input, NativeSelect } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { useOrg } from "~/hooks/useContexteOrg";
import i18n from "~/i18n";
import { lienPartageWhatsApp } from "~/lib/contact";
import type { Enums } from "~/lib/database.types";
import { formaterDate, initiales } from "~/lib/format";
import { getSupabase } from "~/lib/supabase";

export const meta = () => [{ title: i18n.t("equipe.meta") }];

const ROLES: Enums<"role_membre">[] = ["admin", "editeur", "lecteur"];

export default function Equipe() {
  const { t } = useTranslation();
  const org = useOrg();
  const orgId = org.organisation.id;
  // Dernière invitation créée ou renvoyée : son lien et l'état de l'envoi par e-mail.
  const [resultat, setResultat] = useState<ResultatInvitation | null>(null);

  const membres = useQuery({
    queryKey: ["membres", orgId],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("memberships")
        .select("user_id, role, created_at, profil:profiles(nom, email)")
        .eq("org_id", orgId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const invitations = useQuery({
    queryKey: ["invitations", orgId],
    enabled: org.estAdmin,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("invitations")
        .select("id, email, role, expires_at, created_at")
        .eq("org_id", orgId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const enAttente = invitations.data?.filter((i) => new Date(i.expires_at) > new Date()).length ?? 0;
  const utilises = (membres.data?.length ?? 0) + enAttente;
  const limite = org.limites.users;
  const quotaAtteint = limite !== null && utilises >= limite;

  return (
    <>
      <EntetePage
        titre={t("equipe.titre")}
        description={
          membres.isSuccess &&
          (limite === null
            ? t("equipe.quota_illimite", { count: utilises })
            : t("equipe.quota", { count: utilises, limite, plan: t(`plans.${org.organisation.plan}`) }))
        }
      />

      {!org.estAdmin && <Bandeau>{t("equipe.lecture_non_admin")}</Bandeau>}

      {org.estAdmin && org.peutEcrire && (
        <CarteInvitation quotaAtteint={quotaAtteint} resultat={resultat} onResultat={setResultat} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("equipe.membres.titre")}</CardTitle>
          <CardDescription>{t("equipe.membres.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {membres.isPending ? (
            <div className="grid grid-cols-1 gap-3" aria-busy>
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : membres.isError ? (
            <EtatErreur erreur={membres.error} onReessayer={() => void membres.refetch()} />
          ) : (
            <ul className="divide-y divide-border">
              {membres.data.map((membre) => (
                <LigneMembre key={membre.user_id} membre={membre} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {org.estAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>{t("equipe.invitations.titre")}</CardTitle>
            <CardDescription>{t("equipe.invitations.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {invitations.isPending ? (
              <Skeleton className="h-14" />
            ) : invitations.isError ? (
              <EtatErreur erreur={invitations.error} onReessayer={() => void invitations.refetch()} />
            ) : invitations.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("equipe.invitations.vide")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {invitations.data.map((invitation) => (
                  <LigneInvitation key={invitation.id} invitation={invitation} onResultat={setResultat} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

type Membre = {
  user_id: string;
  role: Enums<"role_membre">;
  profil: { nom: string | null; email: string | null } | null;
};

function LigneMembre({ membre }: { membre: Membre }) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const [retrait, setRetrait] = useState(false);
  const estMoi = membre.user_id === org.profil.id;
  const peutGerer = org.estAdmin && org.peutEcrire;
  const nom = membre.profil?.nom || membre.profil?.email || t("equipe.membres.sans_nom");

  const changerRole = useMutation({
    mutationFn: async (role: Enums<"role_membre">) => {
      const { error } = await getSupabase().from("memberships").update({ role }).eq("user_id", membre.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("equipe.membres.role_modifie", { nom }));
      void queryClient.invalidateQueries({ queryKey: ["membres", org.organisation.id] });
      if (estMoi) void queryClient.invalidateQueries({ queryKey: ["contexte-org"] });
    },
    onError: gererErreur,
  });

  const retirer = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabase().from("memberships").delete().eq("user_id", membre.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("equipe.membres.retire", { nom }));
      setRetrait(false);
      void queryClient.invalidateQueries({ queryKey: ["membres", org.organisation.id] });
    },
    onError: gererErreur,
  });

  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-subtle font-mono text-xs font-semibold text-navy">
          {initiales(membre.profil?.nom, membre.profil?.email)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {nom}
            {estMoi && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">{t("equipe.membres.vous")}</span>
            )}
          </p>
          <p className="truncate text-sm text-muted-foreground">{membre.profil?.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {peutGerer ? (
          <NativeSelect
            aria-label={t("equipe.membres.role_de", { nom })}
            value={membre.role}
            onChange={(e) => changerRole.mutate(e.target.value as Enums<"role_membre">)}
            disabled={changerRole.isPending}
            className="h-10 w-40"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <Badge variante={membre.role === "admin" ? "marque" : "neutre"}>{t(`roles.${membre.role}`)}</Badge>
        )}
        {peutGerer && !estMoi && (
          <Button
            variante="fantome"
            taille="icone"
            aria-label={t("equipe.membres.retirer_de", { nom })}
            onClick={() => setRetrait(true)}
          >
            <UserMinus aria-hidden />
          </Button>
        )}
      </div>
      <Dialog open={retrait} onOpenChange={setRetrait}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("equipe.membres.retrait_titre", { nom })}</DialogTitle>
            <DialogDescription>
              {t("equipe.membres.retrait_texte", { organisation: org.organisation.nom })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variante="contour" onClick={() => setRetrait(false)}>
              {t("commun.annuler")}
            </Button>
            <Button variante="danger" onClick={() => retirer.mutate()} chargement={retirer.isPending}>
              {t("equipe.membres.retirer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function LigneInvitation({
  invitation,
  onResultat,
}: {
  invitation: { id: string; email: string; role: Enums<"role_membre">; expires_at: string };
  onResultat: (resultat: ResultatInvitation) => void;
}) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const expiree = new Date(invitation.expires_at) <= new Date();
  // Renvoyer = recréer l'invitation (nouveau lien, ancien invalidé) et retenter l'e-mail.
  const renvoyer = useMutation({
    mutationFn: () => inviter({ email: invitation.email, role: invitation.role }),
    onSuccess: (r) => {
      onResultat(r);
      toast.success(t("equipe.invitations.renvoyee", { email: invitation.email }));
      void queryClient.invalidateQueries({ queryKey: ["invitations", org.organisation.id] });
    },
    onError: gererErreur,
  });
  const revoquer = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabase().from("invitations").delete().eq("id", invitation.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("equipe.invitations.revoquee", { email: invitation.email }));
      void queryClient.invalidateQueries({ queryKey: ["invitations", org.organisation.id] });
    },
    onError: gererErreur,
  });

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-semibold">{invitation.email}</p>
        <p className="text-sm text-muted-foreground">
          {t(`roles.${invitation.role}`)} ·{" "}
          {expiree ? (
            <span className="font-semibold text-status-alert-ink">{t("equipe.invitations.expiree")}</span>
          ) : (
            t("equipe.invitations.expire_le", { date: formaterDate(invitation.expires_at, "d MMMM") })
          )}
        </p>
      </div>
      {org.peutEcrire && (
        <div className="flex flex-wrap gap-2">
          <Button variante="contour" taille="sm" onClick={() => renvoyer.mutate()} chargement={renvoyer.isPending}>
            <Send aria-hidden />
            {t("equipe.invitations.renvoyer")}
          </Button>
          <Button variante="fantome" taille="sm" onClick={() => revoquer.mutate()} chargement={revoquer.isPending}>
            <X aria-hidden />
            {t("equipe.invitations.revoquer")}
          </Button>
        </div>
      )}
    </li>
  );
}

const schemaInvitation = z.object({
  email: z.email({ error: "auth.validation.email" }),
  role: z.enum(["admin", "editeur", "lecteur"]),
});
type ValeursInvitation = z.infer<typeof schemaInvitation>;
type StatutEmail = "envoye" | "non_configure" | "echec";
type ResultatInvitation = { email: string; lien: string; emailStatut: StatutEmail };

async function inviter(valeurs: ValeursInvitation): Promise<ResultatInvitation> {
  const { data, error } = await getSupabase().functions.invoke<{ lien: string; emailStatut: StatutEmail }>(
    "invite-member",
    {
      body: valeurs,
    },
  );
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const corps = (await error.context.json().catch(() => null)) as { erreur?: string } | null;
      throw new Error(corps?.erreur ?? "INCONNUE");
    }
    throw error;
  }
  return { email: valeurs.email, lien: data!.lien, emailStatut: data!.emailStatut };
}

function CarteInvitation({
  quotaAtteint,
  resultat,
  onResultat,
}: {
  quotaAtteint: boolean;
  resultat: ResultatInvitation | null;
  onResultat: (resultat: ResultatInvitation | null) => void;
}) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();

  // Un renvoi se déclenche plus bas dans la page : on ramène le résultat à l'écran.
  useEffect(() => {
    if (resultat)
      document.getElementById("resultat-invitation")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [resultat]);
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<ValeursInvitation>({
    resolver: zodResolver(schemaInvitation),
    defaultValues: { email: "", role: "editeur" },
  });
  const role = useWatch({ control, name: "role" });

  const invitation = useMutation({
    mutationFn: inviter,
    onSuccess: (r) => {
      onResultat(r);
      reset({ email: "", role: "editeur" });
      void queryClient.invalidateQueries({ queryKey: ["invitations", org.organisation.id] });
    },
    onError: gererErreur,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("equipe.inviter.titre")}</CardTitle>
        <CardDescription>{t("equipe.inviter.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-5">
        {quotaAtteint && <Bandeau variante="vigilance">{t("equipe.inviter.quota_atteint")}</Bandeau>}
        <form
          onSubmit={handleSubmit((v) => invitation.mutate(v))}
          noValidate
          className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-start"
        >
          <Champ
            id="invitation-email"
            libelle={t("auth.champs.email")}
            erreur={errors.email && t(errors.email.message!)}
          >
            {(a) => <Input {...a} type="email" inputMode="email" autoComplete="off" {...register("email")} />}
          </Champ>
          <Champ id="invitation-role" libelle={t("equipe.inviter.role")}>
            {(a) => (
              <NativeSelect {...a} {...register("role")}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Champ>
          <Button type="submit" className="md:mt-[1.6rem]" chargement={invitation.isPending}>
            <Send aria-hidden />
            {t("equipe.inviter.action")}
          </Button>
          <p className="text-sm text-muted-foreground md:col-span-3">{t(`roles.descriptions.${role}`)}</p>
        </form>
        {resultat && <ResultatLien resultat={resultat} onFermer={() => onResultat(null)} />}
      </CardContent>
    </Card>
  );
}

function ResultatLien({ resultat, onFermer }: { resultat: ResultatInvitation; onFermer: () => void }) {
  const { t } = useTranslation();
  const org = useOrg();
  const [copie, setCopie] = useState(false);
  const message = t("equipe.inviter.message_whatsapp", { organisation: org.organisation.nom, lien: resultat.lien });

  async function copier() {
    try {
      await navigator.clipboard.writeText(resultat.lien);
      setCopie(true);
      toast.success(t("equipe.inviter.lien_copie"));
    } catch {
      toast.error(t("equipe.inviter.copie_impossible"));
    }
  }

  return (
    <div id="resultat-invitation" className="grid gap-3 rounded-2xl bg-sand p-4" role="status">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-navy">{t("equipe.inviter.cree", { email: resultat.email })}</p>
        <Button
          variante="fantome"
          taille="icone"
          className="-mt-2 -mr-2 size-9"
          onClick={onFermer}
          aria-label={t("commun.fermer")}
        >
          <X aria-hidden />
        </Button>
      </div>
      <Bandeau variante={resultat.emailStatut === "envoye" ? "ok" : "vigilance"}>
        {resultat.emailStatut === "envoye" ? <Mail aria-hidden /> : <MailWarning aria-hidden />}
        <p>{t(`equipe.inviter.email_${resultat.emailStatut}`, { email: resultat.email })}</p>
      </Bandeau>
      <label htmlFor="lien-invitation" className="sr-only">
        {t("equipe.inviter.lien")}
      </label>
      <Input
        id="lien-invitation"
        readOnly
        value={resultat.lien}
        onFocus={(e) => e.currentTarget.select()}
        className="font-mono text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <Button variante="contour" taille="sm" onClick={copier}>
          {copie ? <Check aria-hidden /> : <Copy aria-hidden />}
          {t("equipe.inviter.copier")}
        </Button>
        <Button asChild variante="accent" taille="sm">
          <a href={lienPartageWhatsApp(message)} target="_blank" rel="noreferrer">
            <MessageCircle aria-hidden />
            {t("equipe.inviter.whatsapp")}
          </a>
        </Button>
      </div>
    </div>
  );
}
