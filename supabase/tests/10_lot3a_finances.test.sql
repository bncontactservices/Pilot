-- Lot 3a : budget (admin et éditeur) et dépenses (admin seulement) : isolation, rôles, règles, fin d'essai, taux financier dans les vues et les états
-- d'avancement, contenu du projet exemple.
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
  ('p1c', 'a1000000-0000-4000-8000-000000000103'),
  ('p2z', 'b2000000-0000-4000-8000-000000000102'),
  ('p2',  'b2000000-0000-4000-8000-000000000101'),
  ('prog1', 'a1000000-0000-4000-8000-000000000301'),
  ('l1', 'a1000000-0000-4000-8000-000000000401'),
  ('l2', 'a1000000-0000-4000-8000-000000000402'),
  ('l3', 'a1000000-0000-4000-8000-000000000403'),
  ('l4', 'a1000000-0000-4000-8000-000000000404'),
  ('l5', 'a1000000-0000-4000-8000-000000000405'),
  ('l2b', 'b2000000-0000-4000-8000-000000000402'),
  ('e1', 'a1000000-0000-4000-8000-000000000501'),
  ('e3', 'a1000000-0000-4000-8000-000000000503'),
  ('d1', 'a1000000-0000-4000-8000-000000000601'),
  ('d3', 'a1000000-0000-4000-8000-000000000603');

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

insert into public.programmes (id, org_id, nom) values (tests.id('prog1'), tests.id('org1'), 'Programme Alpha');
insert into public.projects (id, org_id, nom, date_debut, date_fin, programme_id) values
  (tests.id('p1'),  tests.id('org1'), 'Projet Alpha',  '2026-01-01', '2026-12-31', tests.id('prog1')),
  (tests.id('p1b'), tests.id('org1'), 'Projet Alpha 2', '2026-01-01', '2026-12-31', tests.id('prog1')),
  (tests.id('p1c'), tests.id('org1'), 'Projet sans budget', '2026-01-01', '2026-12-31', tests.id('prog1')),
  (tests.id('p2z'), tests.id('org2'), 'Projet à budget nul', '2026-01-01', '2026-12-31', null),
  (tests.id('p2'),  tests.id('org2'), 'Projet Beta',   '2026-01-01', '2026-12-31', null);

insert into public.budget_lignes (id, project_id, annee, poste, montant_prevu) values
  (tests.id('l1'), tests.id('p1'),  2026, 'Forages', 100),
  (tests.id('l2'), tests.id('p1'),  2026, 'Latrines', 50),
  (tests.id('l3'), tests.id('p1b'), 2026, 'Pilotage', 100),
  (tests.id('l4'), tests.id('p2z'), 2026, 'Poste à zéro', 0),
  (tests.id('l2b'), tests.id('p2'), 2026, 'Forages', 80);
insert into public.depenses (id, project_id, budget_ligne_id, date, libelle, montant) values
  (tests.id('e1'), tests.id('p1'), tests.id('l1'), '2026-03-10', 'Pompes', 30),
  (tests.id('e3'), tests.id('p1b'), tests.id('l3'), '2026-03-12', 'Évaluation', 120);
insert into public.documents (id, project_id, nom, categorie, storage_path) values
  (tests.id('d1'), tests.id('p1'),  'Facture pompes', 'justificatif', tests.id('org1') || '/' || tests.id('p1') || '/facture.pdf'),
  (tests.id('d3'), tests.id('p1b'), 'Facture évaluation', 'justificatif', tests.id('org1') || '/' || tests.id('p1b') || '/evaluation.pdf');

select plan(72);

-- Lecture : membres de l'organisation seulement ------------------------------
select tests.connecter(tests.id('lecteur1'));
select is((select count(*) from public.budget_lignes), 3::bigint, 'lecteur : lit les lignes budgétaires de son organisation');
select is((select count(*) from public.depenses), 2::bigint, 'lecteur : lit les dépenses de son organisation');
select is((select count(*) from public.budget_lignes where project_id = tests.id('p2')), 0::bigint, 'lecteur : ne voit pas le budget d''une autre organisation');
select throws_ok($$ insert into public.budget_lignes (project_id, annee, poste, montant_prevu) values (tests.id('p1'), 2027, 'X', 1) $$,
  '42501', null, 'lecteur : ne crée pas de ligne budgétaire');
select throws_ok($$ insert into public.depenses (project_id, budget_ligne_id, date, libelle, montant) values (tests.id('p1'), tests.id('l1'), '2026-04-01', 'X', 1) $$,
  '42501', null, 'lecteur : ne crée pas de dépense');
select lives_ok($$ update public.budget_lignes set montant_prevu = 1; update public.depenses set montant = 1; delete from public.budget_lignes; delete from public.depenses $$,
  'lecteur : modifier ou supprimer ne touche aucune ligne');
select is((select sum(montant_prevu) from public.budget_lignes), 250::numeric, 'lecteur : budget intact après ces tentatives');
select is((select sum(montant) from public.depenses), 150::numeric, 'lecteur : dépenses intactes après ces tentatives');
select tests.deconnecter();

select tests.anonyme();
select throws_ok($$ select * from public.budget_lignes $$, '42501', null, 'anonyme : budget refusé');
select throws_ok($$ select * from public.depenses $$, '42501', null, 'anonyme : dépenses refusées');
select tests.deconnecter();

-- Écriture : admin et éditeur ---------------------------------------------------
select tests.connecter(tests.id('editeur1'));
select lives_ok($$ insert into public.budget_lignes (project_id, annee, poste, montant_prevu, notes)
                   values (tests.id('p1'), 2027, 'Formation', 40, 'Relais communautaires') $$,
  'éditeur : crée une ligne budgétaire');
select is((select org_id from public.budget_lignes where poste = 'Formation'), tests.id('org1'), 'l''organisation est dérivée du projet');
select is((select created_by from public.budget_lignes where poste = 'Formation'), tests.id('editeur1'), 'l''auteur est renseigné');
select throws_ok($$ insert into public.budget_lignes (project_id, org_id, annee, poste, montant_prevu)
                    values (tests.id('p1'), tests.id('org2'), 2028, 'Intrus', 1) $$,
  '42501', null, 'l''organisation ne peut pas être fournie par le client');
select lives_ok($$ update public.budget_lignes set montant_prevu = 45 where poste = 'Formation' $$, 'éditeur : modifie une ligne');
select is((select montant_prevu from public.budget_lignes where poste = 'Formation'), 45::numeric, 'la modification est enregistrée');
-- Les dépenses sont réservées aux administrateurs : l'éditeur gère le budget, pas la comptabilité des dépenses.
select throws_ok($$ insert into public.depenses (project_id, budget_ligne_id, date, libelle, montant)
                    values (tests.id('p1'), tests.id('l2'), '2026-04-02', 'Dalles', 12.5) $$,
  '42501', null, 'éditeur : n''enregistre pas de dépense');
select lives_ok($$ update public.depenses set montant = 1; delete from public.depenses $$,
  'éditeur : modifier ou supprimer une dépense ne touche aucune ligne');
select is((select sum(montant) from public.depenses), 150::numeric, 'éditeur : les dépenses sont intactes');
select is((select count(*) from public.depenses), 2::bigint, 'éditeur : il peut toujours les lire');
select tests.deconnecter();

select tests.connecter(tests.id('admin1'));
select lives_ok($$ insert into public.depenses (project_id, budget_ligne_id, date, libelle, montant, fournisseur, reference, document_id)
                   values (tests.id('p1'), tests.id('l2'), '2026-04-02', 'Dalles', 12.5, 'Fournisseur', 'FAC-1', tests.id('d1')) $$,
  'admin : enregistre une dépense avec justificatif');
select is((select count(*) from public.depenses where libelle = 'Dalles' and created_by = tests.id('admin1')), 1::bigint, 'la dépense porte son auteur');
select throws_ok($$ update public.depenses set org_id = tests.id('org2') where libelle = 'Dalles' $$, '42501', null,
  'l''organisation d''une dépense est immuable côté client');
select lives_ok($$ update public.depenses set montant = 13 where libelle = 'Dalles' $$, 'admin : modifie une dépense');
select lives_ok($$ delete from public.depenses where libelle = 'Dalles' $$, 'admin : supprime une dépense');
select tests.deconnecter();

select tests.connecter(tests.id('admin2'));
select throws_ok($$ insert into public.budget_lignes (project_id, annee, poste, montant_prevu) values (tests.id('p1'), 2027, 'Intrus', 1) $$,
  'P0001', 'PROJET_INTROUVABLE', 'une autre organisation ne peut pas écrire dans le budget de ce projet');
select is((select count(*) from public.budget_lignes where project_id = tests.id('p1')), 0::bigint, 'ni le lire');
select tests.deconnecter();

-- Règles -------------------------------------------------------------------------
select tests.connecter(tests.id('admin1'));
select throws_ok($$ insert into public.budget_lignes (project_id, annee, poste, montant_prevu) values (tests.id('p1'), 2027, 'Négatif', -1) $$,
  '23514', null, 'un budget prévu ne peut pas être négatif');
select throws_ok($$ insert into public.budget_lignes (project_id, annee, poste, montant_prevu) values (tests.id('p1'), 1999, 'Ancien', 1) $$,
  '23514', null, 'l''année doit être plausible');
select throws_ok($$ insert into public.budget_lignes (project_id, annee, poste, montant_prevu) values (tests.id('p1'), 2027, '', 1) $$,
  '23514', null, 'le poste est obligatoire');
select throws_ok($$ insert into public.budget_lignes (project_id, annee, poste, montant_prevu) values (tests.id('p1'), 2026, 'FORAGES', 1) $$,
  '23505', null, 'un poste n''existe qu''une fois par année, sans tenir compte de la casse');
select lives_ok($$ insert into public.budget_lignes (project_id, annee, poste, montant_prevu) values (tests.id('p1'), 2027, 'Forages', 0) $$,
  'le même poste peut exister une autre année');
select throws_ok($$ insert into public.depenses (project_id, budget_ligne_id, date, libelle, montant) values (tests.id('p1'), tests.id('l1'), '2026-04-01', 'Nulle', 0) $$,
  '23514', null, 'une dépense a un montant strictement positif');
select throws_ok($$ insert into public.depenses (project_id, budget_ligne_id, date, libelle, montant) values (tests.id('p1'), tests.id('l1'), '1999-04-01', 'Ancienne', 5) $$,
  '23514', null, 'la date d''une dépense doit être plausible');
select throws_ok($$ insert into public.depenses (project_id, budget_ligne_id, date, libelle, montant) values (tests.id('p1'), tests.id('l3'), '2026-04-01', 'Autre projet', 5) $$,
  'P0001', 'RATTACHEMENT_INVALIDE', 'la ligne budgétaire d''une dépense est du même projet');
select throws_ok($$ insert into public.depenses (project_id, budget_ligne_id, date, libelle, montant, document_id)
                    values (tests.id('p1'), tests.id('l1'), '2026-04-01', 'Mauvaise pièce', 5, tests.id('d3')) $$,
  'P0001', 'RATTACHEMENT_INVALIDE', 'le justificatif d''une dépense est un document du même projet');
select throws_ok($$ delete from public.budget_lignes where id = tests.id('l1') $$,
  '23503', null, 'une ligne budgétaire qui a des dépenses ne peut pas être supprimée');
select lives_ok($$ delete from public.budget_lignes where poste = 'Formation' $$, 'une ligne sans dépense peut être supprimée');
select tests.deconnecter();

-- Un justificatif supprimé laisse la dépense -----------------------------------
insert into public.depenses (id, project_id, budget_ligne_id, date, libelle, montant, document_id)
values ('a1000000-0000-4000-8000-000000000502', tests.id('p1'), tests.id('l2'), '2026-05-01', 'Avec pièce', 7, tests.id('d1'));
delete from public.documents where id = tests.id('d1');
select is((select document_id from public.depenses where id = 'a1000000-0000-4000-8000-000000000502'), null,
  'le justificatif supprimé laisse la dépense, sans pièce');
select is((select count(*) from public.depenses where id = 'a1000000-0000-4000-8000-000000000502'), 1::bigint, 'la dépense existe toujours');
delete from public.depenses where id = 'a1000000-0000-4000-8000-000000000502';

-- Fin d'essai : lecture seule ----------------------------------------------------
update public.organisations set essai_fin = now() - interval '1 day' where id = tests.id('org1');
select tests.connecter(tests.id('admin1'));
select throws_ok($$ insert into public.budget_lignes (project_id, annee, poste, montant_prevu) values (tests.id('p1'), 2030, 'Après essai', 1) $$,
  'P0001', 'ESSAI_EXPIRE', 'fin d''essai : pas de nouvelle ligne budgétaire');
select throws_ok($$ update public.budget_lignes set montant_prevu = 2 where id = tests.id('l1') $$,
  'P0001', 'ESSAI_EXPIRE', 'fin d''essai : pas de modification de ligne');
select throws_ok($$ insert into public.depenses (project_id, budget_ligne_id, date, libelle, montant) values (tests.id('p1'), tests.id('l1'), '2026-06-01', 'Après essai', 1) $$,
  'P0001', 'ESSAI_EXPIRE', 'fin d''essai : pas de nouvelle dépense');
select throws_ok($$ delete from public.depenses where id = tests.id('e1') $$,
  'P0001', 'ESSAI_EXPIRE', 'fin d''essai : pas de suppression de dépense');
select cmp_ok((select count(*) from public.depenses), '>', 0::bigint, 'fin d''essai : le budget et les dépenses restent lisibles');
select tests.deconnecter();
update public.organisations set essai_fin = now() + interval '10 days' where id = tests.id('org1');

-- Taux financier dans les vues -----------------------------------------------------
select is((select taux_financier from public.v_avancement where project_id = tests.id('p1')), 20::numeric,
  'v_avancement : 30 dépensés sur 150 prévus = 20 %');
select is((select budget_total from public.v_avancement where project_id = tests.id('p1')), 150::numeric, 'v_avancement : budget total');
select is((select depenses_total from public.v_avancement where project_id = tests.id('p1')), 30::numeric, 'v_avancement : dépenses totales');
select is((select taux_financier from public.v_avancement where project_id = tests.id('p1b')), 120::numeric,
  'v_avancement : un dépassement n''est pas plafonné (120 %)');
select is((select taux_financier from public.v_avancement where project_id = tests.id('p1c')), null,
  'v_avancement : sans ligne budgétaire, pas de taux');
select is((select taux_financier from public.v_avancement where project_id = tests.id('p2z')), null,
  'v_avancement : un budget total nul ne donne pas de taux (pas de division par zéro)');
select is((select taux_financier from public.v_avancement where project_id = tests.id('p2')), 0::numeric,
  'v_avancement : un budget sans dépense donne 0 %');
select is((select count(*) from public.v_avancement_programme where programme_id = tests.id('prog1') and nb_projets = 3 and nb_projets_avec_budget = 2), 1::bigint,
  'programme : deux projets sur trois ont un budget');
select is((select taux_financier from public.v_avancement_programme where programme_id = tests.id('prog1')), 60::numeric,
  'programme : moyenne des taux plafonnés à 100 ((20 + 100) / 2)');
select is((select nb_projets_depassement from public.v_avancement_programme where programme_id = tests.id('prog1')), 1::bigint,
  'programme : un projet dépasse son budget');
select tests.connecter(tests.id('admin2'));
select is((select count(*) from public.v_avancement where project_id = tests.id('p1')), 0::bigint, 'les vues ne montrent pas les projets d''une autre organisation');
select tests.deconnecter();

-- Taux figé dans l'état d'avancement ------------------------------------------------
select tests.connecter(tests.id('admin1'));
select throws_ok($$ insert into public.etats_avancement (project_id, titre, periode_debut, periode_fin, taux_financier)
                    values (tests.id('p1'), 'Forgé', '2026-01-01', '2026-03-31', 99) $$,
  '42501', null, 'le client ne fournit pas le taux financier d''un état');
select lives_ok($$ insert into public.etats_avancement (project_id, titre, periode_debut, periode_fin)
                   values (tests.id('p1'), 'T1', '2026-01-01', '2026-03-31') $$, 'admin : rédige un état d''avancement');
select is((select taux_financier from public.etats_avancement where titre = 'T1'), 20.00::numeric, 'l''état fige le taux financier (20 %)');
select lives_ok($$ insert into public.depenses (project_id, budget_ligne_id, date, libelle, montant) values (tests.id('p1'), tests.id('l2'), '2026-04-20', 'Nouvelle dépense', 30) $$,
  'une nouvelle dépense est enregistrée');
select is((select taux_financier from public.etats_avancement where titre = 'T1'), 20.00::numeric, 'l''état ne bouge plus après la dépense');
select is((select taux_financier from public.v_avancement where project_id = tests.id('p1')), 40::numeric, 'le taux courant, lui, suit (60 sur 150 = 40 %)');
select tests.deconnecter();

-- Projet exemple : budget et dépenses fictifs ------------------------------------------
select tests.connecter(tests.id('admin2'));
select lives_ok($$ select public.charger_projet_exemple() $$, 'l''administrateur charge le projet exemple');
select tests.deconnecter();
insert into tests.ids select 'demo', id from public.projects where org_id = tests.id('org2') and is_demo;
select is((select count(*) from public.budget_lignes where project_id = tests.id('demo')), 15::bigint, 'exemple : cinq postes sur trois années');
select is((select sum(montant_prevu) from public.budget_lignes where project_id = tests.id('demo')),
  (select budget from public.projects where id = tests.id('demo')), 'exemple : le budget des lignes égale le budget du projet');
select is((select count(*) from public.depenses where project_id = tests.id('demo')), 15::bigint, 'exemple : quinze dépenses');
select is((select count(*) from public.depenses d join public.budget_lignes b on b.id = d.budget_ligne_id
           where d.project_id = tests.id('demo') and (d.date > current_date or extract(year from d.date) <> b.annee)), 0::bigint,
  'exemple : aucune dépense future, chaque dépense est dans l''année de sa ligne');
select is((select count(*) from (
             select b.id from public.budget_lignes b join public.depenses d on d.budget_ligne_id = b.id
             where b.project_id = tests.id('demo') group by b.id, b.montant_prevu having sum(d.montant) > b.montant_prevu) x), 1::bigint,
  'exemple : exactement un poste dépasse son budget');
select ok((select taux_financier from public.v_avancement where project_id = tests.id('demo')) > 0, 'exemple : le taux financier est calculé');
select tests.connecter(tests.id('admin2'));
select lives_ok($$ delete from public.projects where id = tests.id('demo') $$, 'supprimer le projet exemple emporte son budget et ses dépenses');
select tests.deconnecter();
select is((select count(*) from public.budget_lignes where project_id = tests.id('demo')), 0::bigint, 'plus de ligne budgétaire après la suppression du projet');

select ok(has_table_privilege('service_role', 'public.depenses', 'INSERT'), 'le rôle de service garde ses droits sur les nouvelles tables');

select * from finish();
rollback;
