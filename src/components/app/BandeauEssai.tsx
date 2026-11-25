import { CalendarClock, CreditCard, Lock, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Bandeau } from "~/components/ui/banner";
import { useOrg } from "~/hooks/useContexteOrg";
import { ALERTE_FIN_ESSAI_JOURS } from "~/lib/constants";
import { lienEmailEquipe, lienWhatsAppEquipe } from "~/lib/contact";
import { formaterDate } from "~/lib/format";
import { useEtatPaiement } from "~/lib/paiement";

/** Compte à rebours à partir de J-3, puis bandeau permanent de lecture seule. */
export function BandeauEssai() {
  const { t } = useTranslation();
  const org = useOrg();
  // Le lien « Payer en ligne » n'apparaît que pour un administrateur, et seulement si le serveur confirme que c'est possible.
  const paiement = useEtatPaiement(org.estAdmin && org.enEssai);
  const jours = org.joursEssaiRestants;
  if (!org.enEssai || jours === null) return null;
  const termine = !org.peutEcrire;
  if (!termine && jours > ALERTE_FIN_ESSAI_JOURS) return null;

  const message = t("essai.message_contact", { organisation: org.organisation.nom });
  const contact =
    lienWhatsAppEquipe(message) ?? lienEmailEquipe(t("essai.sujet_email", { organisation: org.organisation.nom }));
  const date = formaterDate(org.organisation.essai_fin, "d MMMM");

  return (
    <Bandeau variante={termine ? "alerte" : "vigilance"} className="flex-wrap items-center">
      {termine ? <Lock aria-hidden /> : <CalendarClock aria-hidden />}
      <p className="min-w-0 flex-1">
        {termine
          ? t("essai.termine")
          : jours === 0
            ? t("essai.fin_aujourdhui")
            : t("essai.fin_dans", { count: jours, date })}
      </p>
      {paiement.data?.disponible && (
        <Link
          to="/app/parametres#abonnement"
          className="lift inline-flex items-center gap-1.5 rounded-lg font-semibold underline underline-offset-4"
        >
          <CreditCard className="size-4" aria-hidden />
          {t("essai.payer_en_ligne")}
        </Link>
      )}
      {contact && (
        <a
          href={contact}
          target="_blank"
          rel="noreferrer"
          className="lift inline-flex items-center gap-1.5 rounded-lg font-semibold underline underline-offset-4"
        >
          <MessageCircle className="size-4" aria-hidden />
          {t("essai.activer")}
        </a>
      )}
    </Bandeau>
  );
}
