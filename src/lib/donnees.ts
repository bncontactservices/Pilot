// Accès aux données du suivi : requêtes, clés de cache, temps réel.
// Les calculs sont dans kpi.ts ; ici on ne fait que lire et mettre en cache.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { Tables, Vues } from "./database.types";
import { aujourdhuiIso, type EvaluationProjet, evaluerProjet, SEUILS_PAR_DEFAUT, type Seuils } from "./kpi";
import { getSupabase } from "./supabase";

export type Kpi = Tables<"kpis">;
export type SaisieLigne = Pick<
  Tables<"kpi_entries">,
  "id" | "kpi_id" | "date" | "valeur" | "commentaire" | "created_at" | "updated_at"
>;
export type Projet = Tables<"projects"> & { secteur: { libelle: string } | null };
export type Programme = Tables<"programmes">;
export type ParametresSe = Tables<"parametres_se">;
export type Avancement = Vues<"v_avancement">;
export type AvancementProgramme = Vues<"v_avancement_programme">;
type KpiOrg = Pick<
  Tables<"kpis">,
  "id" | "project_id" | "cible" | "valeur_base" | "sens" | "type_agregation" | "frequence"
>;
type SaisieOrg = Pick<Tables<"kpi_entries">, "kpi_id" | "date" | "valeur">;

export const cles = {
  projets: (orgId: string) => ["projets", orgId] as const,
  projet: (projetId: string) => ["projet", projetId] as const,
  kpis: (projetId: string) => ["kpis", projetId] as const,
  saisies: (projetId: string) => ["saisies", projetId] as const,
  orgKpis: (orgId: string) => ["org-kpis", orgId] as const,
  orgSaisies: (orgId: string) => ["org-saisies", orgId] as const,
  parametresSe: (orgId: string) => ["parametres-se", orgId] as const,
  programmes: (orgId: string) => ["programmes", orgId] as const,
  avancements: (orgId: string) => ["avancements", orgId] as const,
  avancementsProgrammes: (orgId: string) => ["avancements-programmes", orgId] as const,
};

// PostgREST plafonne chaque réponse (1 000 lignes par défaut) : on lit page par page.
const TAILLE_PAGE = 1000;

async function toutesLesPages<T>(
  requete: (debut: number, fin: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const lignes: T[] = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const { data, error } = await requete(debut, debut + TAILLE_PAGE - 1);
    if (error) throw error;
    lignes.push(...(data ?? []));
    if (!data || data.length < TAILLE_PAGE) return lignes;
  }
}

async function chargerProjet(projetId: string): Promise<Projet | null> {
  const { data, error } = await getSupabase()
    .from("projects")
    .select("*, secteur:secteurs(libelle)")
    .eq("id", projetId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function chargerKpis(projetId: string): Promise<Kpi[]> {
  const { data, error } = await getSupabase()
    .from("kpis")
    .select("*")
    .eq("project_id", projetId)
    .order("ordre")
    .order("created_at");
  if (error) throw error;
  return data;
}

async function chargerSaisies(projetId: string): Promise<SaisieLigne[]> {
  const lignes = await toutesLesPages((debut, fin) =>
    getSupabase()
      .from("kpi_entries")
      .select("id, kpi_id, date, valeur, commentaire, created_at, updated_at, kpis!inner(project_id)")
      .eq("kpis.project_id", projetId)
      .order("date")
      .order("id")
      .range(debut, fin),
  );
  return lignes.map(({ kpis: _projet, ...saisie }) => saisie);
}

export function useProjet(projetId: string) {
  return useQuery({ queryKey: cles.projet(projetId), queryFn: () => chargerProjet(projetId) });
}

export function useKpis(projetId: string) {
  return useQuery({ queryKey: cles.kpis(projetId), queryFn: () => chargerKpis(projetId) });
}

export function useSaisies(projetId: string) {
  return useQuery({ queryKey: cles.saisies(projetId), queryFn: () => chargerSaisies(projetId) });
}

type ProjetPourListe = { id: string; date_debut: string; date_fin: string };

/** Évaluation de chaque projet de l'organisation (jauge segmentée de la liste des projets). */
export function useEvaluationsProjets(orgId: string, projets: ProjetPourListe[] | undefined) {
  const seuils = useSeuils(orgId);
  const kpis = useQuery({
    queryKey: cles.orgKpis(orgId),
    enabled: Boolean(projets?.length),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("kpis")
        .select("id, project_id, cible, valeur_base, sens, type_agregation, frequence")
        .order("ordre");
      if (error) throw error;
      return data as KpiOrg[];
    },
  });
  const saisies = useQuery({
    queryKey: cles.orgSaisies(orgId),
    enabled: Boolean(projets?.length),
    queryFn: () =>
      toutesLesPages<SaisieOrg>((debut, fin) =>
        getSupabase().from("kpi_entries").select("kpi_id, date, valeur").order("date").order("id").range(debut, fin),
      ),
  });

  const evaluations = useMemo(() => {
    const resultat = new Map<string, EvaluationProjet>();
    if (!projets || !kpis.data || !saisies.data) return resultat;
    const aujourdhui = aujourdhuiIso();
    for (const projet of projets) {
      const kpisProjet = kpis.data.filter((k) => k.project_id === projet.id);
      const ids = new Set(kpisProjet.map((k) => k.id));
      const saisiesProjet = saisies.data.filter((s) => ids.has(s.kpi_id));
      resultat.set(
        projet.id,
        evaluerProjet(kpisProjet, saisiesProjet, {
          projet,
          periode: { debut: null, fin: aujourdhui },
          aujourdhui,
          seuils,
        }),
      );
    }
    return resultat;
  }, [projets, kpis.data, saisies.data, seuils]);

  return { evaluations, chargement: kpis.isPending || saisies.isPending, erreur: kpis.error ?? saisies.error };
}

/**
 * Abonnement aux saisies de l'organisation : toute saisie (de cet appareil ou d'un autre) rafraîchit
 * les calculs. Les rafales (import de fichier) sont regroupées en un seul rafraîchissement.
 */
export function useSaisiesTempsReel(orgId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const supabase = getSupabase();
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const rafraichir = () => {
      clearTimeout(minuterie);
      minuterie = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["saisies"] });
        void queryClient.invalidateQueries({ queryKey: cles.orgSaisies(orgId) });
        // Les taux consolidés (vues SQL) dépendent aussi des saisies.
        void queryClient.invalidateQueries({ queryKey: cles.avancements(orgId) });
        void queryClient.invalidateQueries({ queryKey: cles.avancementsProgrammes(orgId) });
      }, 300);
    };
    const canal = supabase
      .channel(`saisies-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kpi_entries", filter: `org_id=eq.${orgId}` },
        rafraichir,
      )
      .subscribe();
    return () => {
      clearTimeout(minuterie);
      void supabase.removeChannel(canal);
    };
  }, [orgId, queryClient]);
}

// -----------------------------------------------------------------------------
// Paramètres S&E, programmes, taux d'avancement (Lot 2)
// -----------------------------------------------------------------------------

export function useParametresSe(orgId: string) {
  return useQuery({
    queryKey: cles.parametresSe(orgId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase().from("parametres_se").select("*").eq("org_id", orgId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Seuils vert/ambre de l'organisation ; les valeurs par défaut (90 / 60) tant qu'ils ne sont pas chargés. */
export function useSeuils(orgId: string): Seuils {
  const { data } = useParametresSe(orgId);
  const vert = data ? Number(data.seuil_vert) : null;
  const ambre = data ? Number(data.seuil_ambre) : null;
  return useMemo(() => (vert === null || ambre === null ? SEUILS_PAR_DEFAUT : { vert, ambre }), [vert, ambre]);
}

export function useProgrammes(orgId: string) {
  return useQuery({
    queryKey: cles.programmes(orgId),
    queryFn: async () => {
      const { data, error } = await getSupabase().from("programmes").select("*").eq("org_id", orgId).order("nom");
      if (error) throw error;
      return data;
    },
  });
}

/** Taux d'avancement (vue v_avancement) de chaque projet de l'organisation, par identifiant de projet. */
export function useAvancements(orgId: string) {
  return useQuery({
    queryKey: cles.avancements(orgId),
    queryFn: async () => {
      const { data, error } = await getSupabase().from("v_avancement").select("*").eq("org_id", orgId);
      if (error) throw error;
      return new Map(data.map((ligne) => [ligne.project_id, ligne]));
    },
  });
}

export function useAvancementsProgrammes(orgId: string) {
  return useQuery({
    queryKey: cles.avancementsProgrammes(orgId),
    queryFn: async () => {
      const { data, error } = await getSupabase().from("v_avancement_programme").select("*").eq("org_id", orgId);
      if (error) throw error;
      return new Map(data.map((ligne) => [ligne.programme_id, ligne]));
    },
  });
}
