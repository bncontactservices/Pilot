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
      mutations: { retry: 0 },
    },
  });
}
