-- Droits du rôle service_role (clé service, Edge Functions) et absence de privilèges dangereux
-- pour les rôles clients. Ce test aurait détecté l'échec d'invite-member : sur un projet Supabase
-- récent, service_role n'a aucun droit de données par défaut sur les tables créées par une migration.
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
grant usage on schema tests to service_role;
grant select, insert on tests.ids to service_role;
-- --------------------------------------------------------------------------

insert into tests.ids values ('admin1', 'a1000000-0000-4000-8000-000000000001');
insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('admin1'), 'admin1@exemple.test', '{"nom": "Admin Alpha", "organisation": "ONG Alpha"}');
insert into tests.ids select 'org1', org_id from public.memberships where user_id = tests.id('admin1');

select plan(14);

-- Ce que fait invite-member : lire l'appelant, son organisation et son profil, puis écrire l'invitation.
select tests.service();
select is((select count(*) from public.memberships), 1::bigint, 'service : lit les membres');
select is((select count(*) from public.organisations), 1::bigint, 'service : lit les organisations');
select is((select count(*) from public.profiles where email ilike 'ADMIN1@exemple.test'), 1::bigint,
  'service : retrouve un profil par e-mail, sans tenir compte de la casse');
select isnt_empty($$ select m.org_id, o.nom, o.plan, o.essai_fin
                     from public.memberships m join public.organisations o on o.id = m.org_id
                     where m.user_id = tests.id('admin1') $$,
  'service : lit le membre et son organisation ensemble');
select lives_ok($$ insert into public.invitations (org_id, email, role, token_hash)
                   values (tests.id('org1'), 'invite@exemple.test', 'editeur', repeat('a', 64)) $$,
  'service : crée une invitation');
select lives_ok($$ delete from public.invitations where email = 'invite@exemple.test' $$,
  'service : supprime une invitation');

-- Ce que fera submit-lead : écrire et relire les demandes de démonstration.
select lives_ok($$ insert into public.leads (type_demande, email, ip_hash) values ('demo', 'prospect@exemple.test', 'empreinte') $$,
  'service : enregistre une demande de démonstration');
select is((select count(*) from public.leads where ip_hash = 'empreinte'), 1::bigint,
  'service : relit les demandes (limitation de débit)');

-- Le rôle service reste soumis aux quotas, mais pas à la fin d'essai.
select lives_ok($$ update public.organisations set plan = 'starter' where id = tests.id('org1') $$,
  'service : change le plan (activation manuelle)');
select throws_ok($$ insert into public.invitations (org_id, email, role, token_hash)
                    values (tests.id('org1'), 'autre@exemple.test', 'editeur', repeat('b', 64)) $$,
  'P0001', 'PLAN_LIMIT:users', 'service : le quota d''utilisateurs s''applique aussi');
select lives_ok($$ update public.organisations set plan = 'essai', essai_fin = now() - interval '1 day' where id = tests.id('org1') $$,
  'service : peut terminer un essai');
select lives_ok($$ insert into public.projects (org_id, nom, date_debut, date_fin)
                   values (tests.id('org1'), 'Projet service', '2026-01-01', '2026-12-31') $$,
  'service : n''est pas bloqué par la fin d''essai (réservée aux clients)');

-- Les rôles clients ne doivent avoir aucun privilège hérité des droits par défaut.
select tests.deconnecter();
select is(
  (select count(*) from pg_tables t
   where t.schemaname = 'public'
     and exists (select 1 from unnest(array['anon', 'authenticated']) r
                 where has_table_privilege(r, format('public.%I', t.tablename), 'truncate')
                    or has_table_privilege(r, format('public.%I', t.tablename), 'references')
                    or has_table_privilege(r, format('public.%I', t.tablename), 'trigger'))),
  0::bigint, 'anon et authenticated n''ont ni truncate, ni references, ni trigger sur les tables');

select tests.connecter(tests.id('admin1'));
select throws_ok($$ truncate public.projects $$, '42501', null, 'un utilisateur connecté ne peut pas vider une table');

select tests.deconnecter();
select * from finish();
rollback;
