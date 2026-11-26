import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { MailCheck, Users } from "lucide-react";
import { useState } from "react";
import { type Resolver, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { z } from "zod";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import { Champ } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import i18n from "~/i18n";
import { DUREE_ESSAI_JOURS } from "~/lib/constants";
import { supabaseConfigure } from "~/lib/env";
import { VERSION_CONDITIONS } from "~/lib/legal";
import { evenement } from "~/lib/analytics";
import { analyserErreur } from "~/lib/errors";
import { getSupabase } from "~/lib/supabase";

export const meta = () => [{ title: i18n.t("auth.inscription.meta") }];

const motDePasse = z
  .string()
  .min(10, { error: "auth.validation.mot_de_passe_longueur" })
  .regex(/[A-Za-zÀ-ÿ]/, { error: "auth.validation.mot_de_passe_lettre" })
  .regex(/\d/, { error: "auth.validation.mot_de_passe_chiffre" });

const schema = z.object({
  nom: z.string().trim().min(2, { error: "auth.validation.nom" }).max(120, { error: "auth.validation.trop_long" }),
  organisation: z.string().trim().max(120, { error: "auth.validation.trop_long" }).optional(),
  email: z.email({ error: "auth.validation.email" }),
  motDePasse,
  // Acceptation expresse des conditions d'utilisation et de la politique de confidentialité (case à cocher, jamais précochée).
  acceptation: z.literal(true, { error: "auth.validation.acceptation" }),
});

/** Le nom d'organisation n'est exigé que hors invitation. */
function schemaSelon(exigerOrganisation: boolean) {
  return schema.superRefine((valeurs, ctx) => {
    if (exigerOrganisation && (valeurs.organisation ?? "").trim().length < 2) {
      ctx.addIssue({ code: "custom", path: ["organisation"], message: "auth.validation.organisation" });
    }
  });
}
type Valeurs = z.infer<typeof schema>;
type ContexteFormulaire = { exigerOrganisation: boolean };

// Le contexte de react-hook-form suit le rendu : le schéma s'adapte quand l'invitation est validée.
const resolveur: Resolver<Valeurs, ContexteFormulaire> = (valeurs, contexte, options) =>
  zodResolver(schemaSelon(contexte?.exigerOrganisation ?? true))(valeurs, contexte, options);

export default function Inscription() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const jeton = params.get("invitation");
  const planParam = params.get("plan");
  const plan = planParam === "starter" || planParam === "pro" ? planParam : undefined;
  const [envoyeA, setEnvoyeA] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const invitation = useQuery({
    queryKey: ["invitation-apercu", jeton],
    enabled: Boolean(jeton) && supabaseConfigure,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc("invitation_apercu", { p_jeton: jeton! });
      if (error) throw error;
      return data[0] ?? null;
    },
  });
  const invitationValide = Boolean(jeton && invitation.data);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Valeurs, ContexteFormulaire>({
    resolver: resolveur,
    context: { exigerOrganisation: !invitationValide },
  });

  const envoyer = handleSubmit(async (valeurs) => {
    setErreur(null);
    try {
      const { data, error } = await getSupabase().auth.signUp({
        email: valeurs.email,
        password: valeurs.motDePasse,
        options: {
          emailRedirectTo: `${window.location.origin}/app`,
          data: {
            nom: valeurs.nom,
            organisation: invitationValide ? undefined : valeurs.organisation,
            plan,
            invitation: invitationValide ? jeton : undefined,
            // Version du texte acceptée : la base l'enregistre dans le profil avec sa propre horloge
            // (migration acceptation_conditions) ; une date envoyée par le navigateur serait sans valeur.
            conditions_version: VERSION_CONDITIONS,
          },
        },
      });
      if (error) throw error;
      evenement("Signup", { plan: plan ?? "aucun" });
      // Sans session : confirmation d'e-mail requise. Avec session : AuthLayout redirige.
      if (!data.session) setEnvoyeA(valeurs.email);
    } catch (e) {
      setErreur(t(analyserErreur(e).cle));
    }
  });

  if (envoyeA) return <VerifierBoiteMail email={envoyeA} />;

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        {jeton && invitation.isPending && supabaseConfigure ? (
          <Skeleton className="h-9 w-3/4" />
        ) : invitationValide ? (
          <>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-subtle px-3 py-1 text-xs font-semibold text-navy">
              <Users className="size-3.5" aria-hidden />
              {t("auth.inscription.invitation_badge")}
            </span>
            <h1 className="text-3xl font-extrabold text-navy">
              {t("auth.inscription.rejoindre", { organisation: invitation.data!.organisation })}
            </h1>
            <p className="text-muted-foreground">
              {t("auth.inscription.invitation_email", { email: invitation.data!.email_masque })}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-extrabold text-navy">{t("auth.inscription.titre")}</h1>
            <p className="text-muted-foreground">{t("auth.inscription.sous_titre", { jours: DUREE_ESSAI_JOURS })}</p>
          </>
        )}
      </div>

      {jeton && !invitation.isPending && !invitationValide && (
        <Bandeau variante="vigilance">{t("auth.inscription.invitation_invalide")}</Bandeau>
      )}
      {erreur && (
        <Bandeau variante="alerte" role="alert">
          {erreur}
        </Bandeau>
      )}

      <form onSubmit={envoyer} noValidate className="grid grid-cols-1 gap-5">
        <Champ id="nom" libelle={t("auth.champs.nom")} erreur={errors.nom && t(errors.nom.message!)}>
          {(a) => <Input {...a} autoComplete="name" {...register("nom")} />}
        </Champ>
        {!invitationValide && (
          <Champ
            id="organisation"
            libelle={t("auth.champs.organisation")}
            aide={t("auth.champs.organisation_aide")}
            erreur={errors.organisation?.message && t(errors.organisation.message)}
          >
            {(a) => <Input {...a} autoComplete="organization" {...register("organisation")} />}
          </Champ>
        )}
        <Champ id="email" libelle={t("auth.champs.email")} erreur={errors.email && t(errors.email.message!)}>
          {(a) => <Input {...a} type="email" autoComplete="email" inputMode="email" {...register("email")} />}
        </Champ>
        <Champ
          id="mot-de-passe"
          libelle={t("auth.champs.mot_de_passe")}
          aide={t("auth.champs.mot_de_passe_aide")}
          erreur={errors.motDePasse && t(errors.motDePasse.message!)}
        >
          {(a) => <Input {...a} type="password" autoComplete="new-password" {...register("motDePasse")} />}
        </Champ>
        <div className="grid gap-1.5">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-[var(--navy)]"
              aria-invalid={errors.acceptation ? true : undefined}
              aria-describedby={errors.acceptation ? "acceptation-erreur" : undefined}
              {...register("acceptation")}
            />
            <span>
              {t("auth.inscription.acceptation_debut")}{" "}
              <Link
                to="/conditions-utilisation"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-accent-ink underline-offset-2 hover:underline"
              >
                {t("auth.inscription.acceptation_conditions")}
              </Link>{" "}
              {t("auth.inscription.acceptation_et")}{" "}
              <Link
                to="/confidentialite"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-accent-ink underline-offset-2 hover:underline"
              >
                {t("auth.inscription.acceptation_confidentialite")}
              </Link>
              <span className="sr-only"> {t("auth.inscription.acceptation_onglet")}</span>.
            </span>
          </label>
          {errors.acceptation && (
            <p id="acceptation-erreur" role="alert" className="text-sm font-medium text-destructive">
              {t(errors.acceptation.message!)}
            </p>
          )}
        </div>
        <Button type="submit" taille="lg" chargement={isSubmitting}>
          {invitationValide ? t("auth.inscription.action_invitation") : t("auth.inscription.action")}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {t("auth.inscription.deja_compte")}{" "}
        <Link to="/connexion" className="font-semibold text-accent-ink hover:underline">
          {t("auth.inscription.vers_connexion")}
        </Link>
      </p>
    </div>
  );
}

function VerifierBoiteMail({ email }: { email: string }) {
  const { t } = useTranslation();
  const [etat, setEtat] = useState<"attente" | "envoi" | "envoye" | "erreur">("attente");

  async function renvoyer() {
    setEtat("envoi");
    try {
      const { error } = await getSupabase().auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/app` },
      });
      if (error) throw error;
      setEtat("envoye");
    } catch {
      setEtat("erreur");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <span className="grid size-14 place-items-center rounded-2xl bg-status-ok/12 text-status-ok-ink">
        <MailCheck className="size-7" aria-hidden />
      </span>
      <div className="grid gap-2">
        <h1 className="text-3xl font-extrabold text-navy">{t("auth.verifier.titre")}</h1>
        <p className="text-muted-foreground">{t("auth.verifier.texte", { email })}</p>
      </div>
      <Bandeau>{t("auth.verifier.astuce")}</Bandeau>
      <div className="flex flex-wrap gap-3">
        <Button variante="contour" onClick={renvoyer} chargement={etat === "envoi"} disabled={etat === "envoye"}>
          {etat === "envoye" ? t("auth.confirmation_renvoyee") : t("auth.renvoyer_confirmation")}
        </Button>
        <Button asChild variante="fantome">
          <Link to="/connexion">{t("auth.inscription.vers_connexion")}</Link>
        </Button>
      </div>
      {etat === "erreur" && (
        <p role="alert" className="text-sm text-destructive">
          {t("erreurs.auth.trop_de_tentatives")}
        </p>
      )}
    </div>
  );
}
