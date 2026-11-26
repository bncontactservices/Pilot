import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Champ } from "~/components/ui/field";
import { NativeSelect } from "~/components/ui/input";
import { useOrg } from "~/hooks/useContexteOrg";
import { formaterDate } from "~/lib/format";
import {
  clesRapports,
  definirAbonnement,
  envoyerExemple,
  type FrequenceRapport,
  useAbonnementRapport,
  useEtatRapports,
} from "~/lib/rapports-email";

type Choix = "aucun" | FrequenceRapport;

/** Après un exemple, le bouton se repose une minute : le serveur n'envoie de toute façon qu'un message par tranche de cinq minutes. */
const REPOS_EXEMPLE_MS = 60_000;

/**
 * Rapport de suivi par e-mail, au choix de chaque membre. Absente tant que le serveur ne confirme pas que l'envoi est
 * configuré (Resend) : aucun réglage qui ne produirait rien.
 */
export function CarteRapportEmail() {
  const etat = useEtatRapports(true);
  if (!etat.data) return null;
  return <Contenu />;
}

function Contenu() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const userId = org.profil.id;
  const abonnement = useAbonnementRapport(userId, true);
  const enregistre: Choix = abonnement.data?.frequence ?? "aucun";
  const [choix, setChoix] = useState<Choix | null>(null);
  const valeur = choix ?? enregistre;
  const [repos, setRepos] = useState(false);
  useEffect(() => {
    if (!repos) return;
    const minuterie = setTimeout(() => setRepos(false), REPOS_EXEMPLE_MS);
    return () => clearTimeout(minuterie);
  }, [repos]);

  const sauver = useMutation({
    mutationFn: () => definirAbonnement(userId, abonnement.data != null, valeur === "aucun" ? null : valeur),
    onSuccess: () => {
      toast.success(valeur === "aucun" ? t("rapports_email.desabonne") : t("rapports_email.enregistre"));
      setChoix(null);
      void queryClient.invalidateQueries({ queryKey: clesRapports.abonnement(userId) });
    },
    onError: gererErreur,
  });

  const exemple = useMutation({
    mutationFn: envoyerExemple,
    onSuccess: () => {
      toast.success(t("rapports_email.exemple_envoye", { email: org.profil.email }));
      setRepos(true);
    },
    onError: gererErreur,
  });

  return (
    <Card id="rapports">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-5" aria-hidden />
          {t("rapports_email.titre")}
        </CardTitle>
        <CardDescription>{t("rapports_email.description", { email: org.profil.email })}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4">
        <form
          noValidate
          className="grid grid-cols-1 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            sauver.mutate();
          }}
        >
          <Champ id="rapport-frequence" libelle={t("rapports_email.frequence")}>
            {(a) => (
              <NativeSelect {...a} value={valeur} onChange={(e) => setChoix(e.target.value as Choix)}>
                {(["aucun", "hebdomadaire", "mensuelle"] as const).map((c) => (
                  <option key={c} value={c}>
                    {t(`rapports_email.choix.${c}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Champ>
          {abonnement.data && (
            <p className="text-sm text-muted-foreground">
              {t("rapports_email.prochain", {
                date: formaterDate(abonnement.data.prochain_envoi_le, "EEEE d MMMM yyyy"),
              })}
              {abonnement.data.dernier_envoi_le && (
                <>
                  {" "}
                  {t("rapports_email.dernier", { date: formaterDate(abonnement.data.dernier_envoi_le, "d MMMM yyyy") })}
                </>
              )}
            </p>
          )}
          {!org.peutEcrire && <Bandeau>{t("rapports_email.lecture_seule")}</Bandeau>}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" chargement={sauver.isPending} disabled={valeur === enregistre}>
              {t("rapports_email.enregistrer")}
            </Button>
            <Button
              type="button"
              variante="contour"
              onClick={() => exemple.mutate()}
              chargement={exemple.isPending}
              disabled={repos}
            >
              <Send aria-hidden />
              {t("rapports_email.exemple")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("rapports_email.exemple_aide")}</p>
        </form>
      </CardContent>
    </Card>
  );
}
