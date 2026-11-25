import { useEffect } from "react";
import { useOrg } from "~/hooks/useContexteOrg";
import { retirerFichiersOrphelins } from "~/lib/documents";

/**
 * Au chargement de l'application, une personne qui peut modifier (admin ou éditeur, organisation autorisée à
 * écrire) retire du stockage les fichiers de documents supprimés restés en attente : suppression d'un projet dont le
 * nettoyage immédiat a échoué, onglet fermé trop tôt, etc. Sans effet quand il n'y a rien à retirer.
 */
export function useNettoyageFichiers() {
  const { organisation, peutEditer } = useOrg();
  useEffect(() => {
    if (peutEditer) void retirerFichiersOrphelins();
  }, [organisation.id, peutEditer]);
}
