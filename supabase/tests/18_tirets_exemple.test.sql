-- Projet exemple sans tiret long (U+2014) : les fonctions qui l'écrivent sont réécrites avec un tiret simple (les liens par
-- nom d'activité entre fonctions de lots différents suivent), et les lignes d'un projet exemple déjà chargé sont corrigées.
begin;


-- Bloc commun --------------------------------------------------------------
create extension if not exists pgtap with schema extensions;
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create table tests.ids (cle text primary key, id uuid not null);
grant select, insert on tests.ids to anon, authenticated, service_role;
create function tests.id(p_cle text) returns uuid language sql stable
  as $$ select id from tests.ids where cle = p_cle $$;
create function tests.connecter(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function tests.deconnecter() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create function tests.tiret() returns text language sql immutable as $$ select convert_from('\xe28094'::bytea, 'UTF8') $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;
-- --------------------------------------------------------------------------

insert into tests.ids values ('admin1', 'a1000000-0000-4000-8000-000000000001');
insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('admin1'), 'admin1@exemple.test', '{"organisation": "ONG Alpha"}');
insert into tests.ids select 'org1', org_id from public.memberships where user_id = tests.id('admin1');

select plan(13);

-- Fonctions réécrites ----------------------------------------------------------------------------------------------------
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prokind = 'f' and pg_get_functiondef(p.oid) like '%' || tests.tiret() || '%'),
  0::bigint, 'aucune fonction de public ou de private ne contient de tiret long');

-- Un projet exemple chargé maintenant -------------------------------------------------------------------------------------
select tests.connecter(tests.id('admin1'));
insert into tests.ids select 'demo', public.charger_projet_exemple();
select tests.deconnecter();
-- Le contenu des composantes est écrit par un déclencheur différé (fin de transaction) : on le déclenche ici.
set constraints all immediate;

select is((select nom from public.projects where id = tests.id('demo')), 'Projet exemple - Eau, hygiène et assainissement',
  'le projet exemple porte un tiret simple');
select is((select count(*) from public.pta_activites where project_id = tests.id('demo') and intitule like '%' || tests.tiret() || '%'), 0::bigint,
  'activités du plan de travail : aucun tiret long');
select is((select count(*) from public.etapes where project_id = tests.id('demo') and nom like '%' || tests.tiret() || '%'), 0::bigint,
  'étapes : aucun tiret long');
select is((select count(*) from public.etats_avancement where project_id = tests.id('demo') and titre like '%' || tests.tiret() || '%'), 0::bigint,
  'états d''avancement : aucun tiret long');
select is((select count(*) from public.depenses where project_id = tests.id('demo') and libelle like '%' || tests.tiret() || '%'), 0::bigint,
  'dépenses : aucun tiret long');
select cmp_ok((select count(*) from public.pta_activites where project_id = tests.id('demo') and composante_id is not null), '>', 0::bigint,
  'les activités restent rattachées à leurs composantes (le lien se fait par le nom, qui a changé des deux côtés)');
select cmp_ok((select count(*) from public.depenses where project_id = tests.id('demo')), '>', 0::bigint, 'le projet exemple a ses dépenses');

-- Correction d'un projet exemple déjà chargé (mêmes instructions que la migration, sur des lignes remises à l'ancien texte) -----
select set_config('pilot.chargement_exemple', 'on', true);
update public.projects set nom = replace(nom, '-', tests.tiret()) where id = tests.id('demo');
update public.pta_activites set intitule = replace(intitule, ' - ', ' ' || tests.tiret() || ' ') where project_id = tests.id('demo');
update public.etapes set nom = replace(nom, ' - ', ' ' || tests.tiret() || ' ') where project_id = tests.id('demo');
update public.etats_avancement set titre = replace(titre, ' - ', ' ' || tests.tiret() || ' ') where project_id = tests.id('demo');
update public.depenses set libelle = replace(libelle, ' - ', ' ' || tests.tiret() || ' ') where project_id = tests.id('demo');
select cmp_ok((select count(*) from public.projects where id = tests.id('demo') and nom like '%' || tests.tiret() || '%'), '=', 1::bigint,
  'préparation : le projet exemple est remis à l''ancien texte');

do $$
declare
  tiret constant text := convert_from('\xe28094'::bytea, 'UTF8');
begin
  perform set_config('pilot.chargement_exemple', 'on', true);
  update public.projects
  set nom = replace(nom, tiret, '-'), description = replace(description, tiret, '-')
  where is_demo and (nom like '%' || tiret || '%' or description like '%' || tiret || '%');
  update public.etapes e
  set nom = replace(e.nom, tiret, '-'), description = replace(e.description, tiret, '-')
  from public.projects p
  where p.id = e.project_id and p.is_demo and (e.nom like '%' || tiret || '%' or e.description like '%' || tiret || '%');
  update public.pta_activites a
  set intitule = replace(a.intitule, tiret, '-'), description = replace(a.description, tiret, '-')
  from public.projects p
  where p.id = a.project_id and p.is_demo and (a.intitule like '%' || tiret || '%' or a.description like '%' || tiret || '%');
  update public.etats_avancement s
  set titre = replace(s.titre, tiret, '-'),
      faits_marquants = replace(s.faits_marquants, tiret, '-'),
      difficultes = replace(s.difficultes, tiret, '-'),
      risques = replace(s.risques, tiret, '-')
  from public.projects p
  where p.id = s.project_id and p.is_demo
    and (s.titre || coalesce(s.faits_marquants, '') || coalesce(s.difficultes, '') || coalesce(s.risques, '')) like '%' || tiret || '%';
  update public.depenses d
  set libelle = replace(d.libelle, tiret, '-')
  from public.projects p
  where p.id = d.project_id and p.is_demo and d.libelle like '%' || tiret || '%';
end
$$;

select is((select nom from public.projects where id = tests.id('demo')), 'Projet exemple - Eau, hygiène et assainissement', 'après correction : le nom du projet exemple');
select is((select count(*) from public.pta_activites where project_id = tests.id('demo') and intitule like '%' || tests.tiret() || '%'), 0::bigint,
  'après correction : activités sans tiret long');
select is((select count(*) from public.etapes where project_id = tests.id('demo') and nom like '%' || tests.tiret() || '%'), 0::bigint, 'après correction : étapes sans tiret long');
select is((select count(*) from public.depenses where project_id = tests.id('demo') and libelle like '%' || tests.tiret() || '%'), 0::bigint, 'après correction : dépenses sans tiret long');

select * from finish();
rollback;
