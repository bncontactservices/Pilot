// Une personne connectée ne doit jamais voir ses requêtes de données partir en anonyme (Lot 4a).
//
// Quand le jeton d'accès est périmé et ne peut pas être renouvelé (coupure du réseau), supabase-js retombe sur la clé
// publique du projet. La base répond alors « refusé » (clé publique nouvelle forme) ou, avec une clé historique, des
// listes vides qui effaceraient à l'écran les données gardées sur l'appareil, et une saisie serait marquée refusée à tort.
// Tant qu'une session est gardée sur l'appareil, ces requêtes sont refusées comme une coupure réseau : les écrans gardent
// ce qu'ils ont et l'envoi des saisies se retente.
//
// Seules les requêtes de données (/rest/v1/) sont concernées : la connexion, l'inscription, les fonctions publiques
// (formulaire de contact) gardent leur clé publique.

type Fetch = typeof fetch;

export function creerFetchSansRetrogradation(
  cleAnonyme: string,
  sessionGardee: () => boolean,
  fetchDeBase: Fetch = (...args) => fetch(...args),
): Fetch {
  return (entree, init) => {
    const url = typeof entree === "string" ? entree : entree instanceof URL ? entree.href : entree.url;
    if (url.includes("/rest/v1/")) {
      const entetes = new Headers(init?.headers ?? (entree instanceof Request ? entree.headers : undefined));
      if (entetes.get("Authorization") === `Bearer ${cleAnonyme}` && sessionGardee()) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
    }
    return fetchDeBase(entree, init);
  };
}
