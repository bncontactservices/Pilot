// Accès aux données du cœur S&E (Lot 2b) : cadre logique, phases, étapes, plan de travail annuel.
// Les calculs sont dans cadre-logique.ts, pta.ts et avancement.ts ; ici on lit et on met en cache.

import { type QueryClient, useQuery } from "@tanstack/react-query";
import type { Noeud } from "./cadre-logique";
import type { Tables } from "./database.types";
import { cles } from "./donnees";
import { getSupabase } from "./supabase";

export type Phase = Tables<"phases">;
export type Etape = Tables<"etapes">;
export type ActivitePta = Tables<"pta_activites">;
export type EtatAvancement = Tables<"etats_avancement">;
export type Realisation = Tables<"realisations">;
export type ProchaineEtape = Tables<"prochaines_etapes">;
export type DocumentProjet = Tables<"documents">;

export const clesSe = {
  noeuds: (projetId: string) => ["noeuds", projetId] as const,
  phases: (projetId: string) => ["phases", projetId] as const,
  etapes: (projetId: string) => ["etapes", projetId] as const,
  pta: (projetId: string) => ["pta", projetId] as const,
  etats: (projetId: string) => ["etats-avancement", projetId] as const,
  realisations: (projetId: string) => ["realisations", projetId] as const,
  prochaines: (projetId: string) => ["prochaines-etapes", projetId] as const,
  documents: (projetId: string) => ["documents", projetId] as const,
  etiquettes: (projetId: string) => ["etiquettes", projetId] as const,
  etiquettesOrg: (orgId: string) => ["etiquettes-org", orgId] as const,
  membres: (orgId: string) => ["membres-noms", orgId] as const,
};

export function useNoeuds(projetId: string) {
  return useQuery({
    queryKey: clesSe.noeuds(projetId),
    queryFn: async (): Promise<Noeud[]> => {
      const { data, error } = await getSupabase()
        .from("cadre_logique_noeuds")
        .select("id, type, parent_id, code, libelle, moyens_verification, hypotheses, ordre, created_at")
        .eq("project_id", projetId)
        .order("ordre")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function usePhases(projetId: string) {
  return useQuery({
    queryKey: clesSe.phases(projetId),
    queryFn: async (): Promise<Phase[]> => {
      const { data, error } = await getSupabase()
        .from("phases")
        .select("*")
        .eq("project_id", projetId)
        .order("ordre")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useEtapes(projetId: string) {
  return useQuery({
    queryKey: clesSe.etapes(projetId),
    queryFn: async (): Promise<Etape[]> => {
      const { data, error } = await getSupabase()
        .from("etapes")
        .select("*")
        .eq("project_id", projetId)
        .order("date_prevue")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function usePta(projetId: string) {
  return useQuery({
    queryKey: clesSe.pta(projetId),
    queryFn: async (): Promise<ActivitePta[]> => {
      const { data, error } = await getSupabase()
        .from("pta_activites")
        .select("*")
        .eq("project_id", projetId)
        .order("annee")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useEtats(projetId: string) {
  return useQuery({
    queryKey: clesSe.etats(projetId),
    queryFn: async (): Promise<EtatAvancement[]> => {
      const { data, error } = await getSupabase()
        .from("etats_avancement")
        .select("*")
        .eq("project_id", projetId)
        .order("periode_fin", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useRealisations(projetId: string) {
  return useQuery({
    queryKey: clesSe.realisations(projetId),
    queryFn: async (): Promise<Realisation[]> => {
      const { data, error } = await getSupabase()
        .from("realisations")
        .select("*")
        .eq("project_id", projetId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useProchainesEtapes(projetId: string) {
  return useQuery({
    queryKey: clesSe.prochaines(projetId),
    queryFn: async (): Promise<ProchaineEtape[]> => {
      const { data, error } = await getSupabase()
        .from("prochaines_etapes")
        .select("*")
        .eq("project_id", projetId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useDocuments(projetId: string) {
  return useQuery({
    queryKey: clesSe.documents(projetId),
    queryFn: async (): Promise<DocumentProjet[]> => {
      const { data, error } = await getSupabase()
        .from("documents")
        .select("*")
        .eq("project_id", projetId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useEtiquettes(projetId: string) {
  return useQuery({
    queryKey: clesSe.etiquettes(projetId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await getSupabase()
        .from("projet_etiquettes")
        .select("etiquette")
        .eq("project_id", projetId)
        .order("etiquette");
      if (error) throw error;
      return data.map((l) => l.etiquette);
    },
  });
}

/** Étiquettes de tous les projets de l'organisation : filtre de la liste des projets et suggestions. */
export function useEtiquettesOrg(orgId: string) {
  return useQuery({
    queryKey: clesSe.etiquettesOrg(orgId),
    queryFn: async (): Promise<{ project_id: string; etiquette: string }[]> => {
      const { data, error } = await getSupabase()
        .from("projet_etiquettes")
        .select("project_id, etiquette")
        .eq("org_id", orgId)
        .order("etiquette");
      if (error) throw error;
      return data;
    },
  });
}

/** Noms des membres de l'organisation : suggestions pour un champ « responsable » (texte libre). */
export function useNomsMembres(orgId: string) {
  return useQuery({
    queryKey: clesSe.membres(orgId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase().from("profiles").select("nom, email");
      if (error) throw error;
      return data;
    },
  });
}

/** Les taux d'avancement (vues SQL) dépendent du PTA et des étapes : à rafraîchir après chaque écriture qui les touche. */
export function invaliderAvancement(queryClient: QueryClient, orgId: string) {
  void queryClient.invalidateQueries({ queryKey: cles.avancements(orgId) });
  void queryClient.invalidateQueries({ queryKey: cles.avancementsProgrammes(orgId) });
}
