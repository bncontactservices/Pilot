import { QueryClient } from "@tanstack/react-query";
import { analyserErreur } from "./errors";

/** Connexion lente tolérée : deux nouvelles tentatives sur les erreurs réseau uniquement. */
export function creerQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (tentatives, erreur) => tentatives < 2 && analyserErreur(erreur).cle === "erreurs.reseau",
        retryDelay: (tentative) => Math.min(1000 * 2 ** tentative, 8000),
      },
      // Une écriture ne se met jamais en pause en attendant le réseau (comportement par défaut de react-query, qui la
      // lancerait toute seule à son retour) : elle part tout de suite et échoue clairement, ou, pour une saisie
      // d'indicateur, est gardée sur l'appareil par la file hors ligne.
      mutations: { retry: 0, networkMode: "always" },
    },
  });
}
