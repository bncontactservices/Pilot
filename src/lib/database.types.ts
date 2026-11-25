// Types de la base, au format de `supabase gen types typescript`.
// À régénérer avec `npm run db:types` dès qu'un Supabase local ou distant est disponible.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Enums_ = {
  agregation_kpi: "cumul" | "dernier" | "moyenne";
  frequence_kpi: "hebdomadaire" | "mensuelle" | "trimestrielle" | "annuelle";
  langue: "fr" | "en";
  plan_choisi: "starter" | "pro";
  plan_org: "essai" | "starter" | "pro" | "enterprise";
  role_membre: "admin" | "editeur" | "lecteur";
  sens_kpi: "croissant" | "decroissant";
  statut_projet: "non_demarre" | "en_cours" | "en_retard" | "suspendu" | "termine" | "cloture";
  type_demande: "demo" | "pilote" | "enterprise";
  statut_travail: "a_faire" | "en_cours" | "termine" | "reporte" | "annule";
  type_noeud: "objectif_global" | "objectif_specifique" | "resultat" | "activite";
  type_etape: "jalon" | "livrable";
  categorie_document: "rapport" | "contrat" | "justificatif" | "autre";
  type_acteur: "bailleur" | "partenaire" | "prestataire" | "autorite_locale" | "autre";
  sexe_beneficiaire: "femme" | "homme" | "non_precise";
  tranche_age: "0_4" | "5_14" | "15_24" | "25_59" | "60_plus" | "non_precise";
  niveau_localite: "region" | "departement" | "arrondissement" | "commune" | "village" | "quartier";
  statut_abonnement:
    "incomplete" | "incomplete_expired" | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "paused";
};

export type Database = {
  public: {
    Tables: {
      secteurs: {
        Row: { id: number; code: string; libelle: string; ordre: number };
        Insert: { code: string; libelle: string; ordre: number };
        Update: { code?: string; libelle?: string; ordre?: number };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          nom: string | null;
          email: string | null;
          telephone: string | null;
          langue: Enums_["langue"];
          created_at: string;
          // Renseignées par la base à l'inscription ; le client ne peut pas les écrire.
          conditions_version: string | null;
          conditions_acceptees_le: string | null;
        };
        Insert: never;
        Update: { nom?: string | null; telephone?: string | null; langue?: Enums_["langue"] };
        Relationships: [];
      };
      organisations: {
        Row: {
          id: string;
          nom: string;
          logo_path: string | null;
          pays: string;
          devise_defaut: string;
          plan: Enums_["plan_org"];
          plan_souhaite: Enums_["plan_choisi"] | null;
          essai_fin: string;
          created_at: string;
        };
        Insert: never;
        Update: { nom?: string; logo_path?: string | null; pays?: string; devise_defaut?: string };
        Relationships: [];
      };
      memberships: {
        Row: { user_id: string; org_id: string; role: Enums_["role_membre"]; created_at: string };
        Insert: never;
        Update: { role?: Enums_["role_membre"] };
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          id: string;
          org_id: string;
          email: string;
          role: Enums_["role_membre"];
          expires_at: string;
          accepted_at: string | null;
          invited_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "invitations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          org_id: string;
          nom: string;
          description: string | null;
          date_debut: string;
          date_fin: string;
          budget: number | null;
          devise: string;
          statut: Enums_["statut_projet"];
          secteur_id: number | null;
          is_demo: boolean;
          programme_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          nom: string;
          description?: string | null;
          date_debut: string;
          date_fin: string;
          budget?: number | null;
          devise?: string;
          statut?: Enums_["statut_projet"];
          secteur_id?: number | null;
          programme_id?: string | null;
        };
        Update: {
          nom?: string;
          description?: string | null;
          date_debut?: string;
          date_fin?: string;
          budget?: number | null;
          devise?: string;
          statut?: Enums_["statut_projet"];
          secteur_id?: number | null;
          programme_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_secteur_id_fkey";
            columns: ["secteur_id"];
            isOneToOne: false;
            referencedRelation: "secteurs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_programme_id_fkey";
            columns: ["programme_id"];
            isOneToOne: false;
            referencedRelation: "programmes";
            referencedColumns: ["id"];
          },
        ];
      };
      kpis: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          nom: string;
          description: string | null;
          unite: string;
          cible: number;
          valeur_base: number;
          frequence: Enums_["frequence_kpi"];
          sens: Enums_["sens_kpi"];
          type_agregation: Enums_["agregation_kpi"];
          ordre: number;
          epingle: boolean;
          noeud_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          nom: string;
          description?: string | null;
          unite?: string;
          cible: number;
          valeur_base?: number;
          frequence?: Enums_["frequence_kpi"];
          sens?: Enums_["sens_kpi"];
          type_agregation?: Enums_["agregation_kpi"];
          ordre?: number;
          epingle?: boolean;
          noeud_id?: string | null;
        };
        Update: {
          nom?: string;
          description?: string | null;
          unite?: string;
          cible?: number;
          valeur_base?: number;
          frequence?: Enums_["frequence_kpi"];
          sens?: Enums_["sens_kpi"];
          type_agregation?: Enums_["agregation_kpi"];
          ordre?: number;
          epingle?: boolean;
          noeud_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "kpis_noeud_id_fkey";
            columns: ["noeud_id"];
            isOneToOne: false;
            referencedRelation: "cadre_logique_noeuds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kpis_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      kpi_entries: {
        Row: {
          id: string;
          kpi_id: string;
          org_id: string;
          date: string;
          valeur: number;
          commentaire: string | null;
          localite_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          kpi_id: string;
          date: string;
          valeur: number;
          commentaire?: string | null;
          localite_id?: string | null;
        };
        Update: { date?: string; valeur?: number; commentaire?: string | null; localite_id?: string | null };
        Relationships: [
          {
            foreignKeyName: "kpi_entries_kpi_id_fkey";
            columns: ["kpi_id"];
            isOneToOne: false;
            referencedRelation: "kpis";
            referencedColumns: ["id"];
          },
        ];
      };
      programmes: {
        Row: {
          id: string;
          org_id: string;
          nom: string;
          description: string | null;
          date_debut: string | null;
          date_fin: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          nom: string;
          description?: string | null;
          date_debut?: string | null;
          date_fin?: string | null;
        };
        Update: { nom?: string; description?: string | null; date_debut?: string | null; date_fin?: string | null };
        Relationships: [];
      };
      parametres_se: {
        Row: {
          org_id: string;
          seuil_vert: number;
          seuil_ambre: number;
          frequence_defaut: Enums_["frequence_kpi"];
          unites_perso: string[];
          mois_debut_annee_fiscale: number;
          updated_at: string;
        };
        Insert: never;
        Update: {
          seuil_vert?: number;
          seuil_ambre?: number;
          frequence_defaut?: Enums_["frequence_kpi"];
          unites_perso?: string[];
          mois_debut_annee_fiscale?: number;
        };
        Relationships: [];
      };
      phases: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          nom: string;
          description: string | null;
          date_debut: string | null;
          date_fin: string | null;
          ordre: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          nom: string;
          description?: string | null;
          date_debut?: string | null;
          date_fin?: string | null;
          ordre?: number;
        };
        Update: {
          nom?: string;
          description?: string | null;
          date_debut?: string | null;
          date_fin?: string | null;
          ordre?: number;
        };
        Relationships: [
          {
            foreignKeyName: "phases_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      etapes: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          phase_id: string | null;
          nom: string;
          description: string | null;
          type: Enums_["type_etape"];
          date_prevue: string;
          date_reelle: string | null;
          statut: Enums_["statut_travail"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          phase_id?: string | null;
          nom: string;
          description?: string | null;
          type?: Enums_["type_etape"];
          date_prevue: string;
          date_reelle?: string | null;
          statut?: Enums_["statut_travail"];
        };
        Update: {
          phase_id?: string | null;
          nom?: string;
          description?: string | null;
          type?: Enums_["type_etape"];
          date_prevue?: string;
          date_reelle?: string | null;
          statut?: Enums_["statut_travail"];
        };
        Relationships: [
          {
            foreignKeyName: "etapes_phase_id_fkey";
            columns: ["phase_id"];
            isOneToOne: false;
            referencedRelation: "phases";
            referencedColumns: ["id"];
          },
        ];
      };
      cadre_logique_noeuds: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          type: Enums_["type_noeud"];
          parent_id: string | null;
          code: string;
          libelle: string;
          moyens_verification: string | null;
          hypotheses: string | null;
          ordre: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          type: Enums_["type_noeud"];
          parent_id?: string | null;
          libelle: string;
          moyens_verification?: string | null;
          hypotheses?: string | null;
          ordre?: number;
        };
        Update: {
          parent_id?: string | null;
          libelle?: string;
          moyens_verification?: string | null;
          hypotheses?: string | null;
          ordre?: number;
        };
        Relationships: [];
      };
      pta_activites: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          annee: number;
          trimestre: number | null;
          date_debut: string | null;
          date_fin: string | null;
          intitule: string;
          description: string | null;
          responsable: string | null;
          budget_prevu: number | null;
          statut: Enums_["statut_travail"];
          pct_realisation: number;
          noeud_id: string | null;
          phase_id: string | null;
          composante_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          annee: number;
          trimestre?: number | null;
          date_debut?: string | null;
          date_fin?: string | null;
          intitule: string;
          description?: string | null;
          responsable?: string | null;
          budget_prevu?: number | null;
          statut?: Enums_["statut_travail"];
          pct_realisation?: number;
          noeud_id?: string | null;
          phase_id?: string | null;
          composante_id?: string | null;
        };
        Update: {
          annee?: number;
          trimestre?: number | null;
          date_debut?: string | null;
          date_fin?: string | null;
          intitule?: string;
          description?: string | null;
          responsable?: string | null;
          budget_prevu?: number | null;
          statut?: Enums_["statut_travail"];
          pct_realisation?: number;
          noeud_id?: string | null;
          phase_id?: string | null;
          composante_id?: string | null;
        };
        Relationships: [];
      };
      etats_avancement: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          titre: string;
          periode_debut: string;
          periode_fin: string;
          faits_marquants: string | null;
          difficultes: string | null;
          risques: string | null;
          taux_resultats: number | null;
          taux_physique: number | null;
          taux_financier: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          titre: string;
          periode_debut: string;
          periode_fin: string;
          faits_marquants?: string | null;
          difficultes?: string | null;
          risques?: string | null;
        };
        Update: {
          titre?: string;
          periode_debut?: string;
          periode_fin?: string;
          faits_marquants?: string | null;
          difficultes?: string | null;
          risques?: string | null;
        };
        Relationships: [];
      };
      acteurs: {
        Row: {
          id: string;
          org_id: string;
          nom: string;
          type: Enums_["type_acteur"];
          description: string | null;
          contact: string | null;
          email: string | null;
          telephone: string | null;
          notes: string | null;
          exemple: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          nom: string;
          type: Enums_["type_acteur"];
          description?: string | null;
          contact?: string | null;
          email?: string | null;
          telephone?: string | null;
          notes?: string | null;
        };
        Update: {
          nom?: string;
          type?: Enums_["type_acteur"];
          description?: string | null;
          contact?: string | null;
          email?: string | null;
          telephone?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      projet_acteurs: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          acteur_id: string;
          role: string;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { project_id: string; acteur_id: string; role: string; notes?: string | null };
        Update: { role?: string; notes?: string | null };
        Relationships: [];
      };
      localites: {
        Row: {
          id: string;
          /** Nul : référentiel de la plateforme (lecture seule). Renseigné : localité de l'organisation. */
          org_id: string | null;
          parent_id: string | null;
          niveau: Enums_["niveau_localite"];
          nom: string;
          latitude: number | null;
          longitude: number | null;
          source: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          parent_id?: string | null;
          niveau: Enums_["niveau_localite"];
          nom: string;
          latitude?: number | null;
          longitude?: number | null;
          source?: string | null;
        };
        Update: { nom?: string; latitude?: number | null; longitude?: number | null; source?: string | null };
        Relationships: [];
      };
      /**
       * Abonnement Stripe de l'organisation, lisible par ses admins seulement. Le client ne lit ni l'identifiant du client
       * Stripe ni celui de l'abonnement (droits par colonne) et n'écrit rien : on sélectionne les colonnes une à une.
       */
      abonnements: {
        Row: {
          org_id: string;
          plan: Enums_["plan_choisi"] | null;
          periodicite: "mensuelle" | "annuelle" | null;
          statut: Enums_["statut_abonnement"];
          periode_fin: string | null;
          annule_en_fin_de_periode: boolean;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      projet_localites: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          localite_id: string;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { project_id: string; localite_id: string; notes?: string | null };
        Update: { notes?: string | null };
        Relationships: [];
      };
      beneficiaires_effectifs: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          periode_debut: string;
          periode_fin: string;
          categorie: string;
          sexe: Enums_["sexe_beneficiaire"];
          tranche_age: Enums_["tranche_age"];
          effectif: number;
          lieu: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          periode_debut: string;
          periode_fin: string;
          categorie: string;
          sexe?: Enums_["sexe_beneficiaire"];
          tranche_age?: Enums_["tranche_age"];
          effectif: number;
          lieu?: string | null;
        };
        Update: {
          periode_debut?: string;
          periode_fin?: string;
          categorie?: string;
          sexe?: Enums_["sexe_beneficiaire"];
          tranche_age?: Enums_["tranche_age"];
          effectif?: number;
          lieu?: string | null;
        };
        Relationships: [];
      };
      composantes: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          nom: string;
          description: string | null;
          responsable: string | null;
          date_debut: string | null;
          date_fin: string | null;
          statut: Enums_["statut_travail"];
          ordre: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          nom: string;
          description?: string | null;
          responsable?: string | null;
          date_debut?: string | null;
          date_fin?: string | null;
          statut?: Enums_["statut_travail"];
          ordre?: number;
        };
        Update: {
          nom?: string;
          description?: string | null;
          responsable?: string | null;
          date_debut?: string | null;
          date_fin?: string | null;
          statut?: Enums_["statut_travail"];
          ordre?: number;
        };
        Relationships: [];
      };
      budget_lignes: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          annee: number;
          poste: string;
          montant_prevu: number;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          annee: number;
          poste: string;
          montant_prevu: number;
          notes?: string | null;
        };
        Update: { annee?: number; poste?: string; montant_prevu?: number; notes?: string | null };
        Relationships: [];
      };
      depenses: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          budget_ligne_id: string;
          date: string;
          libelle: string;
          montant: number;
          fournisseur: string | null;
          reference: string | null;
          document_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          budget_ligne_id: string;
          date: string;
          libelle: string;
          montant: number;
          fournisseur?: string | null;
          reference?: string | null;
          document_id?: string | null;
        };
        Update: {
          budget_ligne_id?: string;
          date?: string;
          libelle?: string;
          montant?: number;
          fournisseur?: string | null;
          reference?: string | null;
          document_id?: string | null;
        };
        Relationships: [];
      };
      realisations: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          date: string;
          titre: string;
          description: string | null;
          quantite: number | null;
          unite: string | null;
          lieu: string | null;
          noeud_id: string | null;
          pta_activite_id: string | null;
          localite_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          date: string;
          titre: string;
          description?: string | null;
          quantite?: number | null;
          unite?: string | null;
          lieu?: string | null;
          noeud_id?: string | null;
          pta_activite_id?: string | null;
          localite_id?: string | null;
        };
        Update: {
          date?: string;
          titre?: string;
          description?: string | null;
          quantite?: number | null;
          unite?: string | null;
          lieu?: string | null;
          noeud_id?: string | null;
          pta_activite_id?: string | null;
          localite_id?: string | null;
        };
        Relationships: [];
      };
      prochaines_etapes: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          libelle: string;
          responsable: string | null;
          echeance: string | null;
          statut: Enums_["statut_travail"];
          kpi_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          libelle: string;
          responsable?: string | null;
          echeance?: string | null;
          statut?: Enums_["statut_travail"];
          kpi_id?: string | null;
        };
        Update: {
          libelle?: string;
          responsable?: string | null;
          echeance?: string | null;
          statut?: Enums_["statut_travail"];
          kpi_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "prochaines_etapes_kpi_id_fkey";
            columns: ["kpi_id"];
            isOneToOne: false;
            referencedRelation: "kpis";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          nom: string;
          categorie: Enums_["categorie_document"];
          description: string | null;
          storage_path: string;
          mime_type: string | null;
          taille_octets: number | null;
          realisation_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          nom: string;
          categorie?: Enums_["categorie_document"];
          description?: string | null;
          storage_path: string;
          mime_type?: string | null;
          taille_octets?: number | null;
          realisation_id?: string | null;
        };
        Update: {
          nom?: string;
          categorie?: Enums_["categorie_document"];
          description?: string | null;
          realisation_id?: string | null;
        };
        Relationships: [];
      };
      projet_etiquettes: {
        Row: { project_id: string; org_id: string; etiquette: string; created_at: string };
        Insert: { project_id: string; etiquette: string };
        Update: never;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          org_id: string;
          table_name: string;
          row_id: string;
          action: "INSERT" | "UPDATE" | "DELETE";
          ancien: Json | null;
          nouveau: Json | null;
          user_id: string | null;
          at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      v_kpi_atteinte: {
        Row: { kpi_id: string; project_id: string; org_id: string; valeur: number | null; pct_atteinte: number | null };
        Relationships: [];
      };
      v_avancement: {
        Row: {
          project_id: string;
          org_id: string;
          programme_id: string | null;
          nb_kpis: number;
          nb_kpis_avec_donnees: number;
          taux_resultats: number | null;
          fraction_ecoulee: number | null;
          statut_resultats: "ok" | "warn" | "alert" | "none";
          nb_activites: number;
          nb_activites_realisees: number;
          taux_physique: number | null;
          nb_etapes: number;
          nb_etapes_terminees: number;
          nb_etapes_en_retard: number;
          budget_total: number | null;
          depenses_total: number | null;
          taux_financier: number | null;
        };
        Relationships: [];
      };
      v_avancement_programme: {
        Row: {
          programme_id: string;
          org_id: string;
          nb_projets: number;
          nb_projets_avec_resultats: number;
          taux_resultats: number | null;
          nb_projets_avec_pta: number;
          taux_physique: number | null;
          nb_projets_avec_budget: number;
          taux_financier: number | null;
          nb_projets_depassement: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      charger_projet_exemple: { Args: Record<PropertyKey, never>; Returns: string };
      fichiers_a_retirer: { Args: Record<PropertyKey, never>; Returns: string[] };
      fichiers_retires: { Args: { p_chemins: string[] }; Returns: number };
      importer_saisies: {
        Args: { p_lignes: Json; p_remplacer?: boolean };
        Returns: { inserees: number; remplacees: number; ignorees: number }[];
      };
      invitation_apercu: {
        Args: { p_jeton: string };
        Returns: { organisation: string; email_masque: string }[];
      };
    };
    Enums: Enums_;
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
/** Ligne d'une vue (vues d'avancement du Lot 2). */
export type Vues<T extends keyof Database["public"]["Views"]> = Database["public"]["Views"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
