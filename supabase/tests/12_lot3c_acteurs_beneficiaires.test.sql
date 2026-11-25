-- Lot 3c : acteurs (annuaire de l'organisation, rôle par projet) et effectifs de bénéficiaires : isolation, rôles, règles,
-- fin d'essai, projet exemple.
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
  ('a1', 'a1000000-0000-4000-8000-000000000601'),
  ('a2', 'a1000000-0000-4000-8000-000000000602'),
  ('a3', 'b2000000-0000-4000-8000-000000000601');

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
insert into public.acteurs (id, org_id, nom, type) values
  (tests.id('a1'), tests.id('org1'), 'Bailleur A', 'bailleur'),
  (tests.id('a2'), tests.id('org1'), 'Partenaire B', 'partenaire'),
  (tests.id('a3'), tests.id('org2'), 'Acteur de l''autre organisation', 'prestataire');
insert into public.projet_acteurs (project_id, acteur_id, role) values (tests.id('p1'), tests.id('a1'), 'Bailleur principal');
insert into public.beneficiaires_effectifs (project_id, periode_debut, periode_fin, categorie, sexe, tranche_age, effectif, lieu) values
  (tests.id('p1'), '2026-01-01', '2026-06-30', 'Usagers', 'femme', '25_59', 120, 'Kolda');

select plan(56);

-- Lecture : membres de l'organisation seulement ------------------------------
select tests.connecter(tests.id('lecteur1'));
select is((select count(*) from public.acteurs), 2::bigint, 'lecteur : lit l''annuaire de son organisation');
select is((select count(*) from public.acteurs where org_id = tests.id('org2')), 0::bigint, 'lecteur : ne voit pas l''annuaire d''une autre organisation');
select is((select count(*) from public.projet_acteurs), 1::bigint, 'lecteur : lit les rôles des acteurs');
select is((select count(*) from public.beneficiaires_effectifs), 1::bigint, 'lecteur : lit les effectifs');
select throws_ok($$ insert into public.acteurs (org_id, nom, type) values (tests.id('org1'), 'Intrus', 'autre') $$, '42501', null, 'lecteur : ne crée pas d''acteur');
select throws_ok($$ insert into public.projet_acteurs (project_id, acteur_id, role) values (tests.id('p1b'), tests.id('a1'), 'Intrus') $$, '42501', null, 'lecteur : ne rattache pas d''acteur');
select throws_ok($$ insert into public.beneficiaires_effectifs (project_id, periode_debut, periode_fin, categorie, effectif) values (tests.id('p1'), '2026-07-01', '2026-12-31', 'X', 1) $$,
  '42501', null, 'lecteur : n''ajoute pas d''effectif');
select lives_ok($$ update public.acteurs set nom = 'Piraté'; delete from public.acteurs; update public.beneficiaires_effectifs set effectif = 1; delete from public.beneficiaires_effectifs $$,
  'lecteur : modifier ou supprimer ne touche aucune ligne');
select is((select sum(effectif) from public.beneficiaires_effectifs), 120::bigint, 'lecteur : effectifs intacts');
select tests.deconnecter();

select tests.anonyme();
select throws_ok($$ select * from public.acteurs $$, '42501', null, 'anonyme : annuaire refusé');
select throws_ok($$ select * from public.beneficiaires_effectifs $$, '42501', null, 'anonyme : effectifs refusés');
select tests.deconnecter();

-- Annuaire : écriture par admin et éditeur, suppression par les admins -----------------------
select tests.connecter(tests.id('editeur1'));
select lives_ok($$ insert into public.acteurs (org_id, nom, type, contact, email, telephone) values (tests.id('org1'), 'Mairie de Kolda', 'autorite_locale', 'Secrétaire', 'mairie@exemple.test', '+221 77 000 00 00') $$,
  'éditeur : ajoute un acteur à l''annuaire');
select is((select created_by from public.acteurs where nom = 'Mairie de Kolda'), tests.id('editeur1'), 'l''auteur est renseigné');
select is((select exemple from public.acteurs where nom = 'Mairie de Kolda'), false, 'un acteur saisi n''est pas un acteur d''exemple');
select throws_ok($$ insert into public.acteurs (org_id, nom, type, exemple) values (tests.id('org1'), 'Faux exemple', 'autre', true) $$,
  '42501', null, 'le client ne peut pas marquer un acteur comme exemple');
select throws_ok($$ update public.acteurs set exemple = true where nom = 'Mairie de Kolda' $$, '42501', null, 'ni modifier ce marquage');
select throws_ok($$ insert into public.acteurs (org_id, nom, type) values (tests.id('org2'), 'Chez les autres', 'autre') $$,
  '42501', null, 'on n''ajoute pas d''acteur dans l''annuaire d''une autre organisation');
select throws_ok($$ insert into public.acteurs (org_id, nom, type) values (tests.id('org1'), 'BAILLEUR A', 'bailleur') $$,
  '23505', null, 'un nom n''existe qu''une fois dans l''annuaire, sans tenir compte de la casse');
select throws_ok($$ insert into public.acteurs (org_id, nom, type, email) values (tests.id('org1'), 'Mauvais e-mail', 'autre', 'pas-un-email') $$,
  '23514', null, 'l''adresse e-mail est vérifiée');
select lives_ok($$ update public.acteurs set description = 'Autorité locale' where nom = 'Mairie de Kolda' $$, 'éditeur : modifie un acteur');
select lives_ok($$ delete from public.acteurs where nom = 'Mairie de Kolda' $$, 'éditeur : tente de supprimer un acteur');
select is((select count(*) from public.acteurs where nom = 'Mairie de Kolda'), 1::bigint, 'seuls les admins suppriment un acteur');
select tests.deconnecter();

-- Rôle d'un acteur dans un projet --------------------------------------------------------------
select tests.connecter(tests.id('editeur1'));
select lives_ok($$ insert into public.projet_acteurs (project_id, acteur_id, role, notes) values (tests.id('p1'), tests.id('a2'), 'Partenaire de mise en œuvre', 'Zone nord') $$,
  'éditeur : rattache un acteur à un projet avec son rôle');
select is((select org_id from public.projet_acteurs where role = 'Partenaire de mise en œuvre'), tests.id('org1'), 'l''organisation est dérivée du projet');
select throws_ok($$ insert into public.projet_acteurs (project_id, acteur_id, role) values (tests.id('p1b'), tests.id('a3'), 'Acteur d''ailleurs') $$,
  'P0001', 'RATTACHEMENT_INVALIDE', 'un acteur d''une autre organisation ne peut pas être rattaché');
select throws_ok($$ insert into public.projet_acteurs (project_id, acteur_id, role) values (tests.id('p1'), tests.id('a2'), 'Doublon') $$,
  '23505', null, 'un acteur n''a qu''un rôle par projet');
select throws_ok($$ insert into public.projet_acteurs (project_id, acteur_id, role) values (tests.id('p1b'), tests.id('a1'), '') $$,
  '23514', null, 'le rôle est obligatoire');
select lives_ok($$ update public.projet_acteurs set role = 'Appui technique' where role = 'Partenaire de mise en œuvre' $$, 'éditeur : modifie un rôle');
select throws_ok($$ update public.projet_acteurs set acteur_id = tests.id('a1') where role = 'Appui technique' $$, '42501', null,
  'l''acteur d''un rôle ne se change pas (on retire et on rajoute)');
select tests.deconnecter();

-- Effectifs de bénéficiaires -----------------------------------------------------------------------
select tests.connecter(tests.id('editeur1'));
select lives_ok($$ insert into public.beneficiaires_effectifs (project_id, periode_debut, periode_fin, categorie, sexe, tranche_age, effectif, lieu)
                   values (tests.id('p1'), '2026-01-01', '2026-06-30', 'Usagers', 'homme', '25_59', 95, 'Kolda') $$,
  'éditeur : ajoute un effectif');
select is((select org_id from public.beneficiaires_effectifs where sexe = 'homme'), tests.id('org1'), 'l''organisation est dérivée du projet');
select throws_ok($$ insert into public.beneficiaires_effectifs (project_id, periode_debut, periode_fin, categorie, sexe, tranche_age, effectif, lieu)
                    values (tests.id('p1'), '2026-01-01', '2026-06-30', 'USAGERS', 'femme', '25_59', 5, 'KOLDA') $$,
  '23505', null, 'la même combinaison ne se saisit qu''une fois, sans tenir compte de la casse');
select lives_ok($$ insert into public.beneficiaires_effectifs (project_id, periode_debut, periode_fin, categorie, sexe, tranche_age, effectif)
                   values (tests.id('p1'), '2026-01-01', '2026-06-30', 'Usagers', 'femme', '25_59', 0) $$,
  'le même effectif sans lieu est une autre combinaison, et zéro est une valeur');
select throws_ok($$ insert into public.beneficiaires_effectifs (project_id, periode_debut, periode_fin, categorie, effectif)
                    values (tests.id('p1'), '2026-07-01', '2026-06-01', 'X', 1) $$, '23514', null, 'la fin de période ne précède pas son début');
select throws_ok($$ insert into public.beneficiaires_effectifs (project_id, periode_debut, periode_fin, categorie, effectif)
                    values (tests.id('p1'), '2026-07-01', '2026-12-31', 'X', -1) $$, '23514', null, 'un effectif n''est pas négatif');
select throws_ok($$ insert into public.beneficiaires_effectifs (project_id, periode_debut, periode_fin, categorie, effectif)
                    values (tests.id('p1'), '2026-07-01', '2026-12-31', '', 1) $$, '23514', null, 'la catégorie est obligatoire');
select throws_ok($$ insert into public.beneficiaires_effectifs (project_id, periode_debut, periode_fin, categorie, sexe, effectif)
                    values (tests.id('p1'), '2026-07-01', '2026-12-31', 'X', 'inconnu', 1) $$, '22P02', null, 'le sexe est dans la liste');
select lives_ok($$ update public.beneficiaires_effectifs set effectif = 100 where sexe = 'homme' $$, 'éditeur : corrige un effectif');
select lives_ok($$ delete from public.beneficiaires_effectifs where sexe = 'homme' $$, 'éditeur : supprime un effectif');
select tests.deconnecter();

select tests.connecter(tests.id('admin2'));
select throws_ok($$ insert into public.projet_acteurs (project_id, acteur_id, role) values (tests.id('p1'), tests.id('a3'), 'Intrusion') $$,
  'P0001', 'PROJET_INTROUVABLE', 'une autre organisation ne peut pas rattacher d''acteur à ce projet');
select throws_ok($$ insert into public.beneficiaires_effectifs (project_id, periode_debut, periode_fin, categorie, effectif)
                    values (tests.id('p1'), '2026-07-01', '2026-12-31', 'X', 1) $$, 'P0001', 'PROJET_INTROUVABLE', 'ni ajouter d''effectif');
select tests.deconnecter();

-- Suppression d'un acteur par un admin : ses rôles partent ------------------------------------------
select tests.connecter(tests.id('admin1'));
select lives_ok($$ delete from public.acteurs where id = tests.id('a1') $$, 'admin : supprime un acteur de l''annuaire');
select is((select count(*) from public.projet_acteurs where acteur_id = tests.id('a1')), 0::bigint, 'ses rôles dans les projets partent avec lui');
select tests.deconnecter();

-- Fin d'essai : lecture seule ----------------------------------------------------------------
update public.organisations set essai_fin = now() - interval '1 day' where id = tests.id('org1');
select tests.connecter(tests.id('editeur1'));
select throws_ok($$ insert into public.acteurs (org_id, nom, type) values (tests.id('org1'), 'Après essai', 'autre') $$, 'P0001', 'ESSAI_EXPIRE', 'fin d''essai : pas de nouvel acteur');
select throws_ok($$ insert into public.beneficiaires_effectifs (project_id, periode_debut, periode_fin, categorie, effectif)
                    values (tests.id('p1'), '2026-07-01', '2026-12-31', 'X', 1) $$, 'P0001', 'ESSAI_EXPIRE', 'fin d''essai : pas de nouvel effectif');
select cmp_ok((select count(*) from public.acteurs), '>', 0::bigint, 'fin d''essai : l''annuaire reste lisible');
select tests.deconnecter();
update public.organisations set essai_fin = now() + interval '10 days' where id = tests.id('org1');

-- Projet exemple ----------------------------------------------------------------------------------
select tests.connecter(tests.id('admin2'));
select lives_ok($$ select public.charger_projet_exemple() $$, 'l''administrateur charge le projet exemple');
select tests.deconnecter();
insert into tests.ids select 'demo', id from public.projects where org_id = tests.id('org2') and is_demo;
select is((select count(*) from public.acteurs where org_id = tests.id('org2') and exemple), 4::bigint, 'exemple : quatre acteurs fictifs, marqués');
select is((select count(*) from public.projet_acteurs where project_id = tests.id('demo')), 4::bigint, 'exemple : chacun a son rôle dans le projet');
select is((select count(*) from public.beneficiaires_effectifs where project_id = tests.id('demo')), 20::bigint, 'exemple : vingt effectifs sur deux semestres');
select ok((select min(periode_fin) from public.beneficiaires_effectifs where project_id = tests.id('demo')) < current_date
          and (select max(periode_fin) from public.beneficiaires_effectifs where project_id = tests.id('demo')) <= current_date, 'exemple : aucune période dans le futur');
select lives_ok($$ select private.charger_contenu_exemple_lot3c(tests.id('demo')) $$, 'recharger le contenu ne fait rien');
select is((select count(*) from public.beneficiaires_effectifs where project_id = tests.id('demo')), 20::bigint, 'exemple : toujours vingt effectifs');
select tests.connecter(tests.id('admin2'));
select lives_ok($$ delete from public.projects where id = tests.id('demo') $$, 'supprimer le projet exemple');
select tests.deconnecter();
select is((select count(*) from public.acteurs where org_id = tests.id('org2') and exemple), 0::bigint, 'ses acteurs fictifs quittent l''annuaire');
select is((select count(*) from public.acteurs where id = tests.id('a3')), 1::bigint, 'les acteurs saisis par l''organisation restent');

select * from finish();
rollback;
