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
export type LigneBudgetProjet = Tables<"budget_lignes">;
export type DepenseProjet = Tables<"depenses">;
export type ComposanteProjet = Tables<"composantes">;
export type Acteur = Tables<"acteurs">;
export type RoleActeur = Tables<"projet_acteurs">;
export type EffectifBeneficiaires = Tables<"beneficiaires_effectifs">;
export type Localite = Tables<"localites">;
export type ZoneProjet = Tables<"projet_localites">;

export const clesSe = {
  noeuds: (projetId: string) => ["noeuds", projetId] as const,
  phases: (projetId: string) => ["phases", projetId] as const,
  etapes: (projetId: string) => ["etapes", projetId] as const,
  pta: (projetId: string) => ["pta", projetId] as const,
  etats: (projetId: string) => ["etats-avancement", projetId] as const,
  realisations: (projetId: string) => ["realisations", projetId] as const,
  prochaines: (projetId: string) => ["prochaines-etapes", projetId] as const,
  documents: (projetId: string) => ["documents", projetId] as const,
  budget: (projetId: string) => ["budget-lignes", projetId] as const,
  composantes: (projetId: string) => ["composantes", projetId] as const,
  acteurs: (orgId: string) => ["acteurs", orgId] as const,
  rolesActeurs: (orgId: string) => ["roles-acteurs", orgId] as const,
  effectifs: (projetId: string) => ["effectifs", projetId] as const,
  localites: (orgId: string) => ["localites", orgId] as const,
  zones: (projetId: string) => ["zones", projetId] as const,
  projetsNoms: (orgId: string) => ["projets-noms", orgId] as const,
  depenses: (projetId: string) => ["depenses", projetId] as const,
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

/** Annuaire d'acteurs de l'organisation. */
export function useActeurs(orgId: string) {
  return useQuery({
    queryKey: clesSe.acteurs(orgId),
    queryFn: async (): Promise<Acteur[]> => {
      const { data, error } = await getSupabase().from("acteurs").select("*").eq("org_id", orgId).order("nom");
      if (error) throw error;
      return data;
    },
  });
}

/** Rôles des acteurs dans les projets de l'organisation (tous projets) : sert à l'annuaire et à la page d'un projet. */
export function useRolesActeurs(orgId: string) {
  return useQuery({
    queryKey: clesSe.rolesActeurs(orgId),
    queryFn: async (): Promise<RoleActeur[]> => {
      const { data, error } = await getSupabase()
        .from("projet_acteurs")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Localités visibles : le référentiel de la plateforme (org_id nul) et celles de l'organisation. La base ne renvoie
 * que celles-là ; l'identifiant de l'organisation sert à séparer les caches entre organisations.
 */
export function useLocalites(orgId: string) {
  return useQuery({
    queryKey: clesSe.localites(orgId),
    queryFn: async (): Promise<Localite[]> => {
      const { data, error } = await getSupabase().from("localites").select("*").order("nom");
      if (error) throw error;
      return data;
    },
  });
}

/** Zones d'intervention d'un projet : les localités où il agit. */
export function useZonesProjet(projetId: string) {
  return useQuery({
    queryKey: clesSe.zones(projetId),
    queryFn: async (): Promise<ZoneProjet[]> => {
      const { data, error } = await getSupabase()
        .from("projet_localites")
        .select("*")
        .eq("project_id", projetId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

/** Noms des projets de l'organisation : pour dire dans quels projets intervient un acteur. */
export function useProjetsNoms(orgId: string) {
  return useQuery({
    queryKey: clesSe.projetsNoms(orgId),
    queryFn: async (): Promise<{ id: string; nom: string }[]> => {
      const { data, error } = await getSupabase().from("projects").select("id, nom").eq("org_id", orgId).order("nom");
      if (error) throw error;
      return data;
    },
  });
}

export function useEffectifsBeneficiaires(projetId: string) {
  return useQuery({
    queryKey: clesSe.effectifs(projetId),
    queryFn: async (): Promise<EffectifBeneficiaires[]> => {
      const { data, error } = await getSupabase()
        .from("beneficiaires_effectifs")
        .select("*")
        .eq("project_id", projetId)
        .order("periode_fin", { ascending: false })
        .order("categorie");
      if (error) throw error;
      return data;
    },
  });
}

export function useComposantes(projetId: string) {
  return useQuery({
    queryKey: clesSe.composantes(projetId),
    queryFn: async (): Promise<ComposanteProjet[]> => {
      const { data, error } = await getSupabase()
        .from("composantes")
        .select("*")
        .eq("project_id", projetId)
        .order("ordre")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useBudgetLignes(projetId: string) {
  return useQuery({
    queryKey: clesSe.budget(projetId),
    queryFn: async (): Promise<LigneBudgetProjet[]> => {
      const { data, error } = await getSupabase()
        .from("budget_lignes")
        .select("*")
        .eq("project_id", projetId)
        .order("annee", { ascending: false })
        .order("poste");
      if (error) throw error;
      return data;
    },
  });
}

export function useDepenses(projetId: string) {
  return useQuery({
    queryKey: clesSe.depenses(projetId),
    queryFn: async (): Promise<DepenseProjet[]> => {
      const { data, error } = await getSupabase()
        .from("depenses")
        .select("*")
        .eq("project_id", projetId)
        .order("date", { ascending: false })
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

/** Les taux d'avancement (vues SQL) dépendent du PTA, des étapes et du budget : à rafraîchir après chaque écriture qui les touche. */
export function invaliderAvancement(queryClient: QueryClient, orgId: string) {
  void queryClient.invalidateQueries({ queryKey: cles.avancements(orgId) });
  void queryClient.invalidateQueries({ queryKey: cles.avancementsProgrammes(orgId) });
}
