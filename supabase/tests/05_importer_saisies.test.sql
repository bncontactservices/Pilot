-- Import de saisies par lots : public.importer_saisies(jsonb, boolean).
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
create function tests.anonyme() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;
create function tests.deconnecter() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
grant execute on all functions in schema tests to anon, authenticated;
-- --------------------------------------------------------------------------

insert into tests.ids values
  ('admin1',   'a1000000-0000-4000-8000-000000000001'),
  ('lecteur1', 'a1000000-0000-4000-8000-000000000002'),
  ('editeur1', 'a1000000-0000-4000-8000-000000000003'),
  ('admin2',   'b2000000-0000-4000-8000-000000000001'),
  ('p1', 'a1000000-0000-4000-8000-000000000101'),
  ('p2', 'b2000000-0000-4000-8000-000000000101'),
  ('k1', 'a1000000-0000-4000-8000-000000000201'),
  ('k1b', 'a1000000-0000-4000-8000-000000000202'),
  ('k2', 'b2000000-0000-4000-8000-000000000201');

insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('admin1'), 'admin1@exemple.test', '{"organisation": "ONG Alpha"}');
insert into tests.ids select 'org1', org_id from public.memberships where user_id = tests.id('admin1');
insert into public.invitations (org_id, email, role, token_hash) values
  (tests.id('org1'), 'lecteur1@exemple.test', 'lecteur', encode(sha256('jeton-lecteur-org1-0123456789'::bytea), 'hex')),
  (tests.id('org1'), 'editeur1@exemple.test', 'editeur', encode(sha256('jeton-editeur-org1-0123456789'::bytea), 'hex'));
insert into auth.users (id, email, raw_user_meta_data) values
  (tests.id('lecteur1'), 'lecteur1@exemple.test', '{"invitation": "jeton-lecteur-org1-0123456789"}'),
  (tests.id('editeur1'), 'editeur1@exemple.test', '{"invitation": "jeton-editeur-org1-0123456789"}');
insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('admin2'), 'admin2@exemple.test', '{"organisation": "PME Beta"}');
insert into tests.ids select 'org2', org_id from public.memberships where user_id = tests.id('admin2');

insert into public.projects (id, org_id, nom, date_debut, date_fin) values
  (tests.id('p1'), tests.id('org1'), 'Projet Alpha', '2026-01-01', '2026-12-31'),
  (tests.id('p2'), tests.id('org2'), 'Projet Beta', '2026-01-01', '2026-12-31');
insert into public.kpis (id, project_id, nom, cible) values
  (tests.id('k1'), tests.id('p1'), 'KPI Alpha', 100),
  (tests.id('k1b'), tests.id('p1'), 'KPI Alpha bis', 50),
  (tests.id('k2'), tests.id('p2'), 'KPI Beta', 50);
insert into public.kpi_entries (kpi_id, date, valeur, commentaire) values
  (tests.id('k1'), '2026-01-31', 10, 'existante');

select plan(25);

-- Lot ordinaire --------------------------------------------------------------
select tests.connecter(tests.id('editeur1'));
select results_eq(
  format($$ select * from public.importer_saisies(%L::jsonb, false) $$, json_build_array(
    json_build_object('kpi_id', tests.id('k1'), 'date', '2026-02-28', 'valeur', 12.5, 'commentaire', 'février'),
    json_build_object('kpi_id', tests.id('k1'), 'date', '2026-03-31', 'valeur', 15),
    json_build_object('kpi_id', tests.id('k1b'), 'date', '2026-02-28', 'valeur', 3, 'commentaire', ''))::text),
  $$ values (3, 0, 0) $$,
  'éditeur : 3 saisies insérées');
select is((select count(*) from public.kpi_entries where kpi_id = tests.id('k1')), 3::bigint, 'les saisies existent');
select is((select commentaire from public.kpi_entries where kpi_id = tests.id('k1b')), null,
  'un commentaire vide est enregistré comme absent');
select is((select created_by from public.kpi_entries where kpi_id = tests.id('k1') and date = '2026-02-28'),
  tests.id('editeur1'), 'l''auteur est renseigné comme pour une saisie manuelle');

-- Date déjà saisie : ignorer ---------------------------------------------------
select results_eq(
  format($$ select * from public.importer_saisies(%L::jsonb, false) $$, json_build_array(
    json_build_object('kpi_id', tests.id('k1'), 'date', '2026-01-31', 'valeur', 99),
    json_build_object('kpi_id', tests.id('k1'), 'date', '2026-04-30', 'valeur', 20))::text),
  $$ values (1, 0, 1) $$,
  'ignorer : la date déjà saisie est laissée telle quelle');
select is((select valeur from public.kpi_entries where kpi_id = tests.id('k1') and date = '2026-01-31'), 10::numeric,
  'ignorer : la valeur existante est conservée');

-- Date déjà saisie : remplacer -------------------------------------------------
select results_eq(
  format($$ select * from public.importer_saisies(%L::jsonb, true) $$, json_build_array(
    json_build_object('kpi_id', tests.id('k1'), 'date', '2026-01-31', 'valeur', 11, 'commentaire', 'corrigée'),
    json_build_object('kpi_id', tests.id('k1'), 'date', '2026-05-31', 'valeur', 25))::text),
  $$ values (1, 1, 0) $$,
  'remplacer : 1 insérée, 1 remplacée');
select is((select valeur from public.kpi_entries where kpi_id = tests.id('k1') and date = '2026-01-31'), 11::numeric,
  'remplacer : la valeur est mise à jour');
select is((select commentaire from public.kpi_entries where kpi_id = tests.id('k1') and date = '2026-01-31'), 'corrigée',
  'remplacer : le commentaire est mis à jour');
select is((select count(*) from public.kpi_entries where kpi_id = tests.id('k1') and date = '2026-01-31'), 1::bigint,
  'remplacer : toujours une seule saisie par date');

-- Doublon dans le lot : la première occurrence l'emporte ------------------------
select results_eq(
  format($$ select * from public.importer_saisies(%L::jsonb, true) $$, json_build_array(
    json_build_object('kpi_id', tests.id('k1'), 'date', '2026-06-30', 'valeur', 1),
    json_build_object('kpi_id', tests.id('k1'), 'date', '2026-06-30', 'valeur', 2))::text),
  $$ values (1, 0, 0) $$,
  'doublon dans le lot : une seule saisie, sans erreur');
select is((select valeur from public.kpi_entries where kpi_id = tests.id('k1') and date = '2026-06-30'), 1::numeric,
  'doublon dans le lot : la première occurrence est retenue');

-- Charges utiles invalides -----------------------------------------------------
select throws_ok($$ select * from public.importer_saisies('{"kpi_id": 1}'::jsonb, false) $$,
  'P0001', 'IMPORT_INVALIDE', 'un objet à la place d''une liste est refusé');
select throws_ok($$ select * from public.importer_saisies(null, false) $$,
  'P0001', 'IMPORT_INVALIDE', 'une charge utile absente est refusée');
select throws_ok(
  format($$ select * from public.importer_saisies(%L::jsonb, false) $$,
    json_build_array(json_build_object('kpi_id', 'pas-un-uuid', 'date', '2026-02-28', 'valeur', 1))::text),
  'P0001', 'IMPORT_INVALIDE', 'un identifiant illisible est refusé');
select throws_ok(
  format($$ select * from public.importer_saisies(%L::jsonb, false) $$,
    json_build_array(json_build_object('kpi_id', tests.id('k1'), 'date', '2026-02-31', 'valeur', 1))::text),
  'P0001', 'IMPORT_INVALIDE', 'une date inexistante est refusée');
select throws_ok(
  format($$ select * from public.importer_saisies(%L::jsonb, false) $$,
    json_build_array(json_build_object('kpi_id', tests.id('k1'), 'date', '2026-02-20'))::text),
  'P0001', 'IMPORT_INVALIDE', 'une valeur absente est refusée');
select throws_ok(
  format($$ select * from public.importer_saisies(%L::jsonb, false) $$,
    (select json_agg(json_build_object('kpi_id', tests.id('k1'), 'date', d::date, 'valeur', 1))::text
     from generate_series('2020-01-01'::date, '2020-01-01'::date + 500, '1 day') d)),
  'P0001', 'IMPORT_LOT_TROP_GRAND', 'un lot de plus de 500 lignes est refusé');

-- Cloisonnement et rôles -------------------------------------------------------
select throws_ok(
  format($$ select * from public.importer_saisies(%L::jsonb, false) $$,
    json_build_array(json_build_object('kpi_id', tests.id('k2'), 'date', '2026-02-28', 'valeur', 1))::text),
  'P0001', 'KPI_INTROUVABLE', 'un indicateur d''une autre organisation est introuvable');
select tests.deconnecter();
select is((select count(*) from public.kpi_entries where kpi_id = tests.id('k2')), 0::bigint,
  'aucune saisie n''a été écrite dans l''autre organisation');

select tests.connecter(tests.id('lecteur1'));
select throws_ok(
  format($$ select * from public.importer_saisies(%L::jsonb, false) $$,
    json_build_array(json_build_object('kpi_id', tests.id('k1'), 'date', '2026-07-31', 'valeur', 1))::text),
  '42501', null, 'lecteur : import refusé par la sécurité par ligne');

select tests.anonyme();
select throws_ok($$ select * from public.importer_saisies('[]'::jsonb, false) $$,
  '42501', null, 'anonyme : fonction inaccessible');

-- Fin d'essai ------------------------------------------------------------------
select tests.deconnecter();
update public.organisations set plan = 'essai', essai_fin = now() - interval '1 day' where id = tests.id('org1');
select tests.connecter(tests.id('admin1'));
select throws_ok(
  format($$ select * from public.importer_saisies(%L::jsonb, false) $$,
    json_build_array(json_build_object('kpi_id', tests.id('k1'), 'date', '2026-07-31', 'valeur', 1))::text),
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : import refusé');

-- Projet exemple : les saisies y sont libres (seuls ses KPI sont figés) -------------
select tests.deconnecter();
update public.organisations set plan = 'pro' where id = tests.id('org1');
select tests.connecter(tests.id('admin1'));
select lives_ok($$ insert into tests.ids select 'demo', public.charger_projet_exemple() $$, 'admin : projet exemple chargé');
select results_eq(
  format($$ select * from public.importer_saisies(%L::jsonb, false) $$,
    json_build_array(json_build_object('kpi_id', (select id from public.kpis where project_id = tests.id('demo') limit 1),
                                       'date', '2030-01-31', 'valeur', 1))::text),
  $$ values (1, 0, 0) $$, 'projet exemple : les saisies restent libres, l''import aussi');

select tests.deconnecter();
select * from finish();
rollback;
