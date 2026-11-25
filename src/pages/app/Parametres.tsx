import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImageUp, LogOut, Mail, MessageCircle, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { DEVISES } from "~/components/app/DialogueNouveauProjet";
import { EntetePage } from "~/components/app/EntetePage";
import { CarteAbonnement } from "~/components/app/abonnement/CarteAbonnement";
import { CarteSuiviEvaluation } from "~/components/app/CarteSuiviEvaluation";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Champ } from "~/components/ui/field";
import { Input, NativeSelect } from "~/components/ui/input";
import { useOrg } from "~/hooks/useContexteOrg";
import { useFileSaisies } from "~/hooks/useFileSaisies";
import i18n from "~/i18n";
import { lienEmailEquipe, lienWhatsAppEquipe } from "~/lib/contact";
import { formaterDate } from "~/lib/format";
import { getSupabase } from "~/lib/supabase";

export const meta = () => [{ title: i18n.t("parametres.meta") }];

const PAYS = ["SN", "CI", "ML", "BF", "NE", "GN", "TG", "BJ", "CM", "MR", "GM", "GW", "CV", "FR"] as const;

export default function Parametres() {
  const { t } = useTranslation();
  const { demanderDeconnexion } = useFileSaisies();
  const org = useOrg();
  return (
    <>
      <EntetePage titre={t("parametres.titre")} description={t("parametres.description")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <CarteOrganisation />
        <CarteSuiviEvaluation />
        <CarteLogo />
        <CartePlan />
        <CarteAbonnement />
        <CarteProfil />
        <Card>
          <CardHeader>
            <CardTitle>{t("parametres.compte.titre")}</CardTitle>
            <CardDescription>{t("parametres.compte.description", { email: org.profil.email })}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variante="contour" onClick={() => demanderDeconnexion()}>
              <LogOut aria-hidden />
              {t("auth.deconnexion")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

const schemaOrganisation = z.object({
  nom: z
    .string()
    .trim()
    .min(2, { error: "auth.validation.organisation" })
    .max(120, { error: "auth.validation.trop_long" }),
  pays: z.enum(PAYS),
  devise: z.enum(DEVISES),
});

function CarteOrganisation() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<z.infer<typeof schemaOrganisation>>({
    resolver: zodResolver(schemaOrganisation),
    defaultValues: {
      nom: org.organisation.nom,
      pays: (PAYS as readonly string[]).includes(org.organisation.pays)
        ? (org.organisation.pays as (typeof PAYS)[number])
        : "SN",
      devise: (DEVISES as readonly string[]).includes(org.organisation.devise_defaut)
        ? (org.organisation.devise_defaut as (typeof DEVISES)[number])
        : "XOF",
    },
  });

  const enregistrer = useMutation({
    mutationFn: async (v: z.infer<typeof schemaOrganisation>) => {
      const { error } = await getSupabase()
        .from("organisations")
        .update({ nom: v.nom, pays: v.pays, devise_defaut: v.devise })
        .eq("id", org.organisation.id);
      if (error) throw error;
      return v;
    },
    onSuccess: (v) => {
      toast.success(t("parametres.enregistre"));
      reset(v);
      void queryClient.invalidateQueries({ queryKey: ["contexte-org"] });
    },
    onError: gererErreur,
  });

  const lectureSeule = !org.estAdmin;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("parametres.organisation.titre")}</CardTitle>
        <CardDescription>
          {lectureSeule ? t("parametres.organisation.lecture_seule") : t("parametres.organisation.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate className="grid grid-cols-1 gap-4">
          <fieldset disabled={lectureSeule} className="grid grid-cols-1 gap-4">
            <Champ
              id="org-nom"
              libelle={t("parametres.organisation.nom")}
              erreur={errors.nom && t(errors.nom.message!)}
            >
              {(a) => <Input {...a} {...register("nom")} />}
            </Champ>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Champ id="org-pays" libelle={t("parametres.organisation.pays")}>
                {(a) => (
                  <NativeSelect {...a} {...register("pays")}>
                    {PAYS.map((p) => (
                      <option key={p} value={p}>
                        {t(`pays.${p}`)}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Champ>
              <Champ id="org-devise" libelle={t("parametres.organisation.devise")}>
                {(a) => (
                  <NativeSelect {...a} {...register("devise")}>
                    {DEVISES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Champ>
            </div>
          </fieldset>
          {!lectureSeule && (
            <Button type="submit" className="w-fit" disabled={!isDirty} chargement={enregistrer.isPending}>
              {t("commun.enregistrer")}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

const TYPES_LOGO: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const TAILLE_LOGO_MAX = 1024 * 1024; // miroir de la limite du bucket « logos »

/** Logo de l'organisation : stocké dans le bucket privé « logos » sous org_id/, affiché en tête des rapports PDF. */
function CarteLogo() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const champ = useRef<HTMLInputElement>(null);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const { id: orgId, logo_path: chemin, nom } = org.organisation;

  const apercu = useQuery({
    queryKey: ["logo", orgId, chemin],
    enabled: Boolean(chemin),
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await getSupabase().storage.from("logos").download(chemin!);
      if (error) throw error;
      return data;
    },
  });
  const url = useMemo(() => (apercu.data ? URL.createObjectURL(apercu.data) : null), [apercu.data]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);

  const changer = useMutation({
    mutationFn: async (fichier: File | null) => {
      const supabase = getSupabase();
      let nouveau: string | null = null;
      if (fichier) {
        // Un nouveau nom à chaque envoi : pas de cache périmé, et l'ancien fichier est supprimé ensuite.
        nouveau = `${orgId}/logo-${Date.now()}.${TYPES_LOGO[fichier.type]}`;
        const { error } = await supabase.storage.from("logos").upload(nouveau, fichier, { contentType: fichier.type });
        if (error) throw error;
      }
      const { error } = await supabase.from("organisations").update({ logo_path: nouveau }).eq("id", orgId);
      if (error) {
        if (nouveau) await supabase.storage.from("logos").remove([nouveau]);
        throw error;
      }
      if (chemin) await supabase.storage.from("logos").remove([chemin]);
      return nouveau;
    },
    onSuccess: (nouveau) => {
      toast.success(nouveau ? t("parametres.logo.enregistre") : t("parametres.logo.retire"));
      void queryClient.invalidateQueries({ queryKey: ["contexte-org"] });
    },
    onError: gererErreur,
  });

  const choisir = (fichier: File | undefined) => {
    if (!fichier) return;
    if (!(fichier.type in TYPES_LOGO)) return setErreurFichier(t("parametres.logo.erreur_type"));
    if (fichier.size > TAILLE_LOGO_MAX) return setErreurFichier(t("parametres.logo.erreur_taille"));
    setErreurFichier(null);
    changer.mutate(fichier);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("parametres.logo.titre")}</CardTitle>
        <CardDescription>
          {org.estAdmin ? t("parametres.logo.description") : t("parametres.logo.lecture_seule")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4">
        <div className="flex min-h-24 items-center justify-center rounded-2xl bg-sand p-4">
          {url ? (
            <img src={url} alt={t("parametres.logo.alt", { nom })} className="max-h-20 max-w-full object-contain" />
          ) : (
            <p className="text-center text-sm text-muted-foreground">{t("parametres.logo.aucun")}</p>
          )}
        </div>
        {org.estAdmin && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={champ}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={t("parametres.logo.choisir")}
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                choisir(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button variante="contour" onClick={() => champ.current?.click()} chargement={changer.isPending}>
              <ImageUp aria-hidden />
              {chemin ? t("parametres.logo.remplacer") : t("parametres.logo.choisir")}
            </Button>
            {chemin && (
              <Button variante="contour" onClick={() => changer.mutate(null)} disabled={changer.isPending}>
                <Trash2 aria-hidden />
                {t("parametres.logo.retirer")}
              </Button>
            )}
          </div>
        )}
        {erreurFichier && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {erreurFichier}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CartePlan() {
  const { t } = useTranslation();
  const org = useOrg();
  const { plan, plan_souhaite, essai_fin } = org.organisation;
  const message = t("limite.message_whatsapp", { organisation: org.organisation.nom, plan: t(`plans.${plan}`) });
  const whatsapp = lienWhatsAppEquipe(message);
  const email = lienEmailEquipe(t("limite.sujet_email", { organisation: org.organisation.nom }));
  const limite = (valeur: number | null) => (valeur === null ? t("parametres.plan.illimite") : String(valeur));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{t("parametres.plan.titre")}</CardTitle>
          <Badge variante="marque">{t(`plans.${plan}`)}</Badge>
          {org.enEssai && !org.peutEcrire && <Badge variante="alerte">{t("essai.termine_court")}</Badge>}
        </div>
        <CardDescription>
          {org.enEssai
            ? org.peutEcrire
              ? t("parametres.plan.essai_jusquau", { date: formaterDate(essai_fin, "d MMMM yyyy") })
              : t("parametres.plan.essai_termine", { date: formaterDate(essai_fin, "d MMMM yyyy") })
            : t("parametres.plan.actif")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-5">
        <dl className="grid grid-cols-3 gap-3">
          {(
            [
              ["projects", "parametres.plan.projets"],
              ["kpis", "parametres.plan.kpis"],
              ["users", "parametres.plan.utilisateurs"],
            ] as const
          ).map(([cle, libelle]) => (
            <div key={cle} className="rounded-2xl bg-sand px-3 py-3">
              <dt className="text-xs text-muted-foreground">{t(libelle)}</dt>
              <dd className="mt-1 font-mono text-xl font-semibold text-navy tabular">{limite(org.limites[cle])}</dd>
            </div>
          ))}
        </dl>
        {plan_souhaite && (
          <p className="text-sm text-muted-foreground">
            {t("parametres.plan.souhaite", { plan: t(`plans.${plan_souhaite}`) })}
          </p>
        )}
        <p className="text-sm text-muted-foreground">{t("limite.facturation")}</p>
        <div className="flex flex-wrap gap-2">
          {whatsapp && (
            <Button asChild variante="accent" taille="sm">
              <a href={whatsapp} target="_blank" rel="noreferrer">
                <MessageCircle aria-hidden />
                {t("limite.whatsapp")}
              </a>
            </Button>
          )}
          {email && (
            <Button asChild variante="contour" taille="sm">
              <a href={email}>
                <Mail aria-hidden />
                {t("limite.email")}
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const schemaProfil = z.object({
  nom: z.string().trim().min(2, { error: "auth.validation.nom" }).max(120, { error: "auth.validation.trop_long" }),
  telephone: z
    .string()
    .trim()
    .max(30, { error: "auth.validation.trop_long" })
    .refine((v) => v === "" || /^\+?[\d\s.-]{6,}$/.test(v), { error: "parametres.profil.telephone_invalide" }),
});

function CarteProfil() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<z.infer<typeof schemaProfil>>({
    resolver: zodResolver(schemaProfil),
    defaultValues: { nom: org.profil.nom ?? "", telephone: org.profil.telephone ?? "" },
  });

  const enregistrer = useMutation({
    mutationFn: async (v: z.infer<typeof schemaProfil>) => {
      const { error } = await getSupabase()
        .from("profiles")
        .update({ nom: v.nom, telephone: v.telephone || null })
        .eq("id", org.profil.id);
      if (error) throw error;
      return v;
    },
    onSuccess: (v) => {
      toast.success(t("parametres.enregistre"));
      reset(v);
      void queryClient.invalidateQueries({ queryKey: ["contexte-org"] });
    },
    onError: gererErreur,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("parametres.profil.titre")}</CardTitle>
        <CardDescription>{t("parametres.profil.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate className="grid grid-cols-1 gap-4">
          <Champ id="profil-nom" libelle={t("auth.champs.nom")} erreur={errors.nom && t(errors.nom.message!)}>
            {(a) => <Input {...a} autoComplete="name" {...register("nom")} />}
          </Champ>
          <Champ
            id="profil-telephone"
            libelle={t("parametres.profil.telephone")}
            optionnel
            aide={t("parametres.profil.telephone_aide")}
            erreur={errors.telephone && t(errors.telephone.message!)}
          >
            {(a) => (
              <Input
                {...a}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+221 77 000 00 00"
                {...register("telephone")}
              />
            )}
          </Champ>
          <Button type="submit" className="w-fit" disabled={!isDirty} chargement={enregistrer.isPending}>
            {t("commun.enregistrer")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
