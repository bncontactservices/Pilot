-- File des fichiers à retirer du stockage : alimentation par les suppressions de documents (directes ou en cascade),
-- lecture et vidage réservés aux admins et éditeurs de l'organisation concernée.
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
  ('p1b', 'a1000000-0000-4000-8000-000000000102'),
  ('p2', 'b2000000-0000-4000-8000-000000000101');

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
  (tests.id('p1b'), tests.id('org1'), 'Projet Alpha bis', '2026-01-01', '2026-12-31'),
  (tests.id('p2'), tests.id('org2'), 'Projet Beta', '2026-01-01', '2026-12-31');
insert into public.documents (project_id, nom, storage_path) values
  (tests.id('p1'), 'A1', tests.id('org1') || '/' || tests.id('p1') || '/a1.pdf'),
  (tests.id('p1'), 'A2', tests.id('org1') || '/' || tests.id('p1') || '/a2.pdf'),
  (tests.id('p1b'), 'A3', tests.id('org1') || '/' || tests.id('p1b') || '/a3.pdf'),
  (tests.id('p2'), 'B1', tests.id('org2') || '/' || tests.id('p2') || '/b1.pdf');

select plan(21);

select is((select count(*) from private.fichiers_a_retirer), 0::bigint, 'au départ, la file est vide');

-- Suppression d'un document seul -------------------------------------------
select tests.connecter(tests.id('editeur1'));
select lives_ok($$ delete from public.documents where nom = 'A3' $$, 'éditeur : supprime un document');
select tests.deconnecter();
select is((select storage_path from private.fichiers_a_retirer),
  tests.id('org1') || '/' || tests.id('p1b') || '/a3.pdf', 'le chemin du document supprimé est en file');

-- Suppression d'un projet : tous ses documents, en cascade ------------------
select tests.connecter(tests.id('admin1'));
select lives_ok($$ delete from public.projects where id = tests.id('p1') $$, 'admin : supprime un projet');
select tests.deconnecter();
select is((select count(*) from private.fichiers_a_retirer where org_id = tests.id('org1')), 3::bigint,
  'la suppression du projet met en file les chemins de ses deux documents (trois en tout)');
select is((select count(*) from public.documents where project_id = tests.id('p1')), 0::bigint,
  'les lignes de documents du projet ont disparu');

-- Lecture de la file -----------------------------------------------------------
select tests.connecter(tests.id('editeur1'));
select is((select count(*) from public.fichiers_a_retirer()), 3::bigint, 'éditeur : voit les 3 chemins de son organisation');
select is((select count(*) from public.fichiers_a_retirer() where fichiers_a_retirer like tests.id('org2') || '%'), 0::bigint,
  'éditeur : ne voit aucun chemin d''une autre organisation');
select throws_ok($$ select * from private.fichiers_a_retirer $$, '42501', null, 'éditeur : la table de file n''est pas lisible directement');
select tests.deconnecter();

select tests.connecter(tests.id('lecteur1'));
select is((select count(*) from public.fichiers_a_retirer()), 0::bigint, 'lecteur : ne voit rien');
select is((select public.fichiers_retires(array[tests.id('org1') || '/' || tests.id('p1b') || '/a3.pdf'])), 0,
  'lecteur : ne peut rien retirer de la file');
select tests.deconnecter();

select tests.anonyme();
select throws_ok($$ select * from public.fichiers_a_retirer() $$, '42501', null, 'anonyme : refusé');
select tests.deconnecter();

-- Vidage de la file --------------------------------------------------------------
select tests.connecter(tests.id('admin2'));
select is((select public.fichiers_retires(array[tests.id('org1') || '/' || tests.id('p1b') || '/a3.pdf'])), 0,
  'admin d''une autre organisation : ne peut pas vider les chemins d''autrui');
select tests.deconnecter();
select is((select count(*) from private.fichiers_a_retirer where org_id = tests.id('org1')), 3::bigint,
  'la file de l''organisation 1 est intacte');

select tests.connecter(tests.id('editeur1'));
select is((select public.fichiers_retires(array[tests.id('org1') || '/' || tests.id('p1b') || '/a3.pdf', 'inconnu/x.pdf'])), 1,
  'éditeur : vide un chemin de son organisation, ignore un chemin inconnu');
select is((select count(*) from public.fichiers_a_retirer()), 2::bigint, 'il en reste deux');
select tests.deconnecter();

-- Fin d'essai : les chemins restent en file mais ne sont plus proposés ---------------
update public.organisations set essai_fin = now() - interval '1 day' where id = tests.id('org1');
select tests.connecter(tests.id('editeur1'));
select is((select count(*) from public.fichiers_a_retirer()), 0::bigint,
  'essai terminé : les chemins ne sont plus proposés (la suppression de fichiers serait refusée)');
select tests.deconnecter();
select is((select count(*) from private.fichiers_a_retirer where org_id = tests.id('org1')), 2::bigint,
  'essai terminé : ils restent en file');

-- Suppression d'une organisation (exploitation, en superutilisateur) : ses chemins restent en file ------------
insert into public.documents (project_id, nom, storage_path) values
  (tests.id('p1b'), 'A6', tests.id('org1') || '/' || tests.id('p1b') || '/a6.pdf');
select lives_ok($$ delete from public.organisations where id = tests.id('org1') $$,
  'exploitation : une organisation dont l''essai est terminé peut être supprimée');
select is((select count(*) from public.documents where org_id = tests.id('org1')), 0::bigint,
  'ses documents ont disparu avec elle');
select is((select count(*) from private.fichiers_a_retirer where org_id = tests.id('org1')), 3::bigint,
  'ses chemins restent en file : la ligne de file survit à l''organisation');

select * from finish();
rollback;
