-- Plus de localités préchargées : la migration retire le référentiel de la plateforme (la commune de Yoff et sa
-- hiérarchie), les zones et rattachements qui le désignaient, et le rattachement d'office du projet exemple.
-- Le jeu d'essai refait l'état d'avant (référentiel chargé, projet exemple rattaché, saisies rattachées), puis rejoue les
-- instructions de la migration (même méthode que 18_tirets_exemple.test.sql).
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
grant execute on all functions in schema tests to anon, authenticated, service_role;
-- --------------------------------------------------------------------------

-- Les instructions de la migration 20261127150000_localites_sans_referentiel.sql, dans une fonction pour les rejouer.
create function tests.appliquer_migration() returns void language plpgsql as $f$
begin
  perform set_config('pilot.chargement_exemple', 'on', true);

  update public.kpi_entries
  set localite_id = null
  where localite_id in (select id from public.localites where org_id is null);

  update public.realisations
  set localite_id = null
  where localite_id in (select id from public.localites where org_id is null);

  delete from public.projet_localites
  where localite_id in (select id from public.localites where org_id is null);

  update public.localites
  set parent_id = null
  where org_id is not null and parent_id in (select id from public.localites where org_id is null);

  delete from public.localites where org_id is null;
end
$f$;

insert into tests.ids values
  ('admin1', 'a1000000-0000-4000-8000-000000000001'),
  ('p1', 'a1000000-0000-4000-8000-000000000101'),
  ('k1', 'a1000000-0000-4000-8000-000000000201'),
  ('region', 'a1000000-0000-4000-8000-000000000701'),
  ('commune', 'a1000000-0000-4000-8000-000000000702'),
  ('propre', 'a1000000-0000-4000-8000-000000000703'),
  ('racine', 'a1000000-0000-4000-8000-000000000704');

insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('admin1'), 'admin1@exemple.test', '{"organisation": "ONG Alpha"}');
insert into tests.ids select 'org1', org_id from public.memberships where user_id = tests.id('admin1');
insert into public.projects (id, org_id, nom, date_debut, date_fin)
values (tests.id('p1'), tests.id('org1'), 'Projet Alpha', '2026-01-01', '2026-12-31');
insert into public.kpis (id, project_id, nom, cible) values (tests.id('k1'), tests.id('p1'), 'Indicateur Alpha', 100);

-- Le projet exemple de l'organisation.
select tests.connecter(tests.id('admin1'));
select public.charger_projet_exemple();
select tests.deconnecter();
insert into tests.ids select 'demo', id from public.projects where org_id = tests.id('org1') and is_demo;

select plan(21);

-- L'état d'avant : un référentiel chargé par la plateforme, des localités propres dessous, des rattachements ---------------------
select set_config('pilot.chargement_exemple', 'on', true);
insert into public.localites (id, niveau, nom, source) values (tests.id('region'), 'region', 'Region de test', 'Source de test');
insert into public.localites (id, parent_id, niveau, nom, latitude, longitude, source)
values (tests.id('commune'), tests.id('region'), 'commune', 'Commune de test', 14.5, -17.5, 'Source de test');
insert into public.localites (id, org_id, parent_id, niveau, nom, latitude, longitude, source) values
  (tests.id('propre'), tests.id('org1'), tests.id('commune'), 'village', 'Village de l''organisation', 14.7, -17.4, 'Releve GPS'),
  (tests.id('racine'), tests.id('org1'), null, 'village', 'Village sans parent', null, null, null);
insert into public.projet_localites (project_id, localite_id) values
  (tests.id('p1'), tests.id('commune')),
  (tests.id('p1'), tests.id('propre')),
  (tests.id('p1'), tests.id('racine')),
  (tests.id('demo'), tests.id('commune'));
insert into public.kpi_entries (kpi_id, date, valeur, localite_id) values
  (tests.id('k1'), '2026-03-01', 5, tests.id('commune')),
  (tests.id('k1'), '2026-03-02', 6, tests.id('propre')),
  (tests.id('k1'), '2026-03-03', 7, null);
insert into public.realisations (project_id, date, titre, localite_id) values
  (tests.id('p1'), '2026-03-05', 'Forage', tests.id('commune')),
  (tests.id('p1'), '2026-03-06', 'Latrines', tests.id('propre'));

select is((select count(*) from public.localites where org_id is null), 2::bigint, 'avant : le référentiel est chargé');
select is((select count(*) from public.projet_localites where localite_id = tests.id('commune')), 2::bigint, 'avant : la commune est zone de deux projets, dont le projet exemple');

-- La migration ----------------------------------------------------------------------------------------
select lives_ok($$ select tests.appliquer_migration() $$, 'la migration s''applique');

select is((select count(*) from public.localites where org_id is null), 0::bigint, 'le référentiel de la plateforme est vide');
select is((select count(*) from public.projet_localites where localite_id = tests.id('commune')), 0::bigint, 'plus aucune zone ne désigne le référentiel');
select is((select count(*) from public.projet_localites where project_id = tests.id('demo')), 0::bigint, 'le projet exemple n''a plus de zone');
select is((select count(*) from public.projet_localites where project_id = tests.id('p1')), 2::bigint, 'les zones qui sont des localités de l''organisation restent');

select is((select localite_id from public.kpi_entries where date = '2026-03-01'), null::uuid, 'la saisie rattachée au référentiel perd sa localité');
select is((select valeur from public.kpi_entries where date = '2026-03-01'), 5::numeric, '... mais garde sa valeur');
select is((select localite_id from public.kpi_entries where date = '2026-03-02'), tests.id('propre'), 'la saisie rattachée à une localité de l''organisation ne change pas');
select is((select count(*) from public.kpi_entries where kpi_id = tests.id('k1')), 3::bigint, 'aucune saisie n''est supprimée');
select is((select localite_id from public.realisations where titre = 'Forage'), null::uuid, 'la réalisation rattachée au référentiel perd sa localité');
select is((select localite_id from public.realisations where titre = 'Latrines'), tests.id('propre'), 'la réalisation rattachée à une localité de l''organisation ne change pas');

select is((select parent_id from public.localites where id = tests.id('propre')), null::uuid, 'une localité de l''organisation rangée sous le référentiel devient une racine');
select is((select nom || ' / ' || niveau || ' / ' || latitude || ' / ' || longitude || ' / ' || source from public.localites where id = tests.id('propre')),
  'Village de l''organisation / village / 14.700000 / -17.400000 / Releve GPS', '... et garde son nom, son niveau, ses coordonnées et sa source');
select is((select count(*) from public.localites where org_id = tests.id('org1')), 2::bigint, 'les localités de l''organisation sont toutes là');

-- Le projet exemple n'est plus rattaché d'office ----------------------------------------------------
select hasnt_trigger('public', 'projects', 't96_contenu_exemple_lot3d', 'le déclencheur du projet exemple est supprimé');
select hasnt_function('private', 'charger_contenu_exemple_lot3d', array['uuid'], 'la fonction de contenu du projet exemple est supprimée');
select hasnt_function('private', 'charger_contenu_exemple_lot3d_trigger', array[]::text[], 'la fonction du déclencheur est supprimée');

-- Rejouable ---------------------------------------------------------------------------------------
select lives_ok($$ select tests.appliquer_migration() $$, 'rejouée sans référentiel, elle ne fait rien');
select is((select count(*) from public.localites), 2::bigint, 'rejouée : les deux localités de l''organisation sont toujours là');

select * from finish();
rollback;
