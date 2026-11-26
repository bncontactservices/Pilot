-- Corrections de l'audit de sécurité : fonction de la plateforme sans droit pour les clients, bucket « logos » en lecture seule
-- après l'essai, plafond d'envoi des invitations (délai par adresse, plafond par adresse, plafond par organisation,
-- journal indépendant des invitations, droits réservés à la clé de service).
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
  ('editeur1', 'a1000000-0000-4000-8000-000000000003'),
  ('admin2',   'b2000000-0000-4000-8000-000000000001');

insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('admin1'), 'admin1@exemple.test', '{"organisation": "ONG Alpha"}');
insert into tests.ids select 'org1', org_id from public.memberships where user_id = tests.id('admin1');
insert into public.invitations (org_id, email, role, token_hash) values
  (tests.id('org1'), 'editeur1@exemple.test', 'editeur', encode(sha256('jeton-editeur-org1-0123456789'::bytea), 'hex'));
insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('editeur1'), 'editeur1@exemple.test', '{"invitation": "jeton-editeur-org1-0123456789"}');
insert into auth.users (id, email, raw_user_meta_data)
values (tests.id('admin2'), 'admin2@exemple.test', '{"organisation": "PME Beta"}');
insert into tests.ids select 'org2', org_id from public.memberships where user_id = tests.id('admin2');

select plan(30);

-- Fonction de la plateforme --------------------------------------------------------------------------------------------
select ok(
  case when to_regprocedure('public.rls_auto_enable()') is null then true
       else not has_function_privilege('anon', to_regprocedure('public.rls_auto_enable()'), 'execute')
        and not has_function_privilege('authenticated', to_regprocedure('public.rls_auto_enable()'), 'execute') end,
  'rls_auto_enable (fonction de la plateforme) : ni anon ni authenticated ne peuvent l''exécuter');

-- Bucket « logos » -----------------------------------------------------------------------------------------------------
select tests.connecter(tests.id('admin1'));
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('logos', tests.id('org1') || '/logo.png') $$,
  'logos : un admin dépose le logo de son organisation');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('logos', tests.id('org2') || '/logo.png') $$,
  '42501', null, 'logos : mais pas dans le dossier d''une autre organisation');
select tests.connecter(tests.id('editeur1'));
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('logos', tests.id('org1') || '/editeur.png') $$,
  '42501', null, 'logos : un éditeur ne dépose pas de logo');
select tests.deconnecter();

update public.organisations set essai_fin = now() - interval '1 day' where id = tests.id('org1');
select tests.connecter(tests.id('admin1'));
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('logos', tests.id('org1') || '/tardif.png') $$,
  '42501', null, 'essai terminé : plus de nouveau logo');
select is_empty($$ update storage.objects set metadata = '{"x": 1}'::jsonb where bucket_id = 'logos' and name like '%/logo.png' returning 1 $$,
  'essai terminé : le logo existant ne se remplace plus');
select isnt_empty($$ select 1 from storage.objects where bucket_id = 'logos' and name like '%/logo.png' $$,
  'essai terminé : le logo reste lisible');
select isnt_empty($$ delete from storage.objects where bucket_id = 'logos' and name like '%/logo.png' returning 1 $$,
  'essai terminé : le logo peut encore être retiré');
select tests.deconnecter();
update public.organisations set essai_fin = now() + interval '10 days' where id = tests.id('org1');
select tests.connecter(tests.id('admin1'));
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('logos', tests.id('org1') || '/retour.png') $$,
  'organisation de nouveau en écriture : le dépôt de logo repasse');
select tests.deconnecter();

-- Droits de la fonction d'envoi ------------------------------------------------------------------------------------------
select tests.connecter(tests.id('admin1'));
select throws_ok($$ select public.invitations_autoriser_envoi(tests.id('org1'), 'a@exemple.test') $$,
  '42501', null, 'invitations_autoriser_envoi : refusée à un membre connecté');
select throws_ok($$ select * from private.invitations_envois $$, '42501', null, 'le journal des envois est fermé aux membres');
select tests.deconnecter();
select tests.anonyme();
select throws_ok($$ select public.invitations_autoriser_envoi(tests.id('org1'), 'a@exemple.test') $$,
  '42501', null, 'invitations_autoriser_envoi : refusée à un visiteur');
select tests.deconnecter();

-- Plafond d'envoi -----------------------------------------------------------------------------------------------------------
select tests.service();
select is(public.invitations_autoriser_envoi(tests.id('org1'), 'Cible@Exemple.test'), 'ok', 'premier envoi à une adresse : accordé');
select is(public.invitations_autoriser_envoi(tests.id('org1'), 'cible@exemple.test'), 'delai',
  'même adresse tout de suite (casse sans effet) : délai');
select is(public.invitations_autoriser_envoi(tests.id('org1'), '  cible@exemple.test '), 'delai', 'espaces sans effet');
select is(public.invitations_autoriser_envoi(tests.id('org2'), 'cible@exemple.test'), 'ok',
  'la même adresse peut être invitée par une autre organisation : le plafond est par organisation');
select tests.deconnecter();

-- Après le délai, un nouvel envoi passe ; au bout de cinq par jour, l'adresse est fermée.
update private.invitations_envois set envoye_le = now() - interval '5 minutes' where org_id = tests.id('org1');
select tests.service();
select is(public.invitations_autoriser_envoi(tests.id('org1'), 'cible@exemple.test'), 'ok', 'après le délai : accordé');
select tests.deconnecter();
update private.invitations_envois set envoye_le = now() - interval '5 minutes' where org_id = tests.id('org1');
insert into private.invitations_envois (org_id, email_hash, envoye_le)
select tests.id('org1'), encode(sha256('cible@exemple.test'::bytea), 'hex'), now() - interval '3 hours' from generate_series(1, 2);
select tests.service();
select is(public.invitations_autoriser_envoi(tests.id('org1'), 'cible@exemple.test'), 'ok', 'quatre envois dans le jour : le cinquième passe');
select tests.deconnecter();
update private.invitations_envois set envoye_le = now() - interval '5 minutes' where org_id = tests.id('org1');
select tests.service();
select is(public.invitations_autoriser_envoi(tests.id('org1'), 'cible@exemple.test'), 'adresse', 'cinq envois dans le jour : la sixième est refusée');
select is(public.invitations_autoriser_envoi(tests.id('org1'), 'autre@exemple.test'), 'ok', 'une autre adresse reste possible');
select tests.deconnecter();

-- La révocation d'une invitation ne remet rien à zéro : le journal est indépendant.
delete from public.invitations where org_id = tests.id('org1');
select tests.service();
select is(public.invitations_autoriser_envoi(tests.id('org1'), 'cible@exemple.test'), 'adresse',
  'invitation révoquée puis recréée : le plafond tient toujours');
select tests.deconnecter();

-- Plafond de l'organisation : vingt à l'heure, soixante par jour.
delete from private.invitations_envois where org_id = tests.id('org2');
insert into private.invitations_envois (org_id, email_hash, envoye_le)
select tests.id('org2'), encode(sha256(('adresse' || n || '@exemple.test')::bytea), 'hex'), now() - interval '10 minutes'
from generate_series(1, 20) n;
select tests.service();
select is(public.invitations_autoriser_envoi(tests.id('org2'), 'nouvelle@exemple.test'), 'plafond', 'vingt envois dans l''heure : le suivant est refusé');
select tests.deconnecter();
update private.invitations_envois set envoye_le = now() - interval '3 hours' where org_id = tests.id('org2');
select tests.service();
select is(public.invitations_autoriser_envoi(tests.id('org2'), 'nouvelle@exemple.test'), 'ok', 'vingt envois, mais plus dans l''heure : accordé');
select tests.deconnecter();
insert into private.invitations_envois (org_id, email_hash, envoye_le)
select tests.id('org2'), encode(sha256(('jour' || n || '@exemple.test')::bytea), 'hex'), now() - interval '5 hours'
from generate_series(1, 40) n;
select tests.service();
select is(public.invitations_autoriser_envoi(tests.id('org2'), 'derniere@exemple.test'), 'plafond', 'soixante envois dans le jour : plafond');
select tests.deconnecter();

-- Purge : au-delà d'un jour, le journal est effacé et ne compte plus.
update private.invitations_envois set envoye_le = now() - interval '2 days' where org_id = tests.id('org2');
select tests.service();
select is(public.invitations_autoriser_envoi(tests.id('org2'), 'derniere@exemple.test'), 'ok', 'envois vieux de deux jours : ils ne comptent plus');
select tests.deconnecter();
select is((select count(*) from private.invitations_envois where org_id = tests.id('org2')), 1::bigint,
  'et ils sont effacés du journal');

-- Valeurs invalides et vie privée --------------------------------------------------------------------------------------------
select tests.service();
select throws_ok($$ select public.invitations_autoriser_envoi(null, 'a@exemple.test') $$, 'P0001', 'REQUETE_INVALIDE', 'organisation absente : refusée');
select throws_ok($$ select public.invitations_autoriser_envoi(tests.id('org1'), '  ') $$, 'P0001', 'REQUETE_INVALIDE', 'adresse vide : refusée');
select tests.deconnecter();
select is((select count(*) from private.invitations_envois where email_hash like '%@%'), 0::bigint,
  'le journal ne garde que des empreintes, jamais une adresse e-mail');
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'private' and c.relname = 'invitations_envois' and c.relrowsecurity), 1::bigint,
  'le journal des envois est protégé par la RLS');

select * from finish();
rollback;
