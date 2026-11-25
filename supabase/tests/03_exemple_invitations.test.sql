-- Projet exemple protégé et parcours d'invitation à l'inscription.
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
  ('admin1', 'a1000000-0000-4000-8000-000000000001'),
  ('nouveau', 'a1000000-0000-4000-8000-000000000003'),
  ('recycle', 'c3000000-0000-4000-8000-000000000001'),
  ('tardif', 'd4000000-0000-4000-8000-000000000001'),
  ('mauvais', 'e5000000-0000-4000-8000-000000000001');
insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('admin1'), 'admin1@exemple.test', '{"organisation": "ONG Alpha"}');
insert into tests.ids select 'org1', org_id from public.memberships where user_id = tests.id('admin1');

select plan(31);

-- Projet exemple -------------------------------------------------------------
select tests.connecter(tests.id('admin1'));
select lives_ok($$ insert into tests.ids select 'demo', public.charger_projet_exemple() $$,
  'admin : charge le projet exemple');
select is((select is_demo from public.projects where id = tests.id('demo')), true, 'le projet est marqué exemple');
select is((select count(*) from public.kpis where project_id = tests.id('demo')), 8::bigint, '8 KPI');
select is((select count(*) from public.kpis where project_id = tests.id('demo') and epingle), 4::bigint, '4 KPI épinglés');
select is((select count(*) from public.kpi_entries e join public.kpis k on k.id = e.kpi_id where k.project_id = tests.id('demo')),
  75::bigint, '75 saisies générées sur 12 mois');
select is((select count(*) from public.kpi_entries where commentaire is not null), 6::bigint, '6 saisies commentées');
select ok((select max(e.date) < current_date - 120
           from public.kpi_entries e join public.kpis k on k.id = e.kpi_id
           where k.project_id = tests.id('demo') and k.ordre = 8),
  'le KPI 8 n''a plus de saisie récente');
select is_empty($$ select 1 from public.audit_log $$, 'le chargement de l''exemple n''encombre pas l''historique');
select throws_ok($$ select public.charger_projet_exemple() $$, 'P0001', 'DEMO_EXISTE',
  'un seul projet exemple par organisation');
select throws_ok($$ insert into public.kpis (project_id, nom, cible) values (tests.id('demo'), 'Ajout', 1) $$,
  'P0001', 'DEMO_READONLY', 'exemple : aucun KPI ajouté');
select lives_ok($$ update public.kpis set epingle = false where project_id = tests.id('demo') and ordre = 1 $$,
  'exemple : un KPI peut être désépinglé');
select lives_ok($$ update public.kpis set ordre = 9 where project_id = tests.id('demo') and ordre = 8 $$,
  'exemple : les KPI peuvent être réordonnés');
select throws_ok($$ update public.kpis set nom = 'Renommé' where project_id = tests.id('demo') and ordre = 2 $$,
  'P0001', 'DEMO_READONLY', 'exemple : la définition d''un KPI est figée');
select throws_ok($$ delete from public.kpis where project_id = tests.id('demo') and ordre = 3 $$,
  'P0001', 'DEMO_READONLY', 'exemple : aucun KPI supprimé');
select throws_ok($$ update public.projects set nom = 'Renommé' where id = tests.id('demo') $$,
  'P0001', 'DEMO_READONLY', 'exemple : le projet n''est pas modifiable');
select lives_ok($$ insert into public.kpi_entries (kpi_id, date, valeur)
                   select id, current_date, 3 from public.kpis where project_id = tests.id('demo') and ordre = 1 $$,
  'exemple : les saisies restent libres pour s''entraîner');
select throws_ok($$ insert into public.projects (org_id, nom, date_debut, date_fin, is_demo)
                    values (tests.id('org1'), 'Faux exemple', '2026-01-01', '2026-12-31', true) $$,
  '42501', null, 'un client ne peut pas créer de projet exemple');
select throws_ok($$ update public.projects set is_demo = true $$, '42501', null,
  'un client ne peut pas marquer un projet comme exemple');
select lives_ok($$ delete from public.projects where id = tests.id('demo') $$,
  'admin : peut supprimer le projet exemple');
select is((select count(*) from public.kpis), 0::bigint, 'ses KPI et saisies partent en cascade');

-- Invitations ----------------------------------------------------------------
select tests.deconnecter();
insert into public.invitations (org_id, email, role, token_hash, invited_by) values
  (tests.id('org1'), 'Nouveau@Exemple.test', 'editeur', encode(sha256('jeton-valide-0123456789abcdef'::bytea), 'hex'), tests.id('admin1')),
  (tests.id('org1'), 'tardif@exemple.test', 'editeur', encode(sha256('jeton-expire-0123456789abcdef'::bytea), 'hex'), tests.id('admin1')),
  (tests.id('org1'), 'bon@exemple.test', 'lecteur', encode(sha256('jeton-autre-0123456789abcdefg'::bytea), 'hex'), tests.id('admin1'));
update public.invitations set expires_at = now() - interval '1 hour' where email = 'tardif@exemple.test';

select tests.anonyme();
select results_eq($$ select organisation, email_masque from public.invitation_apercu('jeton-valide-0123456789abcdef') $$,
  $$ values ('ONG Alpha'::text, 'N***@Exemple.test'::text) $$,
  'aperçu : nom de l''organisation et e-mail masqué');
select is_empty($$ select 1 from public.invitation_apercu('jeton-expire-0123456789abcdef') $$,
  'aperçu : rien pour un jeton expiré');
select is_empty($$ select 1 from public.invitation_apercu('jeton-inconnu-0123456789abcdef') $$,
  'aperçu : rien pour un jeton inconnu');

select tests.deconnecter();
insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('nouveau'), 'nouveau@exemple.test', '{"nom": "Nouvel Éditeur", "invitation": "jeton-valide-0123456789abcdef"}');
select is((select org_id from public.memberships where user_id = tests.id('nouveau')), tests.id('org1'),
  'invitation valide : rejoint l''organisation qui invite (e-mail sans tenir compte de la casse)');
select is((select role from public.memberships where user_id = tests.id('nouveau')), 'editeur'::public.role_membre,
  'invitation valide : reçoit le rôle prévu');
select is((select count(*) from public.organisations), 1::bigint, 'invitation valide : aucune organisation créée');
select isnt((select accepted_at from public.invitations where email = 'Nouveau@Exemple.test'), null,
  'invitation marquée acceptée');
select is((select email from public.profiles where id = tests.id('nouveau')), 'nouveau@exemple.test',
  'profil créé avec l''e-mail');

insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('recycle'), 'recycle@exemple.test', '{"invitation": "jeton-valide-0123456789abcdef"}');
select isnt((select org_id from public.memberships where user_id = tests.id('recycle')), tests.id('org1'),
  'jeton déjà utilisé : aucune entrée dans l''organisation');

insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('tardif'), 'tardif@exemple.test', '{"invitation": "jeton-expire-0123456789abcdef"}');
select is((select role from public.memberships where user_id = tests.id('tardif')), 'admin'::public.role_membre,
  'jeton expiré : la personne crée sa propre organisation d''essai');

insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('mauvais'), 'mauvais@exemple.test', '{"invitation": "jeton-autre-0123456789abcdefg"}');
select isnt((select org_id from public.memberships where user_id = tests.id('mauvais')), tests.id('org1'),
  'jeton valide mais autre e-mail : aucune entrée dans l''organisation');

select tests.deconnecter();
select * from finish();
rollback;
