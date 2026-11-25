import { useState } from "react";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { telechargerDocument } from "~/lib/documents";
import type { DocumentProjet } from "~/lib/donnees-se";

/** Télécharge un document par lien signé ; `enCours` est l'identifiant du document en cours de préparation. */
export function useTelechargement() {
  const gererErreur = useGestionErreur();
  const [enCours, setEnCours] = useState<string | null>(null);
  const telecharger = async (doc: Pick<DocumentProjet, "id" | "nom" | "storage_path">) => {
    setEnCours(doc.id);
    try {
      await telechargerDocument(doc);
    } catch (erreur) {
      gererErreur(erreur);
    } finally {
      setEnCours(null);
    }
  };
  return { telecharger, enCours };
}
