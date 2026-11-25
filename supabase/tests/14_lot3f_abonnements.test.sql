-- Lot 3f : abonnements Stripe : droits (le client ne lit que l'état, jamais les identifiants, et n'écrit rien), fonctions
-- réservées à la clé de service, application des événements (plan, lecture seule, idempotence, désordre, autre abonnement).
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
  ('admin3',   'c3000000-0000-4000-8000-000000000001'),
  ('p1', 'a1000000-0000-4000-8000-000000000101');

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
insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('admin3'), 'admin3@exemple.test', '{"organisation": "Grande ONG"}');
insert into tests.ids select 'org3', org_id from public.memberships where user_id = tests.id('admin3');
update public.organisations set plan = 'enterprise' where id = tests.id('org3');
insert into public.projects (id, org_id, nom, date_debut, date_fin)
values (tests.id('p1'), tests.id('org1'), 'Projet Alpha', '2026-01-01', '2026-12-31');

select plan(65);

-- Fonctions réservées à la clé de service ---------------------------------------------------------------
select tests.connecter(tests.id('admin1'));
select throws_ok($$ select public.stripe_lier_client(tests.id('org1'), 'cus_pirate') $$, '42501', null, 'un administrateur n''appelle pas stripe_lier_client');
select throws_ok($$ select public.stripe_appliquer_abonnement('evt_pirate', 'customer.subscription.updated', now(), 'cus_pirate', 'sub_pirate', tests.id('org1'), 'pro', 'annuelle', 'active', now() + interval '30 days', false) $$,
  '42501', null, 'ni stripe_appliquer_abonnement : il ne peut pas se donner un plan');
select tests.deconnecter();
select tests.anonyme();
select throws_ok($$ select public.stripe_lier_client(tests.id('org1'), 'cus_pirate') $$, '42501', null, 'un anonyme non plus');
select tests.deconnecter();

-- Lier un client à une organisation -------------------------------------------------------------------
select tests.service();
select is(public.stripe_lier_client(tests.id('org1'), 'cus_org1'), 'cus_org1', 'service : lie un client Stripe à l''organisation');
select is(public.stripe_lier_client(tests.id('org1'), 'cus_autre'), 'cus_org1', 'un second client ne remplace pas le premier');
select is(public.stripe_lier_client('00000000-0000-4000-8000-0000000000ff', 'cus_fantome'), 'org_inconnue', 'une organisation inconnue est signalée');
select throws_ok($$ select public.stripe_lier_client(tests.id('org2'), 'pas-un-client') $$, '23514', null, 'l''identifiant du client a le format de Stripe');
select is((select statut::text from public.abonnements where org_id = tests.id('org1')), 'incomplete', 'un client lié n''a pas encore d''abonnement actif');
select tests.deconnecter();

-- Ce que le client voit ------------------------------------------------------------------------------
select tests.connecter(tests.id('admin1'));
select is((select count(*) from public.abonnements), 1::bigint, 'administrateur : lit l''état de l''abonnement de son organisation');
select lives_ok($$ select org_id, plan, periodicite, statut, periode_fin, annule_en_fin_de_periode from public.abonnements $$, 'administrateur : lit le plan, la périodicité, le statut et la fin de période');
select throws_ok($$ select stripe_customer_id from public.abonnements $$, '42501', null, 'mais jamais l''identifiant du client Stripe');
select throws_ok($$ select stripe_subscription_id from public.abonnements $$, '42501', null, 'ni celui de l''abonnement');
select throws_ok($$ insert into public.abonnements (org_id, stripe_customer_id, plan, statut) values (tests.id('org2'), 'cus_x', 'pro', 'active') $$, '42501', null, 'il n''écrit aucun abonnement');
select throws_ok($$ update public.abonnements set statut = 'active', plan = 'pro' $$, '42501', null, 'ni ne le modifie');
select throws_ok($$ delete from public.abonnements $$, '42501', null, 'ni ne le supprime');
select throws_ok($$ select * from public.evenements_stripe $$, '42501', null, 'le journal des événements lui est fermé');
select is((select plan::text from public.organisations where id = tests.id('org1')), 'essai', 'son plan n''a pas changé');
select tests.deconnecter();
select tests.connecter(tests.id('editeur1'));
select is((select count(*) from public.abonnements), 0::bigint, 'éditeur : ne voit pas l''abonnement');
select tests.deconnecter();
select tests.connecter(tests.id('lecteur1'));
select is((select count(*) from public.abonnements), 0::bigint, 'lecteur : ne le voit pas non plus');
select tests.deconnecter();
select tests.connecter(tests.id('admin2'));
select is((select count(*) from public.abonnements), 0::bigint, 'administrateur d''une autre organisation : ne voit rien');
select tests.deconnecter();
select tests.anonyme();
select throws_ok($$ select * from public.abonnements $$, '42501', null, 'anonyme : refusé');
select tests.deconnecter();

-- Application des événements ------------------------------------------------------------------------
select tests.service();
select is(public.stripe_appliquer_abonnement('evt_1', 'customer.subscription.created', now() - interval '3 hours', 'cus_org1', 'sub_1', tests.id('org1'), 'starter', 'mensuelle', 'active', now() + interval '30 days', false),
  'applique', 'service : applique la création d''un abonnement Starter');
select is((select plan::text from public.organisations where id = tests.id('org1')), 'starter', 'le plan de l''organisation devient Starter');
select is((select statut::text || '/' || plan::text || '/' || periodicite from public.abonnements where org_id = tests.id('org1')), 'active/starter/mensuelle', 'l''état de l''abonnement est enregistré');
select is(public.stripe_appliquer_abonnement('evt_1', 'customer.subscription.created', now() - interval '3 hours', 'cus_org1', 'sub_1', tests.id('org1'), 'pro', 'annuelle', 'active', now() + interval '30 days', false),
  'deja_traite', 'le même événement n''est appliqué qu''une fois');
select is((select plan::text from public.organisations where id = tests.id('org1')), 'starter', 'sans effet la seconde fois');
select is(public.stripe_appliquer_abonnement('evt_2', 'customer.subscription.updated', now() - interval '2 hours', 'cus_org1', 'sub_1', tests.id('org1'), 'pro', 'annuelle', 'active', now() + interval '365 days', true),
  'applique', 'un changement vers Pro annuel est appliqué');
select is((select plan::text from public.organisations where id = tests.id('org1')), 'pro', 'le plan devient Pro');
select is((select annule_en_fin_de_periode from public.abonnements where org_id = tests.id('org1')), true, 'l''annulation en fin de période est enregistrée');
select is(public.stripe_appliquer_abonnement('evt_3', 'customer.subscription.updated', now() - interval '4 hours', 'cus_org1', 'sub_1', tests.id('org1'), 'starter', 'mensuelle', 'active', now() + interval '30 days', false),
  'ancien', 'un événement plus ancien que le dernier appliqué est ignoré');
select is((select plan::text from public.organisations where id = tests.id('org1')), 'pro', 'le plan reste Pro');
select is(public.stripe_appliquer_abonnement('evt_4', 'customer.subscription.created', now() - interval '1 hour', 'cus_org1', 'sub_autre', tests.id('org1'), 'starter', 'mensuelle', 'active', now() + interval '30 days', false),
  'autre_abonnement', 'un autre abonnement est ignoré tant que celui en cours n''est pas terminé');
select is((select stripe_subscription_id from public.abonnements where org_id = tests.id('org1')), 'sub_1', 'l''abonnement en cours reste sub_1');
select is(public.stripe_appliquer_abonnement('evt_5', 'customer.subscription.updated', now() - interval '30 minutes', 'cus_org1', 'sub_1', tests.id('org1'), 'pro', 'annuelle', 'past_due', now() + interval '365 days', false),
  'applique', 'un paiement échoué (past_due) est enregistré');
select is((select plan::text from public.organisations where id = tests.id('org1')), 'pro', 'l''accès est maintenu pendant que Stripe retente le paiement');
select ok(private.org_peut_ecrire(tests.id('org1')), 'l''organisation peut toujours écrire');

-- Fin d'abonnement : lecture seule, données conservées ----------------------------------------------------
select is(public.stripe_appliquer_abonnement('evt_6', 'customer.subscription.deleted', now() - interval '10 minutes', 'cus_org1', 'sub_1', tests.id('org1'), null, null, 'canceled', now() - interval '10 minutes', false),
  'applique', 'la fin de l''abonnement est appliquée');
select is((select plan::text from public.organisations where id = tests.id('org1')), 'essai', 'l''organisation repasse au plan « essai »');
select ok(not private.org_peut_ecrire(tests.id('org1')), 'elle est en lecture seule');
select ok((select essai_fin <= now() from public.organisations where id = tests.id('org1')), 'sa fin d''essai est passée');
select is((select count(*) from public.projects where org_id = tests.id('org1')), 1::bigint, 'ses données sont conservées');
select is((select plan::text from public.abonnements where org_id = tests.id('org1')), 'pro', 'l''abonnement garde le dernier plan payé, pour mémoire');
select tests.deconnecter();
select tests.connecter(tests.id('editeur1'));
select throws_ok($$ insert into public.projects (org_id, nom, date_debut, date_fin) values (tests.id('org1'), 'Après abonnement', '2026-01-01', '2026-12-31') $$,
  'P0001', 'ESSAI_EXPIRE', 'les écritures sont refusées par la base après la fin de l''abonnement');
select tests.deconnecter();

-- Un nouvel abonnement après la fin du précédent ----------------------------------------------------------
select tests.service();
select is(public.stripe_appliquer_abonnement('evt_7', 'customer.subscription.created', now() - interval '5 minutes', 'cus_org1', 'sub_2', tests.id('org1'), 'starter', 'mensuelle', 'active', now() + interval '30 days', false),
  'applique', 'un nouvel abonnement est accepté une fois le précédent terminé');
select is((select plan::text from public.organisations where id = tests.id('org1')), 'starter', 'le plan est de nouveau payé');
select ok(private.org_peut_ecrire(tests.id('org1')), 'l''organisation peut de nouveau écrire');
select is((select stripe_subscription_id from public.abonnements where org_id = tests.id('org1')), 'sub_2', 'l''abonnement en cours est sub_2');

-- Un paiement abandonné ne retire pas un essai en cours ---------------------------------------------------------
select is(public.stripe_lier_client(tests.id('org2'), 'cus_org2'), 'cus_org2', 'l''organisation 2 (en essai) a un client');
select is(public.stripe_appliquer_abonnement('evt_8', 'customer.subscription.created', now() - interval '2 hours', 'cus_org2', 'sub_3', tests.id('org2'), 'pro', 'mensuelle', 'incomplete', null, false),
  'applique', 'un abonnement incomplet est enregistré');
select is((select plan::text from public.organisations where id = tests.id('org2')), 'essai', 'sans changer le plan');
select ok(private.org_peut_ecrire(tests.id('org2')), 'l''essai continue');
select is(public.stripe_appliquer_abonnement('evt_9', 'customer.subscription.updated', now() - interval '1 hour', 'cus_org2', 'sub_3', tests.id('org2'), 'pro', 'mensuelle', 'incomplete_expired', null, false),
  'applique', 'un paiement jamais abouti est enregistré');
select ok(private.org_peut_ecrire(tests.id('org2')), 'l''essai continue encore : un paiement abandonné ne coupe pas l''accès');
select is(public.stripe_appliquer_abonnement('evt_10', 'customer.subscription.deleted', now() - interval '30 minutes', 'cus_org2', 'sub_3', tests.id('org2'), null, null, 'canceled', null, false),
  'applique', 'l''annulation d''un abonnement qui n''a jamais été payé est enregistrée');
select ok(private.org_peut_ecrire(tests.id('org2')), 'elle ne coupe pas l''essai : l''organisation n''avait pas de plan payé');

-- Plan activé à la main (enterprise) : jamais modifié ------------------------------------------------------------
select is(public.stripe_lier_client(tests.id('org3'), 'cus_org3'), 'cus_org3', 'l''organisation 3 (enterprise) a un client');
select is(public.stripe_appliquer_abonnement('evt_11', 'customer.subscription.created', now() - interval '1 hour', 'cus_org3', 'sub_4', tests.id('org3'), 'starter', 'mensuelle', 'active', now() + interval '30 days', false),
  'applique', 'un abonnement est enregistré pour elle');
select is((select plan::text from public.organisations where id = tests.id('org3')), 'enterprise', 'son plan enterprise n''est pas modifié');
select is(public.stripe_appliquer_abonnement('evt_12', 'customer.subscription.deleted', now() - interval '30 minutes', 'cus_org3', 'sub_4', tests.id('org3'), null, null, 'canceled', null, false),
  'applique', 'sa fin d''abonnement est enregistrée');
select ok(private.org_peut_ecrire(tests.id('org3')), 'elle reste en écriture');

-- Client inconnu ------------------------------------------------------------------------------------------
select is(public.stripe_appliquer_abonnement('evt_13', 'customer.subscription.created', now(), 'cus_inconnu', 'sub_5', null, 'pro', 'mensuelle', 'active', now() + interval '30 days', false),
  'org_inconnue', 'un client inconnu, sans organisation, est signalé et sans effet');
select is((select count(*) from public.abonnements), 3::bigint, 'aucun abonnement créé pour lui');

-- Journal -------------------------------------------------------------------------------------------------
select is((select count(*) from public.evenements_stripe), 13::bigint, 'chaque événement reçu est journalisé une fois');
select tests.deconnecter();

-- Supprimer une organisation efface son abonnement ------------------------------------------------------
select lives_ok($$ delete from public.organisations where id = tests.id('org2') $$, 'supprimer une organisation qui a un abonnement');
select is((select count(*) from public.abonnements where stripe_customer_id = 'cus_org2'), 0::bigint, 'son abonnement part avec elle');

select * from finish();
rollback;
