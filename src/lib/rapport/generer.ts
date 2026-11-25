// Génération du rapport PDF dans le navigateur. Ce module (et @react-pdf/renderer avec lui) n'est
// chargé qu'au clic sur « Générer le PDF » : il ne pèse pas sur le premier affichage de l'application.

import type { DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { NOM_PRODUIT } from "../constants";
import { getSupabase } from "../supabase";
import { type EntreeRapport, preparerRapport } from "./donnees";
import { enregistrerPolices } from "./polices";
import { SOURCES_POLICES } from "./polices-urls";
import { RapportPdf } from "./RapportPdf";

const LARGEUR_LOGO_MAX = 480;

/**
 * Télécharge le logo de l'organisation (bucket privé) et le convertit en PNG : @react-pdf ne lit que le PNG et le JPEG,
 * alors que le logo peut être en WebP. Renvoie null si l'organisation n'a pas de logo ou s'il est illisible :
 * le rapport affiche alors son nom en texte, il n'échoue jamais pour un logo.
 */
export async function chargerLogo(chemin: string | null): Promise<EntreeRapport["organisation"]["logo"]> {
  if (!chemin) return null;
  try {
    const { data, error } = await getSupabase().storage.from("logos").download(chemin);
    if (error || !data) return null;
    const image = await createImageBitmap(data);
    const echelle = Math.min(1, LARGEUR_LOGO_MAX / image.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * echelle));
    canvas.height = Math.max(1, Math.round(image.height * echelle));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    return { src: canvas.toDataURL("image/png"), largeur: canvas.width, hauteur: canvas.height };
  } catch {
    return null;
  }
}

export async function genererRapportPdf(entree: EntreeRapport): Promise<{ blob: Blob; nom: string }> {
  const { pdf } = await import("@react-pdf/renderer");
  enregistrerPolices(SOURCES_POLICES);
  const donnees = preparerRapport(entree);
  // RapportPdf rend un <Document> : le typage de pdf() n'attend que ce type d'élément à la racine.
  const document = createElement(RapportPdf, {
    donnees,
    t: entree.t,
    produit: NOM_PRODUIT,
  }) as unknown as ReactElement<DocumentProps>;
  const blob = await pdf(document).toBlob();
  return { blob, nom: donnees.nomFichier };
}
