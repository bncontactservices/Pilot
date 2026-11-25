-- =============================================================================
-- Pilot M&E — Migration Lot 2 : cœur du suivi-évaluation
-- Programmes, paramètres S&E, phases, étapes, plan de travail annuel (PTA), cadre logique,
-- états d'avancement, réalisations, prochaines étapes, documents, étiquettes, et les vues
-- d'avancement (v_kpi_atteinte, v_avancement, v_avancement_programme).
--
-- Mêmes règles que le Lot 1 : RLS sur toutes les tables, org_id dérivé du projet et immuable,
-- droits par colonne, écriture refusée après la fin d'essai (ESSAI_EXPIRE), schéma `private`
-- pour les fonctions d'aide.
--
-- Erreurs typées nouvelles (SQLSTATE P0001, message = code), traduites par src/lib/errors.ts :
--   CADRE_PARENT_INVALIDE | RATTACHEMENT_INVALIDE | PROGRAMME_INTROUVABLE
--   ETIQUETTES_MAX | DOCUMENT_CHEMIN_INVALIDE
--
-- Projet exemple : les nouvelles tables y sont librement modifiables (comme les saisies) ;
-- la fonction charger_projet_exemple() les remplit et les projets exemples déjà chargés
-- reçoivent le même contenu à l'application de cette migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Types énumérés
-- -----------------------------------------------------------------------------
create type public.statut_travail as enum ('a_faire', 'en_cours', 'termine', 'reporte', 'annule');
create type public.type_noeud as enum ('objectif_global', 'objectif_specifique', 'resultat', 'activite');
create type public.type_etape as enum ('jalon', 'livrable');
create type public.categorie_document as enum ('rapport', 'contrat', 'justificatif', 'autre');

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.programmes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 160),
  description text check (char_length(description) <= 4000),
  date_debut date,
  date_fin date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programmes_dates_coherentes check (date_debut is null or date_fin is null or date_fin >= date_debut)
);
create index programmes_org_id_idx on public.programmes (org_id);

alter table public.projects
  add column programme_id uuid references public.programmes (id) on delete set null;
create index projects_programme_id_idx on public.projects (programme_id);

-- Une seule ligne par organisation, créée avec l'organisation (voir déclencheur plus bas).
create function private.unites_valides(p_unites text[])
returns boolean language sql immutable set search_path = ''
as $$ select coalesce(bool_and(char_length(u) between 1 and 40), true) from unnest(p_unites) as u $$;

create table public.parametres_se (
  org_id uuid primary key references public.organisations (id) on delete cascade,
  seuil_vert numeric(5, 2) not null default 90,
  seuil_ambre numeric(5, 2) not null default 60,
  frequence_defaut public.frequence_kpi not null default 'mensuelle',
  unites_perso text[] not null default '{}',
  mois_debut_annee_fiscale smallint not null default 1 check (mois_debut_annee_fiscale between 1 and 12),
  updated_at timestamptz not null default now(),
  constraint parametres_se_seuils check (seuil_ambre > 0 and seuil_ambre < seuil_vert and seuil_vert <= 100),
  constraint parametres_se_unites check (cardinality(unites_perso) <= 30 and private.unites_valides(unites_perso))
);

create table public.phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 120),
  description text check (char_length(description) <= 2000),
  date_debut date,
  date_fin date,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phases_dates_coherentes check (date_debut is null or date_fin is null or date_fin >= date_debut)
);
create index phases_project_id_idx on public.phases (project_id);
create index phases_org_id_idx on public.phases (org_id);

create table public.etapes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  phase_id uuid references public.phases (id) on delete set null,
  nom text not null check (char_length(nom) between 1 and 200),
  description text check (char_length(description) <= 2000),
  type public.type_etape not null default 'jalon',
  date_prevue date not null,
  date_reelle date,
  statut public.statut_travail not null default 'a_faire',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index etapes_project_id_idx on public.etapes (project_id);
create index etapes_org_id_idx on public.etapes (org_id);
create index etapes_phase_id_idx on public.etapes (phase_id);

create table public.cadre_logique_noeuds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  type public.type_noeud not null,
  parent_id uuid references public.cadre_logique_noeuds (id) on delete cascade,
  -- OG, OS1, R1.1, A1.1.1 : calculé par private.renumeroter_cadre(), jamais saisi.
  code text not null default '',
  libelle text not null check (char_length(libelle) between 1 and 500),
  moyens_verification text check (char_length(moyens_verification) <= 2000),
  hypotheses text check (char_length(hypotheses) <= 2000),
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cadre_racine check ((type = 'objectif_global') = (parent_id is null))
);
create index cadre_noeuds_project_id_idx on public.cadre_logique_noeuds (project_id);
create index cadre_noeuds_org_id_idx on public.cadre_logique_noeuds (org_id);
create index cadre_noeuds_parent_id_idx on public.cadre_logique_noeuds (parent_id);
create unique index cadre_un_objectif_global_par_projet
  on public.cadre_logique_noeuds (project_id) where type = 'objectif_global';

-- Un indicateur est relié à une ligne du cadre logique.
alter table public.kpis
  add column noeud_id uuid references public.cadre_logique_noeuds (id) on delete set null;
create index kpis_noeud_id_idx on public.kpis (noeud_id);

create table public.pta_activites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  -- Année fiscale du PTA : l'année où elle commence (voir parametres_se.mois_debut_annee_fiscale).
  annee smallint not null check (annee between 2000 and 2100),
  trimestre smallint check (trimestre between 1 and 4),
  date_debut date,
  date_fin date,
  intitule text not null check (char_length(intitule) between 1 and 200),
  description text check (char_length(description) <= 2000),
  responsable text check (char_length(responsable) <= 120),
  budget_prevu numeric(16, 2) check (budget_prevu >= 0),
  statut public.statut_travail not null default 'a_faire',
  pct_realisation numeric(5, 2) not null default 0 check (pct_realisation between 0 and 100),
  noeud_id uuid references public.cadre_logique_noeuds (id) on delete set null,
  phase_id uuid references public.phases (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pta_dates_ensemble check ((date_debut is null) = (date_fin is null)),
  constraint pta_dates_coherentes check (date_fin is null or date_fin >= date_debut),
  constraint pta_periode_connue check (trimestre is not null or date_debut is not null),
  -- Une activité terminée est réalisée à 100 % ; une activité à faire n'a rien de réalisé.
  constraint pta_statut_pct check (
    (statut <> 'termine' or pct_realisation = 100) and (statut <> 'a_faire' or pct_realisation = 0)
  )
);
create index pta_project_id_idx on public.pta_activites (project_id);
create index pta_org_id_idx on public.pta_activites (org_id);
create index pta_noeud_id_idx on public.pta_activites (noeud_id);
create index pta_phase_id_idx on public.pta_activites (phase_id);

create table public.etats_avancement (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  titre text not null check (char_length(titre) between 1 and 160),
  periode_debut date not null,
  periode_fin date not null,
  faits_marquants text check (char_length(faits_marquants) <= 8000),
  difficultes text check (char_length(difficultes) <= 8000),
  risques text check (char_length(risques) <= 8000),
  -- Taux au moment de la rédaction, figés par un déclencheur : le client ne les fournit pas.
  taux_resultats numeric(5, 2),
  taux_physique numeric(5, 2),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint etats_periode_coherente check (periode_fin >= periode_debut)
);
create index etats_project_id_idx on public.etats_avancement (project_id);
create index etats_org_id_idx on public.etats_avancement (org_id);

create table public.realisations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  date date not null,
  titre text not null check (char_length(titre) between 1 and 200),
  description text check (char_length(description) <= 4000),
  quantite numeric check (quantite >= 0),
  unite text check (char_length(unite) <= 40),
  -- Texte libre au Lot 2 ; le référentiel de localités (Lot 3) ajoutera localite_id.
  lieu text check (char_length(lieu) <= 160),
  noeud_id uuid references public.cadre_logique_noeuds (id) on delete set null,
  pta_activite_id uuid references public.pta_activites (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index realisations_project_id_idx on public.realisations (project_id);
create index realisations_org_id_idx on public.realisations (org_id);
create index realisations_noeud_id_idx on public.realisations (noeud_id);
create index realisations_pta_idx on public.realisations (pta_activite_id);

create table public.prochaines_etapes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  libelle text not null check (char_length(libelle) between 1 and 300),
  responsable text check (char_length(responsable) <= 120),
  echeance date,
  statut public.statut_travail not null default 'a_faire',
  -- Origine éventuelle : l'alerte d'un indicateur.
  kpi_id uuid references public.kpis (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prochaines_etapes_project_id_idx on public.prochaines_etapes (project_id);
create index prochaines_etapes_org_id_idx on public.prochaines_etapes (org_id);
create index prochaines_etapes_kpi_id_idx on public.prochaines_etapes (kpi_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 200),
  categorie public.categorie_document not null default 'autre',
  description text check (char_length(description) <= 1000),
  -- Chemin dans le bucket privé « documents » : {org_id}/{project_id}/{fichier}.
  storage_path text not null unique check (char_length(storage_path) <= 500),
  mime_type text check (char_length(mime_type) <= 120),
  taille_octets bigint check (taille_octets >= 0),
  -- Preuve jointe d'une réalisation (facultatif).
  realisation_id uuid references public.realisations (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_project_id_idx on public.documents (project_id);
create index documents_org_id_idx on public.documents (org_id);
create index documents_realisation_id_idx on public.documents (realisation_id);

create table public.projet_etiquettes (
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  etiquette text not null check (char_length(etiquette) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (project_id, etiquette)
);
create index projet_etiquettes_org_id_idx on public.projet_etiquettes (org_id);

-- -----------------------------------------------------------------------------
-- Vues d'avancement (security_invoker : la RLS de l'appelant s'applique).
-- Mêmes formules que src/lib/kpi.ts, période « depuis le début du projet jusqu'à aujourd'hui » :
--   cumul   = base + somme des saisies du début du projet à aujourd'hui ;
--   dernier = dernière saisie jusqu'à aujourd'hui ;
--   moyenne = moyenne des saisies du début du projet à aujourd'hui ;
--   atteinte = (valeur − base) ÷ (cible − base) × 100 (sens inversé si décroissant), bornée [0 ; 150].
-- « Aujourd'hui » est la date du serveur (UTC) : à minuit, un écran peut avoir un jour de décalage.
-- -----------------------------------------------------------------------------

create view public.v_kpi_atteinte with (security_invoker = true) as
select
  k.id as kpi_id,
  k.project_id,
  k.org_id,
  v.valeur,
  case
    when v.valeur is null or k.cible = k.valeur_base then null
    else greatest(0::numeric, least(150::numeric,
      case k.sens
        when 'croissant' then (v.valeur - k.valeur_base) / (k.cible - k.valeur_base) * 100
        else (k.valeur_base - v.valeur) / (k.valeur_base - k.cible) * 100
      end))
  end as pct_atteinte
from public.kpis k
join public.projects p on p.id = k.project_id
cross join lateral (
  select case k.type_agregation
    when 'cumul' then (
      select k.valeur_base + sum(e.valeur) from public.kpi_entries e
      where e.kpi_id = k.id and e.date >= p.date_debut and e.date <= current_date)
    when 'dernier' then (
      select e.valeur from public.kpi_entries e
      where e.kpi_id = k.id and e.date <= current_date
      order by e.date desc limit 1)
    else (
      select avg(e.valeur) from public.kpi_entries e
      where e.kpi_id = k.id and e.date >= p.date_debut and e.date <= current_date)
  end as valeur
) v;

-- Trois taux (le financier arrive au Lot 3) :
--   résultats = moyenne des atteintes (plafonnées à 100) des indicateurs qui ont des données ;
--   physique  = moyenne du % de réalisation des activités du PTA, hors activités annulées ;
-- plus le statut de couleur des résultats (avancement comparé à la trajectoire, seuils de l'organisation).
create view public.v_avancement with (security_invoker = true) as
select
  p.id as project_id,
  p.org_id,
  p.programme_id,
  r.nb_kpis,
  r.nb_kpis_avec_donnees,
  r.taux_resultats,
  f.fraction_ecoulee,
  case
    when r.taux_resultats is null then 'none'
    when r.taux_resultats / d.diviseur >= coalesce(s.seuil_vert, 90) then 'ok'
    when r.taux_resultats / d.diviseur >= coalesce(s.seuil_ambre, 60) then 'warn'
    else 'alert'
  end as statut_resultats,
  a.nb_activites,
  a.nb_activites_realisees,
  a.taux_physique,
  e.nb_etapes,
  e.nb_etapes_terminees,
  e.nb_etapes_en_retard
from public.projects p
left join public.parametres_se s on s.org_id = p.org_id
cross join lateral (
  select
    count(*) as nb_kpis,
    count(*) filter (where x.valeur is not null and x.pct_atteinte is not null) as nb_kpis_avec_donnees,
    avg(least(100::numeric, x.pct_atteinte)) filter (where x.valeur is not null and x.pct_atteinte is not null) as taux_resultats
  from public.v_kpi_atteinte x
  where x.project_id = p.id
) r
cross join lateral (
  select case
    when p.date_fin <= p.date_debut then null
    else least(1::numeric, greatest(0::numeric, (current_date - p.date_debut)::numeric / (p.date_fin - p.date_debut)))
  end as fraction_ecoulee
) f
cross join lateral (
  select case when f.fraction_ecoulee > 0 then f.fraction_ecoulee else 1::numeric end as diviseur
) d
cross join lateral (
  select
    count(*) filter (where t.statut <> 'annule') as nb_activites,
    count(*) filter (where t.statut = 'termine') as nb_activites_realisees,
    avg(t.pct_realisation) filter (where t.statut <> 'annule') as taux_physique
  from public.pta_activites t
  where t.project_id = p.id
) a
cross join lateral (
  select
    count(*) filter (where g.statut <> 'annule') as nb_etapes,
    count(*) filter (where g.statut = 'termine') as nb_etapes_terminees,
    count(*) filter (where g.statut not in ('termine', 'annule') and g.date_prevue < current_date) as nb_etapes_en_retard
  from public.etapes g
  where g.project_id = p.id
) e;

-- Agrégation par programme : moyenne simple des taux des projets qui en ont un.
create view public.v_avancement_programme with (security_invoker = true) as
select
  g.id as programme_id,
  g.org_id,
  count(a.project_id) as nb_projets,
  count(a.taux_resultats) as nb_projets_avec_resultats,
  avg(a.taux_resultats) as taux_resultats,
  count(a.taux_physique) as nb_projets_avec_pta,
  avg(a.taux_physique) as taux_physique
from public.programmes g
left join public.v_avancement a on a.programme_id = g.id
group by g.id, g.org_id;

-- -----------------------------------------------------------------------------
-- Fonctions de trigger
-- -----------------------------------------------------------------------------

-- org_id dérivé du projet (la valeur du client est ignorée). Exécutée avec les droits de l'appelant :
-- un projet invisible pour lui est « introuvable ».
create function private.renseigner_org_depuis_projet()
returns trigger language plpgsql set search_path = ''
as $$
begin
  select p.org_id into new.org_id from public.projects p where p.id = new.project_id;
  if new.org_id is null then
    raise exception 'PROJET_INTROUVABLE' using errcode = 'P0001';
  end if;
  return new;
end
$$;

-- Le parent référencé (colonne tg_argv[1], table tg_argv[0]) doit appartenir au même projet.
create function private.verifier_parent_meme_projet()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_cle uuid;
  v_ok boolean;
begin
  execute format('select ($1).%I', tg_argv[1]) into v_cle using new;
  if v_cle is null then
    return new;
  end if;
  execute format('select exists (select 1 from public.%I t where t.id = $1 and t.project_id = $2)', tg_argv[0])
    into v_ok using v_cle, new.project_id;
  if not v_ok then
    raise exception 'RATTACHEMENT_INVALIDE' using errcode = 'P0001',
      hint = 'L''élément lié doit appartenir au même projet.';
  end if;
  return new;
end
$$;

-- Ligne du cadre logique référencée : même projet, et type parmi la liste tg_argv[1] (séparée par des virgules).
create function private.verifier_noeud_lie()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_cle uuid;
  v_ok boolean;
begin
  execute format('select ($1).%I', tg_argv[0]) into v_cle using new;
  if v_cle is null then
    return new;
  end if;
  select exists (
    select 1 from public.cadre_logique_noeuds n
    where n.id = v_cle and n.project_id = new.project_id
      and n.type::text = any (string_to_array(tg_argv[1], ','))
  ) into v_ok;
  if not v_ok then
    raise exception 'RATTACHEMENT_INVALIDE' using errcode = 'P0001',
      hint = 'La ligne du cadre logique doit appartenir au même projet et avoir un type compatible.';
  end if;
  return new;
end
$$;

-- Un projet ne se rattache qu'à un programme de sa propre organisation.
create function private.verifier_programme()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.programme_id is not null and not exists (
    select 1 from public.programmes g where g.id = new.programme_id and g.org_id = new.org_id
  ) then
    raise exception 'PROGRAMME_INTROUVABLE' using errcode = 'P0001';
  end if;
  return new;
end
$$;

-- Cadre logique : chaque niveau se rattache au niveau du dessus (OG > OS > R > A), dans le même projet.
create function private.verifier_hierarchie_cadre()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_parent public.cadre_logique_noeuds;
  v_attendu public.type_noeud;
begin
  if new.type = 'objectif_global' then
    if new.parent_id is not null then
      raise exception 'CADRE_PARENT_INVALIDE' using errcode = 'P0001';
    end if;
    return new;
  end if;
  v_attendu := case new.type
    when 'objectif_specifique' then 'objectif_global'
    when 'resultat' then 'objectif_specifique'
    else 'resultat'
  end;
  select p.* into v_parent from public.cadre_logique_noeuds p where p.id = new.parent_id;
  if not found or v_parent.project_id <> new.project_id or v_parent.type <> v_attendu then
    raise exception 'CADRE_PARENT_INVALIDE' using errcode = 'P0001',
      hint = 'Cette ligne doit être rattachée à une ligne du niveau supérieur, dans le même projet.';
  end if;
  return new;
end
$$;

-- Codes du cadre logique : OG, OS1, R1.1, A1.1.1 (rang parmi les frères du même type, par « ordre »).
create function private.renumeroter_cadre(p_projet uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  with recursive classes as (
    select n.id, n.type, n.parent_id,
           row_number() over (partition by n.parent_id, n.type order by n.ordre, n.created_at, n.id)::int as rang
    from public.cadre_logique_noeuds n
    where n.project_id = p_projet
  ),
  arbre as (
    select c.id, 'OG'::text as code, array[]::int[] as chemin
    from classes c where c.type = 'objectif_global'
    union all
    select c.id,
           case c.type
             when 'objectif_specifique' then 'OS' || c.rang
             when 'resultat' then 'R' || a.chemin[1] || '.' || c.rang
             else 'A' || a.chemin[1] || '.' || a.chemin[2] || '.' || c.rang
           end,
           a.chemin || c.rang
    from classes c
    join arbre a on a.id = c.parent_id
  )
  update public.cadre_logique_noeuds n
  set code = arbre.code
  from arbre
  where n.id = arbre.id and n.code is distinct from arbre.code;
end
$$;

create function private.renumeroter_cadre_trigger()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.renumeroter_cadre(coalesce(new.project_id, old.project_id));
  return null;
end
$$;

-- Les taux du moment sont figés à la création d'un état d'avancement.
create function private.figer_taux_etat()
returns trigger language plpgsql set search_path = ''
as $$
begin
  select round(a.taux_resultats, 2), round(a.taux_physique, 2)
  into new.taux_resultats, new.taux_physique
  from public.v_avancement a
  where a.project_id = new.project_id;
  return new;
end
$$;

-- Documents : le chemin doit être {org_id}/{project_id}/… (les droits du bucket s'appuient sur le premier dossier).
create function private.verifier_document()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.storage_path not like (new.org_id::text || '/' || new.project_id::text || '/%')
     or new.storage_path like '%..%' then
    raise exception 'DOCUMENT_CHEMIN_INVALIDE' using errcode = 'P0001';
  end if;
  return new;
end
$$;

-- Étiquettes : minuscules, espaces simplifiés, dix au plus par projet.
create function private.normaliser_etiquette()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.etiquette := lower(btrim(regexp_replace(new.etiquette, '\s+', ' ', 'g')));
  if (select count(*) from public.projet_etiquettes e where e.project_id = new.project_id) >= 10 then
    raise exception 'ETIQUETTES_MAX' using errcode = 'P0001',
      hint = 'Un projet porte dix étiquettes au plus.';
  end if;
  return new;
end
$$;

-- Chaque organisation a ses paramètres S&E dès sa création.
create function private.creer_parametres_se()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.parametres_se (org_id) values (new.id) on conflict do nothing;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Triggers (exécutés par ordre alphabétique de nom)
-- -----------------------------------------------------------------------------

create trigger t90_creer_parametres_se after insert on public.organisations
  for each row execute function private.creer_parametres_se();

insert into public.parametres_se (org_id) select o.id from public.organisations o on conflict do nothing;

-- programmes
create trigger t10_created_by before insert on public.programmes
  for each row execute function private.renseigner_created_by();
create trigger t20_essai before insert or update or delete on public.programmes
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.programmes
  for each row execute function private.maj_updated_at();

-- projects : rattachement à un programme de la même organisation
create trigger t35_programme before insert or update of programme_id on public.projects
  for each row execute function private.verifier_programme();

-- parametres_se
create trigger t20_essai before insert or update or delete on public.parametres_se
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.parametres_se
  for each row execute function private.maj_updated_at();

-- phases
create trigger t10_org_id before insert on public.phases
  for each row execute function private.renseigner_org_depuis_projet();
create trigger t20_essai before insert or update or delete on public.phases
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.phases
  for each row execute function private.maj_updated_at();

-- etapes
create trigger t10_org_id before insert on public.etapes
  for each row execute function private.renseigner_org_depuis_projet();
create trigger t12_phase before insert or update of phase_id on public.etapes
  for each row execute function private.verifier_parent_meme_projet('phases', 'phase_id');
create trigger t20_essai before insert or update or delete on public.etapes
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.etapes
  for each row execute function private.maj_updated_at();

-- cadre_logique_noeuds
create trigger t10_org_id before insert on public.cadre_logique_noeuds
  for each row execute function private.renseigner_org_depuis_projet();
create trigger t12_hierarchie before insert or update of parent_id on public.cadre_logique_noeuds
  for each row execute function private.verifier_hierarchie_cadre();
create trigger t20_essai before insert or update or delete on public.cadre_logique_noeuds
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update of libelle, moyens_verification, hypotheses, parent_id, ordre
  on public.cadre_logique_noeuds
  for each row execute function private.maj_updated_at();
-- Au niveau 0 seulement : la renumérotation met à jour « code » sans se redéclencher, et la suppression
-- en cascade d'un projet ne renumérote rien.
create trigger t95_renumeroter after insert or delete or update of parent_id, ordre on public.cadre_logique_noeuds
  for each row when (pg_trigger_depth() = 0) execute function private.renumeroter_cadre_trigger();

-- kpis : ligne du cadre logique reliée (tous niveaux)
create trigger t12_noeud before insert or update of noeud_id on public.kpis
  for each row execute function private.verifier_noeud_lie('noeud_id', 'objectif_global,objectif_specifique,resultat,activite');

-- pta_activites
create trigger t10_org_id before insert on public.pta_activites
  for each row execute function private.renseigner_org_depuis_projet();
create trigger t11_created_by before insert on public.pta_activites
  for each row execute function private.renseigner_created_by();
create trigger t12_noeud before insert or update of noeud_id on public.pta_activites
  for each row execute function private.verifier_noeud_lie('noeud_id', 'activite');
create trigger t13_phase before insert or update of phase_id on public.pta_activites
  for each row execute function private.verifier_parent_meme_projet('phases', 'phase_id');
create trigger t20_essai before insert or update or delete on public.pta_activites
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.pta_activites
  for each row execute function private.maj_updated_at();

-- etats_avancement
create trigger t10_org_id before insert on public.etats_avancement
  for each row execute function private.renseigner_org_depuis_projet();
create trigger t11_created_by before insert on public.etats_avancement
  for each row execute function private.renseigner_created_by();
create trigger t15_taux before insert on public.etats_avancement
  for each row execute function private.figer_taux_etat();
create trigger t20_essai before insert or update or delete on public.etats_avancement
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.etats_avancement
  for each row execute function private.maj_updated_at();

-- realisations
create trigger t10_org_id before insert on public.realisations
  for each row execute function private.renseigner_org_depuis_projet();
create trigger t11_created_by before insert on public.realisations
  for each row execute function private.renseigner_created_by();
create trigger t12_noeud before insert or update of noeud_id on public.realisations
  for each row execute function private.verifier_noeud_lie('noeud_id', 'resultat,activite');
create trigger t13_pta before insert or update of pta_activite_id on public.realisations
  for each row execute function private.verifier_parent_meme_projet('pta_activites', 'pta_activite_id');
create trigger t20_essai before insert or update or delete on public.realisations
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.realisations
  for each row execute function private.maj_updated_at();

-- prochaines_etapes
create trigger t10_org_id before insert on public.prochaines_etapes
  for each row execute function private.renseigner_org_depuis_projet();
create trigger t11_created_by before insert on public.prochaines_etapes
  for each row execute function private.renseigner_created_by();
create trigger t12_kpi before insert or update of kpi_id on public.prochaines_etapes
  for each row execute function private.verifier_parent_meme_projet('kpis', 'kpi_id');
create trigger t20_essai before insert or update or delete on public.prochaines_etapes
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.prochaines_etapes
  for each row execute function private.maj_updated_at();

-- documents
create trigger t10_org_id before insert on public.documents
  for each row execute function private.renseigner_org_depuis_projet();
create trigger t11_created_by before insert on public.documents
  for each row execute function private.renseigner_created_by();
create trigger t12_chemin before insert on public.documents
  for each row execute function private.verifier_document();
create trigger t13_realisation before insert or update of realisation_id on public.documents
  for each row execute function private.verifier_parent_meme_projet('realisations', 'realisation_id');
create trigger t20_essai before insert or update or delete on public.documents
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.documents
  for each row execute function private.maj_updated_at();

-- projet_etiquettes
create trigger t10_org_id before insert on public.projet_etiquettes
  for each row execute function private.renseigner_org_depuis_projet();
create trigger t12_normaliser before insert on public.projet_etiquettes
  for each row execute function private.normaliser_etiquette();
create trigger t20_essai before insert or update or delete on public.projet_etiquettes
  for each row execute function private.verifier_ecriture_essai();

-- -----------------------------------------------------------------------------
-- Projet exemple : les indicateurs peuvent perdre leur lien avec le cadre logique quand l'utilisateur
-- supprime une ligne (mise à NULL par la clé étrangère) ; le lien reste donc modifiable dans l'exemple.
-- -----------------------------------------------------------------------------
create or replace function private.proteger_projet_exemple()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if private.chargement_exemple() then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'projects' then
    if old.is_demo then
      raise exception 'DEMO_READONLY' using errcode = 'P0001',
        hint = 'Le projet exemple n''est pas modifiable. Vous pouvez le supprimer.';
    end if;
    return new;
  end if;

  -- table kpis
  if tg_op = 'INSERT' then
    if exists (select 1 from public.projects p where p.id = new.project_id and p.is_demo) then
      raise exception 'DEMO_READONLY' using errcode = 'P0001',
        hint = 'Le projet exemple ne peut pas recevoir de nouveaux KPI.';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if exists (select 1 from public.projects p where p.id = old.project_id and p.is_demo)
       and (to_jsonb(new) - array['epingle', 'ordre', 'noeud_id', 'updated_at'])
           is distinct from (to_jsonb(old) - array['epingle', 'ordre', 'noeud_id', 'updated_at']) then
      raise exception 'DEMO_READONLY' using errcode = 'P0001',
        hint = 'Les KPI du projet exemple ne sont pas modifiables.';
    end if;
    return new;
  else
    -- Pendant une suppression en cascade, le projet n'est déjà plus visible : autorisé.
    if exists (select 1 from public.projects p where p.id = old.project_id and p.is_demo) then
      raise exception 'DEMO_READONLY' using errcode = 'P0001',
        hint = 'Les KPI du projet exemple ne peuvent pas être supprimés.';
    end if;
    return old;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Contenu du projet exemple (cadre logique, phases, étapes, PTA, réalisations…)
-- Les dates sont relatives à aujourd'hui pour que l'exemple raconte toujours une histoire actuelle.
-- -----------------------------------------------------------------------------
create function private.charger_contenu_exemple_lot2(p_projet uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_debut date;
  v_fin date;
  v_og uuid;
  v_os1 uuid; v_os2 uuid;
  v_r11 uuid; v_r12 uuid; v_r21 uuid; v_r22 uuid;
  v_a111 uuid; v_a112 uuid; v_a121 uuid; v_a211 uuid; v_a221 uuid;
  v_ph uuid[];
  v_trimestre date := date_trunc('quarter', current_date)::date;
  v_pta_a111 uuid;
begin
  select p.org_id, p.date_debut, p.date_fin into v_org, v_debut, v_fin
  from public.projects p where p.id = p_projet and p.is_demo;
  if v_org is null then
    return;
  end if;

  -- Cadre logique ---------------------------------------------------------------
  insert into public.cadre_logique_noeuds (project_id, type, libelle, moyens_verification, hypotheses, ordre)
  values (p_projet, 'objectif_global',
    'Contribuer à l''amélioration de la santé des populations rurales par l''accès durable à l''eau potable, à l''hygiène et à l''assainissement.',
    'Statistiques sanitaires des districts ; enquête de population en fin de projet.',
    'Les politiques nationales de l''eau et de l''assainissement restent stables.', 1)
  returning id into v_og;

  insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle, moyens_verification, hypotheses, ordre)
  values (p_projet, 'objectif_specifique', v_og,
    'Améliorer l''accès durable à l''eau potable des ménages de la zone d''intervention.',
    'Enquêtes trimestrielles auprès des ménages ; contrôles mensuels des points d''eau.',
    'Les nappes phréatiques restent exploitables pendant la durée du projet.', 1)
  returning id into v_os1;
  insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle, moyens_verification, hypotheses, ordre)
  values (p_projet, 'objectif_specifique', v_og,
    'Renforcer les pratiques d''hygiène et l''accès à l''assainissement des ménages.',
    'Rapports des postes de santé ; registres des séances de sensibilisation.',
    'Les ménages acceptent de participer aux séances et de cofinancer leurs latrines.', 2)
  returning id into v_os2;

  insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle, moyens_verification, hypotheses, ordre)
  values (p_projet, 'resultat', v_os1,
    'Les points d''eau existants sont réhabilités et fonctionnent durablement.',
    'Procès-verbaux de réception ; fiches de contrôle mensuel.',
    'Les pièces de rechange sont disponibles localement.', 1)
  returning id into v_r11;
  insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle, moyens_verification, hypotheses, ordre)
  values (p_projet, 'resultat', v_os1,
    'Les comités de gestion assurent l''entretien et la gestion financière des points d''eau.',
    'Comptes rendus de réunion ; carnets de recettes et de dépenses des comités.',
    'Les usagers acceptent de payer l''eau.', 2)
  returning id into v_r12;
  insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle, moyens_verification, hypotheses, ordre)
  values (p_projet, 'resultat', v_os2,
    'Les ménages adoptent des pratiques d''hygiène adaptées (lavage des mains, conservation de l''eau).',
    'Registres des séances ; enquêtes de pratiques.',
    'Les relais communautaires restent mobilisés.', 1)
  returning id into v_r21;
  insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle, moyens_verification, hypotheses, ordre)
  values (p_projet, 'resultat', v_os2,
    'Les ménages disposent de latrines améliorées.',
    'Procès-verbaux de réception des latrines.',
    'Les fournisseurs livrent les matériaux dans les délais.', 2)
  returning id into v_r22;

  insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle, moyens_verification, hypotheses, ordre)
  values (p_projet, 'activite', v_r11, 'Réhabiliter les forages en panne.', 'Bons de commande et procès-verbaux de réception.', null, 1)
  returning id into v_a111;
  insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle, moyens_verification, hypotheses, ordre)
  values (p_projet, 'activite', v_r11, 'Former et équiper les artisans réparateurs.', 'Listes de présence ; inventaire des kits d''outils.', null, 2)
  returning id into v_a112;
  insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle, moyens_verification, hypotheses, ordre)
  values (p_projet, 'activite', v_r12, 'Mettre en place et former les comités de gestion.', 'Procès-verbaux de constitution ; listes de présence.', null, 1)
  returning id into v_a121;
  insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle, moyens_verification, hypotheses, ordre)
  values (p_projet, 'activite', v_r21, 'Animer des séances de sensibilisation avec les relais communautaires.', 'Registres des séances.', null, 1)
  returning id into v_a211;
  insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle, moyens_verification, hypotheses, ordre)
  values (p_projet, 'activite', v_r22, 'Accompagner la construction de latrines familiales.', 'Fiches de suivi de chantier.', null, 1)
  returning id into v_a221;

  update public.kpis k
  set noeud_id = case k.nom
    when 'Forages réhabilités' then v_r11
    when 'Ménages avec accès à l''eau potable' then v_os1
    when 'Points d''eau fonctionnels' then v_r11
    when 'Personnes sensibilisées à l''hygiène' then v_r21
    when 'Latrines familiales construites' then v_r22
    when 'Comités de gestion fonctionnels' then v_r12
    when 'Cas de diarrhée déclarés par mois' then v_os2
    when 'Temps moyen de collecte de l''eau' then v_os1
  end
  where k.project_id = p_projet;

  -- Phases ----------------------------------------------------------------------
  insert into public.phases (project_id, nom, description, date_debut, date_fin, ordre)
  select p_projet, x.nom, x.description,
         (v_debut + make_interval(months => x.de))::date,
         (v_debut + make_interval(months => x.a))::date - 1,
         x.ordre
  from (values
    (1, 'Conception', 'Cadrage, cadre logique et budget.', 0, 1),
    (2, 'Démarrage', 'Recrutements, ateliers de lancement et enquête de base.', 1, 3),
    (3, 'Mise en œuvre', 'Réhabilitations, formations, sensibilisation et latrines.', 3, 21),
    (4, 'Suivi-évaluation', 'Collecte régulière, revues et évaluations.', 6, 23),
    (5, 'Clôture', 'Évaluation finale, capitalisation et rapport final.', 23, 24)
  ) as x(ordre, nom, description, de, a)
  order by x.ordre;
  select array_agg(ph.id order by ph.ordre) into v_ph from public.phases ph where ph.project_id = p_projet;

  -- Étapes (jalons et livrables) ----------------------------------------------------
  insert into public.etapes (project_id, phase_id, nom, description, type, date_prevue, date_reelle, statut)
  values
    (p_projet, v_ph[1], 'Validation du cadre logique', 'Atelier avec les partenaires.', 'jalon',
      v_debut + 20, v_debut + 22, 'termine'),
    (p_projet, v_ph[2], 'Lancement officiel du projet', null, 'jalon',
      (v_debut + interval '2 months')::date, (v_debut + interval '2 months')::date + 3, 'termine'),
    (p_projet, v_ph[2], 'Rapport de base (enquête initiale)', 'Valeurs de départ des indicateurs.', 'livrable',
      (v_debut + interval '3 months')::date, (v_debut + interval '3 months')::date + 10, 'termine'),
    (p_projet, v_ph[4], 'Évaluation à mi-parcours des comités de gestion', null, 'jalon',
      (v_debut + interval '10 months')::date, null, 'en_cours'),
    (p_projet, v_ph[4], 'Rapport annuel — année 1', 'Rapport au bailleur.', 'livrable',
      (v_debut + interval '12 months')::date + 20, null, 'a_faire'),
    (p_projet, v_ph[5], 'Évaluation finale', null, 'jalon',
      (v_debut + interval '22 months')::date, null, 'a_faire'),
    (p_projet, v_ph[5], 'Rapport final', null, 'livrable',
      v_fin - 15, null, 'a_faire');

  -- Plan de travail annuel ------------------------------------------------------------
  -- Dates décalées par rapport à aujourd'hui : l'exemple montre toujours des activités terminées,
  -- en cours, à venir et reportée, quelle que soit la date du chargement.
  insert into public.pta_activites
    (project_id, annee, trimestre, date_debut, date_fin, intitule, responsable, budget_prevu, statut, pct_realisation, noeud_id, phase_id)
  select p_projet, extract(year from x.debut)::smallint, extract(quarter from x.debut)::smallint,
         x.debut, x.fin, x.intitule, x.responsable, x.budget,
         case
           when x.reporte then 'reporte'::public.statut_travail
           when x.fin < current_date then 'termine'
           when x.debut > current_date then 'a_faire'
           else 'en_cours'
         end,
         case
           when x.reporte then 0
           when x.fin < current_date then 100
           when x.debut > current_date then 0
           else greatest(5, least(95, round(100.0 * (current_date - x.debut) / greatest(1, x.fin - x.debut))))
         end,
         x.noeud, v_ph[3]
  from (
    select t.intitule, t.responsable, t.budget::numeric as budget, t.noeud, t.reporte,
           current_date + t.jours_debut as debut, current_date + t.jours_fin as fin
    from (values
      ('Diagnostic des forages en panne', 'Ingénieur hydraulicien', 6500000, -150, -100, v_a111, false),
      ('Réhabilitation des forages — lot 1', 'Ingénieur hydraulicien', 48000000, -120, -30, v_a111, false),
      ('Réhabilitation des forages — lot 2', 'Ingénieur hydraulicien', 52000000, -20, 80, v_a111, false),
      ('Formation des artisans réparateurs', 'Responsable formation', 9000000, -90, -60, v_a112, false),
      ('Mise en place des comités de gestion', 'Animateur social', 12000000, -100, -20, v_a121, false),
      ('Séances de sensibilisation à l''hygiène', 'Responsable communication', 21000000, -200, 150, v_a211, false),
      ('Appui à la construction des latrines', 'Chargé d''infrastructures', 64000000, -90, 60, v_a221, false),
      ('Enquête de satisfaction des usagers', 'Responsable S&E', 4500000, 30, 60, null::uuid, true),
      ('Atelier de capitalisation des acquis', 'Cheffe de projet', 7500000, 70, 100, null::uuid, false)
    ) as t(intitule, responsable, budget, jours_debut, jours_fin, noeud, reporte)
  ) as x;

  -- Réalisations ---------------------------------------------------------------------
  select t.id into v_pta_a111 from public.pta_activites t
  where t.project_id = p_projet and t.intitule = 'Réhabilitation des forages — lot 1';

  insert into public.realisations (project_id, date, titre, description, quantite, unite, lieu, noeud_id, pta_activite_id)
  values
    (p_projet, current_date - 75, 'Forages réhabilités et réceptionnés (lot 1)',
      'Remise en service après réparation des pompes et des têtes de forage.', 14, 'forages',
      'Département de Nioro du Rip', v_a111, v_pta_a111);
  insert into public.realisations (project_id, date, titre, description, quantite, unite, lieu, noeud_id)
  values
    (p_projet, current_date - 60, 'Artisans réparateurs formés', 'Formation de cinq jours avec remise d''un kit d''outils.', 18, 'artisans', 'Kaolack', v_a112),
    (p_projet, current_date - 45, 'Comités de gestion installés', 'Comités constitués en assemblée villageoise.', 12, 'comités', 'Département de Koungheul', v_a121),
    (p_projet, current_date - 20, 'Séances de sensibilisation animées', 'Lavage des mains et conservation de l''eau.', 36, 'séances', 'Zone d''intervention', v_a211),
    (p_projet, current_date - 10, 'Latrines familiales achevées', 'Latrines réceptionnées par l''équipe technique.', 38, 'latrines', 'Département de Kaffrine', v_a221);

  -- Prochaines étapes ------------------------------------------------------------------
  insert into public.prochaines_etapes (project_id, libelle, responsable, echeance, statut, kpi_id)
  values
    (p_projet, 'Relancer le fournisseur pour la livraison des dalles de latrines', 'Chargé d''infrastructures',
      current_date + 7, 'en_cours',
      (select k.id from public.kpis k where k.project_id = p_projet and k.nom = 'Latrines familiales construites')),
    (p_projet, 'Reprendre l''enquête sur le temps de collecte de l''eau', 'Responsable S&E',
      current_date - 5, 'a_faire',
      (select k.id from public.kpis k where k.project_id = p_projet and k.nom = 'Temps moyen de collecte de l''eau')),
    (p_projet, 'Préparer la revue à mi-parcours avec le bailleur', 'Cheffe de projet', current_date + 21, 'a_faire', null),
    (p_projet, 'Valider le rapport trimestriel avec le bailleur', 'Cheffe de projet', current_date - 20, 'termine', null);

  -- État d'avancement du trimestre précédent -------------------------------------------
  insert into public.etats_avancement (project_id, titre, periode_debut, periode_fin, faits_marquants, difficultes, risques)
  values (p_projet, 'État d''avancement — trimestre précédent',
    (v_trimestre - interval '3 months')::date, v_trimestre - 1,
    'Quatorze forages réhabilités et réceptionnés. Dix-huit artisans réparateurs formés et équipés. Douze comités de gestion installés.',
    'Retards de livraison des dalles de latrines. L''enquête sur le temps de collecte de l''eau a été interrompue faute d''enquêteurs disponibles.',
    'Saison des pluies : les chantiers de latrines risquent de ralentir. Dépendance à un seul fournisseur de dalles.');

  -- Étiquettes ---------------------------------------------------------------------------
  insert into public.projet_etiquettes (project_id, etiquette)
  values (p_projet, 'infrastructure'), (p_projet, 'sensibilisation'), (p_projet, 'formation');
end
$$;

-- Les projets exemples déjà chargés reçoivent le même contenu.
do $$
declare
  v_projet uuid;
begin
  for v_projet in select p.id from public.projects p where p.is_demo loop
    perform set_config('pilot.chargement_exemple', 'on', true);
    perform private.charger_contenu_exemple_lot2(v_projet);
  end loop;
  perform set_config('pilot.chargement_exemple', 'off', true);
end
$$;

-- charger_projet_exemple() : identique au Lot 1, avec le contenu du Lot 2 en fin de chargement.
create or replace function public.charger_projet_exemple()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_role public.role_membre;
  v_debut date := (date_trunc('month', current_date) - interval '12 months')::date;
  v_fin date := (date_trunc('month', current_date) + interval '12 months' - interval '1 day')::date;
  v_projet uuid;
  v_k uuid[];
begin
  if v_uid is null then
    raise exception 'NON_AUTHENTIFIE' using errcode = '42501';
  end if;

  select m.org_id, m.role into v_org, v_role from public.memberships m where m.user_id = v_uid;
  if v_org is null or v_role not in ('admin', 'editeur') then
    raise exception 'ACCES_REFUSE' using errcode = '42501';
  end if;
  if not private.org_peut_ecrire(v_org) then
    raise exception 'ESSAI_EXPIRE' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.projects p where p.org_id = v_org and p.is_demo) then
    raise exception 'DEMO_EXISTE' using errcode = 'P0001', hint = 'Le projet exemple est déjà chargé.';
  end if;

  perform set_config('pilot.chargement_exemple', 'on', true);

  insert into public.projects (org_id, nom, description, date_debut, date_fin, budget, devise, statut, secteur_id, is_demo)
  values (
    v_org,
    'Projet exemple — Eau, hygiène et assainissement',
    'Projet fictif fourni pour découvrir Pilot M&E. Les données sont générées et ne décrivent aucun projet réel.',
    v_debut, v_fin, 250000000, 'XOF', 'en_cours',
    (select s.id from public.secteurs s where s.code = 'eau_assainissement'),
    true
  )
  returning id into v_projet;

  insert into public.kpis (project_id, nom, description, unite, cible, valeur_base, frequence, sens, type_agregation, ordre, epingle)
  values
    (v_projet, 'Forages réhabilités', 'Forages remis en service et réceptionnés.', 'forages',
      40, 0, 'mensuelle', 'croissant', 'cumul', 1, true),
    (v_projet, 'Ménages avec accès à l''eau potable', 'Part des ménages disposant d''un point d''eau potable à moins de 30 minutes (enquête trimestrielle).', '%',
      80, 35, 'trimestrielle', 'croissant', 'dernier', 2, true),
    (v_projet, 'Points d''eau fonctionnels', 'Part des points d''eau en état de marche lors du contrôle mensuel.', '%',
      90, 55, 'mensuelle', 'croissant', 'dernier', 3, false),
    (v_projet, 'Personnes sensibilisées à l''hygiène', 'Participants aux séances sur le lavage des mains et la conservation de l''eau.', 'personnes',
      12000, 0, 'mensuelle', 'croissant', 'cumul', 4, true),
    (v_projet, 'Latrines familiales construites', 'Latrines améliorées achevées et réceptionnées.', 'latrines',
      1500, 0, 'mensuelle', 'croissant', 'cumul', 5, true),
    (v_projet, 'Comités de gestion fonctionnels', 'Comités de gestion des points d''eau qui se réunissent et tiennent leurs comptes.', 'comités',
      40, 4, 'trimestrielle', 'croissant', 'dernier', 6, false),
    (v_projet, 'Cas de diarrhée déclarés par mois', 'Cas déclarés par les postes de santé de la zone.', 'cas',
      40, 120, 'mensuelle', 'decroissant', 'dernier', 7, false),
    (v_projet, 'Temps moyen de collecte de l''eau', 'Durée moyenne d''un aller-retour au point d''eau, mesurée par enquête.', 'minutes',
      20, 45, 'mensuelle', 'decroissant', 'moyenne', 8, false);

  select array_agg(k.id order by k.ordre) into v_k from public.kpis k where k.project_id = v_projet;

  -- Mensuels : le 28 de chacun des 12 derniers mois. Trimestriels : tous les 3 mois.
  insert into public.kpi_entries (kpi_id, date, valeur)
  select v_k[s.kpi], (v_debut + make_interval(months => s.mois - 1))::date + 27, s.valeur
  from (
    select 1 as kpi, v.n::int as mois, v.x as valeur
      from unnest(array[1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1]::numeric[]) with ordinality as v(x, n)
    union all
    select 2, (v.n * 3)::int, v.x
      from unnest(array[41, 45, 49, 52]::numeric[]) with ordinality as v(x, n)
    union all
    select 3, v.n::int, v.x
      from unnest(array[56, 57, 59, 60, 62, 63, 65, 67, 69, 70, 72, 74]::numeric[]) with ordinality as v(x, n)
    union all
    select 4, v.n::int, v.x
      from unnest(array[180, 240, 310, 350, 420, 390, 460, 380, 330, 450, 480, 510]::numeric[]) with ordinality as v(x, n)
    union all
    select 5, v.n::int, v.x
      from unnest(array[0, 0, 12, 18, 25, 30, 22, 35, 40, 38, 42, 38]::numeric[]) with ordinality as v(x, n)
    union all
    select 6, (v.n * 3)::int, v.x
      from unnest(array[7, 11, 15, 18]::numeric[]) with ordinality as v(x, n)
    union all
    select 7, v.n::int, v.x
      from unnest(array[124, 131, 118, 122, 127, 135, 129, 117, 112, 110, 108, 105]::numeric[]) with ordinality as v(x, n)
    union all
    -- Sans saisie depuis 5 mois : déclenche le badge « Saisie en retard ».
    select 8, v.n::int, v.x
      from unnest(array[46, 44, 43, 41, 40, 38, 37]::numeric[]) with ordinality as v(x, n)
  ) as s;

  update public.kpi_entries e
  set commentaire = c.texte
  from (values
    (1, 12, 'Deux forages réceptionnés ce mois-ci.'),
    (4, 12, 'Séances animées avec les relais communautaires.'),
    (5, 1, 'Démarrage retardé : attente de la livraison des dalles.'),
    (5, 7, 'Saison des pluies : chantiers ralentis.'),
    (7, 6, 'Pic saisonnier pendant l''hivernage.'),
    (8, 7, 'Dernière enquête avant la suspension : enquêteurs réaffectés.')
  ) as c(kpi, mois, texte)
  where e.kpi_id = v_k[c.kpi]
    and e.date = (v_debut + make_interval(months => c.mois - 1))::date + 27;

  perform private.charger_contenu_exemple_lot2(v_projet);

  perform set_config('pilot.chargement_exemple', 'off', true);
  return v_projet;
end
$$;

-- -----------------------------------------------------------------------------
-- Droits (colonne par colonne, comme au Lot 1)
-- -----------------------------------------------------------------------------

revoke all on public.programmes, public.parametres_se, public.phases, public.etapes,
  public.cadre_logique_noeuds, public.pta_activites, public.etats_avancement, public.realisations,
  public.prochaines_etapes, public.documents, public.projet_etiquettes,
  public.v_kpi_atteinte, public.v_avancement, public.v_avancement_programme
  from anon, authenticated;

grant select on public.programmes to authenticated;
grant insert (org_id, nom, description, date_debut, date_fin) on public.programmes to authenticated;
grant update (nom, description, date_debut, date_fin) on public.programmes to authenticated;
grant delete on public.programmes to authenticated;

grant select on public.parametres_se to authenticated;
grant update (seuil_vert, seuil_ambre, frequence_defaut, unites_perso, mois_debut_annee_fiscale)
  on public.parametres_se to authenticated;

grant select, delete on public.phases to authenticated;
grant insert (project_id, nom, description, date_debut, date_fin, ordre) on public.phases to authenticated;
grant update (nom, description, date_debut, date_fin, ordre) on public.phases to authenticated;

grant select, delete on public.etapes to authenticated;
grant insert (project_id, phase_id, nom, description, type, date_prevue, date_reelle, statut) on public.etapes to authenticated;
grant update (phase_id, nom, description, type, date_prevue, date_reelle, statut) on public.etapes to authenticated;

grant select, delete on public.cadre_logique_noeuds to authenticated;
grant insert (project_id, type, parent_id, libelle, moyens_verification, hypotheses, ordre) on public.cadre_logique_noeuds to authenticated;
grant update (parent_id, libelle, moyens_verification, hypotheses, ordre) on public.cadre_logique_noeuds to authenticated;

grant select, delete on public.pta_activites to authenticated;
grant insert (project_id, annee, trimestre, date_debut, date_fin, intitule, description, responsable, budget_prevu,
              statut, pct_realisation, noeud_id, phase_id) on public.pta_activites to authenticated;
grant update (annee, trimestre, date_debut, date_fin, intitule, description, responsable, budget_prevu,
              statut, pct_realisation, noeud_id, phase_id) on public.pta_activites to authenticated;

grant select, delete on public.etats_avancement to authenticated;
grant insert (project_id, titre, periode_debut, periode_fin, faits_marquants, difficultes, risques)
  on public.etats_avancement to authenticated;
grant update (titre, periode_debut, periode_fin, faits_marquants, difficultes, risques)
  on public.etats_avancement to authenticated;

grant select, delete on public.realisations to authenticated;
grant insert (project_id, date, titre, description, quantite, unite, lieu, noeud_id, pta_activite_id)
  on public.realisations to authenticated;
grant update (date, titre, description, quantite, unite, lieu, noeud_id, pta_activite_id)
  on public.realisations to authenticated;

grant select, delete on public.prochaines_etapes to authenticated;
grant insert (project_id, libelle, responsable, echeance, statut, kpi_id) on public.prochaines_etapes to authenticated;
grant update (libelle, responsable, echeance, statut, kpi_id) on public.prochaines_etapes to authenticated;

grant select, delete on public.documents to authenticated;
grant insert (project_id, nom, categorie, description, storage_path, mime_type, taille_octets, realisation_id)
  on public.documents to authenticated;
grant update (nom, categorie, description, realisation_id) on public.documents to authenticated;

grant select, delete on public.projet_etiquettes to authenticated;
grant insert (project_id, etiquette) on public.projet_etiquettes to authenticated;

-- Colonnes ajoutées aux tables du Lot 1.
grant insert (programme_id), update (programme_id) on public.projects to authenticated;
grant insert (noeud_id), update (noeud_id) on public.kpis to authenticated;

grant select on public.v_kpi_atteinte, public.v_avancement, public.v_avancement_programme to authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.programmes enable row level security;
alter table public.parametres_se enable row level security;
alter table public.phases enable row level security;
alter table public.etapes enable row level security;
alter table public.cadre_logique_noeuds enable row level security;
alter table public.pta_activites enable row level security;
alter table public.etats_avancement enable row level security;
alter table public.realisations enable row level security;
alter table public.prochaines_etapes enable row level security;
alter table public.documents enable row level security;
alter table public.projet_etiquettes enable row level security;

create policy "programmes : lecture par les membres" on public.programmes
  for select to authenticated using (private.is_org_member(org_id));
create policy "programmes : création par admin et éditeur" on public.programmes
  for insert to authenticated with check (private.peut_editer(org_id));
create policy "programmes : modification par admin et éditeur" on public.programmes
  for update to authenticated using (private.peut_editer(org_id)) with check (private.peut_editer(org_id));
create policy "programmes : suppression par les admins" on public.programmes
  for delete to authenticated using (private.est_admin(org_id));

create policy "paramètres S&E : lecture par les membres" on public.parametres_se
  for select to authenticated using (private.is_org_member(org_id));
create policy "paramètres S&E : modification par les admins" on public.parametres_se
  for update to authenticated using (private.est_admin(org_id)) with check (private.est_admin(org_id));

-- Tables du projet : lecture par les membres, écriture par admin et éditeur.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'phases', 'etapes', 'cadre_logique_noeuds', 'pta_activites', 'etats_avancement',
    'realisations', 'prochaines_etapes', 'documents'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.is_org_member(org_id))',
      v_table || ' : lecture par les membres', v_table);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.peut_editer(org_id))',
      v_table || ' : création par admin et éditeur', v_table);
    execute format('create policy %I on public.%I for update to authenticated using (private.peut_editer(org_id)) with check (private.peut_editer(org_id))',
      v_table || ' : modification par admin et éditeur', v_table);
    execute format('create policy %I on public.%I for delete to authenticated using (private.peut_editer(org_id))',
      v_table || ' : suppression par admin et éditeur', v_table);
  end loop;
end
$$;

create policy "étiquettes : lecture par les membres" on public.projet_etiquettes
  for select to authenticated using (private.is_org_member(org_id));
create policy "étiquettes : ajout par admin et éditeur" on public.projet_etiquettes
  for insert to authenticated with check (private.peut_editer(org_id));
create policy "étiquettes : suppression par admin et éditeur" on public.projet_etiquettes
  for delete to authenticated using (private.peut_editer(org_id));

-- -----------------------------------------------------------------------------
-- Stockage des documents : écriture refusée après la fin d'essai, types de fichiers limités
-- (un fichier HTML déposé dans un bucket ne doit pas pouvoir s'afficher comme une page).
-- -----------------------------------------------------------------------------
drop policy "documents : ajout par admin et éditeur" on storage.objects;
drop policy "documents : remplacement par admin et éditeur" on storage.objects;
drop policy "documents : suppression par admin et éditeur" on storage.objects;

create policy "documents : ajout par admin et éditeur" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and private.peut_editer(private.uuid_ou_null((storage.foldername(name))[1]))
    and private.org_peut_ecrire(private.uuid_ou_null((storage.foldername(name))[1]))
  );
create policy "documents : remplacement par admin et éditeur" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and private.peut_editer(private.uuid_ou_null((storage.foldername(name))[1]))
    and private.org_peut_ecrire(private.uuid_ou_null((storage.foldername(name))[1]))
  );
create policy "documents : suppression par admin et éditeur" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and private.peut_editer(private.uuid_ou_null((storage.foldername(name))[1]))
    and private.org_peut_ecrire(private.uuid_ou_null((storage.foldername(name))[1]))
  );

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp',
  'text/plain', 'text/csv',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet'
]
where id = 'documents';
