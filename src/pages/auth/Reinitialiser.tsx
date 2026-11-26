import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { AuthShell } from "~/components/app/AuthShell";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import { Champ } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import i18n from "~/i18n";
import { useAuth } from "~/lib/auth";
import { analyserErreur } from "~/lib/errors";
import { getSupabase } from "~/lib/supabase";
import { FormulaireEnChargement } from "./AuthLayout";

export const meta = () => [{ title: i18n.t("auth.reinitialiser.meta") }];

const schema = z
  .object({
    motDePasse: z
      .string()
      .min(10, { error: "auth.validation.mot_de_passe_longueur" })
      .regex(/[A-Za-zÀ-ÿ]/, { error: "auth.validation.mot_de_passe_lettre" })
      .regex(/\d/, { error: "auth.validation.mot_de_passe_chiffre" }),
    confirmation: z.string(),
  })
  .refine((v) => v.motDePasse === v.confirmation, {
    path: ["confirmation"],
    error: "auth.validation.confirmation",
  });
type Valeurs = z.infer<typeof schema>;

/** Hors de AuthLayout : le lien de récupération ouvre une session qu'il ne faut pas rediriger. */
export default function Reinitialiser() {
  const { t } = useTranslation();
  const { statut } = useAuth();
  return (
    <AuthShell>
      {statut === "chargement" ? (
        <FormulaireEnChargement />
      ) : statut === "connecte" ? (
        <FormulaireNouveauMotDePasse />
      ) : (
        <div className="grid grid-cols-1 gap-6">
          <h1 className="text-3xl font-extrabold text-navy">{t("auth.reinitialiser.lien_invalide_titre")}</h1>
          <p className="text-muted-foreground">{t("auth.reinitialiser.lien_invalide_texte")}</p>
          <Button asChild className="w-fit">
            <Link to="/mot-de-passe-oublie">{t("auth.reinitialiser.nouveau_lien")}</Link>
          </Button>
        </div>
      )}
    </AuthShell>
  );
}

function FormulaireNouveauMotDePasse() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [erreur, setErreur] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Valeurs>({ resolver: zodResolver(schema) });

  const envoyer = handleSubmit(async ({ motDePasse }) => {
    setErreur(null);
    try {
      const { error } = await getSupabase().auth.updateUser({ password: motDePasse });
      if (error) throw error;
      toast.success(t("auth.reinitialiser.succes"));
      navigate("/app", { replace: true });
    } catch (e) {
      setErreur(t(analyserErreur(e).cle));
    }
  });

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-3xl font-extrabold text-navy">{t("auth.reinitialiser.titre")}</h1>
        <p className="text-muted-foreground">{t("auth.reinitialiser.sous_titre")}</p>
      </div>
      {erreur && (
        <Bandeau variante="alerte" role="alert">
          {erreur}
        </Bandeau>
      )}
      <form onSubmit={envoyer} noValidate className="grid grid-cols-1 gap-5">
        <Champ
          id="nouveau-mot-de-passe"
          libelle={t("auth.champs.nouveau_mot_de_passe")}
          aide={t("auth.champs.mot_de_passe_aide")}
          erreur={errors.motDePasse && t(errors.motDePasse.message!)}
        >
          {(a) => <Input {...a} type="password" autoComplete="new-password" {...register("motDePasse")} />}
        </Champ>
        <Champ
          id="confirmation"
          libelle={t("auth.champs.confirmation")}
          erreur={errors.confirmation && t(errors.confirmation.message!)}
        >
          {(a) => <Input {...a} type="password" autoComplete="new-password" {...register("confirmation")} />}
        </Champ>
        <Button type="submit" taille="lg" chargement={isSubmitting}>
          {t("auth.reinitialiser.action")}
        </Button>
      </form>
    </div>
  );
}
