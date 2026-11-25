-- Lot 3b : composantes et planning (isolation, rôles, règles, rattachement des activités, fin d'essai, projet exemple).
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
  ('p1',  'a1000000-0000-4000-8000-000000000101'),
  ('p1b', 'a1000000-0000-4000-8000-000000000102'),
  ('p2',  'b2000000-0000-4000-8000-000000000101'),
  ('c1', 'a1000000-0000-4000-8000-000000000401'),
  ('c2', 'a1000000-0000-4000-8000-000000000402'),
  ('c3', 'a1000000-0000-4000-8000-000000000403'),
  ('t1', 'a1000000-0000-4000-8000-000000000501'),
  ('t2', 'a1000000-0000-4000-8000-000000000502');

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
  (tests.id('p1'),  tests.id('org1'), 'Projet Alpha',   '2026-01-01', '2026-12-31'),
  (tests.id('p1b'), tests.id('org1'), 'Projet Alpha 2', '2026-01-01', '2026-12-31'),
  (tests.id('p2'),  tests.id('org2'), 'Projet Beta',    '2026-01-01', '2026-12-31');
insert into public.composantes (id, project_id, nom, date_debut, date_fin, statut) values
  (tests.id('c1'), tests.id('p1'),  'Eau potable', '2026-02-01', '2026-08-31', 'en_cours'),
  (tests.id('c2'), tests.id('p1'),  'Hygiène', '2026-03-01', '2026-10-31', 'a_faire'),
  (tests.id('c3'), tests.id('p1b'), 'Gouvernance', '2026-01-01', '2026-06-30', 'a_faire');
insert into public.composantes (project_id, nom) values (tests.id('p2'), 'Composante Beta');
insert into public.pta_activites (id, project_id, annee, trimestre, intitule) values
  (tests.id('t1'), tests.id('p1'),  2026, 1, 'Activité Alpha'),
  (tests.id('t2'), tests.id('p1b'), 2026, 1, 'Activité Alpha 2');

select plan(41);

-- Lecture : membres de l'organisation seulement ------------------------------
select tests.connecter(tests.id('lecteur1'));
select is((select count(*) from public.composantes), 3::bigint, 'lecteur : lit les composantes de son organisation');
select is((select count(*) from public.composantes where project_id = tests.id('p2')), 0::bigint, 'lecteur : ne voit pas celles d''une autre organisation');
select throws_ok($$ insert into public.composantes (project_id, nom) values (tests.id('p1'), 'Intrus') $$,
  '42501', null, 'lecteur : ne crée pas de composante');
select lives_ok($$ update public.composantes set nom = 'Piratée'; delete from public.composantes $$,
  'lecteur : modifier ou supprimer ne touche aucune ligne');
select is((select count(*) from public.composantes where nom <> 'Piratée'), 3::bigint, 'lecteur : composantes intactes');
select tests.deconnecter();

select tests.anonyme();
select throws_ok($$ select * from public.composantes $$, '42501', null, 'anonyme : composantes refusées');
select tests.deconnecter();

-- Écriture : admin et éditeur ---------------------------------------------------
select tests.connecter(tests.id('editeur1'));
select lives_ok($$ insert into public.composantes (project_id, nom, description, responsable, date_debut, date_fin, statut, ordre)
                   values (tests.id('p1'), 'Suivi-évaluation', 'Enquêtes', 'Responsable S&E', '2026-05-01', '2026-11-30', 'en_cours', 4) $$,
  'éditeur : crée une composante');
select is((select org_id from public.composantes where nom = 'Suivi-évaluation'), tests.id('org1'), 'l''organisation est dérivée du projet');
select is((select created_by from public.composantes where nom = 'Suivi-évaluation'), tests.id('editeur1'), 'l''auteur est renseigné');
select throws_ok($$ insert into public.composantes (project_id, org_id, nom) values (tests.id('p1'), tests.id('org2'), 'Forgée') $$,
  '42501', null, 'l''organisation ne peut pas être fournie par le client');
select lives_ok($$ update public.composantes set statut = 'termine' where nom = 'Suivi-évaluation' $$, 'éditeur : modifie une composante');
select is((select statut::text from public.composantes where nom = 'Suivi-évaluation'), 'termine', 'la modification est enregistrée');
select lives_ok($$ delete from public.composantes where nom = 'Suivi-évaluation' $$, 'éditeur : supprime une composante');
select tests.deconnecter();

select tests.connecter(tests.id('admin2'));
select throws_ok($$ insert into public.composantes (project_id, nom) values (tests.id('p1'), 'Intrusion') $$,
  'P0001', 'PROJET_INTROUVABLE', 'une autre organisation ne peut pas écrire dans ce projet');
select tests.deconnecter();

-- Règles -----------------------------------------------------------------------------
select tests.connecter(tests.id('editeur1'));
select throws_ok($$ insert into public.composantes (project_id, nom) values (tests.id('p1'), 'EAU POTABLE') $$,
  '23505', null, 'un nom n''existe qu''une fois par projet, sans tenir compte de la casse');
select lives_ok($$ insert into public.composantes (project_id, nom) values (tests.id('p1b'), 'Eau potable') $$,
  'le même nom peut exister dans un autre projet');
select throws_ok($$ insert into public.composantes (project_id, nom) values (tests.id('p1'), '') $$, '23514', null, 'le nom est obligatoire');
select throws_ok($$ insert into public.composantes (project_id, nom, date_debut) values (tests.id('p1'), 'Une date', '2026-01-01') $$,
  '23514', null, 'les dates vont par paire');
select throws_ok($$ insert into public.composantes (project_id, nom, date_debut, date_fin) values (tests.id('p1'), 'À l''envers', '2026-06-01', '2026-05-01') $$,
  '23514', null, 'la fin ne peut pas précéder le début');
select throws_ok($$ insert into public.composantes (project_id, nom, statut) values (tests.id('p1'), 'Statut', 'inconnu') $$,
  '22P02', null, 'le statut est dans la liste');
select lives_ok($$ insert into public.composantes (project_id, nom) values (tests.id('p1'), 'À planifier') $$, 'une composante sans dates est à planifier');

-- Rattachement des activités -------------------------------------------------------------
select throws_ok($$ update public.pta_activites set composante_id = tests.id('c3') where id = tests.id('t1') $$,
  'P0001', 'RATTACHEMENT_INVALIDE', 'une activité ne se rattache qu''à une composante de son projet');
select throws_ok($$ insert into public.pta_activites (project_id, annee, trimestre, intitule, composante_id)
                    values (tests.id('p1'), 2026, 2, 'Mal rattachée', tests.id('c3')) $$,
  'P0001', 'RATTACHEMENT_INVALIDE', 'même refus à la création de l''activité');
select lives_ok($$ update public.pta_activites set composante_id = tests.id('c1') where id = tests.id('t1') $$, 'une activité se rattache à une composante du projet');
select is((select composante_id from public.pta_activites where id = tests.id('t1')), tests.id('c1'), 'le rattachement est enregistré');
select lives_ok($$ delete from public.composantes where id = tests.id('c1') $$, 'supprimer une composante');
select is((select composante_id from public.pta_activites where id = tests.id('t1')), null, 'ses activités sont détachées, pas supprimées');
select is((select count(*) from public.pta_activites where id = tests.id('t1')), 1::bigint, 'l''activité existe toujours');
select tests.deconnecter();

select tests.connecter(tests.id('admin1'));
select lives_ok($$ delete from public.projects where id = tests.id('p1b') $$, 'admin : supprime un projet');
select tests.deconnecter();
select is((select count(*) from public.composantes where project_id = tests.id('p1b')), 0::bigint, 'ses composantes partent avec lui');

-- Fin d'essai : lecture seule ----------------------------------------------------------------
update public.organisations set essai_fin = now() - interval '1 day' where id = tests.id('org1');
select tests.connecter(tests.id('editeur1'));
select throws_ok($$ insert into public.composantes (project_id, nom) values (tests.id('p1'), 'Après essai') $$,
  'P0001', 'ESSAI_EXPIRE', 'fin d''essai : pas de nouvelle composante');
select throws_ok($$ update public.composantes set nom = 'Autre' where id = tests.id('c2') $$,
  'P0001', 'ESSAI_EXPIRE', 'fin d''essai : pas de modification');
select cmp_ok((select count(*) from public.composantes), '>', 0::bigint, 'fin d''essai : les composantes restent lisibles');
select tests.deconnecter();
update public.organisations set essai_fin = now() + interval '10 days' where id = tests.id('org1');

-- Projet exemple : quatre composantes déduites des activités ------------------------------------
select tests.connecter(tests.id('admin2'));
select lives_ok($$ select public.charger_projet_exemple() $$, 'l''administrateur charge le projet exemple');
select tests.deconnecter();
-- Le contenu des composantes est ajouté à la fin de la transaction : on la force ici.
set constraints all immediate;
insert into tests.ids select 'demo', id from public.projects where org_id = tests.id('org2') and is_demo;
select is((select count(*) from public.composantes where project_id = tests.id('demo')), 4::bigint, 'exemple : quatre composantes');
select is((select count(*) from public.pta_activites where project_id = tests.id('demo') and composante_id is not null), 9::bigint,
  'exemple : les neuf activités du plan de travail sont rattachées à une composante');
select is((select count(*) from public.composantes c
           where c.project_id = tests.id('demo') and (c.date_debut is null or c.date_fin < c.date_debut
             or c.date_debut > (select min(t.date_debut) from public.pta_activites t where t.composante_id = c.id)
             or c.date_fin < (select max(t.date_fin) from public.pta_activites t where t.composante_id = c.id))), 0::bigint,
  'exemple : chaque composante est datée et couvre ses activités');
select is((select string_agg(nom || ' : ' || statut, ' | ' order by ordre) from public.composantes where project_id = tests.id('demo')),
  'Accès à l''eau potable : en_cours | Gouvernance des points d''eau : termine | Hygiène et assainissement : en_cours | Suivi-évaluation et capitalisation : a_faire',
  'exemple : le statut se déduit des activités');
select lives_ok($$ select private.charger_contenu_exemple_lot3b(tests.id('demo')) $$, 'recharger le contenu ne fait rien');
select is((select count(*) from public.composantes where project_id = tests.id('demo')), 4::bigint, 'exemple : toujours quatre composantes');
select tests.connecter(tests.id('admin2'));
select lives_ok($$ delete from public.projects where id = tests.id('demo') $$, 'supprimer le projet exemple emporte ses composantes');
select tests.deconnecter();

select * from finish();
rollback;
