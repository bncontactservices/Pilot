-- =============================================================================
-- Pilot M&E — Migration Lot 4b : rapport de suivi par e-mail, programmé
-- Chaque membre choisit de recevoir, chaque semaine ou chaque mois, un e-mail récapitulatif de l'avancement de son organisation.
--
-- Choix (DECISIONS.md, sections 24 et 29) :
--   - **Par choix, jamais d'office** : chaque membre s'abonne lui-même (une ligne par membre) et peut se désabonner à tout moment.
--     Aucune adresse n'est saisie : le destinataire est l'adresse du compte (profiles.email). Pas d'adresse externe.
--   - Le désabonnement n'est jamais bloqué par la fin d'essai : retirer son consentement doit toujours être possible, donc
--     cette table n'a pas le déclencheur de lecture seule des autres.
--   - Le client n'écrit que la fréquence. L'organisation, le compte, la prochaine date d'envoi, le dernier envoi et les
--     échecs sont posés par la base.
--   - **Dates d'envoi** : lundi 07:00 UTC (hebdomadaire) ou le 1er du mois 07:00 UTC (mensuel). UTC est l'heure de Dakar.
--     À l'abonnement, le premier envoi est à la prochaine échéance (pas d'envoi immédiat ; l'écran offre « recevoir un exemple »).
--   - **Fonctions réservées à la clé de service** (retirées à anon et authenticated) : réserver les envois dus, marquer le
--     résultat, lire le contenu du rapport, vérifier le jeton du planificateur. Réserver est exclusif (`for update skip locked`)
--     et repousse l'échéance d'une heure : deux passages simultanés n'envoient pas deux fois, et un passage interrompu est repris.
--   - Une organisation en lecture seule (essai terminé) ne reçoit rien ; ses abonnements sont conservés.
--   - Le contenu reprend les vues d'avancement (aucun calcul de plus) ; il exclut le projet exemple et les projets terminés
--     ou clôturés.
-- Le planificateur (pg_cron et pg_net) est dans la migration suivante : il n'existe pas sur le Postgres embarqué des tests.
-- =============================================================================

create type public.frequence_rapport as enum ('hebdomadaire', 'mensuelle');

create table public.rapports_abonnes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  frequence public.frequence_rapport not null,
  prochain_envoi_le timestamptz not null,
  dernier_envoi_le timestamptz,
  echecs smallint not null default 0 check (echecs >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rapports_abonnes_echeance_idx on public.rapports_abonnes (prochain_envoi_le);
create index rapports_abonnes_org_idx on public.rapports_abonnes (org_id);

-- Configuration du planificateur (adresse de la fonction, jeton) : aucun accès client, aucune politique.
create table private.rapports_config (
  cle text primary key,
  valeur text not null
);
insert into private.rapports_config (cle, valeur) values
  ('url', 'https://rdhjfdfbtopkgamaifda.supabase.co/functions/v1/rapports-programmes'),
  ('jeton', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
alter table private.rapports_config enable row level security;
revoke all on private.rapports_config from anon, authenticated;

-- Prochaine échéance strictement après p_apres : lundi 07:00 UTC, ou le 1er du mois 07:00 UTC.
create function private.prochain_rapport(p_frequence public.frequence_rapport, p_apres timestamptz)
returns timestamptz language plpgsql immutable set search_path = ''
as $$
declare
  v_local timestamp := p_apres at time zone 'UTC';
  v_candidat timestamp;
begin
  if p_frequence = 'hebdomadaire' then
    v_candidat := date_trunc('week', v_local) + interval '7 hours';
    if v_candidat <= v_local then v_candidat := v_candidat + interval '7 days'; end if;
  else
    v_candidat := date_trunc('month', v_local) + interval '7 hours';
    if v_candidat <= v_local then v_candidat := v_candidat + interval '1 month'; end if;
  end if;
  return v_candidat at time zone 'UTC';
end
$$;

-- Le compte et l'organisation viennent de la session, jamais du client ; l'échéance vient de la fréquence.
create function private.rapports_preparer()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Une session de membre : tout vient de la base. Sans session (clé de service, administration), les valeurs données sont gardées.
    if (select auth.uid()) is not null then
      new.user_id := (select auth.uid());
      select m.org_id into new.org_id from public.memberships m where m.user_id = new.user_id;
      if new.org_id is null then
        raise exception 'ACCES_REFUSE' using errcode = '42501';
      end if;
      new.prochain_envoi_le := private.prochain_rapport(new.frequence, now());
      new.dernier_envoi_le := null;
      new.echecs := 0;
    end if;
  elsif new.frequence is distinct from old.frequence then
    new.prochain_envoi_le := private.prochain_rapport(new.frequence, now());
    new.echecs := 0;
  end if;
  return new;
end
$$;

create trigger t10_preparer before insert or update on public.rapports_abonnes
  for each row execute function private.rapports_preparer();
create trigger t90_updated_at before update on public.rapports_abonnes
  for each row execute function private.maj_updated_at();

-- Droits : chacun lit, crée, modifie (la fréquence seulement) et supprime sa propre ligne. -------------------------
revoke all on public.rapports_abonnes from anon, authenticated;
grant select (user_id, org_id, frequence, prochain_envoi_le, dernier_envoi_le, created_at) on public.rapports_abonnes to authenticated;
grant insert (frequence) on public.rapports_abonnes to authenticated;
grant update (frequence) on public.rapports_abonnes to authenticated;
grant delete on public.rapports_abonnes to authenticated;
grant select, insert, update, delete on public.rapports_abonnes to service_role;

alter table public.rapports_abonnes enable row level security;
create policy "rapports : lecture de sa ligne" on public.rapports_abonnes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "rapports : abonnement de son compte" on public.rapports_abonnes
  for insert to authenticated with check (user_id = (select auth.uid()) and private.is_org_member(org_id));
create policy "rapports : modification de sa ligne" on public.rapports_abonnes
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "rapports : désabonnement" on public.rapports_abonnes
  for delete to authenticated using (user_id = (select auth.uid()));

-- Fonctions réservées aux Edge Functions ----------------------------------------------------------------------

-- Réserve les envois dus (au plus p_limite) : renvoie qui, et repousse l'échéance d'une heure, le temps d'envoyer.
create function public.rapports_reserver(p_limite integer default 50)
returns table (user_id uuid, org_id uuid, email text, nom text, org_nom text, frequence public.frequence_rapport)
language sql security definer set search_path = ''
as $$
  with dus as (
    select r.user_id
    from public.rapports_abonnes r
    join public.organisations o on o.id = r.org_id
    join public.profiles p on p.id = r.user_id
    where r.prochain_envoi_le <= now()
      and p.email is not null
      -- Une organisation en lecture seule (essai terminé) ne reçoit rien.
      and (o.plan <> 'essai' or o.essai_fin > now())
    order by r.prochain_envoi_le
    limit greatest(1, least(coalesce(p_limite, 50), 200))
    for update of r skip locked
  ), maj as (
    update public.rapports_abonnes r
    set prochain_envoi_le = now() + interval '1 hour'
    from dus
    where r.user_id = dus.user_id
    returning r.user_id, r.org_id, r.frequence
  )
  select m.user_id, m.org_id, p.email, p.nom, o.nom as org_nom, m.frequence
  from maj m
  join public.profiles p on p.id = m.user_id
  join public.organisations o on o.id = m.org_id
$$;

-- Enregistre le résultat d'un envoi : réussi, la prochaine échéance régulière ; raté, nouvel essai dans une heure, et à la
-- cinquième défaillance on attend l'échéance régulière.
create function public.rapports_marquer(p_user uuid, p_envoye boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.rapports_abonnes r
  set
    dernier_envoi_le = case when p_envoye then now() else r.dernier_envoi_le end,
    echecs = case when p_envoye then 0 else r.echecs + 1 end,
    prochain_envoi_le = case
      when p_envoye or r.echecs + 1 >= 5 then private.prochain_rapport(r.frequence, now())
      else now() + interval '1 hour'
    end
  where r.user_id = p_user
$$;

-- Le contenu du rapport d'une organisation, tel que le donnent les vues d'avancement.
create function public.rapports_contenu(p_org uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'organisation', (select jsonb_build_object('nom', o.nom, 'devise', o.devise_defaut) from public.organisations o where o.id = p_org),
    'seuils', (select jsonb_build_object('vert', coalesce(s.seuil_vert, 90), 'ambre', coalesce(s.seuil_ambre, 60))
               from (select 1) x left join public.parametres_se s on s.org_id = p_org),
    'programmes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'nom', g.nom, 'nb_projets', a.nb_projets,
        'taux_resultats', round(a.taux_resultats, 1), 'taux_physique', round(a.taux_physique, 1),
        'taux_financier', round(a.taux_financier, 1), 'nb_projets_depassement', a.nb_projets_depassement
      ) order by g.nom)
      from public.programmes g
      join public.v_avancement_programme a on a.programme_id = g.id
      where g.org_id = p_org
    ), '[]'::jsonb),
    'projets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nom', p.nom, 'statut', p.statut, 'programme_id', p.programme_id, 'date_fin', p.date_fin,
        'statut_resultats', a.statut_resultats,
        'taux_resultats', round(a.taux_resultats, 1), 'taux_physique', round(a.taux_physique, 1),
        'taux_financier', round(a.taux_financier, 1), 'nb_etapes_en_retard', a.nb_etapes_en_retard,
        'nb_kpis', a.nb_kpis, 'nb_kpis_avec_donnees', a.nb_kpis_avec_donnees
      ) order by p.nom)
      from public.projects p
      join public.v_avancement a on a.project_id = p.id
      where p.org_id = p_org and not p.is_demo and p.statut in ('non_demarre', 'en_cours', 'en_retard', 'suspendu')
    ), '[]'::jsonb)
  )
$$;

-- Le planificateur prouve son identité par un jeton que seule la clé de service sait vérifier.
create function public.rapports_verifier_jeton(p_jeton text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(p_jeton, '') <> '' and exists (select 1 from private.rapports_config c where c.cle = 'jeton' and c.valeur = p_jeton)
$$;

revoke all on function public.rapports_reserver(integer) from public, anon, authenticated;
revoke all on function public.rapports_marquer(uuid, boolean) from public, anon, authenticated;
revoke all on function public.rapports_contenu(uuid) from public, anon, authenticated;
revoke all on function public.rapports_verifier_jeton(text) from public, anon, authenticated;
grant execute on function public.rapports_reserver(integer) to service_role;
grant execute on function public.rapports_marquer(uuid, boolean) to service_role;
grant execute on function public.rapports_contenu(uuid) to service_role;
grant execute on function public.rapports_verifier_jeton(text) to service_role;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;
