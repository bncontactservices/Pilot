-- =============================================================================
-- Droits du rôle service_role
-- Sur les projets Supabase récents, les tables créées dans public ne reçoivent par défaut
-- aucun privilège de lecture ni d'écriture pour service_role (seulement truncate, references,
-- trigger et maintain). Les Edge Functions (invite-member, submit-lead) en ont besoin :
-- on les accorde explicitement. service_role contourne la RLS ; anon et authenticated
-- ne sont pas concernés.
-- =============================================================================

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
