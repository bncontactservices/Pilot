-- =============================================================================
-- Pilot M&E — Migration Lot 3f : abonnements Stripe
-- L'état d'abonnement d'une organisation, et deux fonctions que seules les Edge Functions (clé de service) appellent :
-- lier un client Stripe à une organisation, et appliquer un événement d'abonnement reçu de Stripe.
--
-- Choix :
--   - Stripe est la source de vérité de l'abonnement ; la base n'en garde que ce qu'il faut pour décider des droits :
--     le plan payé, la périodicité, le statut, la fin de période. Les identifiants Stripe (client, abonnement) ne sont pas
--     lisibles par le client : droits par colonne. Un abonnement n'est lu que par les admins de l'organisation.
--   - **Aucune écriture du client** : ni création ni modification. Tout passe par stripe_lier_client() et
--     stripe_appliquer_abonnement(), réservées à service_role (les droits d'exécution sont retirés à anon et authenticated).
--   - Le plan de l'organisation (organisations.plan, qui décide des limites et de la lecture seule) suit le statut :
--       active, trialing, past_due → le plan payé (past_due : Stripe retente le paiement, l'accès est maintenu) ;
--       canceled, unpaid, paused   → lecture seule (plan « essai » avec une fin d'essai passée), données conservées ;
--       incomplete, incomplete_expired → aucun changement (un paiement abandonné ne retire pas un essai en cours).
--     Une organisation « enterprise » n'est jamais modifiée (plan activé à la main). Un retour en lecture seule ne se
--     fait que si l'organisation avait un plan payé.
--   - **Idempotence et désordre** : chaque événement n'est traité qu'une fois (journal evenements_stripe, sans accès
--     client). Un événement plus ancien que le dernier appliqué est ignoré (Stripe ne garantit pas l'ordre), et un
--     événement d'un autre abonnement que celui en cours est ignoré tant que celui-ci n'est pas terminé.
--   - Les quotas des plans ne se vérifient qu'à la création : passer de Pro à Starter ne supprime rien, mais empêche
--     d'en créer davantage.
-- =============================================================================

create type public.statut_abonnement as enum (
  'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'
);

create table public.abonnements (
  org_id uuid primary key references public.organisations (id) on delete cascade,
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9_]+$'),
  stripe_subscription_id text unique check (stripe_subscription_id ~ '^sub_[A-Za-z0-9_]+$'),
  plan public.plan_choisi,
  periodicite text check (periodicite in ('mensuelle', 'annuelle')),
  statut public.statut_abonnement not null default 'incomplete',
  periode_fin timestamptz,
  annule_en_fin_de_periode boolean not null default false,
  -- Date de l'événement Stripe le plus récent appliqué : les événements plus anciens sont ignorés.
  dernier_evenement_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Journal des événements Stripe traités : empêche de les appliquer deux fois. Aucun accès client.
create table public.evenements_stripe (
  id text primary key check (id ~ '^evt_[A-Za-z0-9_]+$'),
  type text not null check (char_length(type) <= 100),
  recu_le timestamptz not null default now()
);

create trigger t90_updated_at before update on public.abonnements
  for each row execute function private.maj_updated_at();

-- Droits ------------------------------------------------------------------------------------------------------
revoke all on public.abonnements, public.evenements_stripe from anon, authenticated;
-- Le client lit l'état de l'abonnement, jamais les identifiants Stripe, et n'écrit rien.
grant select (org_id, plan, periodicite, statut, periode_fin, annule_en_fin_de_periode, updated_at)
  on public.abonnements to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;

alter table public.abonnements enable row level security;
alter table public.evenements_stripe enable row level security;
create policy "abonnements : lecture par les admins" on public.abonnements
  for select to authenticated using (private.est_admin(org_id));

-- Fonctions réservées aux Edge Functions ----------------------------------------------------------------------

-- Lie un client Stripe à une organisation (au premier paiement). Sans effet si l'organisation a déjà un client.
create function public.stripe_lier_client(p_org uuid, p_client text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_client text;
begin
  if not exists (select 1 from public.organisations o where o.id = p_org) then
    return 'org_inconnue';
  end if;
  insert into public.abonnements (org_id, stripe_customer_id) values (p_org, p_client)
  on conflict (org_id) do nothing;
  select a.stripe_customer_id into v_client from public.abonnements a where a.org_id = p_org;
  return v_client;
end
$$;

-- Applique un événement d'abonnement (customer.subscription.created | updated | deleted). Renvoie :
--   applique | deja_traite | ancien | autre_abonnement | org_inconnue
create function public.stripe_appliquer_abonnement(
  p_evenement_id text,
  p_type text,
  p_evenement_le timestamptz,
  p_client text,
  p_abonnement text,
  p_org uuid,
  p_plan public.plan_choisi,
  p_periodicite text,
  p_statut public.statut_abonnement,
  p_periode_fin timestamptz,
  p_annule boolean
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_abo public.abonnements;
  v_plan_actuel public.plan_org;
  v_plan_paye public.plan_choisi;
begin
  insert into public.evenements_stripe (id, type) values (p_evenement_id, p_type) on conflict do nothing;
  if not found then
    return 'deja_traite';
  end if;

  select a.org_id into v_org from public.abonnements a where a.stripe_customer_id = p_client;
  -- Client pas encore lié (événement arrivé avant le lien) : on s'appuie sur l'organisation portée par l'abonnement.
  if v_org is null and p_org is not null and exists (select 1 from public.organisations o where o.id = p_org) then
    insert into public.abonnements (org_id, stripe_customer_id) values (p_org, p_client)
    on conflict (org_id) do nothing;
    select a.org_id into v_org from public.abonnements a where a.stripe_customer_id = p_client;
  end if;
  if v_org is null then
    return 'org_inconnue';
  end if;

  select * into v_abo from public.abonnements a where a.org_id = v_org for update;
  if v_abo.dernier_evenement_le is not null and p_evenement_le < v_abo.dernier_evenement_le then
    return 'ancien';
  end if;
  if v_abo.stripe_subscription_id is not null
     and v_abo.stripe_subscription_id <> p_abonnement
     and v_abo.statut not in ('canceled', 'incomplete_expired') then
    return 'autre_abonnement';
  end if;

  update public.abonnements set
    stripe_subscription_id = p_abonnement,
    plan = coalesce(p_plan, plan),
    periodicite = coalesce(p_periodicite, periodicite),
    statut = p_statut,
    periode_fin = p_periode_fin,
    annule_en_fin_de_periode = coalesce(p_annule, false),
    dernier_evenement_le = p_evenement_le
  where org_id = v_org
  returning plan into v_plan_paye;

  select o.plan into v_plan_actuel from public.organisations o where o.id = v_org;
  if v_plan_actuel <> 'enterprise' then
    if p_statut in ('active', 'trialing', 'past_due') and v_plan_paye is not null then
      update public.organisations set plan = v_plan_paye::text::public.plan_org where id = v_org;
    elsif p_statut in ('canceled', 'unpaid', 'paused') and v_plan_actuel in ('starter', 'pro') then
      -- Lecture seule : plan « essai » dont la fin est passée. Les données restent consultables et exportables.
      update public.organisations set plan = 'essai', essai_fin = least(essai_fin, now()) where id = v_org;
    end if;
  end if;
  return 'applique';
end
$$;

-- Seule la clé de service les appelle : on retire l'exécution à tous les autres rôles.
revoke all on function public.stripe_lier_client(uuid, text) from public, anon, authenticated;
revoke all on function public.stripe_appliquer_abonnement(
  text, text, timestamptz, text, text, uuid, public.plan_choisi, text, public.statut_abonnement, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.stripe_lier_client(uuid, text) to service_role;
grant execute on function public.stripe_appliquer_abonnement(
  text, text, timestamptz, text, text, uuid, public.plan_choisi, text, public.statut_abonnement, timestamptz, boolean
) to service_role;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;
