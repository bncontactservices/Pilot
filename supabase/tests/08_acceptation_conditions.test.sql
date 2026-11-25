-- Acceptation des conditions d'utilisation : colonnes protégées de public.profiles, remplies par le déclencheur
-- d'inscription avec l'horloge de la base.
begin;

-- Bloc commun --------------------------------------------------------------
create extension if not exists pgtap with schema extensions;
create schema tests;
grant usage on schema tests to anon, authenticated;
create table tests.ids (cle text primary key, id uuid not null);
grant select, insert on tests.ids to anon, authenticated;
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
grant execute on all functions in schema tests to anon, authenticated;
-- --------------------------------------------------------------------------

insert into tests.ids values
  ('admin1',  'a1000000-0000-4000-8000-000000000001'),
  ('invite1', 'a1000000-0000-4000-8000-000000000002'),
  ('sans',    'c3000000-0000-4000-8000-000000000001'),
  ('faux',    'c3000000-0000-4000-8000-000000000002'),
  ('nombre',  'c3000000-0000-4000-8000-000000000003'),
  ('objet',   'c3000000-0000-4000-8000-000000000004');

-- Inscription avec version : la date de l'horloge de la base remplace celle du client.
insert into auth.users (id, email, raw_user_meta_data) values
  (tests.id('admin1'), 'admin1@exemple.test',
   '{"organisation": "ONG Alpha", "conditions_version": "2026-11-25", "conditions_acceptees_le": "2020-01-01T00:00:00Z"}');
insert into tests.ids select 'org1', org_id from public.memberships where user_id = tests.id('admin1');

-- Inscription sur invitation : le chemin court du déclencheur enregistre aussi l'acceptation.
insert into public.invitations (org_id, email, role, token_hash) values
  (tests.id('org1'), 'invite1@exemple.test', 'lecteur', encode(sha256('jeton-invite1-org1-0123456789'::bytea), 'hex'));
insert into auth.users (id, email, raw_user_meta_data) values
  (tests.id('invite1'), 'invite1@exemple.test',
   '{"invitation": "jeton-invite1-org1-0123456789", "conditions_version": "2026-11-25"}');

-- Sans version, ou avec une valeur qui n'a pas le bon format : rien n'est enregistré, la création n'est pas refusée.
insert into auth.users (id, email, raw_user_meta_data) values
  (tests.id('sans'), 'sans@exemple.test', '{"organisation": "Sans"}'),
  (tests.id('faux'), 'faux@exemple.test', '{"conditions_version": "hier soir"}'),
  (tests.id('nombre'), 'nombre@exemple.test', '{"conditions_version": 20261125}'),
  (tests.id('objet'), 'objet@exemple.test', '{"conditions_version": {"a": "2026-11-25"}}');

select plan(14);

select is((select conditions_version from public.profiles where id = tests.id('admin1')), '2026-11-25',
  'la version déclarée est enregistrée');
select is((select conditions_acceptees_le from public.profiles where id = tests.id('admin1')), now(),
  'la date est celle de la base : la date envoyée par le client est ignorée');
select is((select conditions_version from public.profiles where id = tests.id('invite1')), '2026-11-25',
  'inscription sur invitation : la version est enregistrée');
select is((select conditions_acceptees_le from public.profiles where id = tests.id('invite1')), now(),
  'inscription sur invitation : la date est enregistrée');
select is((select role::text from public.memberships where user_id = tests.id('invite1')), 'lecteur',
  'inscription sur invitation : le rattachement à l''organisation fonctionne toujours');
select is((select count(*) from public.profiles where id in (tests.id('sans'), tests.id('faux'), tests.id('nombre'), tests.id('objet'))
           and conditions_version is null and conditions_acceptees_le is null), 4::bigint,
  'sans version, ou avec une version mal formée : aucune acceptation enregistrée, comptes créés');
select is((select count(*) from public.memberships where user_id in (tests.id('sans'), tests.id('faux'))), 2::bigint,
  'ces comptes ont leur organisation comme avant');

-- Le client ne peut pas écrire les colonnes -----------------------------------
select tests.connecter(tests.id('admin1'));
select throws_ok(
  $$ update public.profiles set conditions_version = '2030-01-01' where id = tests.id('admin1') $$,
  '42501', null, 'un membre ne peut pas modifier la version acceptée');
select throws_ok(
  $$ update public.profiles set conditions_acceptees_le = now() + interval '1 year' where id = tests.id('admin1') $$,
  '42501', null, 'un membre ne peut pas modifier la date d''acceptation');
select lives_ok(
  $$ update public.profiles set nom = 'Nouveau nom', telephone = '+221700000000' where id = tests.id('admin1') $$,
  'un membre modifie toujours son nom et son téléphone');
select is((select conditions_version from public.profiles where id = tests.id('admin1')), '2026-11-25',
  'la version acceptée est intacte après ces tentatives');
select is((select conditions_version from public.profiles where id = tests.id('invite1')), '2026-11-25',
  'les membres de l''organisation lisent toujours les profils');
select tests.deconnecter();

-- Cohérence imposée par la base -----------------------------------------------
select throws_ok(
  $$ update public.profiles set conditions_version = '2026-11-25' where id = tests.id('sans') $$,
  '23514', null, 'une version sans date est refusée');
select throws_ok(
  $$ update public.profiles set conditions_version = 'n''importe quoi', conditions_acceptees_le = now() where id = tests.id('sans') $$,
  '23514', null, 'une version mal formée est refusée');

select * from finish();
rollback;
