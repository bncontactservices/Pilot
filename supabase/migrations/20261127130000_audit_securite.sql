-- =============================================================================
-- Pilot M&E — Migration : corrections de l'audit de sécurité (DECISIONS.md, section 30)
--
--   1. public.rls_auto_enable() : fonction créée par la plateforme (déclencheur d'événement qui active la RLS sur toute
--      nouvelle table). Elle était exécutable par anon et authenticated ; elle ne peut pas être appelée comme une fonction
--      (elle renvoie un event_trigger), mais personne n'a à pouvoir l'exécuter. Le déclencheur d'événement, lui, n'a pas
--      besoin de ce droit pour s'exécuter. Sur le Postgres embarqué des tests, la fonction n'existe pas : on ne fait rien.
--   2. Bucket « logos » : l'ajout et le remplacement de fichiers refusent une organisation en lecture seule (essai terminé),
--      comme le bucket « documents ». Le retrait reste permis : retirer un fichier est un droit de l'organisation.
--   3. Invitations : un journal des envois (adresse hachée, jamais en clair) et une fonction réservée à la clé de service
--      qui accorde ou refuse un envoi. L'Edge Function invite-member l'appelle avant d'écrire une invitation :
--        - délai de deux minutes entre deux envois à la même adresse ;
--        - cinq envois au plus par adresse et par jour ;
--        - vingt envois au plus par heure et soixante par jour pour une organisation.
--      Le journal est indépendant des invitations : révoquer une invitation puis la recréer ne remet rien à zéro.
--      Les lignes de plus d'un jour sont effacées à chaque appel.
-- =============================================================================

-- 1. Fonction de la plateforme ----------------------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;

-- 2. Bucket « logos » : lecture seule après l'essai ---------------------------------------------------------------------
drop policy "logos : ajout par les admins" on storage.objects;
drop policy "logos : remplacement par les admins" on storage.objects;

create policy "logos : ajout par les admins" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and private.est_admin(private.uuid_ou_null((storage.foldername(name))[1]))
    and private.org_peut_ecrire(private.uuid_ou_null((storage.foldername(name))[1]))
  );
create policy "logos : remplacement par les admins" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos'
    and private.est_admin(private.uuid_ou_null((storage.foldername(name))[1]))
    and private.org_peut_ecrire(private.uuid_ou_null((storage.foldername(name))[1]))
  );

-- 3. Plafond d'envoi des invitations ----------------------------------------------------------------------------------
create table private.invitations_envois (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organisations (id) on delete cascade,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  envoye_le timestamptz not null default now()
);
create index invitations_envois_org_idx on private.invitations_envois (org_id, envoye_le);
alter table private.invitations_envois enable row level security;
revoke all on private.invitations_envois from anon, authenticated;

-- Renvoie 'ok' (l'envoi est inscrit au journal), 'delai' (même adresse il y a moins de deux minutes), 'adresse' (cinq envois
-- à cette adresse en un jour) ou 'plafond' (organisation au maximum de l'heure ou du jour).
create function public.invitations_autoriser_envoi(p_org uuid, p_email text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_hash text;
begin
  if p_org is null or v_email = '' then
    raise exception 'REQUETE_INVALIDE' using errcode = 'P0001';
  end if;
  v_hash := encode(sha256(convert_to(v_email, 'UTF8')), 'hex');

  -- Deux demandes simultanées pour une même organisation se suivent : aucune ne passe entre le comptage et l'inscription.
  perform pg_advisory_xact_lock(hashtextextended('invitations_envois:' || p_org::text, 0));
  delete from private.invitations_envois where envoye_le < now() - interval '1 day';

  if exists (
    select 1 from private.invitations_envois
    where org_id = p_org and email_hash = v_hash and envoye_le > now() - interval '2 minutes'
  ) then
    return 'delai';
  end if;
  if (select count(*) from private.invitations_envois where org_id = p_org and email_hash = v_hash) >= 5 then
    return 'adresse';
  end if;
  if (select count(*) from private.invitations_envois where org_id = p_org and envoye_le > now() - interval '1 hour') >= 20
     or (select count(*) from private.invitations_envois where org_id = p_org) >= 60 then
    return 'plafond';
  end if;

  insert into private.invitations_envois (org_id, email_hash) values (p_org, v_hash);
  return 'ok';
end
$$;

revoke all on function public.invitations_autoriser_envoi(uuid, text) from public, anon, authenticated;
grant execute on function public.invitations_autoriser_envoi(uuid, text) to service_role;
