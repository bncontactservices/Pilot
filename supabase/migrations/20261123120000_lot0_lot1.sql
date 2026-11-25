-- =============================================================================
-- Pilot M&E — Migration Lot 0–1
-- Organisations, membres, invitations, projets, KPI, saisies, audit, leads.
-- RLS sur toutes les tables, droits par colonne, quotas de plan, fin d'essai
-- en lecture seule, projet exemple protégé, stockage privé.
--
-- Erreurs typées (SQLSTATE P0001, message = code) traduites côté front par
-- src/lib/errors.ts : PLAN_LIMIT:projects | PLAN_LIMIT:kpis | PLAN_LIMIT:users |
-- ESSAI_EXPIRE | DEMO_READONLY | DEMO_EXISTE | KPI_EPINGLES_MAX | DERNIER_ADMIN |
-- PROJET_INTROUVABLE | KPI_INTROUVABLE
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Types énumérés
-- -----------------------------------------------------------------------------
create type public.plan_org as enum ('essai', 'starter', 'pro', 'enterprise');
create type public.plan_choisi as enum ('starter', 'pro');
create type public.role_membre as enum ('admin', 'editeur', 'lecteur');
create type public.statut_projet as enum ('non_demarre', 'en_cours', 'en_retard', 'suspendu', 'termine', 'cloture');
create type public.frequence_kpi as enum ('hebdomadaire', 'mensuelle', 'trimestrielle', 'annuelle');
create type public.sens_kpi as enum ('croissant', 'decroissant');
create type public.agregation_kpi as enum ('cumul', 'dernier', 'moyenne');
create type public.type_demande as enum ('demo', 'pilote', 'enterprise');
create type public.langue as enum ('fr', 'en');

-- -----------------------------------------------------------------------------
-- Constantes et fonctions utilitaires (schéma privé, non exposé par l'API)
-- -----------------------------------------------------------------------------

-- Durée de l'essai ({{TRIAL_DAYS}}). Modifier ici et dans src/lib/constants.ts.
create function private.duree_essai_jours()
returns integer language sql immutable set search_path = ''
as $$ select 14 $$;

-- Limites par plan ; null = illimité. L'essai a les limites du plan Pro.
create function private.limite_plan(p_plan public.plan_org, p_ressource text)
returns integer language sql immutable set search_path = ''
as $$
  select case p_plan
    when 'enterprise' then null
    when 'starter' then case p_ressource when 'projects' then 1 when 'kpis' then 5 when 'users' then 1 end
    else case p_ressource when 'projects' then 3 when 'kpis' then 20 when 'users' then 5 end
  end
$$;

-- Vrai quand la requête vient d'un client (clé anon ou utilisateur connecté),
-- faux pour la clé service, les Edge Functions et les triggers d'Auth.
create function private.est_client()
returns boolean language sql stable set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
         in ('anon', 'authenticated')
$$;

-- Drapeau positionné par charger_projet_exemple() pour la durée de la transaction.
create function private.chargement_exemple()
returns boolean language sql stable set search_path = ''
as $$ select coalesce(current_setting('pilot.chargement_exemple', true), '') = 'on' $$;

create function private.uuid_ou_null(p_texte text)
returns uuid language plpgsql immutable set search_path = ''
as $$
begin
  return p_texte::uuid;
exception when invalid_text_representation then
  return null;
end
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.secteurs (
  id smallint generated always as identity primary key,
  code text not null unique,
  libelle text not null,
  ordre smallint not null
);

insert into public.secteurs (code, libelle, ordre) values
  ('eau_assainissement', 'Eau et assainissement', 1),
  ('sante', 'Santé', 2),
  ('education', 'Éducation', 3),
  ('agriculture_securite_alimentaire', 'Agriculture et sécurité alimentaire', 4),
  ('energie', 'Énergie', 5),
  ('gouvernance', 'Gouvernance', 6),
  ('genre_inclusion', 'Genre et inclusion', 7),
  ('environnement_climat', 'Environnement et climat', 8),
  ('emploi_entrepreneuriat', 'Emploi et entrepreneuriat', 9),
  ('autre', 'Autre', 10);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nom text check (char_length(nom) <= 120),
  email text check (char_length(email) <= 254),
  telephone text check (char_length(telephone) <= 30),
  langue public.langue not null default 'fr',
  created_at timestamptz not null default now()
);

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(nom) between 1 and 120),
  logo_path text check (char_length(logo_path) <= 300),
  pays text not null default 'SN' check (pays ~ '^[A-Z]{2}$'),
  devise_defaut text not null default 'XOF' check (devise_defaut ~ '^[A-Z]{3}$'),
  plan public.plan_org not null default 'essai',
  plan_souhaite public.plan_choisi,
  essai_fin timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create table public.memberships (
  -- Référence profiles (lui-même lié à auth.users) pour permettre la jointure côté API.
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  role public.role_membre not null,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id),
  -- MVP : une organisation par utilisateur (DECISIONS.md, levable plus tard).
  constraint memberships_une_org_par_utilisateur unique (user_id)
);
create index memberships_org_id_idx on public.memberships (org_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  email text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.role_membre not null default 'editeur',
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index invitations_org_id_idx on public.invitations (org_id);
create unique index invitations_une_en_attente_par_email
  on public.invitations (org_id, lower(email)) where accepted_at is null;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 160),
  description text check (char_length(description) <= 4000),
  date_debut date not null,
  date_fin date not null,
  budget numeric(16, 2) check (budget >= 0),
  devise text not null default 'XOF' check (devise ~ '^[A-Z]{3}$'),
  statut public.statut_projet not null default 'non_demarre',
  secteur_id smallint references public.secteurs (id),
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_dates_coherentes check (date_fin >= date_debut)
);
create index projects_org_id_idx on public.projects (org_id);
create unique index projects_un_exemple_par_org on public.projects (org_id) where is_demo;

create table public.kpis (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 160),
  description text check (char_length(description) <= 2000),
  unite text not null default '' check (char_length(unite) <= 40),
  cible numeric not null,
  valeur_base numeric not null default 0,
  frequence public.frequence_kpi not null default 'mensuelle',
  sens public.sens_kpi not null default 'croissant',
  type_agregation public.agregation_kpi not null default 'cumul',
  ordre integer not null default 0,
  epingle boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un cumul ne peut que croître : un objectif décroissant n'a pas de sens.
  constraint kpis_cumul_croissant check (not (type_agregation = 'cumul' and sens = 'decroissant'))
);
create index kpis_project_id_idx on public.kpis (project_id);
create index kpis_org_id_idx on public.kpis (org_id);

create table public.kpi_entries (
  id uuid primary key default gen_random_uuid(),
  kpi_id uuid not null references public.kpis (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  date date not null,
  valeur numeric not null,
  commentaire text check (char_length(commentaire) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kpi_entries_une_valeur_par_date unique (kpi_id, date)
);
create index kpi_entries_org_id_idx on public.kpi_entries (org_id);

-- Pas de clé étrangère sur org_id : le journal doit survivre aux suppressions en cascade.
create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  ancien jsonb,
  nouveau jsonb,
  user_id uuid,
  at timestamptz not null default now()
);
create index audit_log_org_at_idx on public.audit_log (org_id, at desc);
create index audit_log_row_idx on public.audit_log (row_id);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  type_demande public.type_demande not null default 'demo',
  nom text check (char_length(nom) <= 120),
  organisation text check (char_length(organisation) <= 160),
  email text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  besoin text check (char_length(besoin) <= 2000),
  ip_hash text check (char_length(ip_hash) <= 128),
  created_at timestamptz not null default now()
);
create index leads_ip_hash_created_at_idx on public.leads (ip_hash, created_at);

-- -----------------------------------------------------------------------------
-- Fonctions d'aide RLS (SECURITY DEFINER : évitent la récursion sur memberships)
-- -----------------------------------------------------------------------------

create function private.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid())
  )
$$;

create function private.org_role(p_org uuid)
returns public.role_membre language sql stable security definer set search_path = ''
as $$
  select m.role from public.memberships m
  where m.org_id = p_org and m.user_id = (select auth.uid())
$$;

create function private.peut_editer(p_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.org_role(p_org) in ('admin', 'editeur'), false) $$;

create function private.est_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.org_role(p_org) = 'admin', false) $$;

create function private.partage_une_org(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships moi
    join public.memberships autre on autre.org_id = moi.org_id
    where moi.user_id = (select auth.uid()) and autre.user_id = p_user
  )
$$;

-- Plan payant, ou essai non expiré.
create function private.org_peut_ecrire(p_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organisations o
    where o.id = p_org and (o.plan <> 'essai' or o.essai_fin > now())
  )
$$;

create function private.project_org(p_project uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select p.org_id from public.projects p where p.id = p_project $$;

-- -----------------------------------------------------------------------------
-- Fonctions de trigger
-- -----------------------------------------------------------------------------

create function private.maj_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create function private.renseigner_created_by()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.created_by := (select auth.uid());
  return new;
end
$$;

-- org_id dénormalisé : toujours dérivé du parent (la valeur du client est ignorée).
-- Exécutée avec les droits de l'appelant : un parent invisible pour lui est « introuvable ».
create function private.kpis_renseigner_org()
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

create function private.kpi_entries_renseigner_org()
returns trigger language plpgsql set search_path = ''
as $$
begin
  select k.org_id into new.org_id from public.kpis k where k.id = new.kpi_id;
  if new.org_id is null then
    raise exception 'KPI_INTROUVABLE' using errcode = 'P0001';
  end if;
  return new;
end
$$;

-- Fin d'essai : toute écriture d'un client est refusée (lecture et export restent possibles).
create function private.verifier_ecriture_essai()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_org uuid;
begin
  if not private.est_client() then
    return coalesce(new, old);
  end if;
  v_org := case when tg_op = 'DELETE' then old.org_id else new.org_id end;
  if not private.org_peut_ecrire(v_org) then
    raise exception 'ESSAI_EXPIRE' using errcode = 'P0001',
      hint = 'L''essai est terminé : l''organisation est en lecture seule.';
  end if;
  return coalesce(new, old);
end
$$;

create function private.verifier_quota_projets()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_plan public.plan_org;
  v_limite integer;
  v_nb integer;
begin
  if new.is_demo then
    return new; -- le projet exemple est exclu des quotas
  end if;
  select o.plan into v_plan from public.organisations o where o.id = new.org_id for update;
  v_limite := private.limite_plan(v_plan, 'projects');
  if v_limite is null then
    return new;
  end if;
  select count(*) into v_nb from public.projects p where p.org_id = new.org_id and not p.is_demo;
  if v_nb >= v_limite then
    raise exception 'PLAN_LIMIT:projects' using errcode = 'P0001', detail = format('%s/%s', v_nb, v_limite);
  end if;
  return new;
end
$$;

create function private.verifier_quota_kpis()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_plan public.plan_org;
  v_limite integer;
  v_nb integer;
begin
  if exists (select 1 from public.projects p where p.id = new.project_id and p.is_demo) then
    return new; -- quota non applicable ; la protection du projet exemple est un autre trigger
  end if;
  select o.plan into v_plan from public.organisations o where o.id = new.org_id for update;
  v_limite := private.limite_plan(v_plan, 'kpis');
  if v_limite is null then
    return new;
  end if;
  select count(*) into v_nb from public.kpis k where k.project_id = new.project_id;
  if v_nb >= v_limite then
    raise exception 'PLAN_LIMIT:kpis' using errcode = 'P0001', detail = format('%s/%s', v_nb, v_limite);
  end if;
  return new;
end
$$;

-- Utilisateurs = membres + invitations en attente non expirées.
create function private.verifier_quota_utilisateurs()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_plan public.plan_org;
  v_limite integer;
  v_nb integer;
begin
  select o.plan into v_plan from public.organisations o where o.id = new.org_id for update;
  v_limite := private.limite_plan(v_plan, 'users');
  if v_limite is null then
    return new;
  end if;
  select
    (select count(*) from public.memberships m where m.org_id = new.org_id)
    + (select count(*) from public.invitations i
       where i.org_id = new.org_id and i.accepted_at is null and i.expires_at > now())
  into v_nb;
  if v_nb >= v_limite then
    raise exception 'PLAN_LIMIT:users' using errcode = 'P0001', detail = format('%s/%s', v_nb, v_limite);
  end if;
  return new;
end
$$;

-- Projet exemple : saisies libres ; KPI figés (seuls epingle et ordre changent) ;
-- projet non modifiable (suppression par un admin autorisée, cascade comprise).
create function private.proteger_projet_exemple()
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
       and (to_jsonb(new) - array['epingle', 'ordre', 'updated_at'])
           is distinct from (to_jsonb(old) - array['epingle', 'ordre', 'updated_at']) then
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

create function private.verifier_epingles()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.epingle and (tg_op = 'INSERT' or not old.epingle) then
    if (select count(*) from public.kpis k
        where k.project_id = new.project_id and k.epingle and k.id <> new.id) >= 4 then
      raise exception 'KPI_EPINGLES_MAX' using errcode = 'P0001',
        hint = 'Quatre KPI au maximum peuvent être épinglés sur le dashboard.';
    end if;
  end if;
  return new;
end
$$;

create function private.garder_un_admin()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.role <> 'admin' or (tg_op = 'UPDATE' and new.role = 'admin') then
    return coalesce(new, old);
  end if;
  -- Suppression en cascade d'une organisation ou d'un utilisateur : autorisée.
  if not exists (select 1 from public.organisations o where o.id = old.org_id)
     or not exists (select 1 from auth.users u where u.id = old.user_id) then
    return coalesce(new, old);
  end if;
  perform 1 from public.organisations o where o.id = old.org_id for update;
  if not exists (
    select 1 from public.memberships m
    where m.org_id = old.org_id and m.role = 'admin' and m.user_id <> old.user_id
  ) then
    raise exception 'DERNIER_ADMIN' using errcode = 'P0001',
      hint = 'Une organisation doit garder au moins un administrateur.';
  end if;
  return coalesce(new, old);
end
$$;

-- Historique : alimenté uniquement par triggers.
create function private.journaliser()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_ligne jsonb := to_jsonb(coalesce(new, old));
begin
  if private.chargement_exemple() then
    return null;
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    return null;
  end if;
  insert into public.audit_log (org_id, table_name, row_id, action, ancien, nouveau, user_id)
  values (
    (v_ligne ->> 'org_id')::uuid,
    tg_table_name,
    (v_ligne ->> 'id')::uuid,
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    (select auth.uid())
  );
  return null;
end
$$;

-- Inscription : rejoint l'organisation si un jeton d'invitation valide est fourni,
-- sinon crée une organisation d'essai dont la personne est admin.
create function private.creer_compte()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_jeton text := v_meta ->> 'invitation';
  v_plan text := v_meta ->> 'plan';
  v_invitation public.invitations;
  v_org uuid;
begin
  insert into public.profiles (id, nom, email)
  values (new.id, nullif(left(trim(coalesce(v_meta ->> 'nom', '')), 120), ''), new.email);

  if v_jeton is not null and char_length(v_jeton) between 20 and 200 then
    select i.* into v_invitation
    from public.invitations i
    where i.token_hash = encode(sha256(convert_to(v_jeton, 'UTF8')), 'hex')
      and i.accepted_at is null
      and i.expires_at > now()
      and lower(i.email) = lower(new.email)
    for update;

    if found then
      update public.invitations set accepted_at = now() where id = v_invitation.id;
      insert into public.memberships (user_id, org_id, role)
      values (new.id, v_invitation.org_id, v_invitation.role);
      return new;
    end if;
  end if;

  insert into public.organisations (nom, plan, plan_souhaite, essai_fin)
  values (
    coalesce(nullif(left(trim(coalesce(v_meta ->> 'organisation', '')), 120), ''), 'Mon organisation'),
    'essai',
    case when v_plan in ('starter', 'pro') then v_plan::public.plan_choisi end,
    now() + make_interval(days => private.duree_essai_jours())
  )
  returning id into v_org;

  insert into public.memberships (user_id, org_id, role) values (new.id, v_org, 'admin');
  return new;
end
$$;

create function private.synchroniser_email_profil()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Triggers (exécutés par ordre alphabétique de nom : préfixes numériques)
-- -----------------------------------------------------------------------------

create trigger t10_creer_compte after insert on auth.users
  for each row execute function private.creer_compte();
create trigger t20_synchroniser_email after update of email on auth.users
  for each row execute function private.synchroniser_email_profil();

-- projects
create trigger t10_created_by before insert on public.projects
  for each row execute function private.renseigner_created_by();
create trigger t20_essai before insert or update or delete on public.projects
  for each row execute function private.verifier_ecriture_essai();
create trigger t30_quota before insert on public.projects
  for each row execute function private.verifier_quota_projets();
create trigger t40_exemple before update on public.projects
  for each row execute function private.proteger_projet_exemple();
create trigger t90_updated_at before update on public.projects
  for each row execute function private.maj_updated_at();
create trigger t99_audit after insert or update or delete on public.projects
  for each row execute function private.journaliser();

-- kpis
create trigger t10_org_id before insert on public.kpis
  for each row execute function private.kpis_renseigner_org();
create trigger t20_essai before insert or update or delete on public.kpis
  for each row execute function private.verifier_ecriture_essai();
create trigger t30_quota before insert on public.kpis
  for each row execute function private.verifier_quota_kpis();
create trigger t40_exemple before insert or update or delete on public.kpis
  for each row execute function private.proteger_projet_exemple();
create trigger t50_epingles before insert or update of epingle on public.kpis
  for each row execute function private.verifier_epingles();
create trigger t90_updated_at before update on public.kpis
  for each row execute function private.maj_updated_at();
create trigger t99_audit after insert or update or delete on public.kpis
  for each row execute function private.journaliser();

-- kpi_entries
create trigger t10_org_id before insert on public.kpi_entries
  for each row execute function private.kpi_entries_renseigner_org();
create trigger t15_created_by before insert on public.kpi_entries
  for each row execute function private.renseigner_created_by();
create trigger t20_essai before insert or update or delete on public.kpi_entries
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.kpi_entries
  for each row execute function private.maj_updated_at();
create trigger t99_audit after insert or update or delete on public.kpi_entries
  for each row execute function private.journaliser();

-- memberships
create trigger t20_essai before insert or update or delete on public.memberships
  for each row execute function private.verifier_ecriture_essai();
create trigger t30_dernier_admin before update or delete on public.memberships
  for each row execute function private.garder_un_admin();

-- invitations
create trigger t20_essai before insert or update or delete on public.invitations
  for each row execute function private.verifier_ecriture_essai();
create trigger t30_quota before insert on public.invitations
  for each row execute function private.verifier_quota_utilisateurs();

-- -----------------------------------------------------------------------------
-- Fonctions appelables par le client (RPC)
-- -----------------------------------------------------------------------------

-- Aperçu d'une invitation pour la page d'inscription : nom de l'organisation
-- et e-mail masqué, uniquement si le jeton est valide.
create function public.invitation_apercu(p_jeton text)
returns table (organisation text, email_masque text)
language sql stable security definer set search_path = ''
as $$
  select
    o.nom,
    left(split_part(i.email, '@', 1), 1) || '***@' || split_part(i.email, '@', 2)
  from public.invitations i
  join public.organisations o on o.id = i.org_id
  where char_length(p_jeton) between 20 and 200
    and i.token_hash = encode(sha256(convert_to(p_jeton, 'UTF8')), 'hex')
    and i.accepted_at is null
    and i.expires_at > now()
$$;

-- Projet exemple : 8 KPI, 12 mois de saisies aux trajectoires variées
-- (2 en avance, 3 en vigilance, 2 en retard, 1 sans saisie récente).
create function public.charger_projet_exemple()
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

  perform set_config('pilot.chargement_exemple', 'off', true);
  return v_projet;
end
$$;

-- -----------------------------------------------------------------------------
-- Droits (les privilèges par défaut de Supabase accordent tout à anon et
-- authenticated : on retire tout, puis on accorde colonne par colonne).
-- -----------------------------------------------------------------------------

revoke all on public.secteurs, public.profiles, public.organisations, public.memberships,
  public.invitations, public.projects, public.kpis, public.kpi_entries, public.audit_log,
  public.leads from anon, authenticated;

grant select on public.secteurs to authenticated;

grant select on public.profiles to authenticated;
grant update (nom, telephone, langue) on public.profiles to authenticated;

grant select on public.organisations to authenticated;
grant update (nom, logo_path, pays, devise_defaut) on public.organisations to authenticated;

grant select, delete on public.memberships to authenticated;
grant update (role) on public.memberships to authenticated;

grant select (id, org_id, email, role, expires_at, accepted_at, invited_by, created_at) on public.invitations to authenticated;
grant delete on public.invitations to authenticated;

grant select, delete on public.projects to authenticated;
grant insert (org_id, nom, description, date_debut, date_fin, budget, devise, statut, secteur_id) on public.projects to authenticated;
grant update (nom, description, date_debut, date_fin, budget, devise, statut, secteur_id) on public.projects to authenticated;

grant select, delete on public.kpis to authenticated;
grant insert (project_id, nom, description, unite, cible, valeur_base, frequence, sens, type_agregation, ordre, epingle) on public.kpis to authenticated;
grant update (nom, description, unite, cible, valeur_base, frequence, sens, type_agregation, ordre, epingle) on public.kpis to authenticated;

grant select, delete on public.kpi_entries to authenticated;
grant insert (kpi_id, date, valeur, commentaire) on public.kpi_entries to authenticated;
grant update (date, valeur, commentaire) on public.kpi_entries to authenticated;

grant select on public.audit_log to authenticated;
-- leads : aucun droit client. Écriture par l'Edge Function submit-lead (clé service).

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

revoke execute on function public.invitation_apercu(text) from public;
grant execute on function public.invitation_apercu(text) to anon, authenticated, service_role;
revoke execute on function public.charger_projet_exemple() from public, anon;
grant execute on function public.charger_projet_exemple() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.secteurs enable row level security;
alter table public.profiles enable row level security;
alter table public.organisations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.projects enable row level security;
alter table public.kpis enable row level security;
alter table public.kpi_entries enable row level security;
alter table public.audit_log enable row level security;
alter table public.leads enable row level security;

create policy "secteurs : lecture" on public.secteurs
  for select to authenticated using (true);

create policy "profils : lecture dans l'organisation" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.partage_une_org(id));
create policy "profils : modification de son profil" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "organisations : lecture par les membres" on public.organisations
  for select to authenticated using (private.is_org_member(id));
create policy "organisations : paramètres par les admins" on public.organisations
  for update to authenticated using (private.est_admin(id)) with check (private.est_admin(id));

create policy "membres : lecture par les membres" on public.memberships
  for select to authenticated using (private.is_org_member(org_id));
create policy "membres : rôles par les admins" on public.memberships
  for update to authenticated using (private.est_admin(org_id)) with check (private.est_admin(org_id));
create policy "membres : retrait par les admins" on public.memberships
  for delete to authenticated using (private.est_admin(org_id));

create policy "invitations : lecture par les admins" on public.invitations
  for select to authenticated using (private.est_admin(org_id));
create policy "invitations : révocation par les admins" on public.invitations
  for delete to authenticated using (private.est_admin(org_id));

create policy "projets : lecture par les membres" on public.projects
  for select to authenticated using (private.is_org_member(org_id));
create policy "projets : création par admin et éditeur" on public.projects
  for insert to authenticated with check (private.peut_editer(org_id));
create policy "projets : modification par admin et éditeur" on public.projects
  for update to authenticated using (private.peut_editer(org_id)) with check (private.peut_editer(org_id));
create policy "projets : suppression par les admins" on public.projects
  for delete to authenticated using (private.est_admin(org_id));

create policy "kpis : lecture par les membres" on public.kpis
  for select to authenticated using (private.is_org_member(org_id));
create policy "kpis : création par admin et éditeur" on public.kpis
  for insert to authenticated with check (private.peut_editer(org_id));
create policy "kpis : modification par admin et éditeur" on public.kpis
  for update to authenticated using (private.peut_editer(org_id)) with check (private.peut_editer(org_id));
create policy "kpis : suppression par admin et éditeur" on public.kpis
  for delete to authenticated using (private.peut_editer(org_id));

create policy "saisies : lecture par les membres" on public.kpi_entries
  for select to authenticated using (private.is_org_member(org_id));
create policy "saisies : création par admin et éditeur" on public.kpi_entries
  for insert to authenticated with check (private.peut_editer(org_id));
create policy "saisies : modification par admin et éditeur" on public.kpi_entries
  for update to authenticated using (private.peut_editer(org_id)) with check (private.peut_editer(org_id));
create policy "saisies : suppression par admin et éditeur" on public.kpi_entries
  for delete to authenticated using (private.peut_editer(org_id));

create policy "historique : lecture par les membres" on public.audit_log
  for select to authenticated using (private.is_org_member(org_id));

-- leads : RLS active sans aucune politique = aucun accès client.

-- -----------------------------------------------------------------------------
-- Temps réel : le dashboard s'abonne aux saisies (la RLS filtre les événements).
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.kpi_entries;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Stockage privé : chemins préfixés par org_id/
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('logos', 'logos', false, 1048576, array['image/png', 'image/jpeg', 'image/webp']),
  ('documents', 'documents', false, 20971520, null)
on conflict (id) do nothing;

create policy "logos : lecture par les membres" on storage.objects
  for select to authenticated
  using (bucket_id = 'logos' and private.is_org_member(private.uuid_ou_null((storage.foldername(name))[1])));
create policy "logos : ajout par les admins" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos' and private.est_admin(private.uuid_ou_null((storage.foldername(name))[1])));
create policy "logos : remplacement par les admins" on storage.objects
  for update to authenticated
  using (bucket_id = 'logos' and private.est_admin(private.uuid_ou_null((storage.foldername(name))[1])));
create policy "logos : suppression par les admins" on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and private.est_admin(private.uuid_ou_null((storage.foldername(name))[1])));

create policy "documents : lecture par les membres" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and private.is_org_member(private.uuid_ou_null((storage.foldername(name))[1])));
create policy "documents : ajout par admin et éditeur" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and private.peut_editer(private.uuid_ou_null((storage.foldername(name))[1])));
create policy "documents : remplacement par admin et éditeur" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and private.peut_editer(private.uuid_ou_null((storage.foldername(name))[1])));
create policy "documents : suppression par admin et éditeur" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and private.peut_editer(private.uuid_ou_null((storage.foldername(name))[1])));
