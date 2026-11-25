/** Déclenche le téléchargement d'un contenu produit dans le navigateur (rapport d'erreurs, modèle, PDF). */
export function telecharger(nom: string, contenu: Blob | string, type = "text/csv;charset=utf-8"): void {
  const blob = typeof contenu === "string" ? new Blob([contenu], { type }) : contenu;
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nom;
  lien.hidden = true;
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Nom de fichier sûr : sans accents, espaces ni caractères spéciaux. */
export function nomFichierSur(texte: string, repli = "fichier"): string {
  const propre = texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return propre || repli;
}
