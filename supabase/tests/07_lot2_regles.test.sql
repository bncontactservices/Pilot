-- Lot 2 : règles métier (cadre logique, PTA, rattachements, documents, étiquettes),
-- formules d'avancement (mêmes cas que src/lib/avancement.test.ts) et contenu du projet exemple.
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
create function tests.deconnecter() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
-- Code d'une ligne du cadre logique, par libellé.
create function tests.code(p_libelle text) returns text language sql stable
  as $$ select code from public.cadre_logique_noeuds where libelle = p_libelle $$;
create function tests.noeud(p_libelle text) returns uuid language sql stable
  as $$ select id from public.cadre_logique_noeuds where libelle = p_libelle $$;
grant execute on all functions in schema tests to anon, authenticated;
-- --------------------------------------------------------------------------

insert into tests.ids values
  ('admin1', 'a1000000-0000-4000-8000-000000000001'),
  ('admin2', 'b2000000-0000-4000-8000-000000000001'),
  ('pA', 'a1000000-0000-4000-8000-000000000101'),
  ('pB', 'a1000000-0000-4000-8000-000000000102'),
  ('pC', 'a1000000-0000-4000-8000-000000000103'),
  ('pD', 'a1000000-0000-4000-8000-000000000104'),
  ('pE', 'a1000000-0000-4000-8000-000000000105'),
  ('p3', 'b2000000-0000-4000-8000-000000000101');

insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('admin1'), 'admin1@exemple.test', '{"organisation": "ONG Alpha"}');
insert into tests.ids select 'org1', org_id from public.memberships where user_id = tests.id('admin1');
-- Plan Enterprise : les quotas de projets et d'indicateurs ne sont pas l'objet de ce fichier.
update public.organisations set plan = 'enterprise' where id = tests.id('org1');
insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('admin2'), 'admin2@exemple.test', '{"organisation": "PME Beta"}');
insert into tests.ids select 'org2', org_id from public.memberships where user_id = tests.id('admin2');

-- pA : 200 jours, à mi-parcours (fraction écoulée = 0,5). pB : pas encore commencé. pC : durée nulle.
-- pD : sans indicateur ni activité. pE : second projet de l'organisation (rattachements croisés).
insert into public.projects (id, org_id, nom, date_debut, date_fin) values
  (tests.id('pA'), tests.id('org1'), 'Projet A', current_date - 100, current_date + 100),
  (tests.id('pB'), tests.id('org1'), 'Projet B', current_date + 10, current_date + 210),
  (tests.id('pC'), tests.id('org1'), 'Projet C', current_date - 5, current_date - 5),
  (tests.id('pD'), tests.id('org1'), 'Projet D', current_date - 100, current_date + 100),
  (tests.id('pE'), tests.id('org1'), 'Projet E', current_date - 100, current_date + 100),
  (tests.id('p3'), tests.id('org2'), 'Projet 3', current_date - 100, current_date + 100);

insert into public.kpis (project_id, nom, cible, valeur_base, sens, type_agregation, frequence) values
  (tests.id('pA'), 'K1', 110, 10, 'croissant', 'cumul', 'mensuelle'),
  (tests.id('pA'), 'K2', 200, 0, 'croissant', 'dernier', 'mensuelle'),
  (tests.id('pA'), 'K3', 20, 100, 'decroissant', 'moyenne', 'mensuelle'),
  (tests.id('pA'), 'K4', 5, 5, 'croissant', 'dernier', 'mensuelle'),
  (tests.id('pA'), 'K5', 100, 0, 'croissant', 'dernier', 'mensuelle'),
  (tests.id('pA'), 'K6', 50, 0, 'croissant', 'dernier', 'mensuelle'),
  (tests.id('pA'), 'K7', 100, 0, 'croissant', 'dernier', 'mensuelle'),
  (tests.id('pE'), 'KE1', 100, 0, 'croissant', 'dernier', 'mensuelle'),
  (tests.id('pE'), 'KE2', 100, 0, 'croissant', 'dernier', 'mensuelle'),
  (tests.id('pB'), 'KB', 100, 0, 'croissant', 'dernier', 'mensuelle'),
  (tests.id('pC'), 'KC', 100, 0, 'croissant', 'dernier', 'mensuelle');

insert into public.kpi_entries (kpi_id, date, valeur)
select k.id, current_date + s.jours, s.valeur
from (values
  ('K1', -50, 20), ('K1', -10, 30), ('K1', -200, 999), ('K1', 5, 1000),  -- avant le début et dans le futur : ignorées
  ('K2', -30, 80), ('K2', -5, 120),
  ('K3', -40, 80), ('K3', -20, 60),
  ('K4', -1, 7),
  ('K6', 0, 100),
  ('K7', -3, -10),
  ('KB', 0, 95),
  ('KC', -1, 40)
) as s(kpi, jours, valeur)
join public.kpis k on k.nom = s.kpi;

insert into public.pta_activites (project_id, annee, trimestre, intitule, statut, pct_realisation) values
  (tests.id('pA'), 2026, 1, 'Activité terminée', 'termine', 100),
  (tests.id('pA'), 2026, 1, 'Activité en cours', 'en_cours', 40),
  (tests.id('pA'), 2026, 2, 'Activité à faire', 'a_faire', 0),
  (tests.id('pA'), 2026, 2, 'Activité annulée', 'annule', 70),
  (tests.id('pA'), 2026, 3, 'Activité reportée', 'reporte', 10);

insert into public.etapes (project_id, nom, date_prevue, statut) values
  (tests.id('pA'), 'Étape terminée', current_date - 30, 'termine'),
  (tests.id('pA'), 'Étape en retard', current_date - 10, 'en_cours'),
  (tests.id('pA'), 'Étape à venir', current_date + 30, 'a_faire'),
  (tests.id('pA'), 'Étape annulée', current_date - 20, 'annule');

select plan(148);

-- Formules d'avancement ---------------------------------------------------------------------
select is((select nb_kpis from public.v_avancement where project_id = tests.id('pA')), 7::bigint, 'pA : sept indicateurs');
select is((select nb_kpis_avec_donnees from public.v_avancement where project_id = tests.id('pA')), 5::bigint,
  'pA : cinq indicateurs avec des données (cible = base et absence de saisie exclues)');
select is((select round(valeur, 4) from public.v_kpi_atteinte a join public.kpis k on k.id = a.kpi_id where k.nom = 'K1'), 60::numeric,
  'cumul : base + saisies du début du projet à aujourd''hui (saisies avant le début et futures ignorées)');
select is((select round(pct_atteinte, 4) from public.v_kpi_atteinte a join public.kpis k on k.id = a.kpi_id where k.nom = 'K1'), 50::numeric,
  'cumul : 50 % d''atteinte');
select is((select valeur from public.v_kpi_atteinte a join public.kpis k on k.id = a.kpi_id where k.nom = 'K2'), 120::numeric,
  'dernier : la dernière saisie');
select is((select round(pct_atteinte, 4) from public.v_kpi_atteinte a join public.kpis k on k.id = a.kpi_id where k.nom = 'K2'), 60::numeric,
  'dernier : 60 % d''atteinte');
select is((select round(valeur, 4) from public.v_kpi_atteinte a join public.kpis k on k.id = a.kpi_id where k.nom = 'K3'), 70::numeric,
  'moyenne : moyenne des saisies');
select is((select round(pct_atteinte, 4) from public.v_kpi_atteinte a join public.kpis k on k.id = a.kpi_id where k.nom = 'K3'), 37.5::numeric,
  'sens décroissant : (base − valeur) ÷ (base − cible)');
select is((select pct_atteinte from public.v_kpi_atteinte a join public.kpis k on k.id = a.kpi_id where k.nom = 'K4'), null,
  'cible égale à la base : pas de pourcentage (n/a)');
select is((select valeur from public.v_kpi_atteinte a join public.kpis k on k.id = a.kpi_id where k.nom = 'K5'), null,
  'aucune saisie : pas de valeur');
select is((select round(pct_atteinte, 4) from public.v_kpi_atteinte a join public.kpis k on k.id = a.kpi_id where k.nom = 'K6'), 150::numeric,
  'dépassement : atteinte bornée à 150');
select is((select round(pct_atteinte, 4) from public.v_kpi_atteinte a join public.kpis k on k.id = a.kpi_id where k.nom = 'K7'), 0::numeric,
  'valeur négative : atteinte bornée à 0');
select is((select round(taux_resultats, 4) from public.v_avancement where project_id = tests.id('pA')), 49.5::numeric,
  'taux de résultats : moyenne des atteintes plafonnées à 100 (50, 60, 37,5, 100, 0)');
select is((select round(fraction_ecoulee, 4) from public.v_avancement where project_id = tests.id('pA')), 0.5::numeric,
  'fraction de la durée écoulée : 0,5 à mi-parcours');
select is((select statut_resultats from public.v_avancement where project_id = tests.id('pA')), 'ok',
  'statut : 49,5 % d''atteinte à mi-parcours = 99 % de la trajectoire → vert');
update public.parametres_se set seuil_vert = 100, seuil_ambre = 95 where org_id = tests.id('org1');
select is((select statut_resultats from public.v_avancement where project_id = tests.id('pA')), 'warn',
  'statut : les seuils de l''organisation s''appliquent (99 % entre 95 et 100 → ambre)');
update public.parametres_se set seuil_vert = 100, seuil_ambre = 99.5 where org_id = tests.id('org1');
select is((select statut_resultats from public.v_avancement where project_id = tests.id('pA')), 'alert',
  'statut : sous le seuil ambre → rouge');
update public.parametres_se set seuil_vert = 90, seuil_ambre = 60 where org_id = tests.id('org1');

select is((select round(taux_resultats, 4) from public.v_avancement where project_id = tests.id('pB')), 95::numeric,
  'projet pas commencé : le taux compte les valeurs « dernier » déjà saisies');
select is((select fraction_ecoulee from public.v_avancement where project_id = tests.id('pB')), 0::numeric,
  'projet pas commencé : fraction nulle');
select is((select statut_resultats from public.v_avancement where project_id = tests.id('pB')), 'ok',
  'projet pas commencé : le statut retombe sur le pourcentage seul');
select is((select fraction_ecoulee from public.v_avancement where project_id = tests.id('pC')), null,
  'projet de durée nulle : pas de trajectoire');
select is((select statut_resultats from public.v_avancement where project_id = tests.id('pC')), 'alert',
  'projet de durée nulle : statut d''après le pourcentage seul (40 % → rouge)');
select is((select statut_resultats from public.v_avancement where project_id = tests.id('pD')), 'none',
  'projet sans indicateur : statut « aucune donnée »');
select is((select taux_resultats from public.v_avancement where project_id = tests.id('pD')), null,
  'projet sans indicateur : pas de taux');
select is((select taux_physique from public.v_avancement where project_id = tests.id('pD')), null,
  'projet sans PTA : pas de taux physique');
select is((select nb_activites from public.v_avancement where project_id = tests.id('pD')), 0::bigint, 'projet sans PTA : zéro activité');

select is((select nb_activites from public.v_avancement where project_id = tests.id('pA')), 4::bigint,
  'PTA : les activités annulées ne comptent pas');
select is((select nb_activites_realisees from public.v_avancement where project_id = tests.id('pA')), 1::bigint,
  'PTA : une activité terminée');
select is((select round(taux_physique, 4) from public.v_avancement where project_id = tests.id('pA')), 37.5::numeric,
  'taux physique : moyenne des % de réalisation (100, 40, 0, 10)');
select is((select nb_etapes from public.v_avancement where project_id = tests.id('pA')), 3::bigint, 'étapes : les annulées ne comptent pas');
select is((select nb_etapes_terminees from public.v_avancement where project_id = tests.id('pA')), 1::bigint, 'étapes : une terminée');
select is((select nb_etapes_en_retard from public.v_avancement where project_id = tests.id('pA')), 1::bigint,
  'étapes : une en retard (date dépassée, non terminée)');

-- Programme : moyenne simple des taux de ses projets ----------------------------------------
select tests.connecter(tests.id('admin1'));
select lives_ok($$ with g as (insert into public.programmes (org_id, nom) values (tests.id('org1'), 'Programme P') returning id)
                   insert into tests.ids select 'g', id from g $$, 'admin : crée un programme');
select lives_ok($$ update public.projects set programme_id = tests.id('g') where id in (tests.id('pA'), tests.id('pB')) $$,
  'admin : rattache deux projets au programme');
select is((select nb_projets from public.v_avancement_programme where programme_id = tests.id('g')), 2::bigint, 'programme : deux projets');
select is((select round(taux_resultats, 4) from public.v_avancement_programme where programme_id = tests.id('g')), 72.25::numeric,
  'programme : moyenne des taux de résultats (49,5 et 95)');
select is((select nb_projets_avec_pta from public.v_avancement_programme where programme_id = tests.id('g')), 1::bigint,
  'programme : un seul projet a un PTA');
select is((select round(taux_physique, 4) from public.v_avancement_programme where programme_id = tests.id('g')), 37.5::numeric,
  'programme : taux physique des seuls projets qui ont un PTA');
select lives_ok($$ with g as (insert into public.programmes (org_id, nom) values (tests.id('org1'), 'Programme vide') returning id)
                   insert into tests.ids select 'gv', id from g $$, 'admin : crée un programme sans projet');
select is((select nb_projets from public.v_avancement_programme where programme_id = tests.id('gv')), 0::bigint, 'programme vide : zéro projet');
select is((select taux_resultats from public.v_avancement_programme where programme_id = tests.id('gv')), null, 'programme vide : pas de taux');

-- Cadre logique : codes, hiérarchie, renumérotation ---------------------------------------
select lives_ok($$ insert into public.cadre_logique_noeuds (project_id, type, libelle, ordre)
                   values (tests.id('pE'), 'objectif_global', 'OG E', 1) $$, 'cadre : crée l''objectif global');
select is(tests.code('OG E'), 'OG', 'cadre : code OG');
select throws_ok($$ insert into public.cadre_logique_noeuds (project_id, type, libelle)
                    values (tests.id('pE'), 'objectif_global', 'Second OG') $$,
  '23505', null, 'cadre : un seul objectif global par projet');
select lives_ok($$ insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle, ordre) values
  (tests.id('pE'), 'objectif_specifique', tests.noeud('OG E'), 'OS alpha', 1),
  (tests.id('pE'), 'objectif_specifique', tests.noeud('OG E'), 'OS beta', 2) $$, 'cadre : crée deux objectifs spécifiques');
select is(tests.code('OS alpha'), 'OS1', 'cadre : premier objectif spécifique = OS1');
select is(tests.code('OS beta'), 'OS2', 'cadre : second objectif spécifique = OS2');
select lives_ok($$ insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle, ordre) values
  (tests.id('pE'), 'resultat', tests.noeud('OS alpha'), 'R a1', 1),
  (tests.id('pE'), 'resultat', tests.noeud('OS alpha'), 'R a2', 2),
  (tests.id('pE'), 'resultat', tests.noeud('OS beta'), 'R b1', 1) $$, 'cadre : crée trois résultats');
select is(tests.code('R a1'), 'R1.1', 'cadre : code R1.1');
select is(tests.code('R a2'), 'R1.2', 'cadre : code R1.2');
select is(tests.code('R b1'), 'R2.1', 'cadre : code R2.1');
select lives_ok($$ insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle, ordre) values
  (tests.id('pE'), 'activite', tests.noeud('R a2'), 'A a2-1', 1),
  (tests.id('pE'), 'activite', tests.noeud('R a2'), 'A a2-2', 2) $$, 'cadre : crée deux activités');
select is(tests.code('A a2-1'), 'A1.2.1', 'cadre : code A1.2.1');
select is(tests.code('A a2-2'), 'A1.2.2', 'cadre : code A1.2.2');

select throws_ok($$ insert into public.cadre_logique_noeuds (project_id, type, libelle) values (tests.id('pE'), 'objectif_specifique', 'Orphelin') $$,
  'P0001', 'CADRE_PARENT_INVALIDE', 'cadre : un objectif spécifique doit avoir un parent');
select throws_ok($$ insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle) values
  (tests.id('pE'), 'resultat', tests.noeud('OG E'), 'Résultat sous OG') $$,
  'P0001', 'CADRE_PARENT_INVALIDE', 'cadre : un résultat se rattache à un objectif spécifique, pas à l''objectif global');
select throws_ok($$ insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle) values
  (tests.id('pE'), 'activite', tests.noeud('OS alpha'), 'Activité sous OS') $$,
  'P0001', 'CADRE_PARENT_INVALIDE', 'cadre : une activité se rattache à un résultat');
select throws_ok($$ insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle) values
  (tests.id('pA'), 'objectif_specifique', tests.noeud('OG E'), 'OS d''un autre projet') $$,
  'P0001', 'CADRE_PARENT_INVALIDE', 'cadre : le parent doit être dans le même projet');
select throws_ok($$ update public.cadre_logique_noeuds set parent_id = tests.noeud('OS alpha') where libelle = 'A a2-1' $$,
  'P0001', 'CADRE_PARENT_INVALIDE', 'cadre : on ne déplace pas une activité sous un objectif spécifique');
select throws_ok($$ update public.cadre_logique_noeuds set parent_id = tests.noeud('R a1') where libelle = 'OS beta' $$,
  'P0001', 'CADRE_PARENT_INVALIDE', 'cadre : on ne déplace pas un objectif spécifique sous un résultat');

select lives_ok($$ update public.cadre_logique_noeuds set ordre = 0 where libelle = 'OS beta' $$, 'cadre : réordonne les objectifs spécifiques');
select is(tests.code('OS beta'), 'OS1', 'cadre : renumérotation : OS beta devient OS1');
select is(tests.code('OS alpha'), 'OS2', 'cadre : renumérotation : OS alpha devient OS2');
select is(tests.code('R b1'), 'R1.1', 'cadre : renumérotation des résultats suit leur parent');
select is(tests.code('A a2-2'), 'A2.2.2', 'cadre : renumérotation des activités suit leur parent');
select lives_ok($$ update public.cadre_logique_noeuds set parent_id = tests.noeud('OS beta') where libelle = 'R a2' $$,
  'cadre : déplace un résultat sous un autre objectif spécifique');
select is(tests.code('R a2'), 'R1.2', 'cadre : le résultat déplacé prend le rang suivant');
select is(tests.code('A a2-1'), 'A1.2.1', 'cadre : ses activités suivent');
select is(tests.code('R a1'), 'R2.1', 'cadre : les résultats restants sont renumérotés');
select lives_ok($$ delete from public.cadre_logique_noeuds where libelle = 'OS beta' $$,
  'cadre : supprime un objectif spécifique avec tout ce qu''il porte');
select is((select count(*) from public.cadre_logique_noeuds where project_id = tests.id('pE')), 3::bigint,
  'cadre : la suppression emporte les résultats et activités rattachés (OG, OS alpha et R a1 restent)');
select is(tests.code('OS alpha'), 'OS1', 'cadre : renumérotation après suppression');
select is(tests.code('R a1'), 'R1.1', 'cadre : les résultats restants suivent');

-- Indicateurs reliés au cadre logique -------------------------------------------------------
select lives_ok($$ update public.kpis set noeud_id = tests.noeud('R a1') where nom = 'KE1' $$, 'indicateur : relié à un résultat');
select lives_ok($$ update public.kpis set noeud_id = tests.noeud('OG E') where nom = 'KE2' $$, 'indicateur : relié à l''objectif global');
select throws_ok($$ update public.kpis set noeud_id = tests.noeud('R a1') where nom = 'KB' $$,
  'P0001', 'RATTACHEMENT_INVALIDE', 'indicateur : le cadre logique doit être celui de son projet');
select throws_ok($$ insert into public.kpis (project_id, nom, cible, noeud_id) values (tests.id('pB'), 'KX', 5, tests.noeud('R a1')) $$,
  'P0001', 'RATTACHEMENT_INVALIDE', 'indicateur : même règle à la création');
select lives_ok($$ delete from public.cadre_logique_noeuds where libelle = 'R a1' $$, 'cadre : supprime un résultat relié à un indicateur');
select is((select noeud_id from public.kpis where nom = 'KE1'), null, 'supprimer une ligne détache l''indicateur sans le supprimer');
select is((select count(*) from public.kpis where nom = 'KE1'), 1::bigint, 'l''indicateur détaché existe toujours');

-- PTA, réalisations, étapes : rattachements ---------------------------------------------------
select lives_ok($$ insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle, ordre)
                   values (tests.id('pE'), 'resultat', tests.noeud('OS alpha'), 'R c1', 2) $$, 'cadre : nouveau résultat');
select lives_ok($$ insert into public.cadre_logique_noeuds (project_id, type, parent_id, libelle, ordre)
                   values (tests.id('pE'), 'activite', tests.noeud('R c1'), 'A c1-1', 1) $$, 'cadre : nouvelle activité');
select lives_ok($$ insert into public.pta_activites (project_id, annee, trimestre, intitule, noeud_id)
                   values (tests.id('pE'), 2026, 1, 'PTA reliée', tests.noeud('A c1-1')) $$, 'PTA : reliée à une activité du cadre logique');
select throws_ok($$ insert into public.pta_activites (project_id, annee, trimestre, intitule, noeud_id)
                    values (tests.id('pE'), 2026, 1, 'PTA mal reliée', tests.noeud('R c1')) $$,
  'P0001', 'RATTACHEMENT_INVALIDE', 'PTA : seule une activité du cadre logique peut être reliée');
select lives_ok($$ insert into public.realisations (project_id, date, titre, noeud_id)
                   values (tests.id('pE'), current_date, 'Réalisation liée à un résultat', tests.noeud('R c1')) $$,
  'réalisation : peut être reliée à un résultat');
select throws_ok($$ insert into public.realisations (project_id, date, titre, noeud_id)
                    values (tests.id('pE'), current_date, 'Mal liée', tests.noeud('OG E')) $$,
  'P0001', 'RATTACHEMENT_INVALIDE', 'réalisation : pas de lien avec l''objectif global');
select throws_ok($$ insert into public.realisations (project_id, date, titre, pta_activite_id)
                    select tests.id('pE'), current_date, 'Mal liée au PTA', id from public.pta_activites where intitule = 'Activité en cours' $$,
  'P0001', 'RATTACHEMENT_INVALIDE', 'réalisation : le PTA lié doit être celui du même projet');
select lives_ok($$ insert into public.realisations (project_id, date, titre, pta_activite_id)
                   select tests.id('pE'), current_date, 'Liée au PTA', id from public.pta_activites where intitule = 'PTA reliée' $$,
  'réalisation : peut être liée à une activité du PTA');

select lives_ok($$ insert into public.phases (project_id, nom, ordre) values (tests.id('pE'), 'Phase E', 1) $$, 'phase créée');
select lives_ok($$ insert into public.etapes (project_id, phase_id, nom, date_prevue)
                   select tests.id('pE'), id, 'Étape E', current_date from public.phases where nom = 'Phase E' $$, 'étape rattachée à une phase');
select throws_ok($$ insert into public.etapes (project_id, phase_id, nom, date_prevue)
                    select tests.id('pA'), id, 'Étape mal rattachée', current_date from public.phases where nom = 'Phase E' $$,
  'P0001', 'RATTACHEMENT_INVALIDE', 'étape : la phase doit être celle du même projet');
select lives_ok($$ delete from public.phases where nom = 'Phase E' $$, 'phase supprimée');
select is((select phase_id from public.etapes where nom = 'Étape E'), null, 'supprimer une phase garde ses étapes, sans phase');
select throws_ok($$ insert into public.phases (project_id, nom, date_debut, date_fin) values (tests.id('pE'), 'Inversée', '2026-06-01', '2026-05-01') $$,
  '23514', null, 'phase : la fin ne précède pas le début');

select throws_ok($$ insert into public.pta_activites (project_id, annee, trimestre, intitule, statut, pct_realisation)
                    values (tests.id('pE'), 2026, 1, 'Terminée à moitié', 'termine', 50) $$,
  '23514', null, 'PTA : une activité terminée est réalisée à 100 %');
select throws_ok($$ insert into public.pta_activites (project_id, annee, trimestre, intitule, statut, pct_realisation)
                    values (tests.id('pE'), 2026, 1, 'À faire avancée', 'a_faire', 20) $$,
  '23514', null, 'PTA : une activité à faire est à 0 %');
select throws_ok($$ insert into public.pta_activites (project_id, annee, intitule) values (tests.id('pE'), 2026, 'Sans période') $$,
  '23514', null, 'PTA : un trimestre ou des dates sont requis');
select throws_ok($$ insert into public.pta_activites (project_id, annee, intitule, date_debut) values (tests.id('pE'), 2026, 'Une seule date', '2026-02-01') $$,
  '23514', null, 'PTA : les deux dates vont ensemble');
select throws_ok($$ insert into public.pta_activites (project_id, annee, intitule, date_debut, date_fin) values (tests.id('pE'), 2026, 'Dates inversées', '2026-05-01', '2026-02-01') $$,
  '23514', null, 'PTA : la fin ne précède pas le début');
select lives_ok($$ insert into public.pta_activites (project_id, annee, intitule, date_debut, date_fin, budget_prevu)
                   values (tests.id('pE'), 2026, 'Avec dates seules', '2026-02-01', '2026-05-01', 1500000) $$, 'PTA : des dates suffisent');
select throws_ok($$ insert into public.pta_activites (project_id, annee, trimestre, intitule, budget_prevu) values (tests.id('pE'), 2026, 1, 'Budget négatif', -1) $$,
  '23514', null, 'PTA : budget prévu positif');
select throws_ok($$ insert into public.pta_activites (project_id, annee, trimestre, intitule) values (tests.id('pE'), 1999, 1, 'Année absurde') $$,
  '23514', null, 'PTA : année plausible');

-- États d'avancement : taux figés ----------------------------------------------------------
select lives_ok($$ insert into public.etats_avancement (project_id, titre, periode_debut, periode_fin, faits_marquants)
                   values (tests.id('pA'), 'État A', current_date - 90, current_date - 1, 'Faits.') $$, 'état d''avancement rédigé');
select is((select taux_resultats from public.etats_avancement where titre = 'État A'), 49.5::numeric,
  'état d''avancement : le taux de résultats est figé à la création');
select is((select taux_physique from public.etats_avancement where titre = 'État A'), 37.5::numeric,
  'état d''avancement : le taux physique est figé à la création');
insert into public.kpi_entries (kpi_id, date, valeur) select id, current_date - 1, 200 from public.kpis where nom = 'K2';
select is((select taux_resultats from public.etats_avancement where titre = 'État A'), 49.5::numeric,
  'état d''avancement : une saisie ultérieure ne change pas le taux figé');
select throws_ok($$ insert into public.etats_avancement (project_id, titre, periode_debut, periode_fin)
                    values (tests.id('pA'), 'Inversé', current_date, current_date - 1) $$,
  '23514', null, 'état d''avancement : la fin de période ne précède pas le début');

-- Documents -----------------------------------------------------------------------------
select lives_ok($$ insert into public.documents (project_id, nom, categorie, storage_path, mime_type, taille_octets)
                   values (tests.id('pE'), 'Rapport', 'rapport', tests.id('org1') || '/' || tests.id('pE') || '/rapport.pdf', 'application/pdf', 1234) $$,
  'document : chemin conforme accepté');
select throws_ok($$ insert into public.documents (project_id, nom, storage_path)
                    values (tests.id('pE'), 'Autre org', tests.id('org2') || '/' || tests.id('pE') || '/x.pdf') $$,
  'P0001', 'DOCUMENT_CHEMIN_INVALIDE', 'document : le dossier doit être celui de l''organisation');
select throws_ok($$ insert into public.documents (project_id, nom, storage_path)
                    values (tests.id('pE'), 'Autre projet', tests.id('org1') || '/' || tests.id('pA') || '/x.pdf') $$,
  'P0001', 'DOCUMENT_CHEMIN_INVALIDE', 'document : le sous-dossier doit être celui du projet');
select throws_ok($$ insert into public.documents (project_id, nom, storage_path)
                    values (tests.id('pE'), 'Remontée', tests.id('org1') || '/' || tests.id('pE') || '/../x.pdf') $$,
  'P0001', 'DOCUMENT_CHEMIN_INVALIDE', 'document : pas de remontée de dossier');
select throws_ok($$ insert into public.documents (project_id, nom, storage_path)
                    values (tests.id('pE'), 'Doublon', tests.id('org1') || '/' || tests.id('pE') || '/rapport.pdf') $$,
  '23505', null, 'document : un chemin n''est utilisé qu''une fois');
select throws_ok($$ insert into public.documents (project_id, nom, storage_path, realisation_id)
                    select tests.id('pA'), 'Mal lié', tests.id('org1') || '/' || tests.id('pA') || '/m.pdf', id
                    from public.realisations where titre = 'Liée au PTA' $$,
  'P0001', 'RATTACHEMENT_INVALIDE', 'document : la réalisation jointe doit être du même projet');
select lives_ok($$ insert into public.documents (project_id, nom, storage_path, realisation_id)
                   select tests.id('pE'), 'Preuve', tests.id('org1') || '/' || tests.id('pE') || '/preuve.pdf', id
                   from public.realisations where titre = 'Liée au PTA' $$, 'document : preuve jointe à une réalisation');
select lives_ok($$ delete from public.realisations where titre = 'Liée au PTA' $$, 'réalisation supprimée');
select is((select realisation_id from public.documents where nom = 'Preuve'), null,
  'supprimer une réalisation garde le document comme pièce du projet');

-- Étiquettes ---------------------------------------------------------------------------
select lives_ok($$ insert into public.projet_etiquettes (project_id, etiquette) values (tests.id('pE'), '  Formation   Continue ') $$,
  'étiquette : saisie avec espaces et majuscules');
select is((select etiquette from public.projet_etiquettes where project_id = tests.id('pE')), 'formation continue',
  'étiquette : normalisée en minuscules, espaces simplifiés');
select throws_ok($$ insert into public.projet_etiquettes (project_id, etiquette) values (tests.id('pE'), 'FORMATION CONTINUE') $$,
  '23505', null, 'étiquette : pas de doublon, majuscules comprises');
select lives_ok($$ insert into public.projet_etiquettes (project_id, etiquette)
                   select tests.id('pE'), 'etiquette ' || n from generate_series(1, 9) n $$, 'étiquette : neuf autres, soit dix au total');
select throws_ok($$ insert into public.projet_etiquettes (project_id, etiquette) values (tests.id('pE'), 'onzieme') $$,
  'P0001', 'ETIQUETTES_MAX', 'étiquette : dix au plus par projet');

-- Programme d'une autre organisation ----------------------------------------------------------
select is_empty($$ update public.projects set programme_id = (select id from public.programmes where nom = 'Programme P')
                   where id = tests.id('p3') returning 1 $$,
  'un projet d''une autre organisation est invisible : aucun rattachement possible');

-- Projet exemple : contenu du Lot 2 -------------------------------------------------------
select lives_ok($$ insert into tests.ids select 'demo', public.charger_projet_exemple() $$, 'admin : charge le projet exemple');
select is((select count(*) from public.cadre_logique_noeuds where project_id = tests.id('demo')), 12::bigint, 'exemple : douze lignes de cadre logique');
select is((select count(*) from public.cadre_logique_noeuds where project_id = tests.id('demo') and code = '' ), 0::bigint,
  'exemple : toutes les lignes ont un code');
select is((select count(*) from public.cadre_logique_noeuds where project_id = tests.id('demo') and code in ('OG', 'OS1', 'OS2', 'R1.1', 'R1.2', 'R2.1', 'R2.2', 'A1.1.1', 'A1.1.2', 'A1.2.1', 'A2.1.1', 'A2.2.1')),
  12::bigint, 'exemple : codes OG, OS1-2, R1.1-2.2 et A1.1.1-A2.2.1');
select is((select count(*) from public.kpis where project_id = tests.id('demo') and noeud_id is not null), 8::bigint,
  'exemple : les huit indicateurs sont reliés au cadre logique');
select is((select count(*) from public.phases where project_id = tests.id('demo')), 5::bigint, 'exemple : cinq phases');
select is((select count(*) from public.etapes where project_id = tests.id('demo')), 7::bigint, 'exemple : sept étapes');
select is((select count(*) from public.pta_activites where project_id = tests.id('demo')), 9::bigint, 'exemple : neuf activités au PTA');
select is((select count(*) from public.pta_activites where project_id = tests.id('demo') and statut = 'termine' and pct_realisation = 100), 4::bigint,
  'exemple : quatre activités terminées');
select is((select count(*) from public.pta_activites where project_id = tests.id('demo') and statut = 'en_cours'), 3::bigint, 'exemple : trois activités en cours');
select is((select count(*) from public.pta_activites where project_id = tests.id('demo') and statut in ('reporte', 'a_faire')), 2::bigint,
  'exemple : une activité reportée et une à venir');
select is((select count(*) from public.realisations where project_id = tests.id('demo')), 5::bigint, 'exemple : cinq réalisations');
select is((select count(*) from public.prochaines_etapes where project_id = tests.id('demo')), 4::bigint, 'exemple : quatre prochaines étapes');
select is((select count(*) from public.prochaines_etapes where project_id = tests.id('demo') and kpi_id is not null), 2::bigint,
  'exemple : deux prochaines étapes nées d''une alerte d''indicateur');
select is((select count(*) from public.etats_avancement where project_id = tests.id('demo')), 1::bigint, 'exemple : un état d''avancement');
select isnt((select taux_resultats from public.etats_avancement where project_id = tests.id('demo')), null,
  'exemple : l''état d''avancement porte ses taux figés');
select is((select count(*) from public.projet_etiquettes where project_id = tests.id('demo')), 3::bigint, 'exemple : trois étiquettes');
select isnt((select taux_physique from public.v_avancement where project_id = tests.id('demo')), null, 'exemple : un taux physique est calculé');
select cmp_ok((select nb_etapes_en_retard from public.v_avancement where project_id = tests.id('demo')), '>=', 1::bigint,
  'exemple : au moins une étape en retard');

-- Dans l'exemple, ces contenus restent libres (comme les saisies) ; la définition des indicateurs reste figée.
select lives_ok($$ insert into public.phases (project_id, nom) values (tests.id('demo'), 'Phase libre') $$, 'exemple : une phase peut être ajoutée');
select lives_ok($$ delete from public.cadre_logique_noeuds where project_id = tests.id('demo') and code = 'R1.1' $$,
  'exemple : une ligne du cadre logique peut être supprimée');
select is((select count(*) from public.kpis where project_id = tests.id('demo') and noeud_id is null), 2::bigint,
  'exemple : les deux indicateurs de la ligne supprimée sont détachés, sans erreur');
select throws_ok($$ update public.kpis set nom = 'Renommé' where project_id = tests.id('demo') and ordre = 2 $$,
  'P0001', 'DEMO_READONLY', 'exemple : la définition d''un indicateur reste figée');
select throws_ok($$ update public.projects set programme_id = tests.id('g') where id = tests.id('demo') $$,
  'P0001', 'DEMO_READONLY', 'exemple : le projet n''est pas rattachable à un programme');
select lives_ok($$ delete from public.projects where id = tests.id('demo') $$, 'admin : supprime le projet exemple');
select is((select count(*) from public.cadre_logique_noeuds where project_id = tests.id('demo')), 0::bigint,
  'le contenu du projet exemple part en cascade');

select tests.deconnecter();
select * from finish();
rollback;
