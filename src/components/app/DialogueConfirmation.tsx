import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

/** Confirmation d'une suppression : titre, conséquences, bouton d'action rouge. */
export function DialogueConfirmation({
  ouvert,
  onOuvertChange,
  titre,
  description,
  action,
  enCours,
  onConfirmer,
}: {
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
  titre: string;
  description: ReactNode;
  action: string;
  enCours: boolean;
  onConfirmer: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titre}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variante="contour" onClick={() => onOuvertChange(false)}>
            {t("commun.annuler")}
          </Button>
          <Button variante="danger" onClick={onConfirmer} chargement={enCours}>
            <Trash2 aria-hidden />
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
