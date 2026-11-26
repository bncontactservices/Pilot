-- =============================================================================
-- Pilot M&E — Migration Lot 4b (suite) : le planificateur des rapports par e-mail
-- Toutes les heures, à la cinquième minute, pg_cron appelle l'Edge Function `rapports-programmes` (par pg_net) avec le jeton
-- de private.rapports_config. La fonction réserve les envois dus, les envoie, et marque le résultat. Sans abonné dû, elle ne
-- fait rien ; tant que Resend n'est pas configuré (RESEND_API_KEY, EMAIL_FROM, APP_URL), elle répond « non configuré » sans
-- rien réserver : les échéances restent dues.
--
-- pg_cron et pg_net existent sur Supabase mais pas sur le Postgres embarqué des tests locaux : tout est conditionnel, la
-- migration ne fait rien là où ces extensions manquent.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net with schema extensions;
    -- Un nom de tâche identique remplace l'ancienne : la migration peut être rejouée.
    perform cron.schedule(
      'rapports-programmes',
      '5 * * * *',
      $job$
        select net.http_post(
          url := (select c.valeur from private.rapports_config c where c.cle = 'url'),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Cron-Jeton', (select c.valeur from private.rapports_config c where c.cle = 'jeton')
          ),
          body := '{"action":"cron"}'::jsonb,
          timeout_milliseconds := 60000
        )
      $job$
    );
  end if;
end
$$;
