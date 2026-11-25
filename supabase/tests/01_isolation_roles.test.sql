-- Isolation entre organisations et droits par rôle.
-- Identités : admin de l'org 1, lecteur de l'org 1, éditeur de l'org 2, anonyme.
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
  ('admin2',   'b2000000-0000-4000-8000-000000000001'),
  ('editeur2', 'b2000000-0000-4000-8000-000000000002'),
  ('p1', 'a1000000-0000-4000-8000-000000000101'),
  ('p2', 'b2000000-0000-4000-8000-000000000101'),
  ('k1', 'a1000000-0000-4000-8000-000000000201'),
  ('k2', 'b2000000-0000-4000-8000-000000000201'),
  ('e1', 'a1000000-0000-4000-8000-000000000301'),
  ('e2', 'b2000000-0000-4000-8000-000000000301');

-- Organisation 1 : un admin, un lecteur arrivé par invitation.
insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('admin1'), 'admin1@exemple.test', '{"nom": "Admin Alpha", "organisation": "ONG Alpha"}');
insert into tests.ids select 'org1', org_id from public.memberships where user_id = tests.id('admin1');
insert into public.invitations (org_id, email, role, token_hash)
values (tests.id('org1'), 'lecteur1@exemple.test', 'lecteur',
        encode(sha256('jeton-lecteur-org1-0123456789'::bytea), 'hex'));
insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('lecteur1'), 'lecteur1@exemple.test', '{"invitation": "jeton-lecteur-org1-0123456789"}');

-- Organisation 2 : un admin, un éditeur arrivé par invitation.
insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('admin2'), 'admin2@exemple.test', '{"organisation": "PME Beta"}');
insert into tests.ids select 'org2', org_id from public.memberships where user_id = tests.id('admin2');
insert into public.invitations (org_id, email, role, token_hash)
values (tests.id('org2'), 'editeur2@exemple.test', 'editeur',
        encode(sha256('jeton-editeur-org2-0123456789'::bytea), 'hex'));
insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('editeur2'), 'editeur2@exemple.test', '{"invitation": "jeton-editeur-org2-0123456789"}');

-- Un projet, un KPI et une saisie par organisation.
insert into public.projects (id, org_id, nom, date_debut, date_fin) values
  (tests.id('p1'), tests.id('org1'), 'Projet Alpha', '2026-01-01', '2026-12-31'),
  (tests.id('p2'), tests.id('org2'), 'Projet Beta', '2026-01-01', '2026-12-31');
insert into public.kpis (id, project_id, nom, cible) values
  (tests.id('k1'), tests.id('p1'), 'KPI Alpha', 100),
  (tests.id('k2'), tests.id('p2'), 'KPI Beta', 50);
insert into public.kpi_entries (id, kpi_id, date, valeur) values
  (tests.id('e1'), tests.id('k1'), '2026-01-31', 10),
  (tests.id('e2'), tests.id('k2'), '2026-01-31', 5);

select plan(60);

-- Structure -----------------------------------------------------------------
select is(
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity),
  0::bigint, 'RLS activée sur toutes les tables du schéma public');
select is(
  (select role from public.memberships where user_id = tests.id('lecteur1')),
  'lecteur'::public.role_membre, 'le lecteur a rejoint l''organisation 1 par invitation');
select is(
  (select org_id from public.memberships where user_id = tests.id('lecteur1')),
  tests.id('org1'), 'l''invité est rattaché à l''organisation qui l''invite');
select is(
  (select count(*) from public.organisations), 2::bigint,
  'les invités n''ont pas créé d''organisation');
select is(
  (select org_id from public.kpis where id = tests.id('k1')), tests.id('org1'),
  'org_id du KPI dérivé du projet');

-- Admin de l'organisation 1 --------------------------------------------------
select tests.connecter(tests.id('admin1'));
select is((select count(*) from public.projects), 1::bigint, 'admin 1 : ne voit que les projets de son organisation');
select is((select count(*) from public.organisations), 1::bigint, 'admin 1 : ne voit que son organisation');
select is((select count(*) from public.kpi_entries), 1::bigint, 'admin 1 : ne voit que les saisies de son organisation');
select is((select count(*) from public.memberships), 2::bigint, 'admin 1 : voit les deux membres de son organisation');
select is((select count(*) from public.profiles), 2::bigint, 'admin 1 : voit les profils de son organisation');
select is_empty($$ select 1 from public.audit_log where org_id <> tests.id('org1') $$,
  'admin 1 : aucun historique d''une autre organisation');
select isnt_empty($$ select 1 from public.audit_log $$, 'admin 1 : voit l''historique de son organisation');
select lives_ok($$ update public.projects set nom = 'Projet Alpha révisé' where id = tests.id('p1') $$,
  'admin 1 : peut modifier un projet');

-- Lecteur de l'organisation 1 ------------------------------------------------
select tests.connecter(tests.id('lecteur1'));
select is((select count(*) from public.projects), 1::bigint, 'lecteur : voit les projets de son organisation');
select throws_ok(
  $$ insert into public.projects (org_id, nom, date_debut, date_fin) values (tests.id('org1'), 'Interdit', '2026-01-01', '2026-12-31') $$,
  '42501', null, 'lecteur : ne peut pas créer de projet');
select is_empty($$ update public.projects set nom = 'Piraté' where id = tests.id('p1') returning 1 $$,
  'lecteur : ne peut pas modifier un projet');
select is_empty($$ delete from public.projects where id = tests.id('p1') returning 1 $$,
  'lecteur : ne peut pas supprimer un projet');
select throws_ok($$ insert into public.kpis (project_id, nom, cible) values (tests.id('p1'), 'Interdit', 10) $$,
  '42501', null, 'lecteur : ne peut pas créer de KPI');
select is_empty($$ update public.kpis set cible = 1 where id = tests.id('k1') returning 1 $$,
  'lecteur : ne peut pas modifier un KPI');
select is_empty($$ delete from public.kpis where id = tests.id('k1') returning 1 $$,
  'lecteur : ne peut pas supprimer un KPI');
select throws_ok($$ insert into public.kpi_entries (kpi_id, date, valeur) values (tests.id('k1'), '2026-02-28', 1) $$,
  '42501', null, 'lecteur : ne peut pas saisir de valeur');
select is_empty($$ update public.kpi_entries set valeur = 999 where id = tests.id('e1') returning 1 $$,
  'lecteur : ne peut pas modifier une saisie');
select is_empty($$ delete from public.kpi_entries where id = tests.id('e1') returning 1 $$,
  'lecteur : ne peut pas supprimer une saisie');
select is_empty($$ update public.memberships set role = 'admin' where user_id = auth.uid() returning 1 $$,
  'lecteur : ne peut pas se promouvoir');
select throws_ok($$ select public.charger_projet_exemple() $$, '42501', null,
  'lecteur : ne peut pas charger le projet exemple');

-- Éditeur de l'organisation 2 -----------------------------------------------
select tests.connecter(tests.id('editeur2'));
select is((select count(*) from public.projects), 1::bigint, 'éditeur 2 : ne voit que les projets de son organisation');
select is_empty($$ select 1 from public.projects where id = tests.id('p1') $$,
  'éditeur 2 : aucun accès au projet de l''organisation 1');
select is_empty($$ select 1 from public.kpis where org_id = tests.id('org1') $$,
  'éditeur 2 : aucun KPI de l''organisation 1');
select is_empty($$ select 1 from public.kpi_entries where org_id = tests.id('org1') $$,
  'éditeur 2 : aucune saisie de l''organisation 1');
select is_empty($$ select 1 from public.audit_log where org_id = tests.id('org1') $$,
  'éditeur 2 : aucun historique de l''organisation 1');
select is_empty($$ select 1 from public.profiles where id = tests.id('admin1') $$,
  'éditeur 2 : aucun profil de l''organisation 1');
select throws_ok(
  $$ insert into public.projects (org_id, nom, date_debut, date_fin) values (tests.id('org1'), 'Intrusion', '2026-01-01', '2026-12-31') $$,
  '42501', null, 'éditeur 2 : ne peut pas créer de projet dans l''organisation 1');
select throws_ok($$ insert into public.kpis (project_id, nom, cible) values (tests.id('p1'), 'Intrusion', 10) $$,
  'P0001', 'PROJET_INTROUVABLE', 'éditeur 2 : ne peut pas ajouter de KPI à un projet de l''organisation 1');
select throws_ok($$ insert into public.kpi_entries (kpi_id, date, valeur) values (tests.id('k1'), '2026-03-31', 1) $$,
  'P0001', 'KPI_INTROUVABLE', 'éditeur 2 : ne peut pas saisir sur un KPI de l''organisation 1');
select lives_ok(
  $$ insert into public.projects (org_id, nom, date_debut, date_fin) values (tests.id('org2'), 'Projet Beta 2', '2026-01-01', '2026-12-31') $$,
  'éditeur 2 : peut créer un projet dans son organisation');
select is_empty($$ delete from public.projects where id = tests.id('p2') returning 1 $$,
  'éditeur 2 : ne peut pas supprimer de projet');
select is_empty($$ update public.memberships set role = 'admin' where user_id = auth.uid() returning 1 $$,
  'éditeur 2 : ne peut pas se promouvoir admin');
select is_empty($$ delete from public.memberships where user_id = tests.id('admin2') returning 1 $$,
  'éditeur 2 : ne peut pas retirer un membre');
select is_empty($$ select 1 from public.invitations $$, 'éditeur 2 : ne voit pas les invitations');
select throws_ok(
  $$ insert into public.invitations (org_id, email, role, token_hash) values (tests.id('org2'), 'x@exemple.test', 'admin', repeat('a', 64)) $$,
  '42501', null, 'éditeur 2 : ne peut pas inviter');
select is_empty($$ update public.organisations set nom = 'Renommée' returning 1 $$,
  'éditeur 2 : ne peut pas modifier les paramètres de l''organisation');
select lives_ok($$ insert into public.kpi_entries (kpi_id, date, valeur) values (tests.id('k2'), '2026-02-28', 7) $$,
  'éditeur 2 : peut saisir une valeur');
select is((select created_by from public.kpi_entries where kpi_id = tests.id('k2') and date = '2026-02-28'),
  tests.id('editeur2'), 'created_by est forcé à l''auteur de la saisie');
select is((select org_id from public.kpi_entries where kpi_id = tests.id('k2') and date = '2026-02-28'),
  tests.id('org2'), 'org_id de la saisie dérivé du KPI');

-- Anonyme ---------------------------------------------------------------------
select tests.anonyme();
select throws_ok($$ select 1 from public.projects $$, '42501', null, 'anonyme : aucun accès aux projets');
select throws_ok($$ select 1 from public.organisations $$, '42501', null, 'anonyme : aucun accès aux organisations');
select throws_ok($$ insert into public.leads (email) values ('spam@exemple.test') $$, '42501', null,
  'anonyme : aucune écriture directe dans leads');
select throws_ok($$ select public.charger_projet_exemple() $$, '42501', null,
  'anonyme : ne peut pas charger de projet exemple');

-- Admin : gestion de l'organisation -----------------------------------------
select tests.connecter(tests.id('admin1'));
select throws_ok($$ select 1 from public.leads $$, '42501', null, 'utilisateur connecté : aucune lecture de leads');
select throws_ok($$ update public.organisations set plan = 'enterprise' $$, '42501', null,
  'admin : ne peut pas changer son plan');
select throws_ok($$ update public.organisations set essai_fin = now() + interval '1 year' $$, '42501', null,
  'admin : ne peut pas prolonger son essai');
select throws_ok($$ update public.organisations set plan_souhaite = 'pro' $$, '42501', null,
  'admin : ne peut pas modifier plan_souhaite');
select throws_ok($$ insert into public.organisations (nom) values ('Seconde organisation') $$, '42501', null,
  'admin : ne peut pas créer d''organisation');
select lives_ok($$ update public.organisations set nom = 'ONG Alpha Sénégal' where id = tests.id('org1') $$,
  'admin : peut renommer son organisation');
select lives_ok($$ update public.memberships set role = 'editeur' where user_id = tests.id('lecteur1') $$,
  'admin : peut changer le rôle d''un membre');
select throws_ok($$ delete from public.memberships where user_id = auth.uid() $$, 'P0001', 'DERNIER_ADMIN',
  'admin : ne peut pas retirer le dernier admin');
select throws_ok($$ update public.memberships set role = 'lecteur' where user_id = auth.uid() $$, 'P0001', 'DERNIER_ADMIN',
  'admin : ne peut pas se rétrograder s''il est le seul admin');
select throws_ok($$ update public.projects set org_id = tests.id('org2') where id = tests.id('p1') $$, '42501', null,
  'org_id d''un projet est immuable');
select lives_ok($$ delete from public.projects where id = tests.id('p1') $$,
  'admin : peut supprimer un projet');
select is((select count(*) from public.kpis where project_id = tests.id('p1')), 0::bigint,
  'les KPI du projet supprimé partent en cascade');

select tests.deconnecter();
select * from finish();
rollback;
