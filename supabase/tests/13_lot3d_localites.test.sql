-- Lot 3d : localités (référentiel de la plateforme et localités d'une organisation), zones d'intervention des projets,
-- rattachement des saisies et des réalisations : isolation, rôles, règles, fin d'essai, projet exemple.
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
  ('k1',  'a1000000-0000-4000-8000-000000000201'),
  ('l1',  'a1000000-0000-4000-8000-000000000701'),
  ('l2',  'b2000000-0000-4000-8000-000000000701');

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
insert into public.kpis (id, project_id, nom, cible) values (tests.id('k1'), tests.id('p1'), 'Indicateur Alpha', 100);

select plan(68);

-- Aucune localité n'est livrée avec la plateforme ---------------------------------------------------
select is((select count(*) from public.localites), 0::bigint, 'aucune localité préchargée : les organisations renseignent les leurs');
select is((select count(*) from public.localites where org_id is null), 0::bigint, 'aucune ligne dans le référentiel de la plateforme');
select hasnt_function('private', 'charger_contenu_exemple_lot3d', array['uuid'], 'le projet exemple n''est plus rattaché d''office à une localité');

-- Le mécanisme du référentiel reste : on charge ici, comme la plateforme le ferait, trois lignes de test sourcées.
insert into public.localites (niveau, nom, source) values ('region', 'Region de reference', 'Source de test');
insert into public.localites (parent_id, niveau, nom, latitude, longitude, source)
select id, 'commune', 'Commune de reference', 14.5, -17.5, 'Source de test' from public.localites where nom = 'Region de reference';
insert into public.localites (parent_id, niveau, nom, source)
select id, 'village', 'Village de reference', 'Source de test' from public.localites where nom = 'Commune de reference';
insert into public.localites (parent_id, niveau, nom, source)
select id, 'quartier', 'Quartier de reference', 'Source de test' from public.localites where nom = 'Village de reference';
insert into tests.ids select 'commune', id from public.localites where org_id is null and nom = 'Commune de reference';
insert into tests.ids select 'villageref', id from public.localites where org_id is null and nom = 'Village de reference';
insert into tests.ids select 'quartierref', id from public.localites where org_id is null and nom = 'Quartier de reference';
insert into public.localites (id, org_id, parent_id, niveau, nom) values
  (tests.id('l1'), tests.id('org1'), tests.id('commune'), 'village', 'Village test Alpha'),
  (tests.id('l2'), tests.id('org2'), tests.id('commune'), 'village', 'Village test Beta');

-- Référentiel de la plateforme (lignes de test) ------------------------------------------------------
select is((select count(*) from public.localites where org_id is null), 4::bigint, 'référentiel : quatre lignes de test');
select is((select count(*) from public.localites where org_id is null and (source is null or source = '')), 0::bigint, 'référentiel : chaque ligne a sa source');
select throws_ok($$ insert into public.localites (niveau, nom) values ('region', 'Sans source') $$, '23514', null, 'référentiel : une ligne sans source est refusée');

-- Lecture : le référentiel et sa propre organisation ----------------------------------------------
select tests.connecter(tests.id('lecteur1'));
select is((select count(*) from public.localites), 5::bigint, 'lecteur : lit le référentiel et les localités de son organisation');
select is((select count(*) from public.localites where org_id = tests.id('org2')), 0::bigint, 'lecteur : ne voit pas les localités d''une autre organisation');
select throws_ok($$ insert into public.localites (org_id, niveau, nom) values (tests.id('org1'), 'village', 'Intrus') $$, '42501', null, 'lecteur : ne crée pas de localité');
select lives_ok($$ update public.localites set nom = 'Piraté'; delete from public.localites $$, 'lecteur : modifier ou supprimer ne touche aucune ligne');
select is((select count(*) from public.localites), 5::bigint, 'lecteur : localités intactes');
select tests.deconnecter();

select tests.anonyme();
select throws_ok($$ select * from public.localites $$, '42501', null, 'anonyme : localités refusées');
select tests.deconnecter();

-- Localités d'une organisation : écriture par admin et éditeur ----------------------------------------
select tests.connecter(tests.id('editeur1'));
select lives_ok($$ insert into public.localites (org_id, parent_id, niveau, nom, latitude, longitude, source)
                   values (tests.id('org1'), tests.id('commune'), 'village', 'Village test Gamma', 14.7650, -17.4700, 'Relevé GPS du 12 mars') $$,
  'éditeur : ajoute un village sous une commune du référentiel, avec ses coordonnées');
select is((select created_by from public.localites where nom = 'Village test Gamma'), tests.id('editeur1'), 'l''auteur est renseigné');
select throws_ok($$ insert into public.localites (org_id, niveau, nom, source) values (null, 'village', 'Faux référentiel', 'inventé') $$,
  '42501', null, 'le client ne peut pas écrire dans le référentiel de la plateforme');
select throws_ok($$ insert into public.localites (org_id, niveau, nom) values (tests.id('org2'), 'village', 'Chez les autres') $$,
  '42501', null, 'on n''ajoute pas de localité à une autre organisation');
select throws_ok($$ insert into public.localites (org_id, parent_id, niveau, nom) values (tests.id('org1'), tests.id('commune'), 'village', 'VILLAGE TEST ALPHA') $$,
  '23505', null, 'un nom n''existe qu''une fois sous un même parent, sans tenir compte de la casse');
select throws_ok($$ insert into public.localites (org_id, parent_id, niveau, nom) values (tests.id('org1'), tests.id('villageref'), 'quartier', 'QUARTIER DE REFERENCE') $$,
  'P0001', 'LOCALITE_EXISTE', 'une organisation ne recrée pas une localité du référentiel');
select throws_ok($$ insert into public.localites (org_id, niveau, nom, latitude) values (tests.id('org1'), 'village', 'Latitude seule', 14.7) $$,
  '23514', null, 'les coordonnées vont par paire');
select throws_ok($$ insert into public.localites (org_id, niveau, nom, latitude, longitude) values (tests.id('org1'), 'village', 'Latitude absurde', 91, 10) $$,
  '23514', null, 'la latitude reste entre -90 et 90');
select throws_ok($$ insert into public.localites (org_id, niveau, nom, latitude, longitude) values (tests.id('org1'), 'village', 'Longitude absurde', 10, -181) $$,
  '23514', null, 'la longitude reste entre -180 et 180');
select throws_ok($$ insert into public.localites (org_id, parent_id, niveau, nom) values (tests.id('org1'), tests.id('l2'), 'quartier', 'Enfant d''ailleurs') $$,
  'P0001', 'LOCALITE_PARENT_INVALIDE', 'le parent d''une autre organisation est refusé');
select throws_ok($$ insert into public.localites (org_id, parent_id, niveau, nom) values (tests.id('org1'), tests.id('commune'), 'region', 'Région sous une commune') $$,
  'P0001', 'LOCALITE_NIVEAU_INVALIDE', 'un enfant a un niveau inférieur à celui de son parent');
select lives_ok($$ insert into public.localites (org_id, niveau, nom) values (tests.id('org1'), 'village', 'Village isolé') $$,
  'un village peut n''avoir aucun parent (hors du référentiel)');
select lives_ok($$ update public.localites set nom = 'Village test Alpha 2', latitude = 14.77, longitude = -17.47, source = 'Relevé GPS' where id = tests.id('l1') $$,
  'éditeur : corrige le nom et les coordonnées d''une localité de son organisation');
select throws_ok($$ update public.localites set niveau = 'quartier' where id = tests.id('l1') $$, '42501', null, 'le niveau ne se change pas');
select throws_ok($$ update public.localites set parent_id = tests.id('villageref') where id = tests.id('l1') $$, '42501', null, 'le parent ne se change pas');
select lives_ok($$ update public.localites set nom = 'Piraté' where org_id is null $$, 'éditeur : tente de modifier le référentiel');
select is((select count(*) from public.localites where nom = 'Piraté'), 0::bigint, 'le référentiel n''est pas modifiable par le client');
select lives_ok($$ delete from public.localites where org_id is null $$, 'éditeur : tente de supprimer le référentiel');
select is((select count(*) from public.localites where org_id is null), 4::bigint, 'le référentiel n''est pas supprimable par le client');
select lives_ok($$ insert into public.localites (org_id, parent_id, niveau, nom)
                   select tests.id('org1'), id, 'quartier', 'Quartier isolé' from public.localites where nom = 'Village isolé' $$,
  'éditeur : ajoute un quartier sous son village');
select throws_ok($$ delete from public.localites where nom = 'Village isolé' $$, '23503', null, 'une localité qui a des enfants ne se supprime pas');
select lives_ok($$ delete from public.localites where nom = 'Quartier isolé' $$, 'éditeur : supprime une localité sans enfant');
select lives_ok($$ delete from public.localites where nom = 'Village isolé' $$, 'éditeur : supprime ensuite le village, devenu sans enfant');
select tests.deconnecter();

-- Zones d'intervention d'un projet ------------------------------------------------------------------
select tests.connecter(tests.id('editeur1'));
select lives_ok($$ insert into public.projet_localites (project_id, localite_id, notes) values (tests.id('p1'), tests.id('commune'), 'Commune d''intervention') $$,
  'éditeur : désigne une commune du référentiel comme zone d''intervention');
select is((select org_id from public.projet_localites where localite_id = tests.id('commune')), tests.id('org1'), 'l''organisation est dérivée du projet');
select throws_ok($$ insert into public.projet_localites (project_id, localite_id) values (tests.id('p1'), tests.id('l2')) $$,
  'P0001', 'LOCALITE_INTROUVABLE', 'une localité d''une autre organisation ne peut pas être une zone');
select throws_ok($$ insert into public.projet_localites (project_id, localite_id) values (tests.id('p1'), tests.id('commune')) $$,
  '23505', null, 'une localité n''est zone d''un projet qu''une fois');
select lives_ok($$ insert into public.projet_localites (project_id, localite_id) values (tests.id('p1'), tests.id('l1')) $$,
  'éditeur : désigne aussi une localité de son organisation');
select throws_ok($$ delete from public.localites where id = tests.id('l1') $$, '23503', null, 'une localité utilisée comme zone ne se supprime pas');
select tests.deconnecter();

select tests.connecter(tests.id('lecteur1'));
select throws_ok($$ insert into public.projet_localites (project_id, localite_id) values (tests.id('p1b'), tests.id('commune')) $$, '42501', null, 'lecteur : ne désigne pas de zone');
select is((select count(*) from public.projet_localites), 2::bigint, 'lecteur : lit les zones');
select tests.deconnecter();

select tests.connecter(tests.id('admin2'));
select throws_ok($$ insert into public.projet_localites (project_id, localite_id) values (tests.id('p1'), tests.id('quartierref')) $$,
  'P0001', 'PROJET_INTROUVABLE', 'une autre organisation ne peut pas ajouter de zone à ce projet');
select tests.deconnecter();

-- Saisies et réalisations rattachées à une localité ---------------------------------------------------
select tests.connecter(tests.id('editeur1'));
select lives_ok($$ insert into public.kpi_entries (kpi_id, date, valeur, localite_id) values (tests.id('k1'), '2026-03-01', 5, tests.id('commune')) $$,
  'éditeur : rattache une saisie à une zone du projet');
select throws_ok($$ insert into public.kpi_entries (kpi_id, date, valeur, localite_id) values (tests.id('k1'), '2026-03-02', 5, tests.id('quartierref')) $$,
  'P0001', 'LOCALITE_HORS_PROJET', 'une saisie ne se rattache pas à une localité qui n''est pas zone du projet');
select throws_ok($$ insert into public.kpi_entries (kpi_id, date, valeur, localite_id) values (tests.id('k1'), '2026-03-03', 5, tests.id('l2')) $$,
  'P0001', 'LOCALITE_HORS_PROJET', 'ni à la localité d''une autre organisation');
select lives_ok($$ insert into public.kpi_entries (kpi_id, date, valeur) values (tests.id('k1'), '2026-03-04', 6) $$, 'la localité reste facultative');
select lives_ok($$ insert into public.realisations (project_id, date, titre, localite_id) values (tests.id('p1'), '2026-03-05', 'Forage réceptionné', tests.id('commune')) $$,
  'éditeur : rattache une réalisation à une zone du projet');
select throws_ok($$ insert into public.realisations (project_id, date, titre, localite_id) values (tests.id('p1'), '2026-03-06', 'Ailleurs', tests.id('quartierref')) $$,
  'P0001', 'LOCALITE_HORS_PROJET', 'une réalisation ne se rattache pas à une localité qui n''est pas zone du projet');
select throws_ok($$ update public.kpi_entries set localite_id = tests.id('quartierref') where date = '2026-03-01' $$,
  'P0001', 'LOCALITE_HORS_PROJET', 'changer la localité d''une saisie est contrôlé de la même façon');

-- Retirer une zone ne modifie pas les saisies déjà rattachées.
select lives_ok($$ delete from public.projet_localites where project_id = tests.id('p1') and localite_id = tests.id('commune') $$, 'éditeur : retire une zone d''intervention');
select is((select count(*) from public.kpi_entries where localite_id = tests.id('commune')) + (select count(*) from public.realisations where localite_id = tests.id('commune')),
  2::bigint, 'retirer la zone laisse la saisie et la réalisation rattachées');
select lives_ok($$ update public.kpi_entries set localite_id = localite_id, valeur = 9 where date = '2026-03-01' $$,
  'corriger une saisie dont la zone a été retirée reste possible, la localité étant inchangée');
select tests.deconnecter();

-- Supprimer un projet efface ses zones, pas le référentiel -------------------------------------
select tests.connecter(tests.id('admin1'));
select lives_ok($$ insert into public.projet_localites (project_id, localite_id) values (tests.id('p1b'), tests.id('commune')) $$, 'admin : zone sur un second projet');
select lives_ok($$ delete from public.projects where id = tests.id('p1b') $$, 'admin : supprime ce projet');
select is((select count(*) from public.projet_localites where project_id = tests.id('p1b')), 0::bigint, 'ses zones partent avec lui');
select is((select count(*) from public.localites where org_id is null), 4::bigint, 'le référentiel reste intact');
select tests.deconnecter();

-- Fin d'essai : lecture seule ----------------------------------------------------------------
update public.organisations set essai_fin = now() - interval '1 day' where id = tests.id('org1');
select tests.connecter(tests.id('editeur1'));
select throws_ok($$ insert into public.localites (org_id, niveau, nom) values (tests.id('org1'), 'village', 'Après essai') $$, 'P0001', 'ESSAI_EXPIRE', 'fin d''essai : pas de nouvelle localité');
select throws_ok($$ insert into public.projet_localites (project_id, localite_id) values (tests.id('p1'), tests.id('commune')) $$, 'P0001', 'ESSAI_EXPIRE', 'fin d''essai : pas de nouvelle zone');
select cmp_ok((select count(*) from public.localites), '>', 0::bigint, 'fin d''essai : les localités restent lisibles');
select tests.deconnecter();
update public.organisations set essai_fin = now() + interval '10 days' where id = tests.id('org1');

-- Projet exemple : aucune zone posée d'office -------------------------------------------------------
select tests.connecter(tests.id('admin2'));
select lives_ok($$ select public.charger_projet_exemple() $$, 'l''administrateur charge le projet exemple');
select tests.deconnecter();
insert into tests.ids select 'demo', id from public.projects where org_id = tests.id('org2') and is_demo;
select is((select count(*) from public.projet_localites where project_id = tests.id('demo')), 0::bigint, 'exemple : aucune zone d''intervention n''est posée d''office');
select is((select count(*) from public.localites where org_id = tests.id('org2') and nom <> 'Village test Beta'), 0::bigint, 'exemple : aucune localité n''est créée pour l''organisation');
select tests.connecter(tests.id('admin2'));
select lives_ok($$ delete from public.projects where id = tests.id('demo') $$, 'supprimer le projet exemple');
select tests.deconnecter();
select is((select count(*) from public.localites where org_id is null), 4::bigint, 'le référentiel de test reste intact');

-- Supprimer une organisation efface ses localités et ses zones dans la même instruction ----------------
select lives_ok($$ delete from public.organisations where id = tests.id('org2') $$, 'supprimer une organisation qui a des localités et des zones');
select is((select count(*) from public.localites where org_id = tests.id('org2')), 0::bigint, 'ses localités sont parties avec elle');

select * from finish();
rollback;
