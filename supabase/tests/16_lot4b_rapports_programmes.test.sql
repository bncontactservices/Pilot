-- Lot 4b : rapport de suivi par e-mail, programmé. Abonnement par choix (chacun sa ligne, jamais celle d'un autre, seule la
-- fréquence s'écrit), échéances (lundi / 1er du mois, 07:00 UTC), réservation exclusive des envois dus, marquage des
-- résultats, contenu du rapport (sans projet exemple ni projet terminé), jeton du planificateur, droits des fonctions.
begin;


-- Bloc commun --------------------------------------------------------------
create extension if not exists pgtap with schema extensions;
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create table tests.ids (cle text primary key, id uuid not null);
grant select, insert on tests.ids to anon, authenticated, service_role;
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
-- --------------------------------------------------------------------------

insert into tests.ids values
  ('admin1',   'a1000000-0000-4000-8000-000000000001'),
  ('lecteur1', 'a1000000-0000-4000-8000-000000000002'),
  ('editeur1', 'a1000000-0000-4000-8000-000000000003'),
  ('admin2',   'b2000000-0000-4000-8000-000000000001'),
  ('prog1',    'a1000000-0000-4000-8000-0000000000a1'),
  ('pactif',   'a1000000-0000-4000-8000-000000000101'),
  ('pdemo',    'a1000000-0000-4000-8000-000000000102'),
  ('ptermine', 'a1000000-0000-4000-8000-000000000103'),
  ('p2',       'b2000000-0000-4000-8000-000000000101'),
  ('k1',       'a1000000-0000-4000-8000-000000000201');

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

-- Les deux organisations sont en essai en cours (plan « essai », fin dans le futur) : elles reçoivent des rapports.
select plan(53);

-- Abonnement par choix ----------------------------------------------------------------------------------------
select tests.connecter(tests.id('editeur1'));
select lives_ok($$ insert into public.rapports_abonnes (frequence) values ('hebdomadaire') $$,
  'un éditeur s''abonne lui-même, en ne donnant que la fréquence');
select is((select user_id from public.rapports_abonnes), tests.id('editeur1'), 'la ligne est celle de son compte (posé par la base)');
select is((select org_id from public.rapports_abonnes), tests.id('org1'), 'et de son organisation (posée par la base)');
select ok((select prochain_envoi_le > now() and prochain_envoi_le <= now() + interval '7 days 1 minute' from public.rapports_abonnes),
  'le premier envoi est à la prochaine échéance, pas tout de suite');
select ok((select extract(dow from prochain_envoi_le at time zone 'UTC') = 1 and extract(hour from prochain_envoi_le at time zone 'UTC') = 7 from public.rapports_abonnes),
  'hebdomadaire : un lundi, 07:00 UTC');
select throws_ok($$ insert into public.rapports_abonnes (frequence) values ('mensuelle') $$, '23505', null,
  'un membre n''a qu''un abonnement');
select throws_ok($$ insert into public.rapports_abonnes (user_id, frequence) values (tests.id('admin1'), 'mensuelle') $$, '42501', null,
  'il ne peut pas s''abonner au nom d''un autre (colonne non ouverte)');
select throws_ok($$ update public.rapports_abonnes set prochain_envoi_le = now() $$, '42501', null,
  'il ne choisit pas la date d''envoi');
select throws_ok($$ update public.rapports_abonnes set echecs = 0 $$, '42501', null, 'ni le compteur d''échecs');
select throws_ok($$ update public.rapports_abonnes set org_id = tests.id('org2') $$, '42501', null, 'ni l''organisation');
select lives_ok($$ update public.rapports_abonnes set frequence = 'mensuelle' $$, 'il change de fréquence');
select ok((select extract(day from prochain_envoi_le at time zone 'UTC') = 1 and extract(hour from prochain_envoi_le at time zone 'UTC') = 7 and prochain_envoi_le > now() from public.rapports_abonnes),
  'mensuel : le 1er du mois, 07:00 UTC, et l''échéance est recalculée');
select throws_ok($$ insert into public.rapports_abonnes (frequence) values ('quotidienne') $$, '22P02', null,
  'une fréquence inconnue est refusée');

-- Chacun sa ligne -----------------------------------------------------------------------------------------------
select tests.connecter(tests.id('lecteur1'));
select is((select count(*) from public.rapports_abonnes), 0::bigint, 'un lecteur ne voit pas l''abonnement d''un collègue');
select lives_ok($$ insert into public.rapports_abonnes (frequence) values ('hebdomadaire') $$, 'un lecteur s''abonne à son tour');
select is((select count(*) from public.rapports_abonnes), 1::bigint, 'et ne voit que sa ligne');
select tests.connecter(tests.id('admin1'));
select is((select count(*) from public.rapports_abonnes), 0::bigint, 'un administrateur non plus ne lit pas les lignes des autres');
update public.rapports_abonnes set frequence = 'hebdomadaire' where user_id = tests.id('editeur1');
delete from public.rapports_abonnes where user_id = tests.id('editeur1');
select tests.connecter(tests.id('editeur1'));
select is((select frequence::text from public.rapports_abonnes), 'mensuelle', 'un administrateur ne modifie ni ne supprime la ligne d''un membre');
select tests.connecter(tests.id('admin2'));
select lives_ok($$ insert into public.rapports_abonnes (frequence) values ('hebdomadaire') $$, 'un membre d''une autre organisation s''abonne');
select is((select org_id from public.rapports_abonnes), tests.id('org2'), 'sa ligne est rattachée à SON organisation');
select tests.anonyme();
select throws_ok($$ select 1 from public.rapports_abonnes $$, '42501', null, 'un visiteur anonyme ne lit rien');

-- Se désabonner n'est jamais bloqué, même en lecture seule ------------------------------------------------------
select tests.deconnecter();
update public.organisations set plan = 'essai', essai_fin = now() - interval '1 day' where id = tests.id('org1');
select tests.connecter(tests.id('lecteur1'));
select lives_ok($$ delete from public.rapports_abonnes $$, 'organisation en lecture seule : le désabonnement reste possible');
select is((select count(*) from public.rapports_abonnes), 0::bigint, 'la ligne a disparu');
select tests.deconnecter();
update public.organisations set essai_fin = now() + interval '5 days' where id = tests.id('org1');

-- Échéances : lundi 07:00 UTC, 1er du mois 07:00 UTC --------------------------------------------------------------
select is(private.prochain_rapport('hebdomadaire', '2026-11-25 10:00:00+00'), '2026-11-30 07:00:00+00'::timestamptz, 'hebdomadaire : un mercredi, le lundi suivant');
select is(private.prochain_rapport('hebdomadaire', '2026-11-30 06:00:00+00'), '2026-11-30 07:00:00+00'::timestamptz, 'hebdomadaire : un lundi avant 07:00, le jour même');
select is(private.prochain_rapport('hebdomadaire', '2026-11-30 07:00:00+00'), '2026-12-07 07:00:00+00'::timestamptz, 'hebdomadaire : un lundi à 07:00 pile, le lundi suivant (strictement après)');
select is(private.prochain_rapport('mensuelle', '2026-11-26 10:00:00+00'), '2026-12-01 07:00:00+00'::timestamptz, 'mensuelle : le 1er du mois suivant');
select is(private.prochain_rapport('mensuelle', '2026-12-01 06:00:00+00'), '2026-12-01 07:00:00+00'::timestamptz, 'mensuelle : un 1er avant 07:00, le jour même');
select is(private.prochain_rapport('mensuelle', '2026-12-31 23:00:00+00'), '2027-01-01 07:00:00+00'::timestamptz, 'mensuelle : passage d''année');

-- Les fonctions sont réservées à la clé de service -----------------------------------------------------------------
select tests.connecter(tests.id('admin1'));
select throws_ok($$ select * from public.rapports_reserver() $$, '42501', null, 'un administrateur ne réserve pas d''envois');
select throws_ok($$ select public.rapports_contenu(tests.id('org1')) $$, '42501', null, 'ni ne lit le contenu par cette voie');
select throws_ok($$ select public.rapports_marquer(tests.id('admin1'), true) $$, '42501', null, 'ni ne marque un résultat');
select throws_ok($$ select public.rapports_verifier_jeton('x') $$, '42501', null, 'ni ne sonde le jeton du planificateur');
select tests.anonyme();
select throws_ok($$ select public.rapports_contenu(tests.id('org1')) $$, '42501', null, 'un visiteur anonyme non plus');
select tests.connecter(tests.id('admin1'));
select throws_ok($$ select * from private.rapports_config $$, '42501', null, 'la configuration du planificateur est fermée au client');
select tests.deconnecter();

-- Réservation exclusive des envois dus -----------------------------------------------------------------------------
delete from public.rapports_abonnes;
update public.profiles set email = null where id = tests.id('lecteur1');
update public.organisations set plan = 'essai', essai_fin = now() - interval '1 day' where id = tests.id('org2');
insert into public.rapports_abonnes (user_id, org_id, frequence, prochain_envoi_le) values
  (tests.id('admin1'),   tests.id('org1'), 'hebdomadaire', now() - interval '1 hour'),
  (tests.id('editeur1'), tests.id('org1'), 'hebdomadaire', now() + interval '1 day'),
  (tests.id('lecteur1'), tests.id('org1'), 'hebdomadaire', now() - interval '2 hours'),
  (tests.id('admin2'),   tests.id('org2'), 'hebdomadaire', now() - interval '3 hours');
select tests.service();
select is((select count(*) from public.rapports_reserver()), 1::bigint,
  'seul l''envoi dû est réservé : ni l''échéance future, ni le membre sans adresse, ni l''organisation en lecture seule');
select tests.deconnecter();
select ok((select prochain_envoi_le > now() + interval '59 minutes' and prochain_envoi_le < now() + interval '61 minutes'
           from public.rapports_abonnes where user_id = tests.id('admin1')),
  'l''échéance est repoussée d''une heure le temps d''envoyer');
select tests.service();
select is((select count(*) from public.rapports_reserver()), 0::bigint, 'un second passage ne réserve rien : pas d''envoi en double');
select tests.deconnecter();
update public.rapports_abonnes set prochain_envoi_le = now() - interval '1 hour' where user_id in (tests.id('admin1'), tests.id('editeur1'));
select tests.service();
select is((select count(*) from public.rapports_reserver(1)), 1::bigint, 'la limite de la réservation est respectée');
select tests.deconnecter();

-- Résultat d'un envoi -----------------------------------------------------------------------------------------------
update public.rapports_abonnes set prochain_envoi_le = now() where user_id = tests.id('admin1');
select tests.service();
select public.rapports_marquer(tests.id('admin1'), true);
select tests.deconnecter();
select ok((select dernier_envoi_le is not null and echecs = 0 and prochain_envoi_le > now()
             and extract(dow from prochain_envoi_le at time zone 'UTC') = 1 and extract(hour from prochain_envoi_le at time zone 'UTC') = 7
           from public.rapports_abonnes where user_id = tests.id('admin1')),
  'envoyé : dernier envoi noté, échecs remis à zéro, prochaine échéance régulière');
select tests.service();
select public.rapports_marquer(tests.id('admin1'), false);
select tests.deconnecter();
select ok((select echecs = 1 and prochain_envoi_le > now() + interval '59 minutes' and prochain_envoi_le < now() + interval '61 minutes'
           from public.rapports_abonnes where user_id = tests.id('admin1')),
  'raté : un échec compté, nouvel essai dans une heure');
select tests.service();
select public.rapports_marquer(tests.id('admin1'), false);
select public.rapports_marquer(tests.id('admin1'), false);
select public.rapports_marquer(tests.id('admin1'), false);
select public.rapports_marquer(tests.id('admin1'), false);
select tests.deconnecter();
select ok((select echecs = 5 and prochain_envoi_le > now() + interval '2 hours' and extract(hour from prochain_envoi_le at time zone 'UTC') = 7
           from public.rapports_abonnes where user_id = tests.id('admin1')),
  'après cinq échecs : on attend l''échéance régulière au lieu de réessayer sans fin');

-- Contenu du rapport ----------------------------------------------------------------------------------------------------
insert into public.programmes (id, org_id, nom) values (tests.id('prog1'), tests.id('org1'), 'Eau et assainissement');
insert into public.projects (id, org_id, nom, date_debut, date_fin, programme_id, statut) values
  (tests.id('pactif'), tests.id('org1'), 'Forages Kolda', '2026-01-01', '2027-12-31', tests.id('prog1'), 'en_cours'),
  (tests.id('ptermine'), tests.id('org1'), 'Projet fini', '2025-01-01', '2025-12-31', null, 'termine'),
  (tests.id('p2'), tests.id('org2'), 'Projet Beta', '2026-01-01', '2027-12-31', null, 'en_cours');
insert into public.projects (id, org_id, nom, date_debut, date_fin, statut, is_demo)
  values (tests.id('pdemo'), tests.id('org1'), 'Exemple', '2026-01-01', '2027-12-31', 'en_cours', true);
insert into public.kpis (id, project_id, nom, cible) values (tests.id('k1'), tests.id('pactif'), 'Forages', 100);
insert into public.kpi_entries (kpi_id, date, valeur) values (tests.id('k1'), '2026-06-30', 50);
select tests.service();
select is(jsonb_array_length(public.rapports_contenu(tests.id('org1')) -> 'projets'), 1,
  'le contenu ne reprend ni le projet exemple ni le projet terminé, ni ceux d''une autre organisation');
select is(public.rapports_contenu(tests.id('org1')) -> 'projets' -> 0 ->> 'nom', 'Forages Kolda', 'c''est le projet suivi');
select is(jsonb_array_length(public.rapports_contenu(tests.id('org1')) -> 'programmes'), 1, 'avec son programme');
select is((public.rapports_contenu(tests.id('org1')) -> 'projets' -> 0 ->> 'taux_resultats')::numeric,
  (select round(taux_resultats, 1) from public.v_avancement where project_id = tests.id('pactif')),
  'les taux sont ceux des vues d''avancement, sans recalcul');
select is((public.rapports_contenu(tests.id('org1')) -> 'projets' -> 0 ->> 'nb_kpis_avec_donnees')::int, 1, 'le nombre d''indicateurs avec données accompagne les taux (points d''attention)');
select is(public.rapports_contenu(tests.id('org1')) -> 'seuils', '{"vert": 90, "ambre": 60}'::jsonb, 'les seuils par défaut accompagnent le contenu');
select is(public.rapports_contenu(tests.id('org2')) -> 'projets' -> 0 ->> 'nom', 'Projet Beta', 'chaque organisation a son propre contenu');
select tests.deconnecter();

-- Jeton du planificateur ------------------------------------------------------------------------------------------------
select set_config('tests.jeton', (select valeur from private.rapports_config where cle = 'jeton'), true);
select tests.service();
select is(public.rapports_verifier_jeton(current_setting('tests.jeton')), true, 'le bon jeton est reconnu');
select is(public.rapports_verifier_jeton('pas-le-bon'), false, 'un autre jeton est refusé');
select is(public.rapports_verifier_jeton(''), false, 'un jeton vide est refusé');
select is(public.rapports_verifier_jeton(null), false, 'un jeton absent est refusé');
select tests.deconnecter();

select * from finish();
rollback;
