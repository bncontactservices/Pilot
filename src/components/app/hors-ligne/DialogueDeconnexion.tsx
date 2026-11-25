import { CloudUpload, LogOut, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import type { SaisieEnAttente } from "~/lib/hors-ligne/file";

/**
 * Se déconnecter avec des saisies non envoyées : jamais en silence. Elles ne partent pas toutes seules sans
 * connexion, et les laisser sur l'appareil les rendrait lisibles à la personne qui s'en sert ensuite. On les envoie,
 * ou on les supprime en le disant.
 */
export function DialogueDeconnexion({
  ouvert,
  saisies,
  enLigne,
  synchronisation,
  onFermer,
  onEnvoyer,
  onSupprimerEtQuitter,
  onQuitter,
}: {
  ouvert: boolean;
  saisies: SaisieEnAttente[];
  enLigne: boolean;
  synchronisation: boolean;
  onFermer: () => void;
  onEnvoyer: () => Promise<void>;
  onSupprimerEtQuitter: () => void;
  onQuitter: () => void;
}) {
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DialogContent>
        {/* Le contenu est démonté à la fermeture : la demande de confirmation repart de zéro à chaque ouverture. */}
        <Contenu
          saisies={saisies}
          enLigne={enLigne}
          synchronisation={synchronisation}
          onFermer={onFermer}
          onEnvoyer={onEnvoyer}
          onSupprimerEtQuitter={onSupprimerEtQuitter}
          onQuitter={onQuitter}
        />
      </DialogContent>
    </Dialog>
  );
}

function Contenu({
  saisies,
  enLigne,
  synchronisation,
  onFermer,
  onEnvoyer,
  onSupprimerEtQuitter,
  onQuitter,
}: Omit<Parameters<typeof DialogueDeconnexion>[0], "ouvert">) {
  const { t } = useTranslation();
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);

  const total = saisies.length;
  const enAttente = saisies.filter((s) => s.statut === "attente").length;
  const aTraiter = total - enAttente;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {total === 0 ? t("horsligne.deconnexion.tout_envoye") : t("horsligne.deconnexion.titre")}
        </DialogTitle>
        <DialogDescription>
          {total === 0
            ? t("horsligne.deconnexion.tout_envoye_texte")
            : t("horsligne.deconnexion.texte", { count: total })}
        </DialogDescription>
      </DialogHeader>

      {total > 0 && !enLigne && enAttente > 0 && (
        <Bandeau variante="vigilance">
          <p>{t("horsligne.deconnexion.hors_ligne")}</p>
        </Bandeau>
      )}
      {aTraiter > 0 && <Bandeau variante="alerte">{t("horsligne.deconnexion.a_traiter", { count: aTraiter })}</Bandeau>}
      {confirmerSuppression && (
        <Bandeau variante="alerte" role="alert">
          <p>{t("horsligne.deconnexion.confirmer_texte", { count: total })}</p>
        </Bandeau>
      )}

      <DialogFooter className="sm:flex-wrap">
        {total === 0 ? (
          <Button onClick={onQuitter}>
            <LogOut aria-hidden />
            {t("auth.deconnexion")}
          </Button>
        ) : confirmerSuppression ? (
          <>
            <Button variante="contour" onClick={() => setConfirmerSuppression(false)}>
              {t("commun.annuler")}
            </Button>
            <Button variante="danger" onClick={onSupprimerEtQuitter}>
              <Trash2 aria-hidden />
              {t("horsligne.deconnexion.confirmer_action", { count: total })}
            </Button>
          </>
        ) : (
          <>
            <Button variante="contour" onClick={onFermer}>
              {t("horsligne.deconnexion.rester")}
            </Button>
            <Button variante="danger" onClick={() => setConfirmerSuppression(true)}>
              <Trash2 aria-hidden />
              {t("horsligne.deconnexion.supprimer")}
            </Button>
            <Button
              onClick={() => void onEnvoyer()}
              chargement={synchronisation}
              disabled={!enLigne || enAttente === 0}
            >
              <CloudUpload aria-hidden />
              {t("horsligne.envoyer_maintenant")}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}
