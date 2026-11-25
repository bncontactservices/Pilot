import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
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

export const meta = () => [{ title: i18n.t("auth.oubli.meta") }];

const schema = z.object({ email: z.email({ error: "auth.validation.email" }) });
type Valeurs = z.infer<typeof schema>;

export default function MotDePasseOublie() {
  const { t } = useTranslation();
  const [envoyeA, setEnvoyeA] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Valeurs>({ resolver: zodResolver(schema) });

  const envoyer = handleSubmit(async ({ email }) => {
    setErreur(null);
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reinitialiser-mot-de-passe`,
      });
      if (error) throw error;
      setEnvoyeA(email);
    } catch (e) {
      setErreur(t(analyserErreur(e).cle));
    }
  });

  if (envoyeA) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <span className="grid size-14 place-items-center rounded-2xl bg-status-ok/12 text-status-ok-ink">
          <MailCheck className="size-7" aria-hidden />
        </span>
        <div className="grid gap-2">
          <h1 className="text-3xl font-extrabold text-navy">{t("auth.oubli.envoye_titre")}</h1>
          <p className="text-muted-foreground">{t("auth.oubli.envoye_texte", { email: envoyeA })}</p>
        </div>
        <Button asChild variante="contour" className="w-fit">
          <Link to="/connexion">{t("auth.inscription.vers_connexion")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-3xl font-extrabold text-navy">{t("auth.oubli.titre")}</h1>
        <p className="text-muted-foreground">{t("auth.oubli.sous_titre")}</p>
      </div>
      {erreur && (
        <Bandeau variante="alerte" role="alert">
          {erreur}
        </Bandeau>
      )}
      <form onSubmit={envoyer} noValidate className="grid grid-cols-1 gap-5">
        <Champ id="email" libelle={t("auth.champs.email")} erreur={errors.email && t(errors.email.message!)}>
          {(a) => <Input {...a} type="email" autoComplete="email" inputMode="email" {...register("email")} />}
        </Champ>
        <Button type="submit" taille="lg" chargement={isSubmitting}>
          {t("auth.oubli.action")}
        </Button>
      </form>
      <Link to="/connexion" className="lift w-fit text-sm font-semibold text-accent-ink hover:underline">
        {t("auth.oubli.retour")}
      </Link>
    </div>
  );
}
