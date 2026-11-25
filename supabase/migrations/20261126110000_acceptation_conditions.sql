-- Acceptation des conditions d'utilisation à l'inscription (pages légales, DECISIONS.md §17-18).
--
-- Pourquoi : le formulaire d'inscription enregistrait la version acceptée et la date dans les métadonnées du
-- compte (auth.users.raw_user_meta_data), que la personne peut modifier elle-même. On les enregistre maintenant
-- dans public.profiles, dans des colonnes que le client ne peut pas écrire :
--   - conditions_version : l'étiquette de la version du texte déclarée par le formulaire (aaaa-mm-jj, voir
--     src/lib/legal.ts), lue dans les métadonnées d'inscription et validée par son format ;
--   - conditions_acceptees_le : l'horloge de la base au moment de la création du compte. La date éventuellement
--     envoyée par le client est ignorée.
-- Les deux colonnes sont renseignées ensemble ou pas du tout. Les comptes créés sans version (avant ce
-- changement, ou hors formulaire : script d'administration, tableau de bord) gardent NULL, ce qui permet de les
-- repérer ; la base ne refuse pas pour autant leur création.
--
-- Ce que cela prouve, et ne prouve pas : un compte créé en appelant directement l'API d'authentification peut
-- déclarer une version sans que la case ait été cochée à l'écran ; la base horodate l'inscription, elle ne voit
-- pas la case.

alter table public.profiles
  add column conditions_version text
    constraint profiles_conditions_version_format check (conditions_version ~ '^\d{4}-\d{2}-\d{2}$'),
  add column conditions_acceptees_le timestamptz,
  add constraint profiles_acceptation_complete
    check ((conditions_version is null) = (conditions_acceptees_le is null));

comment on column public.profiles.conditions_version is
  'Version des conditions d''utilisation déclarée à l''inscription (aaaa-mm-jj). Colonne non modifiable par le client.';
comment on column public.profiles.conditions_acceptees_le is
  'Horodatage (horloge de la base) de l''inscription avec acceptation des conditions. Colonne non modifiable par le client.';

-- Les droits par colonne de public.profiles (lecture complète ; écriture limitée à nom, telephone et langue)
-- couvrent déjà ces colonnes : aucune autre instruction GRANT n'est nécessaire.

create or replace function private.creer_compte()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_jeton text := v_meta ->> 'invitation';
  v_plan text := v_meta ->> 'plan';
  v_version text := case when (v_meta ->> 'conditions_version') ~ '^\d{4}-\d{2}-\d{2}$'
                         then v_meta ->> 'conditions_version' end;
  v_invitation public.invitations;
  v_org uuid;
begin
  insert into public.profiles (id, nom, email, conditions_version, conditions_acceptees_le)
  values (
    new.id,
    nullif(left(trim(coalesce(v_meta ->> 'nom', '')), 120), ''),
    new.email,
    v_version,
    case when v_version is not null then now() end
  );

  if v_jeton is not null and char_length(v_jeton) between 20 and 200 then
    select i.* into v_invitation
    from public.invitations i
    where i.token_hash = encode(sha256(convert_to(v_jeton, 'UTF8')), 'hex')
      and i.accepted_at is null
      and i.expires_at > now()
      and lower(i.email) = lower(new.email)
    for update;

    if found then
      update public.invitations set accepted_at = now() where id = v_invitation.id;
      insert into public.memberships (user_id, org_id, role)
      values (new.id, v_invitation.org_id, v_invitation.role);
      return new;
    end if;
  end if;

  insert into public.organisations (nom, plan, plan_souhaite, essai_fin)
  values (
    coalesce(nullif(left(trim(coalesce(v_meta ->> 'organisation', '')), 120), ''), 'Mon organisation'),
    'essai',
    case when v_plan in ('starter', 'pro') then v_plan::public.plan_choisi end,
    now() + make_interval(days => private.duree_essai_jours())
  )
  returning id into v_org;

  insert into public.memberships (user_id, org_id, role) values (new.id, v_org, 'admin');
  return new;
end
$$;
