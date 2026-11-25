import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { z } from "zod";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import { Champ } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import i18n from "~/i18n";
import { analyserErreur } from "~/lib/errors";
import { getSupabase } from "~/lib/supabase";

export const meta = () => [{ title: i18n.t("auth.connexion.meta") }];

const schema = z.object({
  email: z.email({ error: "auth.validation.email" }),
  motDePasse: z.string().min(1, { error: "auth.validation.mot_de_passe_requis" }),
});
type Valeurs = z.infer<typeof schema>;

export default function Connexion() {
  const { t } = useTranslation();
  const [erreur, setErreur] = useState<string | null>(null);
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  const [renvoi, setRenvoi] = useState<"attente" | "envoi" | "envoye">("attente");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Valeurs>({ resolver: zodResolver(schema) });

  const envoyer = handleSubmit(async ({ email, motDePasse }) => {
    setErreur(null);
    setAConfirmer(null);
    try {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password: motDePasse });
      if (error) throw error;
      // La redirection est faite par AuthLayout dès que la session existe.
    } catch (e) {
      const analyse = analyserErreur(e);
      if (analyse.cle === "erreurs.auth.non_confirme") setAConfirmer(email);
      setErreur(t(analyse.cle));
    }
  });

  async function renvoyerConfirmation() {
    if (!aConfirmer) return;
    setRenvoi("envoi");
    try {
      const { error } = await getSupabase().auth.resend({
        type: "signup",
        email: aConfirmer,
        options: { emailRedirectTo: `${window.location.origin}/app` },
      });
      if (error) throw error;
      setRenvoi("envoye");
    } catch (e) {
      setRenvoi("attente");
      setErreur(t(analyserErreur(e).cle));
    }
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-3xl font-extrabold text-navy">{t("auth.connexion.titre")}</h1>
        <p className="text-muted-foreground">{t("auth.connexion.sous_titre")}</p>
      </div>

      {erreur && (
        <Bandeau variante="alerte" role="alert">
          <div className="grid gap-2">
            <span>{erreur}</span>
            {aConfirmer && (
              <Button
                variante="lien"
                taille="sm"
                className="h-auto justify-start"
                onClick={renvoyerConfirmation}
                chargement={renvoi === "envoi"}
                disabled={renvoi === "envoye"}
              >
                {renvoi === "envoye" ? t("auth.confirmation_renvoyee") : t("auth.renvoyer_confirmation")}
              </Button>
            )}
          </div>
        </Bandeau>
      )}

      <form onSubmit={envoyer} noValidate className="grid grid-cols-1 gap-5">
        <Champ id="email" libelle={t("auth.champs.email")} erreur={errors.email && t(errors.email.message!)}>
          {(a) => <Input {...a} type="email" autoComplete="email" inputMode="email" {...register("email")} />}
        </Champ>
        <Champ
          id="mot-de-passe"
          libelle={t("auth.champs.mot_de_passe")}
          erreur={errors.motDePasse && t(errors.motDePasse.message!)}
        >
          {(a) => <Input {...a} type="password" autoComplete="current-password" {...register("motDePasse")} />}
        </Champ>
        <div className="-mt-2 flex justify-end">
          <Link to="/mot-de-passe-oublie" className="lift text-sm font-semibold text-accent-ink hover:underline">
            {t("auth.connexion.oubli")}
          </Link>
        </div>
        <Button type="submit" taille="lg" chargement={isSubmitting}>
          {t("auth.connexion.action")}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {t("auth.connexion.pas_de_compte")}{" "}
        <Link to="/inscription" className="font-semibold text-accent-ink hover:underline">
          {t("auth.connexion.vers_inscription")}
        </Link>
      </p>
    </div>
  );
}
