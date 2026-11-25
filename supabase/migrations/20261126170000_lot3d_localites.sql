-- =============================================================================
-- Pilot M&E — Migration Lot 3d : localités et zones d'intervention
-- Un référentiel de localités à plusieurs niveaux (région, département, arrondissement, commune, village, quartier),
-- les zones d'intervention d'un projet, et le rattachement facultatif d'une saisie d'indicateur ou d'une réalisation
-- à une localité.
--
-- Mêmes règles que les lots précédents : RLS (lecture par les membres, écriture par admin et éditeur), org_id dérivé
-- du projet et immuable, droits par colonne, ESSAI_EXPIRE après la fin d'essai.
--
-- Choix :
--   - Deux sortes de localités dans la même table. Le **référentiel de la plateforme** (org_id nul) est lisible par
--     tout utilisateur connecté et n'est écrit que par la plateforme (migration, clé de service) : aucun droit
--     d'écriture pour le client. Les **localités d'une organisation** (org_id renseigné) sont lues par ses membres et
--     écrites par ses admins et éditeurs. Le brief ne prévoyait que le référentiel ; sans les localités propres à
--     l'organisation, la fonction ne servirait qu'aux lieux que la plateforme a chargés.
--   - **Le référentiel ne contient que ce qui a une source vérifiable** : la commune de Yoff, sa hiérarchie
--     administrative et les sept quartiers de son village traditionnel. Chaque ligne porte sa source. Une coordonnée
--     n'est posée que si elle est sourcée : les quartiers n'en ont pas, aucune n'est inventée. Le reste du Sénégal
--     n'est pas chargé : aucun jeu de données complet, daté et sourcé n'a été fourni.
--   - Une localité sans coordonnées reste utilisable (zone d'un projet, localité d'une saisie) ; elle n'apparaît
--     simplement pas sur la carte. Les coordonnées vont par paire (les deux ou aucune).
--   - Le niveau est ordonné : un enfant a un niveau strictement inférieur à celui de son parent, ce qui interdit les
--     cycles. Un niveau peut être sauté (un village directement sous une commune). Niveau et parent ne changent plus.
--   - Un nom est unique sous un même parent, sans tenir compte de la casse, et une organisation ne recrée pas une
--     localité du référentiel qui porte le même nom sous le même parent.
--   - Une saisie ou une réalisation ne peut être rattachée qu'à une localité qui est zone d'intervention de son
--     projet. Retirer une zone ne modifie pas les saisies déjà rattachées : elles gardent leur localité.
--   - On ne supprime pas une localité qui a des enfants ou qui est utilisée (clé étrangère sans action, erreur 23503) ;
--     le choix « sans action » plutôt que « restreindre » laisse aboutir la suppression d'une organisation ou d'un
--     projet, qui efface localités et rattachements dans la même instruction (même raison qu'au 3a).
--
-- Projet exemple : il est rattaché à la commune de Yoff, à titre d'illustration (ses données restent fictives).
-- =============================================================================

create type public.niveau_localite as enum ('region', 'departement', 'arrondissement', 'commune', 'village', 'quartier');

create table public.localites (
  id uuid primary key default gen_random_uuid(),
  -- Nul : référentiel de la plateforme. Renseigné : localité propre à l'organisation.
  org_id uuid references public.organisations (id) on delete cascade,
  parent_id uuid references public.localites (id),
  niveau public.niveau_localite not null,
  nom text not null check (char_length(nom) between 1 and 160),
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  -- D'où viennent le nom, le rattachement et les coordonnées. Obligatoire pour le référentiel.
  source text check (char_length(source) <= 400),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint localites_coordonnees_ensemble check ((latitude is null) = (longitude is null)),
  constraint localites_source_referentiel check (org_id is not null or source is not null)
);
create unique index localites_nom_idx on public.localites (
  coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(nom)
);
create index localites_org_id_idx on public.localites (org_id);
create index localites_parent_id_idx on public.localites (parent_id);

create table public.projet_localites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  localite_id uuid not null references public.localites (id),
  notes text check (char_length(notes) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projet_localites_unique unique (project_id, localite_id)
);
create index projet_localites_org_id_idx on public.projet_localites (org_id);
create index projet_localites_localite_id_idx on public.projet_localites (localite_id);

-- Rattachement facultatif d'une saisie d'indicateur et d'une réalisation à une localité.
alter table public.kpi_entries add column localite_id uuid references public.localites (id);
alter table public.realisations add column localite_id uuid references public.localites (id);
create index kpi_entries_localite_id_idx on public.kpi_entries (localite_id);
create index realisations_localite_id_idx on public.realisations (localite_id);

-- Triggers --------------------------------------------------------------------------------------------------
-- La vérification de fin d'essai ignore une ligne sans organisation : c'est une ligne du référentiel de la plateforme,
-- que la RLS refuse au client (erreur 42501, pas « essai terminé »). Sur les autres tables, org_id n'est jamais nul.
create or replace function private.verifier_ecriture_essai()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_org uuid;
begin
  if not private.est_client() then
    return coalesce(new, old);
  end if;
  v_org := case when tg_op = 'DELETE' then old.org_id else new.org_id end;
  if v_org is null then
    return coalesce(new, old);
  end if;
  if not private.org_peut_ecrire(v_org) then
    raise exception 'ESSAI_EXPIRE' using errcode = 'P0001',
      hint = 'L''essai est terminé : l''organisation est en lecture seule.';
  end if;
  return coalesce(new, old);
end
$$;

-- Parent visible de l'organisation, niveau strictement inférieur, pas de doublon du référentiel.
create function private.verifier_localite()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_parent public.localites;
begin
  if new.parent_id is not null then
    select * into v_parent from public.localites l where l.id = new.parent_id;
    -- Le parent d'une autre organisation n'est pas visible (RLS) ; on le vérifie aussi pour la clé de service.
    if v_parent.id is null or (v_parent.org_id is not null and v_parent.org_id is distinct from new.org_id) then
      raise exception 'LOCALITE_PARENT_INVALIDE' using errcode = 'P0001',
        hint = 'Le parent doit être une localité du référentiel ou de votre organisation.';
    end if;
    if v_parent.niveau >= new.niveau then
      raise exception 'LOCALITE_NIVEAU_INVALIDE' using errcode = 'P0001',
        hint = 'Le niveau d''une localité doit être inférieur à celui de son parent.';
    end if;
  end if;
  if new.org_id is not null and exists (
    select 1 from public.localites r
    where r.org_id is null and r.parent_id is not distinct from new.parent_id and lower(r.nom) = lower(new.nom)
  ) then
    raise exception 'LOCALITE_EXISTE' using errcode = 'P0001',
      hint = 'Cette localité existe déjà dans le référentiel de la plateforme.';
  end if;
  return new;
end
$$;

-- Une zone d'intervention est une localité du référentiel ou de l'organisation du projet.
create function private.verifier_zone_projet()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.localites l where l.id = new.localite_id and (l.org_id is null or l.org_id = new.org_id)
  ) then
    raise exception 'LOCALITE_INTROUVABLE' using errcode = 'P0001',
      hint = 'La localité doit appartenir au référentiel ou à l''organisation du projet.';
  end if;
  return new;
end
$$;

-- Une saisie ou une réalisation ne se rattache qu'à une zone d'intervention de son projet.
create function private.verifier_localite_du_projet()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_projet uuid;
begin
  if new.localite_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.localite_id is not distinct from old.localite_id then
    return new;
  end if;
  -- Deux instructions séparées : plpgsql ne résout les champs de NEW que pour la branche exécutée.
  if tg_table_name = 'kpi_entries' then
    select k.project_id into v_projet from public.kpis k where k.id = new.kpi_id;
  else
    v_projet := new.project_id;
  end if;
  if not exists (
    select 1 from public.projet_localites pl where pl.project_id = v_projet and pl.localite_id = new.localite_id
  ) then
    raise exception 'LOCALITE_HORS_PROJET' using errcode = 'P0001',
      hint = 'La localité doit d''abord être une zone d''intervention du projet.';
  end if;
  return new;
end
$$;

create trigger t11_created_by before insert on public.localites
  for each row execute function private.renseigner_created_by();
create trigger t12_localite before insert on public.localites
  for each row execute function private.verifier_localite();
create trigger t20_essai before insert or update or delete on public.localites
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.localites
  for each row execute function private.maj_updated_at();

create trigger t10_org_id before insert on public.projet_localites
  for each row execute function private.renseigner_org_depuis_projet();
create trigger t11_created_by before insert on public.projet_localites
  for each row execute function private.renseigner_created_by();
create trigger t12_zone before insert on public.projet_localites
  for each row execute function private.verifier_zone_projet();
create trigger t20_essai before insert or update or delete on public.projet_localites
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.projet_localites
  for each row execute function private.maj_updated_at();

create trigger t16_localite before insert or update of localite_id on public.kpi_entries
  for each row execute function private.verifier_localite_du_projet();
create trigger t14_localite before insert or update of localite_id on public.realisations
  for each row execute function private.verifier_localite_du_projet();

-- Droits ------------------------------------------------------------------------------------------------------
revoke all on public.localites, public.projet_localites from anon, authenticated;

-- Le référentiel (org_id nul) n'a aucune politique d'écriture : seul le droit sur la table ne suffit pas.
grant select, delete on public.localites to authenticated;
grant insert (org_id, parent_id, niveau, nom, latitude, longitude, source) on public.localites to authenticated;
grant update (nom, latitude, longitude, source) on public.localites to authenticated;

grant select, delete on public.projet_localites to authenticated;
grant insert (project_id, localite_id, notes) on public.projet_localites to authenticated;
grant update (notes) on public.projet_localites to authenticated;

grant select (localite_id) on public.kpi_entries to authenticated;
grant insert (localite_id) on public.kpi_entries to authenticated;
grant update (localite_id) on public.kpi_entries to authenticated;
grant select (localite_id) on public.realisations to authenticated;
grant insert (localite_id) on public.realisations to authenticated;
grant update (localite_id) on public.realisations to authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- RLS ---------------------------------------------------------------------------------------------------------
alter table public.localites enable row level security;
alter table public.projet_localites enable row level security;

create policy "localites : lecture du référentiel et de son organisation" on public.localites
  for select to authenticated using (org_id is null or private.is_org_member(org_id));
create policy "localites : création par admin et éditeur" on public.localites
  for insert to authenticated with check (org_id is not null and private.peut_editer(org_id));
create policy "localites : modification par admin et éditeur" on public.localites
  for update to authenticated
  using (org_id is not null and private.peut_editer(org_id))
  with check (org_id is not null and private.peut_editer(org_id));
create policy "localites : suppression par admin et éditeur" on public.localites
  for delete to authenticated using (org_id is not null and private.peut_editer(org_id));

create policy "projet_localites : lecture par les membres" on public.projet_localites
  for select to authenticated using (private.is_org_member(org_id));
create policy "projet_localites : création par admin et éditeur" on public.projet_localites
  for insert to authenticated with check (private.peut_editer(org_id));
create policy "projet_localites : modification par admin et éditeur" on public.projet_localites
  for update to authenticated using (private.peut_editer(org_id)) with check (private.peut_editer(org_id));
create policy "projet_localites : suppression par admin et éditeur" on public.projet_localites
  for delete to authenticated using (private.peut_editer(org_id));

-- Référentiel de la plateforme : Yoff -----------------------------------------------------------------------------
-- Tout ce qui suit a une source écrite sur la ligne. Les coordonnées de la commune sont celles d'OpenStreetMap
-- (relation 12988608), recoupées avec la position du plan communal (14°46' N, 17°29' O : écart d'environ 1,7 km, dû
-- à l'arrondi à la minute). Les quartiers n'ont pas de coordonnées sourcées : il n'y en a aucune.
do $$
declare
  v_region uuid;
  v_departement uuid;
  v_arrondissement uuid;
  v_commune uuid;
  v_village uuid;
  v_quartier text;
  v_src_admin constant text :=
    'Vie-publique.sn, fiche de la commune de Yoff (région, département, arrondissement) ; plan de développement '
    'communal durable de Yoff (2023), tutelle de la sous-préfecture de l''arrondissement des Almadies.';
  v_src_pdc constant text :=
    'Plan de développement communal durable (PDC-D) de Yoff (2023), § 5.3.3 : le village traditionnel est composé de '
    'sept quartiers.';
begin
  insert into public.localites (niveau, nom, source)
  values ('region', 'Région de Dakar', v_src_admin) returning id into v_region;
  insert into public.localites (parent_id, niveau, nom, source)
  values (v_region, 'departement', 'Département de Dakar', v_src_admin) returning id into v_departement;
  insert into public.localites (parent_id, niveau, nom, source)
  values (v_departement, 'arrondissement', 'Arrondissement des Almadies', v_src_admin) returning id into v_arrondissement;
  insert into public.localites (parent_id, niveau, nom, latitude, longitude, source)
  values (
    v_arrondissement, 'commune', 'Commune de Yoff', 14.760358, -17.468149,
    'OpenStreetMap (relation 12988608, point de référence, licence ODbL) ; position recoupée avec le plan de '
    'développement communal durable de Yoff (2023), § 5.1 : 14°46'' N, 17°29'' O.'
  ) returning id into v_commune;
  insert into public.localites (parent_id, niveau, nom, source)
  values (v_commune, 'village', 'Village traditionnel de Yoff', v_src_pdc) returning id into v_village;
  foreach v_quartier in array array[
    'Tonghor', 'Ndénatte', 'Dagoudane', 'N’Deungagne', 'Ngaparou', 'M’Benguène', 'Layène'
  ] loop
    insert into public.localites (parent_id, niveau, nom, source)
    values (v_village, 'quartier', v_quartier, v_src_pdc);
  end loop;
end
$$;

-- Contenu du projet exemple -----------------------------------------------------------------------------------
-- Le projet exemple est rattaché à la commune de Yoff, pour que la carte et la page des zones aient du contenu.
-- Ses données restent fictives (le projet est marqué exemple).
create function private.charger_contenu_exemple_lot3d(p_projet uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.projet_localites (project_id, localite_id, notes)
  select p.id, l.id, 'Zone d''illustration du projet exemple.'
  from public.projects p
  join public.localites l on l.org_id is null and l.niveau = 'commune' and l.nom = 'Commune de Yoff'
  where p.id = p_projet and p.is_demo
  on conflict do nothing;
end
$$;

create function private.charger_contenu_exemple_lot3d_trigger()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.charger_contenu_exemple_lot3d(new.id);
  return null;
end
$$;

create trigger t96_contenu_exemple_lot3d after insert on public.projects
  for each row when (new.is_demo) execute function private.charger_contenu_exemple_lot3d_trigger();

-- Les projets exemples déjà chargés reçoivent le même rattachement.
do $$
declare
  v_projet uuid;
begin
  for v_projet in select p.id from public.projects p where p.is_demo loop
    perform private.charger_contenu_exemple_lot3d(v_projet);
  end loop;
end
$$;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;
