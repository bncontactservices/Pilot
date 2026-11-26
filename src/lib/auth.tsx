import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { env, supabaseConfigure } from "./env";
import { analyserErreur } from "./errors";
import { memoriserCache, restaurerCache, stockageIndexedDb } from "./hors-ligne/cache";
import { cleSessionStockee, lireSessionStockee } from "./hors-ligne/session";
import { getSupabase } from "./supabase";

/** Attente maximale de la session de supabase-js à l'ouverture, quand une session est gardée sur l'appareil. */
export const DELAI_OUVERTURE_SESSION_MS = 3000;

export type StatutAuth = "chargement" | "anonyme" | "connecte" | "non_configure";
type EtatAuth = { statut: StatutAuth; session: Session | null; utilisateur: User | null };
export type ValeurAuth = EtatAuth & { seDeconnecter: () => Promise<void> };

/** Exporté pour que les tests montent des écrans sous un compte factice. */
export const ContexteAuth = createContext<ValeurAuth | null>(null);

function depuisSession(session: Session | null): EtatAuth {
  return session
    ? { statut: "connecte", session, utilisateur: session.user }
    : { statut: "anonyme", session: null, utilisateur: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<EtatAuth>({
    statut: supabaseConfigure ? "chargement" : "non_configure",
    session: null,
    utilisateur: null,
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    if (!supabaseConfigure) return;
    const supabase = getSupabase();
    let actif = true;
    // Données gardées sur l'appareil pour ouvrir l'application sans réseau (Lot 4a).
    const stockageCache = stockageIndexedDb();
    let utilisateurCache: string | null = null;
    let arretCache: (() => void) | undefined;
    const lierCache = (utilisateurId: string | null) => {
      if (utilisateurId === utilisateurCache) return;
      arretCache?.();
      arretCache = undefined;
      // Un autre compte (ou plus personne) : ce qui était gardé n'est plus à montrer.
      if (utilisateurCache !== null) {
        queryClient.clear();
        void stockageCache?.effacer().catch(() => undefined);
      }
      utilisateurCache = utilisateurId;
      if (utilisateurId && stockageCache) arretCache = memoriserCache(queryClient, utilisateurId, stockageCache);
    };

    void (async () => {
      const stockee = lireSessionStockee(
        cleSessionStockee(env.supabaseUrl!),
        typeof window === "undefined" ? null : window.localStorage,
      );
      // Jeton périmé : supabase-js tente de le renouveler et, sans réseau, réessaie une trentaine de secondes avant d'abandonner.
      // Quand une session est gardée sur l'appareil, on n'attend pas : passé DELAI_OUVERTURE_SESSION_MS, on ouvre l'application
      // avec elle (données gardées, saisie hors ligne). Le renouvellement continue en arrière-plan : s'il réussit, l'événement
      // TOKEN_REFRESHED met l'état à jour ; si le serveur refuse la session, SIGNED_OUT renvoie vers la connexion.
      const lente = Symbol("lente");
      const reponse = await Promise.race([
        supabase.auth.getSession(),
        stockee
          ? new Promise<typeof lente>((resolve) => setTimeout(() => resolve(lente), DELAI_OUVERTURE_SESSION_MS))
          : new Promise<never>(() => undefined),
      ]);
      let session: Session | null;
      if (reponse === lente) {
        session = stockee;
      } else {
        session = reponse.data.session;
        // Jeton périmé et renouvellement impossible faute de réseau : la session est toujours sur l'appareil. On ouvre
        // l'application avec elle plutôt que de renvoyer vers une connexion impossible.
        if (!session && reponse.error && analyserErreur(reponse.error).cle === "erreurs.reseau") session = stockee;
      }
      if (session && stockageCache) await restaurerCache(queryClient, session.user.id, stockageCache);
      if (!actif) return;
      if (session) lierCache(session.user.id);
      setEtat(depuisSession(session));
    })();

    // Le rappel ne doit pas appeler d'autre méthode Supabase de façon synchrone.
    const { data } = supabase.auth.onAuthStateChange((evenement, session) => {
      // L'état initial est établi ci-dessus (avec la reprise hors ligne) : ne pas l'écraser par « anonyme ».
      if (evenement === "INITIAL_SESSION") return;
      setEtat(depuisSession(session));
      if (evenement === "PASSWORD_RECOVERY") navigateRef.current("/reinitialiser-mot-de-passe", { replace: true });
      if (evenement === "SIGNED_OUT") {
        arretCache?.();
        arretCache = undefined;
        utilisateurCache = null;
        queryClient.clear();
        void stockageCache?.effacer().catch(() => undefined);
      } else if (session) {
        lierCache(session.user.id);
      }
    });
    return () => {
      actif = false;
      arretCache?.();
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const valeur = useMemo<ValeurAuth>(
    () => ({
      ...etat,
      seDeconnecter: async () => {
        const supabase = getSupabase();
        // Sans réseau, la déconnexion se fait sur l'appareil seulement : elle ne dépend pas du serveur.
        const { error } = await supabase.auth.signOut({ scope: navigator.onLine ? "global" : "local" });
        if (error) await supabase.auth.signOut({ scope: "local" });
        navigateRef.current("/connexion", { replace: true });
      },
    }),
    [etat],
  );

  return <ContexteAuth.Provider value={valeur}>{children}</ContexteAuth.Provider>;
}

export function useAuth(): ValeurAuth {
  const valeur = useContext(ContexteAuth);
  if (!valeur) throw new Error("useAuth doit être utilisé sous AuthProvider");
  return valeur;
}
