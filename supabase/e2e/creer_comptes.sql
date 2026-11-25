-- Comptes de test pour le parcours de bout en bout (e2e/parcours.spec.ts) : une organisation, un administrateur, un
-- éditeur et un lecteur, e-mails confirmés d'office. À exécuter dans l'éditeur SQL d'un projet de TEST (jamais en production).
-- Remplacer les trois mots de passe, puis les reporter dans .env.e2e (ignoré par git).
-- L'administrateur et l'éditeur s'inscrivent avec « conditions_version » dans leurs métadonnées, comme le formulaire d'inscription
-- (la base enregistre alors la version et sa propre date dans profiles) ; le lecteur sans, pour contrôler le cas contraire
-- (e2e/fichiers-acceptation.spec.ts).
-- Les comptes se créent par SQL parce que l'inscription par l'interface envoie un e-mail de confirmation, que le SMTP
-- par défaut de Supabase refuse pour des adresses fictives. Le déclencheur d'inscription crée l'organisation (essai de
-- 14 jours) pour l'administrateur ; les deux autres la rejoignent par invitation, comme en production.
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_edit uuid := gen_random_uuid();
  v_lect uuid := gen_random_uuid();
  v_org uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', 'e2e-admin@exemple.invalid', crypt('MOT_DE_PASSE_ADMIN', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"nom":"Admin E2E","organisation":"Organisation E2E (test)","conditions_version":"2026-11-25"}', now(), now(), '', '', '', '');
  select org_id into v_org from public.memberships where user_id = v_admin;
  insert into public.invitations (org_id, email, role, token_hash) values
    (v_org, 'e2e-editeur@exemple.invalid', 'editeur', encode(sha256('jeton-e2e-editeur-0123456789'::bytea), 'hex')),
    (v_org, 'e2e-lecteur@exemple.invalid', 'lecteur', encode(sha256('jeton-e2e-lecteur-0123456789'::bytea), 'hex'));
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values
    ('00000000-0000-0000-0000-000000000000', v_edit, 'authenticated', 'authenticated', 'e2e-editeur@exemple.invalid', crypt('MOT_DE_PASSE_EDITEUR', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"nom":"Éditeur E2E","invitation":"jeton-e2e-editeur-0123456789","conditions_version":"2026-11-25"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_lect, 'authenticated', 'authenticated', 'e2e-lecteur@exemple.invalid', crypt('MOT_DE_PASSE_LECTEUR', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"nom":"Lecteur E2E","invitation":"jeton-e2e-lecteur-0123456789"}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.email, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
  from auth.users u where u.email like 'e2e-%@exemple.invalid';
end $$;

-- Entre deux passages du parcours (il crée un projet et des invitations) :
--   delete from public.projects where org_id = (select id from public.organisations where nom = 'Organisation E2E (test)');
--   delete from public.programmes where org_id = (select id from public.organisations where nom = 'Organisation E2E (test)');
--   (les fichiers déposés par le parcours du cœur S&E sont retirés par le parcours lui-même ; s'il a échoué en route : supprimer
--    les objets du bucket « documents » sous le dossier de l'organisation de test, depuis le tableau de bord Supabase.)
--   delete from public.invitations where accepted_at is null and org_id = (select id from public.organisations where nom = 'Organisation E2E (test)');
-- Pour la phase 2 (fin d'essai) :
--   update public.organisations set essai_fin = now() - interval '1 day' where nom = 'Organisation E2E (test)';
