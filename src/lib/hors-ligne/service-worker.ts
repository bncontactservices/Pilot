// Enregistrement du service worker (Lot 4a). Le fichier `sw.js` est produit à chaque build par
// `scripts/generer-sw.mjs` : il garde l'enveloppe de l'application pour l'ouvrir sans réseau.
// Il n'est enregistré qu'en production et seulement une fois dans l'application (jamais sur la landing).

export function enregistrerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/sw.js").catch(() => {
    // Sans service worker, l'application marche comme avant : seule l'ouverture hors ligne n'est pas offerte.
  });
}
