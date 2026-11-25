import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useGestionErreur } from "~/components/app/LimitePlan";
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
import { cles, type Programme } from "~/lib/donnees";
import { getSupabase } from "~/lib/supabase";

export function DialogueSuppressionProgramme({
  programme,
  ouvert,
  onOuvertChange,
  apres,
}: {
  programme: Programme;
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
  apres?: () => void;
}) {
  const { t } = useTranslation();
  const org = useOrg();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const suppression = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabase().from("programmes").delete().eq("id", programme.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("programmes.suppression.succes", { nom: programme.nom }));
      onOuvertChange(false);
      void queryClient.invalidateQueries({ queryKey: cles.programmes(org.organisation.id) });
      void queryClient.invalidateQueries({ queryKey: cles.avancementsProgrammes(org.organisation.id) });
      void queryClient.invalidateQueries({ queryKey: ["projets", org.organisation.id] });
      void queryClient.invalidateQueries({ queryKey: ["projet"] });
      void queryClient.invalidateQueries({ queryKey: cles.avancements(org.organisation.id) });
      apres?.();
    },
    onError: gererErreur,
  });

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("programmes.suppression.titre", { nom: programme.nom })}</DialogTitle>
          <DialogDescription>{t("programmes.suppression.texte")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variante="contour" onClick={() => onOuvertChange(false)}>
            {t("commun.annuler")}
          </Button>
          <Button variante="danger" onClick={() => suppression.mutate()} chargement={suppression.isPending}>
            <Trash2 aria-hidden />
            {t("programmes.suppression.action")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
