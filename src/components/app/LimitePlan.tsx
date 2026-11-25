import { Mail, MessageCircle } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { useOrg } from "~/hooks/useContexteOrg";
import { LIMITES_PLAN } from "~/lib/constants";
import { lienEmailEquipe, lienWhatsAppEquipe } from "~/lib/contact";
import { analyserErreur, type RessourceQuota } from "~/lib/errors";

const Contexte = createContext<{ ouvrir: (ressource: RessourceQuota) => void } | null>(null);

/** Dialogue d'upgrade déclenché par les erreurs PLAN_LIMIT:* de la base. */
export function LimitePlanProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const org = useOrg();
  const [ressource, setRessource] = useState<RessourceQuota | null>(null);
  const plan = t(`plans.${org.organisation.plan}`);
  const whatsapp = lienWhatsAppEquipe(t("limite.message_whatsapp", { organisation: org.organisation.nom, plan }));
  const email = lienEmailEquipe(t("limite.sujet_email", { organisation: org.organisation.nom }));
  const valeur = useMemo(() => ({ ouvrir: setRessource }), []);
  const pro = LIMITES_PLAN.pro;

  return (
    <Contexte.Provider value={valeur}>
      {children}
      <Dialog open={ressource !== null} onOpenChange={(ouvert) => !ouvert && setRessource(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("limite.titre")}</DialogTitle>
            <DialogDescription>
              {ressource && t(`limite.${ressource}`, { plan, limite: org.limites[ressource] ?? "∞" })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 rounded-2xl bg-sand p-4 text-sm sm:grid-cols-2">
            <div className="grid gap-1">
              <p className="font-bold text-navy">{t("plans.pro")}</p>
              <p className="text-muted-foreground">
                {t("limite.inclus_pro", { projets: pro.projects, kpis: pro.kpis, utilisateurs: pro.users })}
              </p>
            </div>
            <div className="grid gap-1">
              <p className="font-bold text-navy">{t("plans.enterprise")}</p>
              <p className="text-muted-foreground">{t("limite.inclus_enterprise")}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{t("limite.facturation")}</p>
          <DialogFooter>
            <Button variante="contour" onClick={() => setRessource(null)}>
              {t("commun.plus_tard")}
            </Button>
            {whatsapp ? (
              <Button asChild variante="accent">
                <a href={whatsapp} target="_blank" rel="noreferrer">
                  <MessageCircle aria-hidden />
                  {t("limite.whatsapp")}
                </a>
              </Button>
            ) : email ? (
              <Button asChild>
                <a href={email}>
                  <Mail aria-hidden />
                  {t("limite.email")}
                </a>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Contexte.Provider>
  );
}

/** Affiche une erreur : dialogue d'upgrade pour un quota, toast humain sinon. */
export function useGestionErreur() {
  const { t } = useTranslation();
  const contexte = useContext(Contexte);
  return useCallback(
    (erreur: unknown) => {
      const analyse = analyserErreur(erreur);
      if (analyse.quota && contexte) {
        contexte.ouvrir(analyse.quota);
        return;
      }
      toast.error(t(analyse.cle));
    },
    [contexte, t],
  );
}
