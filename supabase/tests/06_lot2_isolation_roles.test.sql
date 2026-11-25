-- Lot 2 : isolation entre organisations et droits par rôle sur les nouvelles tables.
-- Identités : admin, éditeur et lecteur de l'org 1 ; éditeur de l'org 2 ; anonyme.
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
-- Outils propres à ce fichier : compter, supprimer ou « modifier » des lignes d'une table, sans les écrire à la main.
create function tests.compte(p_table text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.%I', p_table) into n;
  return n;
end $$;
create function tests.supprime_org(p_table text, p_org uuid) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('with d as (delete from public.%I where org_id = $1 returning 1) select count(*) from d', p_table)
    into n using p_org;
  return n;
end $$;
create function tests.maj_org(p_table text, p_colonne text, p_org uuid) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('with u as (update public.%I set %I = %I where org_id = $1 returning 1) select count(*) from u',
    p_table, p_colonne, p_colonne) into n using p_org;
  return n;
end $$;
grant execute on all functions in schema tests to anon, authenticated;
-- --------------------------------------------------------------------------

insert into tests.ids values
  ('admin1',   'a1000000-0000-4000-8000-000000000001'),
  ('editeur1', 'a1000000-0000-4000-8000-000000000002'),
  ('lecteur1', 'a1000000-0000-4000-8000-000000000003'),
  ('admin2',   'b2000000-0000-4000-8000-000000000001'),
  ('editeur2', 'b2000000-0000-4000-8000-000000000002'),
  ('p1', 'a1000000-0000-4000-8000-000000000101'),
  ('p2', 'b2000000-0000-4000-8000-000000000101'),
  ('g1', 'a1000000-0000-4000-8000-000000000201'),
  ('g2', 'b2000000-0000-4000-8000-000000000201'),
  ('n1', 'a1000000-0000-4000-8000-000000000301'),
  ('n2', 'b2000000-0000-4000-8000-000000000301'),
  ('ph1', 'a1000000-0000-4000-8000-000000000401'),
  ('ph2', 'b2000000-0000-4000-8000-000000000401');

insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('admin1'), 'admin1@exemple.test', '{"organisation": "ONG Alpha"}');
insert into tests.ids select 'org1', org_id from public.memberships where user_id = tests.id('admin1');
insert into public.invitations (org_id, email, role, token_hash) values
  (tests.id('org1'), 'editeur1@exemple.test', 'editeur', encode(sha256('jeton-editeur-org1-0123456789'::bytea), 'hex')),
  (tests.id('org1'), 'lecteur1@exemple.test', 'lecteur', encode(sha256('jeton-lecteur-org1-0123456789'::bytea), 'hex'));
insert into auth.users (id, email, raw_user_meta_data) values
  (tests.id('editeur1'), 'editeur1@exemple.test', '{"invitation": "jeton-editeur-org1-0123456789"}'),
  (tests.id('lecteur1'), 'lecteur1@exemple.test', '{"invitation": "jeton-lecteur-org1-0123456789"}');

insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('admin2'), 'admin2@exemple.test', '{"organisation": "PME Beta"}');
insert into tests.ids select 'org2', org_id from public.memberships where user_id = tests.id('admin2');
insert into public.invitations (org_id, email, role, token_hash)
values (tests.id('org2'), 'editeur2@exemple.test', 'editeur', encode(sha256('jeton-editeur-org2-0123456789'::bytea), 'hex'));
insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('editeur2'), 'editeur2@exemple.test', '{"invitation": "jeton-editeur-org2-0123456789"}');

insert into public.projects (id, org_id, nom, date_debut, date_fin) values
  (tests.id('p1'), tests.id('org1'), 'Projet Alpha', '2026-01-01', '2026-12-31'),
  (tests.id('p2'), tests.id('org2'), 'Projet Beta', '2026-01-01', '2026-12-31');

-- Une ligne dans chaque table du Lot 2, pour chacune des deux organisations.
insert into public.programmes (id, org_id, nom) values
  (tests.id('g1'), tests.id('org1'), 'Programme Alpha'),
  (tests.id('g2'), tests.id('org2'), 'Programme Beta');
insert into public.phases (id, project_id, nom) values
  (tests.id('ph1'), tests.id('p1'), 'Conception'),
  (tests.id('ph2'), tests.id('p2'), 'Conception');
insert into public.cadre_logique_noeuds (id, project_id, type, libelle) values
  (tests.id('n1'), tests.id('p1'), 'objectif_global', 'Objectif Alpha'),
  (tests.id('n2'), tests.id('p2'), 'objectif_global', 'Objectif Beta');
insert into public.etapes (project_id, nom, date_prevue) values
  (tests.id('p1'), 'Jalon Alpha', '2026-03-01'), (tests.id('p2'), 'Jalon Beta', '2026-03-01');
insert into public.pta_activites (project_id, annee, trimestre, intitule) values
  (tests.id('p1'), 2026, 1, 'Activité Alpha'), (tests.id('p2'), 2026, 1, 'Activité Beta');
insert into public.etats_avancement (project_id, titre, periode_debut, periode_fin) values
  (tests.id('p1'), 'État Alpha', '2026-01-01', '2026-03-31'), (tests.id('p2'), 'État Beta', '2026-01-01', '2026-03-31');
insert into public.realisations (project_id, date, titre) values
  (tests.id('p1'), '2026-02-01', 'Réalisation Alpha'), (tests.id('p2'), '2026-02-01', 'Réalisation Beta');
insert into public.prochaines_etapes (project_id, libelle) values
  (tests.id('p1'), 'Action Alpha'), (tests.id('p2'), 'Action Beta');
insert into public.documents (project_id, nom, storage_path) values
  (tests.id('p1'), 'Document Alpha', tests.id('org1') || '/' || tests.id('p1') || '/alpha.pdf'),
  (tests.id('p2'), 'Document Beta', tests.id('org2') || '/' || tests.id('p2') || '/beta.pdf');
insert into public.projet_etiquettes (project_id, etiquette) values
  (tests.id('p1'), 'formation'), (tests.id('p2'), 'formation');

select plan(135);

-- Structure -----------------------------------------------------------------
select is((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint,
  'RLS activée sur toutes les tables, Lot 2 compris');
select is(
  (select count(*) from pg_class c
   where c.relname in ('v_kpi_atteinte', 'v_avancement', 'v_avancement_programme')
     and c.relkind = 'v' and 'security_invoker=true' = any (c.reloptions)),
  3::bigint, 'les trois vues d''avancement sont en security_invoker');
select is((select count(*) from public.parametres_se), 2::bigint, 'chaque organisation a ses paramètres S&E dès sa création');
select is((select seuil_vert || '/' || seuil_ambre from public.parametres_se where org_id = tests.id('org1')), '90.00/60.00',
  'seuils par défaut : 90 et 60');
select is((select org_id from public.cadre_logique_noeuds where id = tests.id('n1')), tests.id('org1'),
  'org_id d''une ligne du cadre logique dérivé du projet');
select is((select code from public.cadre_logique_noeuds where id = tests.id('n1')), 'OG', 'l''objectif global porte le code OG');

-- Admin de l'organisation 1 : ne voit que son organisation ------------------------
select tests.connecter(tests.id('admin1'));
select is(tests.compte(t), 1::bigint, 'admin 1 : ne voit que sa ligne dans ' || t)
from unnest(array['programmes', 'parametres_se', 'phases', 'etapes', 'cadre_logique_noeuds', 'pta_activites',
                  'etats_avancement', 'realisations', 'prochaines_etapes', 'documents', 'projet_etiquettes']) as t;
select is((select count(*) from public.v_avancement), 1::bigint, 'admin 1 : la vue d''avancement ne montre que son projet');
select is((select count(*) from public.v_avancement_programme), 1::bigint, 'admin 1 : la vue des programmes ne montre que le sien');

-- Lecteur de l'organisation 1 : lit tout, n'écrit rien ----------------------------
select tests.connecter(tests.id('lecteur1'));
select is(tests.compte('phases'), 1::bigint, 'lecteur : lit les phases de son organisation');
select is(tests.compte('cadre_logique_noeuds'), 1::bigint, 'lecteur : lit le cadre logique');
select throws_ok($$ insert into public.programmes (org_id, nom) values (tests.id('org1'), 'Interdit') $$,
  '42501', null, 'lecteur : ne peut pas créer de programme');
select throws_ok($$ insert into public.phases (project_id, nom) values (tests.id('p1'), 'Interdit') $$,
  '42501', null, 'lecteur : ne peut pas créer de phase');
select throws_ok($$ insert into public.etapes (project_id, nom, date_prevue) values (tests.id('p1'), 'Interdit', '2026-05-01') $$,
  '42501', null, 'lecteur : ne peut pas créer d''étape');
select throws_ok($$ insert into public.cadre_logique_noeuds (project_id, type, libelle) values (tests.id('p1'), 'objectif_global', 'Interdit') $$,
  '42501', null, 'lecteur : ne peut pas écrire dans le cadre logique');
select throws_ok($$ insert into public.pta_activites (project_id, annee, trimestre, intitule) values (tests.id('p1'), 2026, 2, 'Interdit') $$,
  '42501', null, 'lecteur : ne peut pas planifier d''activité');
select throws_ok($$ insert into public.etats_avancement (project_id, titre, periode_debut, periode_fin) values (tests.id('p1'), 'Interdit', '2026-01-01', '2026-02-01') $$,
  '42501', null, 'lecteur : ne peut pas rédiger d''état d''avancement');
select throws_ok($$ insert into public.realisations (project_id, date, titre) values (tests.id('p1'), '2026-02-02', 'Interdit') $$,
  '42501', null, 'lecteur : ne peut pas déclarer de réalisation');
select throws_ok($$ insert into public.prochaines_etapes (project_id, libelle) values (tests.id('p1'), 'Interdit') $$,
  '42501', null, 'lecteur : ne peut pas créer de prochaine étape');
select throws_ok($$ insert into public.documents (project_id, nom, storage_path) values (tests.id('p1'), 'Interdit', tests.id('org1') || '/' || tests.id('p1') || '/x.pdf') $$,
  '42501', null, 'lecteur : ne peut pas déposer de document');
select throws_ok($$ insert into public.projet_etiquettes (project_id, etiquette) values (tests.id('p1'), 'interdit') $$,
  '42501', null, 'lecteur : ne peut pas étiqueter un projet');
select is(tests.maj_org(t.nom, t.col, tests.id('org1')), 0::bigint, 'lecteur : ne peut rien modifier dans ' || t.nom)
from (values ('programmes', 'nom'), ('parametres_se', 'seuil_vert'), ('phases', 'nom'), ('etapes', 'nom'),
             ('cadre_logique_noeuds', 'libelle'), ('pta_activites', 'intitule'), ('etats_avancement', 'titre'),
             ('realisations', 'titre'), ('prochaines_etapes', 'libelle'), ('documents', 'nom')) as t(nom, col);
select is(tests.supprime_org(t, tests.id('org1')), 0::bigint, 'lecteur : ne peut rien supprimer dans ' || t)
from unnest(array['programmes', 'phases', 'etapes', 'cadre_logique_noeuds', 'pta_activites', 'etats_avancement',
                  'realisations', 'prochaines_etapes', 'documents', 'projet_etiquettes']) as t;

-- Éditeur de l'organisation 2 : aucune fuite, aucune intrusion ----------------------
select tests.connecter(tests.id('editeur2'));
select is(tests.compte(t), 1::bigint, 'éditeur 2 : ne voit que ses propres lignes dans ' || t)
from unnest(array['programmes', 'phases', 'etapes', 'cadre_logique_noeuds', 'pta_activites', 'etats_avancement',
                  'realisations', 'prochaines_etapes', 'documents', 'projet_etiquettes']) as t;
select is_empty($$ select 1 from public.v_avancement where org_id = tests.id('org1') $$,
  'éditeur 2 : aucune ligne d''avancement de l''organisation 1');
select is_empty($$ select 1 from public.parametres_se where org_id = tests.id('org1') $$,
  'éditeur 2 : aucun paramètre S&E de l''organisation 1');
select throws_ok($$ insert into public.phases (project_id, nom) values (tests.id('p1'), 'Intrusion') $$,
  'P0001', 'PROJET_INTROUVABLE', 'éditeur 2 : ne peut pas ajouter de phase à un projet de l''organisation 1');
select throws_ok($$ insert into public.pta_activites (project_id, annee, trimestre, intitule) values (tests.id('p1'), 2026, 1, 'Intrusion') $$,
  'P0001', 'PROJET_INTROUVABLE', 'éditeur 2 : ne peut pas planifier dans un projet de l''organisation 1');
select throws_ok($$ insert into public.documents (project_id, nom, storage_path) values (tests.id('p1'), 'Intrusion', tests.id('org1') || '/' || tests.id('p1') || '/x.pdf') $$,
  'P0001', 'PROJET_INTROUVABLE', 'éditeur 2 : ne peut pas déposer de document dans un projet de l''organisation 1');
select throws_ok($$ insert into public.projet_etiquettes (project_id, etiquette) values (tests.id('p1'), 'intrusion') $$,
  'P0001', 'PROJET_INTROUVABLE', 'éditeur 2 : ne peut pas étiqueter un projet de l''organisation 1');
select throws_ok($$ insert into public.programmes (org_id, nom) values (tests.id('org1'), 'Intrusion') $$,
  '42501', null, 'éditeur 2 : ne peut pas créer de programme dans l''organisation 1');
select throws_ok($$ update public.projects set programme_id = tests.id('g1') where id = tests.id('p2') $$,
  'P0001', 'PROGRAMME_INTROUVABLE', 'éditeur 2 : ne peut pas rattacher son projet au programme d''une autre organisation');
select is(tests.supprime_org(t, tests.id('org1')), 0::bigint, 'éditeur 2 : ne peut rien supprimer dans ' || t || ' de l''organisation 1')
from unnest(array['programmes', 'phases', 'cadre_logique_noeuds', 'pta_activites', 'documents']) as t;
select is(tests.maj_org('phases', 'nom', tests.id('org1')), 0::bigint, 'éditeur 2 : ne peut pas modifier les phases de l''organisation 1');
select lives_ok($$ insert into public.phases (project_id, nom) values (tests.id('p2'), 'Démarrage') $$,
  'éditeur 2 : peut ajouter une phase dans son organisation');
select is((select org_id from public.phases where nom = 'Démarrage'), tests.id('org2'), 'org_id d''une phase dérivé du projet');
select throws_ok($$ update public.phases set org_id = tests.id('org1') where id = tests.id('ph2') $$,
  '42501', null, 'org_id d''une phase est immuable');
select is((select created_by from public.realisations where titre = 'Réalisation Beta'), null,
  'données de test insérées sans utilisateur : created_by reste nul');
select lives_ok($$ insert into public.realisations (project_id, date, titre) values (tests.id('p2'), '2026-03-03', 'Nouvelle réalisation') $$,
  'éditeur 2 : peut déclarer une réalisation');
select is((select created_by from public.realisations where titre = 'Nouvelle réalisation'), tests.id('editeur2'),
  'created_by d''une réalisation forcé à l''auteur');

-- Anonyme ------------------------------------------------------------------------------
select tests.anonyme();
select throws_ok(format('select tests.compte(%L)', t), '42501', null, 'anonyme : aucun accès à ' || t)
from unnest(array['programmes', 'parametres_se', 'phases', 'etapes', 'cadre_logique_noeuds', 'pta_activites',
                  'etats_avancement', 'realisations', 'prochaines_etapes', 'documents', 'projet_etiquettes',
                  'v_kpi_atteinte', 'v_avancement', 'v_avancement_programme']) as t;

-- Éditeur de l'organisation 1 : écrit, mais ne supprime pas un programme ----------------
select tests.connecter(tests.id('editeur1'));
select lives_ok($$ insert into public.programmes (org_id, nom) values (tests.id('org1'), 'Programme Gamma') $$,
  'éditeur 1 : peut créer un programme');
select is((select created_by from public.programmes where nom = 'Programme Gamma'), tests.id('editeur1'),
  'created_by d''un programme forcé à l''auteur');
select lives_ok($$ update public.programmes set nom = 'Programme Gamma révisé' where nom = 'Programme Gamma' $$,
  'éditeur 1 : peut modifier un programme');
select is(tests.supprime_org('programmes', tests.id('org1')), 0::bigint, 'éditeur 1 : ne peut pas supprimer de programme');
select lives_ok($$ update public.projects set programme_id = tests.id('g1') where id = tests.id('p1') $$,
  'éditeur 1 : peut rattacher un projet à un programme de son organisation');
select is(tests.maj_org('parametres_se', 'seuil_vert', tests.id('org1')), 0::bigint,
  'éditeur 1 : ne peut pas modifier les paramètres S&E');
select lives_ok($$ insert into public.phases (project_id, nom) values (tests.id('p1'), 'Mise en œuvre') $$,
  'éditeur 1 : peut créer une phase');
select lives_ok($$ delete from public.phases where nom = 'Mise en œuvre' $$, 'éditeur 1 : peut supprimer une phase');

-- Droits par colonne ---------------------------------------------------------------------
select tests.connecter(tests.id('admin1'));
select throws_ok($$ update public.cadre_logique_noeuds set code = 'ZZ' where id = tests.id('n1') $$,
  '42501', null, 'le code d''une ligne du cadre logique n''est pas modifiable par un client');
select throws_ok($$ update public.cadre_logique_noeuds set type = 'resultat' where id = tests.id('n1') $$,
  '42501', null, 'le type d''une ligne du cadre logique n''est pas modifiable');
select throws_ok($$ insert into public.etats_avancement (project_id, titre, periode_debut, periode_fin, taux_resultats)
                    values (tests.id('p1'), 'Truqué', '2026-01-01', '2026-02-01', 100) $$,
  '42501', null, 'un client ne peut pas fournir les taux figés d''un état d''avancement');
select throws_ok($$ update public.etats_avancement set taux_physique = 100 where project_id = tests.id('p1') $$,
  '42501', null, 'un client ne peut pas modifier les taux figés');
select throws_ok($$ update public.documents set storage_path = 'ailleurs/x.pdf' where project_id = tests.id('p1') $$,
  '42501', null, 'le chemin de stockage d''un document n''est pas modifiable');
select throws_ok($$ update public.parametres_se set org_id = tests.id('org2') where org_id = tests.id('org1') $$,
  '42501', null, 'org_id des paramètres S&E est immuable');

-- Paramètres S&E : admin uniquement, valeurs cohérentes ----------------------------------
select lives_ok($$ update public.parametres_se set seuil_vert = 85, seuil_ambre = 55, mois_debut_annee_fiscale = 7,
                     unites_perso = array['forages', 'comités'] where org_id = tests.id('org1') $$,
  'admin : peut régler les paramètres S&E');
select throws_ok($$ update public.parametres_se set seuil_ambre = 95 where org_id = tests.id('org1') $$,
  '23514', null, 'le seuil ambre doit rester sous le seuil vert');
select throws_ok($$ update public.parametres_se set seuil_vert = 120 where org_id = tests.id('org1') $$,
  '23514', null, 'le seuil vert ne dépasse pas 100');
select throws_ok($$ update public.parametres_se set mois_debut_annee_fiscale = 13 where org_id = tests.id('org1') $$,
  '23514', null, 'le mois de début d''année fiscale est entre 1 et 12');
select throws_ok($$ update public.parametres_se set unites_perso = array[repeat('x', 41)] where org_id = tests.id('org1') $$,
  '23514', null, 'une unité personnalisée ne dépasse pas 40 caractères');
select throws_ok($$ insert into public.parametres_se (org_id) values (tests.id('org1')) $$,
  '42501', null, 'admin : ne crée pas de seconde ligne de paramètres (créée avec l''organisation)');
select throws_ok($$ delete from public.parametres_se where org_id = tests.id('org1') $$,
  '42501', null, 'admin : ne supprime pas les paramètres S&E');
select lives_ok($$ delete from public.programmes where nom = 'Programme Gamma révisé' $$, 'admin : peut supprimer un programme');
select is((select programme_id from public.projects where id = tests.id('p1')), tests.id('g1'),
  'supprimer un autre programme laisse le rattachement du projet');
select lives_ok($$ delete from public.programmes where id = tests.id('g1') $$, 'admin : peut supprimer le programme du projet');
select is((select programme_id from public.projects where id = tests.id('p1')), null,
  'supprimer un programme détache ses projets sans les supprimer');

-- Fin d'essai : tout le Lot 2 passe en lecture seule -----------------------------------
select tests.deconnecter();
update public.organisations set essai_fin = now() - interval '1 day' where id = tests.id('org1');
select tests.connecter(tests.id('admin1'));
select is(tests.compte('phases'), 1::bigint, 'essai terminé : les phases restent consultables');
select throws_ok($$ insert into public.phases (project_id, nom) values (tests.id('p1'), 'Tardive') $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : aucune phase créée');
select throws_ok($$ insert into public.programmes (org_id, nom) values (tests.id('org1'), 'Tardif') $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : aucun programme créé');
select throws_ok($$ update public.pta_activites set intitule = 'Modifiée' where project_id = tests.id('p1') $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : aucune activité modifiée');
select throws_ok($$ delete from public.cadre_logique_noeuds where id = tests.id('n1') $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : aucune ligne du cadre logique supprimée');
select throws_ok($$ insert into public.realisations (project_id, date, titre) values (tests.id('p1'), '2026-04-01', 'Tardive') $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : aucune réalisation déclarée');
select throws_ok($$ insert into public.prochaines_etapes (project_id, libelle) values (tests.id('p1'), 'Tardive') $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : aucune prochaine étape créée');
select throws_ok($$ insert into public.etats_avancement (project_id, titre, periode_debut, periode_fin) values (tests.id('p1'), 'Tardif', '2026-04-01', '2026-05-01') $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : aucun état d''avancement rédigé');
select throws_ok($$ insert into public.documents (project_id, nom, storage_path) values (tests.id('p1'), 'Tardif', tests.id('org1') || '/' || tests.id('p1') || '/t.pdf') $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : aucun document enregistré');
select throws_ok($$ insert into public.projet_etiquettes (project_id, etiquette) values (tests.id('p1'), 'tardive') $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : aucune étiquette ajoutée');
select throws_ok($$ update public.parametres_se set seuil_vert = 80 where org_id = tests.id('org1') $$,
  'P0001', 'ESSAI_EXPIRE', 'essai terminé : paramètres S&E figés');
select isnt_empty($$ select 1 from public.v_avancement $$, 'essai terminé : les taux d''avancement restent consultables');

-- Stockage des documents : même règle -------------------------------------------------
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('documents', tests.id('org1') || '/' || tests.id('p1') || '/tardif.pdf') $$,
  '42501', null, 'essai terminé : aucun fichier déposé dans le stockage');
select tests.connecter(tests.id('editeur2'));
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('documents', tests.id('org2') || '/' || tests.id('p2') || '/ok.pdf') $$,
  'organisation en essai : dépôt d''un fichier dans son dossier');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('documents', tests.id('org1') || '/' || tests.id('p1') || '/intrus.pdf') $$,
  '42501', null, 'éditeur 2 : ne peut pas déposer de fichier dans le dossier de l''organisation 1');

select tests.deconnecter();
select * from finish();
rollback;
