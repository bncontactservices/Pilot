// Rapport de suivi par e-mail (Lot 4b) : l'abonnement du membre connecté et les appels à l'Edge Function « rapports-programmes ».
// Le serveur décide de tout (destinataire = l'adresse du compte, dates d'envoi) : le navigateur n'envoie que la fréquence choisie.

import { FunctionsHttpError } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import type { Enums } from "./database.types";
import { getSupabase } from "./supabase";

export type FrequenceRapport = Enums<"frequence_rapport">;
export type AbonnementRapport = {
  frequence: FrequenceRapport;
  prochain_envoi_le: string;
  dernier_envoi_le: string | null;
};
const COLONNES = "frequence, prochain_envoi_le, dernier_envoi_le";

export const clesRapports = {
  etat: ["rapports", "etat"] as const,
  abonnement: (userId: string) => ["rapports", "abonnement", userId] as const,
};

/** Appelle la fonction ; une erreur du serveur est relancée avec son code (« RAPPORTS_NON_CONFIGURES »…), que errors.ts traduit. */
async function appeler<T>(corps: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke<T>("rapports-programmes", { body: corps });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const reponse = (await error.context.json().catch(() => null)) as { erreur?: string } | null;
      throw new Error(reponse?.erreur ?? "INCONNUE");
    }
    throw error;
  }
  return data as T;
}

export const envoyerExemple = () => appeler<{ envoye: true }>({ action: "exemple" });

/**
 * L'envoi par e-mail est-il configuré ? Une panne, une fonction non déployée ou une configuration incomplète valent « non » :
 * l'écran n'affiche alors rien de ce rapport (aucun bouton qui ne marcherait pas).
 */
export function useEtatRapports(actif: boolean) {
  return useQuery({
    queryKey: clesRapports.etat,
    enabled: actif,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      try {
        return (await appeler<{ disponible: boolean }>({ action: "etat" })).disponible === true;
      } catch {
        return false;
      }
    },
  });
}

/** Mon abonnement (la base ne renvoie que ma ligne). */
export function useAbonnementRapport(userId: string, actif: boolean) {
  return useQuery({
    queryKey: clesRapports.abonnement(userId),
    enabled: actif,
    queryFn: async (): Promise<AbonnementRapport | null> => {
      const { data, error } = await getSupabase()
        .from("rapports_abonnes")
        .select(COLONNES)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** S'abonner, changer de fréquence ou se désabonner (`null`). Le désabonnement passe toujours, même en lecture seule. */
export async function definirAbonnement(
  userId: string,
  existant: boolean,
  frequence: FrequenceRapport | null,
): Promise<void> {
  const table = getSupabase().from("rapports_abonnes");
  if (frequence === null) {
    const { error } = await table.delete().eq("user_id", userId);
    if (error) throw error;
    return;
  }
  const { error } = existant
    ? await table.update({ frequence }).eq("user_id", userId)
    : await table.insert({ frequence });
  if (error) throw error;
}
