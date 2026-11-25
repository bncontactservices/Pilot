import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { Badge } from "~/components/ui/badge";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { useOrg } from "~/hooks/useContexteOrg";
import { LIMITES_PLAN } from "~/lib/constants";
import { formaterDate } from "~/lib/format";
import {
  abonnementEnCours,
  clesPaiement,
  formaterPrix,
  montantMensuelDepuisAnnuel,
  ouvrirPortail,
  type Periodicite,
  type PlanPayant,
  type PlanProposable,
  souscrire,
  useAbonnement,
  useEtatPaiement,
} from "~/lib/paiement";

/** Pendant l'activation qui suit un paiement, on interroge la base toutes les 2,5 s, au plus 40 s. */
const INTERVALLE_ACTIVATION_MS = 2500;
const DELAI_ACTIVATION_MS = 40_000;

/**
 * Abonnement en ligne (Stripe). Réservé aux administrateurs et absent tant que le serveur ne confirme pas que le paiement
 * en ligne est configuré : aucun bouton qui ne marcherait pas. La facturation manuelle reste décrite dans la carte « Plan ».
 */
export function CarteAbonnement() {
  const org = useOrg();
  if (!org.estAdmin) return null;
  return <Contenu />;
}

function Contenu() {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const [params] = useSearchParams();
  const etat = useEtatPaiement(true);
  const abonnement = useAbonnement(org.organisation.id, true);
  const [periodicite, setPeriodicite] = useState<Periodicite>("mensuelle");
  const retour = params.get("paiement");
  const [activationLente, setActivationLente] = useState(false);

  // Retour de la page de paiement : le plan change quand Stripe a prévenu l'application (quelques secondes).
  const enAttente = retour === "succes" && org.enEssai;
  useEffect(() => {
    if (!enAttente) return;
    const debut = Date.now();
    const minuteur = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["contexte-org"] });
      void queryClient.invalidateQueries({ queryKey: clesPaiement.abonnement(org.organisation.id) });
      if (Date.now() - debut > DELAI_ACTIVATION_MS) setActivationLente(true);
    }, INTERVALLE_ACTIVATION_MS);
    return () => clearInterval(minuteur);
  }, [enAttente, queryClient, org.organisation.id]);
  useEffect(() => {
    if (retour === "succes" && !org.enEssai) toast.success(t("abonnement.active"));
  }, [retour, org.enEssai, t]);

  const redirection = useMutation({
    mutationFn: ({ url }: { url: string }) => {
      window.location.assign(url);
      return Promise.resolve();
    },
  });
  const demarrer = useMutation({
    mutationFn: ({ plan, periode }: { plan: PlanPayant; periode: Periodicite }) => souscrire(plan, periode),
    onSuccess: ({ url }) => redirection.mutate({ url }),
    onError: gererErreur,
  });
  const portail = useMutation({
    mutationFn: ouvrirPortail,
    onSuccess: ({ url }) => redirection.mutate({ url }),
    onError: gererErreur,
  });

  const disponible = etat.data?.disponible === true ? etat.data : null;
  const periodes = useMemo(
    () => (["mensuelle", "annuelle"] as const).filter((p) => disponible?.plans.some((o) => o.periodicite === p)),
    [disponible],
  );
  const periodeChoisie = periodes.includes(periodicite) ? periodicite : (periodes[0] ?? periodicite);

  if (etat.isPending || abonnement.isPending) return null;
  const a = abonnement.data ?? null;
  // Rien à montrer : pas de paiement en ligne configuré et jamais d'abonnement.
  if (!disponible && !a && !retour) return null;

  const enCours = abonnementEnCours(a);
  const propositions = disponible?.plans.filter((p) => p.periodicite === periodeChoisie) ?? [];
  const occupe = demarrer.isPending || portail.isPending || redirection.isPending;

  return (
    <Card id="abonnement">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="inline-flex items-center gap-2">
            <CreditCard className="size-5" aria-hidden />
            {t("abonnement.titre")}
          </CardTitle>
          {disponible?.mode === "test" && <Badge variante="vigilance">Test</Badge>}
        </div>
        <CardDescription>{t("abonnement.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4">
        {disponible?.mode === "test" && <Bandeau variante="vigilance">{t("abonnement.mode_test")}</Bandeau>}
        {retour === "annule" && <Bandeau>{t("abonnement.retour_annule")}</Bandeau>}
        {enAttente && (
          <Bandeau role="status">{activationLente ? t("abonnement.lent") : t("abonnement.retour_succes")}</Bandeau>
        )}

        {a && (a.plan || a.statut !== "incomplete") && (
          <div className="grid gap-2 rounded-2xl bg-sand px-4 py-3">
            {a.plan && a.periodicite && (
              <p className="font-semibold text-navy">
                {t("abonnement.titre_actuel", {
                  plan: t(`plans.${a.plan}`),
                  periodicite: t(`abonnement.periodicites.${a.periodicite}`).toLowerCase(),
                })}
              </p>
            )}
            <p className="text-sm">{t("abonnement.statut", { statut: t(`abonnement.statuts.${a.statut}`) })}</p>
            {a.statut === "past_due" && <Bandeau variante="alerte">{t("abonnement.retard")}</Bandeau>}
            {enCours && a.periode_fin && (
              <p className="text-sm text-muted-foreground">
                {t(a.annule_en_fin_de_periode ? "abonnement.fin" : "abonnement.renouvellement", {
                  date: formaterDate(a.periode_fin, "d MMMM yyyy"),
                })}
              </p>
            )}
            {a.statut === "canceled" && <p className="text-sm text-muted-foreground">{t("abonnement.termine")}</p>}
          </div>
        )}

        {a && disponible && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">{t("abonnement.gerer_aide")}</p>
            <Button
              variante="contour"
              className="w-fit"
              onClick={() => portail.mutate()}
              chargement={portail.isPending}
              disabled={occupe}
            >
              <ExternalLink aria-hidden />
              {t("abonnement.gerer")}
            </Button>
          </div>
        )}

        {disponible && !enCours && propositions.length > 0 && (
          <div className="grid gap-3">
            {periodes.length > 1 && (
              <fieldset className="flex flex-wrap items-center gap-2">
                <legend className="mb-1 text-sm font-semibold text-foreground">{t("abonnement.duree")}</legend>
                {periodes.map((p) => (
                  <label
                    key={p}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium has-[:checked]:border-navy has-[:checked]:bg-navy has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                  >
                    <input
                      type="radio"
                      name="periodicite"
                      className="sr-only"
                      value={p}
                      checked={periodeChoisie === p}
                      onChange={() => setPeriodicite(p)}
                    />
                    {t(`abonnement.periodicites.${p}`)}
                  </label>
                ))}
              </fieldset>
            )}
            <ul className="grid gap-3 sm:grid-cols-2">
              {propositions.map((p) => (
                <li key={p.plan} className="grid content-between gap-3 rounded-2xl border border-border bg-card p-4">
                  <div className="grid gap-1">
                    <h3 className="text-lg font-bold text-navy">{t(`plans.${p.plan}`)}</h3>
                    <Prix proposition={p} />
                    <Limites plan={p.plan} />
                  </div>
                  <Button
                    onClick={() => demarrer.mutate({ plan: p.plan, periode: p.periodicite })}
                    chargement={demarrer.isPending && demarrer.variables?.plan === p.plan}
                    disabled={occupe}
                  >
                    {redirection.isPending
                      ? t("abonnement.redirection")
                      : t("abonnement.souscrire", { plan: t(`plans.${p.plan}`) })}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Prix({ proposition: p }: { proposition: PlanProposable }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="font-mono text-xl font-semibold text-navy tabular">
        {t(p.periodicite === "mensuelle" ? "abonnement.par_mois" : "abonnement.par_an", {
          prix: formaterPrix(p.montant, p.devise),
        })}
      </p>
      {p.periodicite === "annuelle" && (
        <p className="text-sm text-muted-foreground">
          {t("abonnement.equivalent", { prix: formaterPrix(montantMensuelDepuisAnnuel(p.montant), p.devise) })}
        </p>
      )}
    </>
  );
}

function Limites({ plan }: { plan: PlanPayant }) {
  const { t } = useTranslation();
  const l = LIMITES_PLAN[plan];
  return (
    <p className="text-sm text-muted-foreground">
      {[
        t("abonnement.projets", { count: l.projects ?? 0 }),
        t("abonnement.indicateurs", { count: l.kpis ?? 0 }),
        t("abonnement.utilisateurs", { count: l.users ?? 0 }),
      ].join(", ")}
    </p>
  );
}
