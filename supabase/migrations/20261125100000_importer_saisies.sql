-- Import de saisies par lots (Lot 1b).
--
-- Pourquoi une fonction : l'« upsert » de PostgREST réécrit toutes les colonnes de la ligne,
-- y compris kpi_id, que les clients n'ont pas le droit de modifier (droits par colonne). Cette
-- fonction fait le même travail avec `on conflict … do update set valeur, commentaire` — les
-- seules colonnes modifiables — en une transaction par lot.
--
-- SECURITY INVOKER : tout s'exécute avec les droits de l'appelant. La sécurité par ligne
-- (réservée à admin et éditeur), la fin d'essai, la protection du projet exemple, les quotas et
-- l'historique d'audit s'appliquent donc exactement comme pour une saisie manuelle.
--
-- Erreurs métier : IMPORT_INVALIDE (charge utile mal formée), IMPORT_LOT_TROP_GRAND (> 500 lignes).

create function public.importer_saisies(p_lignes jsonb, p_remplacer boolean default false)
returns table (inserees integer, remplacees integer, ignorees integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_distinctes integer;
  v_inserees integer;
  v_remplacees integer;
begin
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
    raise exception 'IMPORT_INVALIDE' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_lignes) > 500 then
    raise exception 'IMPORT_LOT_TROP_GRAND' using errcode = 'P0001';
  end if;

  begin
    -- Un même (indicateur, date) répété dans le lot : la première occurrence l'emporte.
    if p_remplacer then
      with source as (
        select distinct on (l.kpi_id, l.date) l.kpi_id, l.date, l.valeur, l.commentaire
        from (
          select (e.v ->> 'kpi_id')::uuid as kpi_id,
                 (e.v ->> 'date')::date as date,
                 (e.v ->> 'valeur')::numeric as valeur,
                 nullif(e.v ->> 'commentaire', '') as commentaire,
                 e.n
          from jsonb_array_elements(p_lignes) with ordinality as e (v, n)
        ) l
        order by l.kpi_id, l.date, l.n
      ),
      ecrites as (
        insert into public.kpi_entries (kpi_id, date, valeur, commentaire)
        select s.kpi_id, s.date, s.valeur, s.commentaire from source s
        on conflict (kpi_id, date) do update
          set valeur = excluded.valeur, commentaire = excluded.commentaire
        returning (xmax = 0) as nouvelle
      )
      select (select count(*) from source),
             count(*) filter (where nouvelle),
             count(*) filter (where not nouvelle)
      into v_distinctes, v_inserees, v_remplacees
      from ecrites;
    else
      with source as (
        select distinct on (l.kpi_id, l.date) l.kpi_id, l.date, l.valeur, l.commentaire
        from (
          select (e.v ->> 'kpi_id')::uuid as kpi_id,
                 (e.v ->> 'date')::date as date,
                 (e.v ->> 'valeur')::numeric as valeur,
                 nullif(e.v ->> 'commentaire', '') as commentaire,
                 e.n
          from jsonb_array_elements(p_lignes) with ordinality as e (v, n)
        ) l
        order by l.kpi_id, l.date, l.n
      ),
      ecrites as (
        insert into public.kpi_entries (kpi_id, date, valeur, commentaire)
        select s.kpi_id, s.date, s.valeur, s.commentaire from source s
        on conflict (kpi_id, date) do nothing
        returning 1
      )
      select (select count(*) from source), count(*), 0
      into v_distinctes, v_inserees, v_remplacees
      from ecrites;
    end if;
  exception
    when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
      or numeric_value_out_of_range or not_null_violation then
      raise exception 'IMPORT_INVALIDE' using errcode = 'P0001';
  end;

  return query select v_inserees, v_remplacees, v_distinctes - v_inserees - v_remplacees;
end
$$;

revoke execute on function public.importer_saisies(jsonb, boolean) from public, anon;
grant execute on function public.importer_saisies(jsonb, boolean) to authenticated, service_role;
