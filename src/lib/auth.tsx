import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { supabaseConfigure } from "./env";
import { getSupabase } from "./supabase";

export type StatutAuth = "chargement" | "anonyme" | "connecte" | "non_configure";
type EtatAuth = { statut: StatutAuth; session: Session | null; utilisateur: User | null };
type ValeurAuth = EtatAuth & { seDeconnecter: () => Promise<void> };

const ContexteAuth = createContext<ValeurAuth | null>(null);

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
    void supabase.auth.getSession().then(({ data }) => {
      if (actif) setEtat(depuisSession(data.session));
    });
    // Le rappel ne doit pas appeler d'autre méthode Supabase de façon synchrone.
    const { data } = supabase.auth.onAuthStateChange((evenement, session) => {
      setEtat(depuisSession(session));
      if (evenement === "PASSWORD_RECOVERY") navigateRef.current("/reinitialiser-mot-de-passe", { replace: true });
      if (evenement === "SIGNED_OUT") queryClient.clear();
    });
    return () => {
      actif = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const valeur = useMemo<ValeurAuth>(
    () => ({
      ...etat,
      seDeconnecter: async () => {
        await getSupabase().auth.signOut();
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
