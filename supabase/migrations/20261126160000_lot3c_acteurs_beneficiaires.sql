-- =============================================================================
-- Pilot M&E — Migration Lot 3c : acteurs et bénéficiaires
-- Annuaire d'acteurs de l'organisation (bailleurs, partenaires, prestataires, autorités locales), leur rôle dans chaque
-- projet, et les effectifs de bénéficiaires par période, catégorie, sexe et tranche d'âge.
--
-- Mêmes règles que les lots précédents : RLS (lecture par les membres, écriture par admin et éditeur), org_id dérivé du
-- projet et immuable, droits par colonne, ESSAI_EXPIRE après la fin d'essai.
--
-- Choix :
--   - L'annuaire est propre à l'organisation (un acteur peut intervenir dans plusieurs projets) ; le rôle se saisit par
--     projet (projet_acteurs). Supprimer un acteur supprime ses rôles et est réservé aux admins ; un nom d'acteur est
--     unique dans l'organisation, sans tenir compte de la casse.
--   - **Aucune fiche nominative de bénéficiaire.** Le brief ne les admet que si elles sont nécessaires, avec une base
--     légale et des permissions renforcées (loi 2008-12) : on ne stocke que des effectifs agrégés, ce qui évite de
--     traiter des données personnelles de bénéficiaires. Une ligne = un effectif pour une période, une catégorie, un
--     sexe, une tranche d'âge et un lieu (texte libre, en attendant le référentiel de localités du 3d).
--   - Une même combinaison n'existe qu'une fois (index unique) : pas de double saisie qui gonflerait les totaux.
--     Des effectifs de périodes différentes ne s'additionnent pas toujours (une personne peut être comptée à chaque
--     période) : l'application le dit.
--
-- Projet exemple : il reçoit quatre acteurs et des effectifs fictifs. Les acteurs de l'exemple sont marqués
-- (acteurs.exemple, non modifiable par le client) et supprimés avec le projet exemple, pour ne pas laisser de données
-- fictives dans l'annuaire de l'organisation.
-- =============================================================================

create type public.type_acteur as enum ('bailleur', 'partenaire', 'prestataire', 'autorite_locale', 'autre');
create type public.sexe_beneficiaire as enum ('femme', 'homme', 'non_precise');
create type public.tranche_age as enum ('0_4', '5_14', '15_24', '25_59', '60_plus', 'non_precise');

create table public.acteurs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 160),
  type public.type_acteur not null,
  description text check (char_length(description) <= 1000),
  -- Coordonnées d'une personne ou d'un service à contacter, saisies par l'organisation.
  contact text check (char_length(contact) <= 160),
  email text check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telephone text check (char_length(telephone) <= 40),
  notes text check (char_length(notes) <= 1000),
  -- Acteur fictif du projet exemple : fixé par la base, jamais par le client.
  exemple boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index acteurs_nom_idx on public.acteurs (org_id, lower(nom));

create table public.projet_acteurs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  acteur_id uuid not null references public.acteurs (id) on delete cascade,
  role text not null check (char_length(role) between 1 and 120),
  notes text check (char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projet_acteurs_unique unique (project_id, acteur_id)
);
create index projet_acteurs_org_id_idx on public.projet_acteurs (org_id);
create index projet_acteurs_acteur_id_idx on public.projet_acteurs (acteur_id);

create table public.beneficiaires_effectifs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  periode_debut date not null,
  periode_fin date not null,
  categorie text not null check (char_length(categorie) between 1 and 120),
  sexe public.sexe_beneficiaire not null default 'non_precise',
  tranche_age public.tranche_age not null default 'non_precise',
  effectif integer not null check (effectif between 0 and 100000000),
  -- Texte libre au Lot 3c ; le référentiel de localités (3d) ajoutera localite_id.
  lieu text check (char_length(lieu) <= 160),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beneficiaires_periode_coherente check (periode_fin >= periode_debut and periode_debut >= '2000-01-01')
);
create unique index beneficiaires_combinaison_idx on public.beneficiaires_effectifs
  (project_id, periode_debut, periode_fin, lower(categorie), sexe, tranche_age, lower(coalesce(lieu, '')));
create index beneficiaires_org_id_idx on public.beneficiaires_effectifs (org_id);

-- Triggers --------------------------------------------------------------------------------------------------
create function private.verifier_acteur_meme_org()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from public.acteurs a where a.id = new.acteur_id and a.org_id = new.org_id) then
    raise exception 'RATTACHEMENT_INVALIDE' using errcode = 'P0001',
      hint = 'L''acteur doit appartenir à l''organisation du projet.';
  end if;
  return new;
end
$$;

create trigger t11_created_by before insert on public.acteurs
  for each row execute function private.renseigner_created_by();
create trigger t20_essai before insert or update or delete on public.acteurs
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.acteurs
  for each row execute function private.maj_updated_at();

create trigger t10_org_id before insert on public.projet_acteurs
  for each row execute function private.renseigner_org_depuis_projet();
create trigger t11_created_by before insert on public.projet_acteurs
  for each row execute function private.renseigner_created_by();
create trigger t12_acteur before insert on public.projet_acteurs
  for each row execute function private.verifier_acteur_meme_org();
create trigger t20_essai before insert or update or delete on public.projet_acteurs
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.projet_acteurs
  for each row execute function private.maj_updated_at();

create trigger t10_org_id before insert on public.beneficiaires_effectifs
  for each row execute function private.renseigner_org_depuis_projet();
create trigger t11_created_by before insert on public.beneficiaires_effectifs
  for each row execute function private.renseigner_created_by();
create trigger t20_essai before insert or update or delete on public.beneficiaires_effectifs
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.beneficiaires_effectifs
  for each row execute function private.maj_updated_at();

-- Droits ------------------------------------------------------------------------------------------------------
revoke all on public.acteurs, public.projet_acteurs, public.beneficiaires_effectifs from anon, authenticated;

grant select, delete on public.acteurs to authenticated;
grant insert (org_id, nom, type, description, contact, email, telephone, notes) on public.acteurs to authenticated;
grant update (nom, type, description, contact, email, telephone, notes) on public.acteurs to authenticated;

grant select, delete on public.projet_acteurs to authenticated;
grant insert (project_id, acteur_id, role, notes) on public.projet_acteurs to authenticated;
grant update (role, notes) on public.projet_acteurs to authenticated;

grant select, delete on public.beneficiaires_effectifs to authenticated;
grant insert (project_id, periode_debut, periode_fin, categorie, sexe, tranche_age, effectif, lieu)
  on public.beneficiaires_effectifs to authenticated;
grant update (periode_debut, periode_fin, categorie, sexe, tranche_age, effectif, lieu)
  on public.beneficiaires_effectifs to authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- RLS ---------------------------------------------------------------------------------------------------------
alter table public.acteurs enable row level security;
alter table public.projet_acteurs enable row level security;
alter table public.beneficiaires_effectifs enable row level security;

create policy "acteurs : lecture par les membres" on public.acteurs
  for select to authenticated using (private.is_org_member(org_id));
create policy "acteurs : création par admin et éditeur" on public.acteurs
  for insert to authenticated with check (private.peut_editer(org_id));
create policy "acteurs : modification par admin et éditeur" on public.acteurs
  for update to authenticated using (private.peut_editer(org_id)) with check (private.peut_editer(org_id));
create policy "acteurs : suppression par les admins" on public.acteurs
  for delete to authenticated using (private.est_admin(org_id));

do $$
declare
  v_table text;
begin
  foreach v_table in array array['projet_acteurs', 'beneficiaires_effectifs'] loop
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

-- Contenu du projet exemple (données fictives) ----------------------------------------------------------------

-- Quatre acteurs fictifs (leur nom dit « fictif ») avec leur rôle dans le projet exemple, et des effectifs de
-- bénéficiaires sur deux semestres glissants. Les acteurs de l'exemple portent exemple = true.
create function private.charger_contenu_exemple_lot3c(p_projet uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
begin
  select p.org_id into v_org from public.projects p where p.id = p_projet and p.is_demo;
  if v_org is null or exists (select 1 from public.projet_acteurs x where x.project_id = p_projet) then
    return;
  end if;

  insert into public.acteurs (org_id, nom, type, description, contact, exemple)
  values
    (v_org, 'Fondation pour l''eau et la santé (fictive)', 'bailleur', 'Finance la réhabilitation des forages.', 'Chargée de programme', true),
    (v_org, 'Association des usagers de l''eau (fictive)', 'partenaire', 'Met en œuvre les actions avec les comités de gestion.', 'Président du bureau', true),
    (v_org, 'Entreprise de forage (fictive)', 'prestataire', 'Réalise les travaux de réhabilitation.', 'Responsable de chantier', true),
    (v_org, 'Mairie de la commune d''intervention (fictive)', 'autorite_locale', 'Autorité locale du site, associée aux réceptions.', 'Secrétaire municipal', true)
  on conflict do nothing;

  insert into public.projet_acteurs (project_id, acteur_id, role)
  select p_projet, a.id, r.role
  from (values
    ('Fondation pour l''eau et la santé (fictive)', 'Bailleur principal'),
    ('Association des usagers de l''eau (fictive)', 'Partenaire de mise en œuvre'),
    ('Entreprise de forage (fictive)', 'Prestataire des travaux'),
    ('Mairie de la commune d''intervention (fictive)', 'Autorité locale, cosignataire des réceptions')
  ) as r(nom, role)
  join public.acteurs a on a.org_id = v_org and lower(a.nom) = lower(r.nom)
  on conflict do nothing;

  -- Effectifs : deux semestres glissants, deux catégories, ventilés par sexe et tranche d'âge (fictifs).
  insert into public.beneficiaires_effectifs
    (project_id, periode_debut, periode_fin, categorie, sexe, tranche_age, effectif, lieu)
  select p_projet, s.debut, s.fin, c.categorie, c.sexe::public.sexe_beneficiaire, c.tranche::public.tranche_age,
         (c.base * s.coef)::integer, 'Zone d''intervention'
  from (values
    (current_date - 364, current_date - 183, 0.6),
    (current_date - 182, current_date, 1.0)
  ) as s(debut, fin, coef)
  cross join (values
    ('Usagers des points d''eau réhabilités', 'femme', '5_14', 420),
    ('Usagers des points d''eau réhabilités', 'homme', '5_14', 390),
    ('Usagers des points d''eau réhabilités', 'femme', '15_24', 510),
    ('Usagers des points d''eau réhabilités', 'homme', '15_24', 470),
    ('Usagers des points d''eau réhabilités', 'femme', '25_59', 880),
    ('Usagers des points d''eau réhabilités', 'homme', '25_59', 760),
    ('Usagers des points d''eau réhabilités', 'femme', '60_plus', 170),
    ('Usagers des points d''eau réhabilités', 'homme', '60_plus', 140),
    ('Participants aux séances d''hygiène', 'femme', 'non_precise', 640),
    ('Participants aux séances d''hygiène', 'homme', 'non_precise', 310)
  ) as c(categorie, sexe, tranche, base);
end
$$;

create function private.charger_contenu_exemple_lot3c_trigger()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.charger_contenu_exemple_lot3c(new.id);
  return null;
end
$$;

create trigger t97_contenu_exemple_lot3c after insert on public.projects
  for each row when (new.is_demo) execute function private.charger_contenu_exemple_lot3c_trigger();

-- Quand le projet exemple est supprimé, ses acteurs fictifs quittent l'annuaire de l'organisation.
create function private.retirer_acteurs_exemple()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.acteurs a where a.org_id = old.org_id and a.exemple;
  return null;
end
$$;

create trigger t98_retirer_acteurs_exemple after delete on public.projects
  for each row when (old.is_demo) execute function private.retirer_acteurs_exemple();

-- Les projets exemples déjà chargés reçoivent le même contenu.
do $$
declare
  v_projet uuid;
begin
  for v_projet in select p.id from public.projects p where p.is_demo loop
    perform private.charger_contenu_exemple_lot3c(v_projet);
  end loop;
end
$$;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;
