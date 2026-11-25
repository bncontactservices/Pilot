// Fichiers d'un projet : dépôt dans le bucket privé « documents », lien signé de courte durée, suppression.
// Les droits sont portés par la base (RLS du bucket et de la table `documents`) ; ce module n'en décide pas.

import type { DocumentProjet } from "./donnees-se";
import { cheminDocument, typeDocument } from "./suivi";
import { getSupabase } from "./supabase";

const BUCKET = "documents";
/** Durée de validité d'un lien de téléchargement, en secondes. */
const DUREE_LIEN = 60;

export type DepotDocument = {
  orgId: string;
  projetId: string;
  fichier: File;
  nom: string;
  categorie: DocumentProjet["categorie"];
  description: string | null;
  realisationId: string | null;
};

/**
 * Dépose le fichier puis enregistre sa ligne. Si l'enregistrement échoue, le fichier déposé est retiré :
 * pas de fichier orphelin du fait d'un échec. Retourne l'identifiant du document et le chemin du fichier
 * (pour le rattacher, par exemple, comme justificatif d'une dépense).
 */
export async function deposerDocument(d: DepotDocument): Promise<{ id: string; storage_path: string }> {
  const supabase = getSupabase();
  const type = typeDocument(d.fichier);
  if (type === null) throw new Error("mime type not supported");
  const chemin = cheminDocument(d.orgId, d.projetId, d.fichier.name, crypto.randomUUID());
  const depot = await supabase.storage.from(BUCKET).upload(chemin, d.fichier, { contentType: type, upsert: false });
  if (depot.error) throw depot.error;
  const { data, error } = await supabase
    .from("documents")
    .insert({
      project_id: d.projetId,
      nom: d.nom,
      categorie: d.categorie,
      description: d.description,
      storage_path: chemin,
      mime_type: type,
      taille_octets: d.fichier.size,
      realisation_id: d.realisationId,
    })
    .select("id")
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([chemin]);
    throw error;
  }
  return { id: data.id, storage_path: chemin };
}

/**
 * Supprime la ligne, puis le fichier. Retourne false si le fichier n'a pas pu être retiré du stockage
 * (la ligne, elle, est bien supprimée : la base garde le chemin en file, et le fichier sera retiré par
 * `retirerFichiersOrphelins` à la prochaine occasion).
 */
export async function supprimerDocument(document: Pick<DocumentProjet, "id" | "storage_path">): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase.from("documents").delete().eq("id", document.id);
  if (error) throw error;
  const retrait = await supabase.storage.from(BUCKET).remove([document.storage_path]);
  if (retrait.error) return false;
  // Le fichier est parti : le chemin n'a plus à rester en file (sans conséquence si cet appel échoue).
  await supabase.rpc("fichiers_retires", { p_chemins: [document.storage_path] });
  return true;
}

/** Nombre de lots de chemins traités au plus par appel (la base en renvoie 200 à la fois). */
const LOTS_MAX = 5;

/**
 * Retire du stockage les fichiers des documents supprimés, puis vide la file que la base en tient.
 *
 * Supprimer un projet supprime ses lignes `documents` en cascade mais pas ses fichiers, que seule l'API de
 * stockage peut retirer : la base inscrit donc chaque chemin dans une file (migration fichiers_a_retirer), et cette
 * fonction la traite avec les droits de la personne connectée. Appelée après une suppression de projet et au
 * chargement de l'application : un échec (réseau, onglet fermé) se rattrape tout seul à la session suivante.
 * Ne lève jamais d'erreur ; retourne le nombre de fichiers retirés.
 */
export async function retirerFichiersOrphelins(): Promise<number> {
  try {
    const supabase = getSupabase();
    let retires = 0;
    for (let lot = 0; lot < LOTS_MAX; lot += 1) {
      const { data: chemins, error } = await supabase.rpc("fichiers_a_retirer");
      if (error || !chemins || chemins.length === 0) break;
      const retrait = await supabase.storage.from(BUCKET).remove(chemins);
      if (retrait.error) break;
      const vidage = await supabase.rpc("fichiers_retires", { p_chemins: chemins });
      if (vidage.error) break;
      retires += chemins.length;
      if (chemins.length < 200) break;
    }
    return retires;
  } catch {
    return 0;
  }
}

/** Nom du fichier téléchargé : le nom du document, avec l'extension du fichier d'origine. */
export function nomTelechargement(document: Pick<DocumentProjet, "nom" | "storage_path">): string {
  const point = document.storage_path.lastIndexOf(".");
  const ext = point > 0 ? document.storage_path.slice(point) : "";
  return !ext || document.nom.toLowerCase().endsWith(ext.toLowerCase()) ? document.nom : `${document.nom}${ext}`;
}

/**
 * Télécharge un document par un lien signé qui expire au bout d'une minute.
 *
 * Le nom du fichier est ajouté à l'adresse ici et non par l'option `download` de supabase-js : la bibliothèque encode
 * deux fois le nom, et le navigateur enregistre alors « Bon de r%C3%A9ception.pdf » au lieu de « Bon de réception.pdf »
 * (défaut constaté par le test de bout en bout du parcours S&E).
 */
export async function telechargerDocument(doc: Pick<DocumentProjet, "nom" | "storage_path">): Promise<void> {
  const { data, error } = await getSupabase().storage.from(BUCKET).createSignedUrl(doc.storage_path, DUREE_LIEN);
  if (error) throw error;
  const lien = document.createElement("a");
  lien.href = `${data.signedUrl}${data.signedUrl.includes("?") ? "&" : "?"}download=${encodeURIComponent(nomTelechargement(doc))}`;
  lien.rel = "noopener";
  lien.hidden = true;
  document.body.append(lien);
  lien.click();
  lien.remove();
}
