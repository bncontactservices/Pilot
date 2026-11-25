-- Lot 4a : saisie hors ligne. Une saisie porte un identifiant tiré sur l'appareil : le rejeu d'un envoi dont la réponse
-- s'est perdue retrouve sa propre ligne au lieu d'un doublon. L'identifiant ne s'ouvre qu'à l'insertion, et rien d'autre
-- ne devient écrivable (organisation, auteur, modification de l'identifiant, rôles, fin d'essai, autre organisation).
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
create function tests.anonyme() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;
create function tests.service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
end $$;
create function tests.deconnecter() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;
-- --------------------------------------------------------------------------

insert into tests.ids values
  ('admin1',   'a1000000-0000-4000-8000-000000000001'),
  ('lecteur1', 'a1000000-0000-4000-8000-000000000002'),
  ('editeur1', 'a1000000-0000-4000-8000-000000000003'),
  ('admin2',   'b2000000-0000-4000-8000-000000000001'),
  ('p1', 'a1000000-0000-4000-8000-000000000101'),
  ('p2', 'b2000000-0000-4000-8000-000000000101'),
  ('k1', 'a1000000-0000-4000-8000-000000000201'),
  ('k2', 'b2000000-0000-4000-8000-000000000201'),
  -- Identifiants tirés « sur l'appareil ».
  ('e1', 'e0000000-0000-4000-8000-000000000001'),
  ('e2', 'e0000000-0000-4000-8000-000000000002'),
  ('e3', 'e0000000-0000-4000-8000-000000000003'),
  ('e4', 'e0000000-0000-4000-8000-000000000004'),
  ('e5', 'e0000000-0000-4000-8000-000000000005'),
  ('e6', 'e0000000-0000-4000-8000-000000000006');

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
  (tests.id('k1'), tests.id('p1'), 'Indicateur Alpha', 100),
  (tests.id('k2'), tests.id('p2'), 'Indicateur Beta', 100);

select plan(14);

-- Un éditeur pose lui-même l'identifiant de sa saisie ---------------------------------------------------
select tests.connecter(tests.id('editeur1'));
select lives_ok($$ insert into public.kpi_entries (id, kpi_id, date, valeur)
                   values (tests.id('e1'), tests.id('k1'), '2026-03-01', 12) $$,
  'un éditeur insère une saisie avec l''identifiant tiré sur son appareil');
select is((select valeur from public.kpi_entries where id = tests.id('e1')), 12::numeric,
  'la saisie est retrouvable par cet identifiant');
select is((select created_by from public.kpi_entries where id = tests.id('e1')), tests.id('editeur1'),
  'l''auteur est posé par la base, pas par l''appareil');

-- Le rejeu : même identifiant, mêmes valeurs -------------------------------------------------------------
select throws_ok($$ insert into public.kpi_entries (id, kpi_id, date, valeur)
                    values (tests.id('e1'), tests.id('k1'), '2026-03-01', 12) $$,
  '23505', null, 'le rejeu d''un envoi déjà passé est refusé (l''appareil le retrouve par son identifiant)');
select is((select count(*) from public.kpi_entries where kpi_id = tests.id('k1') and date = '2026-03-01'), 1::bigint,
  'aucun doublon après le rejeu');

-- Une valeur d'un autre à la même date : conflit, identifiant différent ----------------------------------
select throws_ok($$ insert into public.kpi_entries (id, kpi_id, date, valeur)
                    values (tests.id('e2'), tests.id('k1'), '2026-03-01', 99) $$,
  '23505', null, 'une autre valeur à la même date est un conflit');
select is((select id from public.kpi_entries where kpi_id = tests.id('k1') and date = '2026-03-01'), tests.id('e1'),
  'et la ligne en place reste celle de l''identifiant d''origine : l''appareil distingue le rejeu du conflit');

-- Sans identifiant, l'insertion se fait comme avant ------------------------------------------------------
select lives_ok($$ insert into public.kpi_entries (kpi_id, date, valeur)
                   values (tests.id('k1'), '2026-03-02', 5) $$,
  'sans identifiant, la base en pose un');

-- Ce que l'ouverture de la colonne n'autorise pas --------------------------------------------------------
select throws_ok($$ update public.kpi_entries set id = tests.id('e3') where id = tests.id('e1') $$,
  '42501', null, 'l''identifiant ne se modifie jamais');
select throws_ok($$ insert into public.kpi_entries (id, org_id, kpi_id, date, valeur)
                    values (tests.id('e3'), tests.id('org2'), tests.id('k1'), '2026-03-03', 1) $$,
  '42501', null, 'l''organisation ne se pose pas depuis l''appareil');

-- Rôles, fin d'essai, autre organisation -----------------------------------------------------------------
select tests.connecter(tests.id('lecteur1'));
select throws_ok($$ insert into public.kpi_entries (id, kpi_id, date, valeur)
                    values (tests.id('e4'), tests.id('k1'), '2026-03-04', 1) $$,
  '42501', null, 'un lecteur n''écrit pas, identifiant ou non');

select tests.connecter(tests.id('admin2'));
select throws_ok($$ insert into public.kpi_entries (id, kpi_id, date, valeur)
                    values (tests.id('e5'), tests.id('k1'), '2026-03-05', 1) $$,
  'P0001', 'KPI_INTROUVABLE', 'une autre organisation n''écrit pas dans ce projet (et ne voit même pas qu''il existe)');
select throws_ok($$ insert into public.kpi_entries (id, kpi_id, date, valeur)
                    values (tests.id('e1'), tests.id('k2'), '2026-03-06', 1) $$,
  '23505', null, 'prendre l''identifiant d''une saisie existante ne l''écrase pas : refus');

select tests.deconnecter();
update public.organisations set plan = 'essai', essai_fin = now() - interval '1 day' where id = tests.id('org1');
select tests.connecter(tests.id('editeur1'));
select throws_ok($$ insert into public.kpi_entries (id, kpi_id, date, valeur)
                    values (tests.id('e6'), tests.id('k1'), '2026-03-07', 1) $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : la saisie rejouée est refusée (la file la marque refusée)');

select * from finish();
rollback;
