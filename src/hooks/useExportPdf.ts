import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useOrg } from "~/hooks/useContexteOrg";
import { type Kpi, type Projet, type SaisieLigne, useSeuils } from "~/lib/donnees";
import type { Periode } from "~/lib/kpi";
import { aujourdhuiIso } from "~/lib/kpi";
import { telecharger } from "~/lib/telechargement";

/** Génère et télécharge le rapport PDF d'un projet. Disponible pour tous les rôles, y compris après la fin d'essai. */
export function useExportPdf() {
  const { t } = useTranslation();
  const org = useOrg();
  const seuils = useSeuils(org.organisation.id);
  const [enCours, setEnCours] = useState(false);

  const exporter = useCallback(
    async (donnees: { projet: Projet; kpis: Kpi[]; saisies: SaisieLigne[]; periode: Periode }) => {
      setEnCours(true);
      try {
        // Laisse le bouton passer à l'état « en cours » avant le calcul, qui occupe le thread principal.
        await new Promise((resolve) => setTimeout(resolve, 30));
        const { chargerLogo, genererRapportPdf } = await import("~/lib/rapport/generer");
        const logo = await chargerLogo(org.organisation.logo_path);
        const { blob, nom } = await genererRapportPdf({
          ...donnees,
          organisation: { nom: org.organisation.nom, logo },
          aujourdhui: aujourdhuiIso(),
          seuils,
          t: (cle, valeurs) => t(cle, { ...valeurs }),
        });
        telecharger(nom, blob, "application/pdf");
        toast.success(t("rapport.genere", { nom }));
      } catch (erreur) {
        console.error("Génération du rapport PDF impossible", erreur);
        toast.error(t("rapport.erreur"));
      } finally {
        setEnCours(false);
      }
    },
    [org.organisation.logo_path, org.organisation.nom, seuils, t],
  );

  return { exporter, enCours };
}
