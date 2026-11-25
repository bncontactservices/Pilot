-- Quotas de plan (refusés par la base) et fin d'essai en lecture seule.
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

insert into tests.ids values ('admin1', 'a1000000-0000-4000-8000-000000000001');
insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('admin1'), 'admin1@exemple.test', '{"organisation": "ONG Alpha", "plan": "pro"}');
insert into tests.ids select 'org1', org_id from public.memberships where user_id = tests.id('admin1');

select plan(29);

-- Inscription ---------------------------------------------------------------
select is((select plan from public.organisations where id = tests.id('org1')), 'essai'::public.plan_org,
  'inscription : organisation créée en essai');
select ok((select essai_fin between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour'
           from public.organisations where id = tests.id('org1')),
  'inscription : essai de 14 jours');
select is((select plan_souhaite from public.organisations where id = tests.id('org1')), 'pro'::public.plan_choisi,
  'inscription : plan choisi sur la landing enregistré');
select is((select role from public.memberships where user_id = tests.id('admin1')), 'admin'::public.role_membre,
  'inscription : la personne est admin de sa nouvelle organisation');

-- Plan Starter : 1 projet, 5 KPI par projet, 1 utilisateur ------------------
update public.organisations set plan = 'starter' where id = tests.id('org1');
select tests.connecter(tests.id('admin1'));

select lives_ok($$
  with p as (
    insert into public.projects (org_id, nom, date_debut, date_fin)
    values (tests.id('org1'), 'Projet A', '2026-01-01', '2026-12-31') returning id
  ) insert into tests.ids select 'pA', id from p $$,
  'starter : premier projet accepté');
select throws_ok($$ insert into public.projects (org_id, nom, date_debut, date_fin)
                    values (tests.id('org1'), 'Projet B', '2026-01-01', '2026-12-31') $$,
  'P0001', 'PLAN_LIMIT:projects', 'starter : deuxième projet refusé');
select throws_ok($$ insert into public.kpis (project_id, nom, cible, type_agregation, sens)
                    values (tests.id('pA'), 'Cumul décroissant', 10, 'cumul', 'decroissant') $$,
  '23514', null, 'un KPI cumulé décroissant est refusé');
select lives_ok($$ insert into public.kpis (project_id, nom, cible)
                   select tests.id('pA'), 'KPI ' || n, 100 from generate_series(1, 5) n $$,
  'starter : 5 KPI acceptés');
select throws_ok($$ insert into public.kpis (project_id, nom, cible) values (tests.id('pA'), 'KPI 6', 100) $$,
  'P0001', 'PLAN_LIMIT:kpis', 'starter : sixième KPI refusé');
select is((select created_by from public.projects where id = tests.id('pA')), tests.id('admin1'),
  'created_by du projet renseigné');

select tests.deconnecter();
select throws_ok($$ insert into public.invitations (org_id, email, role, token_hash)
                    values (tests.id('org1'), 'b@exemple.test', 'editeur', repeat('b', 64)) $$,
  'P0001', 'PLAN_LIMIT:users', 'starter : aucune invitation au-delà d''un utilisateur');

-- Plan Pro : 5 utilisateurs, invitations en attente comprises ---------------
update public.organisations set plan = 'pro' where id = tests.id('org1');
select lives_ok($$ insert into public.invitations (org_id, email, role, token_hash)
                   select tests.id('org1'), 'invite' || n || '@exemple.test', 'editeur', repeat(n::text, 64)
                   from generate_series(1, 4) n $$,
  'pro : 4 invitations en plus de l''admin');
select throws_ok($$ insert into public.invitations (org_id, email, role, token_hash)
                    values (tests.id('org1'), 'invite5@exemple.test', 'editeur', repeat('c', 64)) $$,
  'P0001', 'PLAN_LIMIT:users', 'pro : sixième utilisateur refusé');
update public.invitations set expires_at = now() - interval '1 day' where email = 'invite1@exemple.test';
select lives_ok($$ insert into public.invitations (org_id, email, role, token_hash)
                   values (tests.id('org1'), 'invite5@exemple.test', 'editeur', repeat('d', 64)) $$,
  'une invitation expirée ne compte plus');

-- KPI épinglés : 4 au maximum ----------------------------------------------
select tests.connecter(tests.id('admin1'));
select lives_ok($$ update public.kpis set epingle = true where nom in ('KPI 1', 'KPI 2', 'KPI 3', 'KPI 4') $$,
  '4 KPI épinglés acceptés');
select throws_ok($$ update public.kpis set epingle = true where nom = 'KPI 5' $$,
  'P0001', 'KPI_EPINGLES_MAX', 'cinquième KPI épinglé refusé');

-- Projet exemple hors quota -------------------------------------------------
select tests.deconnecter();
update public.organisations set plan = 'starter' where id = tests.id('org1');
select tests.connecter(tests.id('admin1'));
select isnt(public.charger_projet_exemple(), null, 'starter : le projet exemple se charge malgré le quota de projets');
select is((select count(*) from public.kpis k join public.projects p on p.id = k.project_id where p.is_demo),
  8::bigint, 'le projet exemple compte 8 KPI hors quota');

-- Fin d'essai : lecture seule ----------------------------------------------
select tests.deconnecter();
update public.organisations set plan = 'essai', essai_fin = now() - interval '1 day' where id = tests.id('org1');
select tests.connecter(tests.id('admin1'));

select is((select count(*) from public.projects), 2::bigint, 'essai terminé : les projets restent consultables');
select isnt_empty($$ select 1 from public.kpi_entries $$, 'essai terminé : les saisies restent consultables');
select throws_ok($$ insert into public.projects (org_id, nom, date_debut, date_fin)
                    values (tests.id('org1'), 'Projet C', '2026-01-01', '2026-12-31') $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : création de projet refusée');
select throws_ok($$ update public.projects set nom = 'Renommé' where id = tests.id('pA') $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : modification de projet refusée');
select throws_ok($$ insert into public.kpi_entries (kpi_id, date, valeur)
                    select id, '2026-06-30', 1 from public.kpis where nom = 'KPI 1' $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : saisie refusée');
select throws_ok($$ delete from public.kpis where nom = 'KPI 5' $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : suppression de KPI refusée');
select throws_ok($$ delete from public.invitations $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : révocation d''invitation refusée');
select throws_ok($$ select public.charger_projet_exemple() $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : chargement du projet exemple refusé');

-- Réactivation manuelle d'un plan ------------------------------------------
select tests.deconnecter();
update public.organisations set plan = 'starter' where id = tests.id('org1');
select tests.connecter(tests.id('admin1'));
select is((select count(*) from public.projects where not is_demo), 1::bigint,
  'passage à un plan inférieur : les données sont conservées');
select lives_ok($$ insert into public.kpi_entries (kpi_id, date, valeur)
                   select id, '2026-06-30', 1 from public.kpis where nom = 'KPI 1' $$,
  'plan activé : la saisie reprend');
select throws_ok($$ insert into public.projects (org_id, nom, date_debut, date_fin)
                    values (tests.id('org1'), 'Projet C', '2026-01-01', '2026-12-31') $$,
  'P0001', 'PLAN_LIMIT:projects', 'plan activé : le quota du nouveau plan s''applique aux créations');

select tests.deconnecter();
select * from finish();
rollback;
