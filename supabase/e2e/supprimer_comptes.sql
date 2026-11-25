-- Supprime tout ce que creer_comptes.sql et le parcours ont créé. Ne touche à aucune autre organisation.
do $$
declare v_org uuid;
begin
  select id into v_org from public.organisations where nom = 'Organisation E2E (test)';
  if v_org is null then raise exception 'organisation de test introuvable'; end if;
  delete from public.organisations where id = v_org;
  -- L'historique d'audit ne suit pas la suppression de l'organisation : on le retire explicitement.
  delete from public.audit_log where org_id = v_org;
  delete from auth.identities where user_id in (select id from auth.users where email like 'e2e-%@exemple.invalid');
  delete from auth.users where email like 'e2e-%@exemple.invalid';
end $$;
