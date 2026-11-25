// Paiement en ligne (Lot 3f) : appels aux Edge Functions de Stripe, lecture de l'abonnement, mise en forme des prix.
// Le serveur décide de tout (prix, droits, redirections) : le navigateur n'envoie que le plan et la périodicité choisis.

import { FunctionsHttpError } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import type { Enums } from "./database.types";
import { getSupabase } from "./supabase";

export type PlanPayant = Enums<"plan_choisi">;
export type Periodicite = "mensuelle" | "annuelle";
export type PlanProposable = { plan: PlanPayant; periodicite: Periodicite; montant: number; devise: string };
export type EtatPaiement = { disponible: false } | { disponible: true; mode: "test" | "live"; plans: PlanProposable[] };

/** Ce que l'administrateur peut lire de l'abonnement : jamais les identifiants Stripe (droits par colonne). */
export type Abonnement = {
  org_id: string;
  plan: PlanPayant | null;
  periodicite: Periodicite | null;
  statut: Enums<"statut_abonnement">;
  periode_fin: string | null;
  annule_en_fin_de_periode: boolean;
  updated_at: string;
};
const COLONNES_ABONNEMENT = "org_id, plan, periodicite, statut, periode_fin, annule_en_fin_de_periode, updated_at";

/** Appelle une fonction ; une erreur du serveur est relancée avec son code (« ABONNEMENT_EXISTE »…), que errors.ts traduit. */
async function appeler<T>(nom: string, corps: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke<T>(nom, { body: corps });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const reponse = (await error.context.json().catch(() => null)) as { erreur?: string } | null;
      throw new Error(reponse?.erreur ?? "INCONNUE");
    }
    throw error;
  }
  return data as T;
}

export const lireEtatPaiement = () => appeler<EtatPaiement>("stripe-checkout", { action: "etat" });
export const souscrire = (plan: PlanPayant, periodicite: Periodicite) =>
  appeler<{ url: string }>("stripe-checkout", { action: "souscrire", plan, periodicite });
export const ouvrirPortail = () => appeler<{ url: string }>("stripe-portal", {});

export const clesPaiement = {
  etat: ["paiement", "etat"] as const,
  abonnement: (orgId: string) => ["paiement", "abonnement", orgId] as const,
};

/**
 * Le paiement en ligne est-il disponible ? Une panne, une fonction non déployée ou une configuration incomplète valent
 * « non » : l'application n'affiche alors rien du paiement en ligne (la facturation manuelle reste proposée).
 */
export function useEtatPaiement(actif: boolean) {
  return useQuery({
    queryKey: clesPaiement.etat,
    enabled: actif,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EtatPaiement> => {
      try {
        return await lireEtatPaiement();
      } catch {
        return { disponible: false };
      }
    },
  });
}

export function useAbonnement(orgId: string, actif: boolean) {
  return useQuery({
    queryKey: clesPaiement.abonnement(orgId),
    enabled: actif,
    queryFn: async (): Promise<Abonnement | null> => {
      const { data, error } = await getSupabase()
        .from("abonnements")
        .select(COLONNES_ABONNEMENT)
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** « 25,00 € » : Stripe donne les montants dans la plus petite unité de la devise (centimes, ou l'unité pour le FCFA). */
export function formaterPrix(montant: number, devise: string): string {
  try {
    const format = new Intl.NumberFormat("fr-FR", { style: "currency", currency: devise });
    const decimales = format.resolvedOptions().maximumFractionDigits ?? 2;
    return format.format(montant / 10 ** decimales);
  } catch {
    return `${montant} ${devise}`;
  }
}

/** Prix annuel ramené au mois, arrondi à l'unité de la devise : « soit 20,00 € par mois ». */
export const montantMensuelDepuisAnnuel = (montantAnnuel: number): number => Math.round(montantAnnuel / 12);

/** Un abonnement en cours : on gère le plan depuis le portail, on ne propose pas d'en souscrire un autre. */
export const abonnementEnCours = (a: Pick<Abonnement, "statut"> | null | undefined): boolean =>
  a?.statut === "active" || a?.statut === "trialing" || a?.statut === "past_due";
