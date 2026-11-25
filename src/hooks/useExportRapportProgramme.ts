import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useOrg } from "~/hooks/useContexteOrg";
import type { Avancement, AvancementProgramme } from "~/lib/donnees";
import { aujourdhuiIso } from "~/lib/kpi";
import type { EntreeRapportProgramme } from "~/lib/rapport/programme";
import { telecharger } from "~/lib/telechargement";

type Donnees = Pick<EntreeRapportProgramme, "programme" | "projets"> & { consolide: AvancementProgramme | null };

/**
 * Génère et télécharge le rapport PDF consolidé d'un programme. Comme celui d'un projet, il reste disponible pour tous
 * les rôles, y compris après la fin d'essai : c'est une lecture, pas une écriture.
 */
export function useExportRapportProgramme() {
  const { t } = useTranslation();
  const org = useOrg();
  const [enCours, setEnCours] = useState(false);

  const exporter = useCallback(
    async (donnees: Donnees) => {
      setEnCours(true);
      try {
        // Laisse le bouton passer à l'état « en cours » avant le calcul, qui occupe le thread principal.
        await new Promise((resolve) => setTimeout(resolve, 30));
        const { chargerLogo, genererRapportProgrammePdf } = await import("~/lib/rapport/generer");
        const logo = await chargerLogo(org.organisation.logo_path);
        const { blob, nom } = await genererRapportProgrammePdf({
          ...donnees,
          organisation: { nom: org.organisation.nom, logo },
          aujourdhui: aujourdhuiIso(),
          t: (cle, valeurs) => t(cle, { ...valeurs }),
        });
        telecharger(nom, blob, "application/pdf");
        toast.success(t("rapport.genere", { nom }));
      } catch (erreur) {
        console.error("Génération du rapport de programme impossible", erreur);
        toast.error(t("rapport.erreur"));
      } finally {
        setEnCours(false);
      }
    },
    [org.organisation.logo_path, org.organisation.nom, t],
  );

  return { exporter, enCours };
}

export type { Avancement };
