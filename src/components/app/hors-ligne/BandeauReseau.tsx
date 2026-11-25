import { CloudUpload, TriangleAlert, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import { useFileSaisies } from "~/hooks/useFileSaisies";

/** État de la connexion et des saisies gardées sur l'appareil, en haut de chaque écran de l'application. */
export function BandeauReseau() {
  const { t } = useTranslation();
  const { saisies, enLigne, synchronisation, synchroniser, arret } = useFileSaisies();
  const enAttente = saisies.filter((s) => s.statut === "attente").length;
  const aTraiter = saisies.filter((s) => s.statut !== "attente");
  if (enLigne && saisies.length === 0) return null;

  return (
    <>
      {!enLigne && (
        <Bandeau variante="vigilance" className="flex-wrap items-center">
          <WifiOff aria-hidden />
          <p className="min-w-0 flex-1">
            {t("horsligne.bandeau.hors_ligne")}
            {enAttente > 0 && <> {t("horsligne.bandeau.hors_ligne_attente", { count: enAttente })}</>}
          </p>
        </Bandeau>
      )}
      {enLigne && enAttente > 0 && (
        <Bandeau className="flex-wrap items-center">
          <CloudUpload aria-hidden />
          <p className="min-w-0 flex-1">
            {t("horsligne.bandeau.en_attente", { count: enAttente })}
            {arret === "session" && <> {t("horsligne.bandeau.session")}</>}
            {arret === "reseau" && <> {t("horsligne.bandeau.instable")}</>}
            {arret === "serveur" && <> {t("horsligne.bandeau.serveur")}</>}
          </p>
          <Button variante="contour" taille="sm" onClick={() => void synchroniser()} chargement={synchronisation}>
            {t("horsligne.envoyer_maintenant")}
          </Button>
        </Bandeau>
      )}
      {aTraiter.length > 0 && (
        <Bandeau variante="alerte" className="flex-wrap items-center">
          <TriangleAlert aria-hidden />
          <p className="min-w-0 flex-1">{t("horsligne.bandeau.a_traiter", { count: aTraiter.length })}</p>
          <Link
            to={`/app/projets/${aTraiter[0]!.projetId}/saisie`}
            className="lift inline-flex items-center gap-1.5 rounded-lg font-semibold underline underline-offset-4"
          >
            {t("horsligne.bandeau.voir")}
          </Link>
        </Bandeau>
      )}
    </>
  );
}
