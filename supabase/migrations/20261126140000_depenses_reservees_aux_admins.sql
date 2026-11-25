-- Les dépenses sont réservées aux administrateurs (DECISIONS.md §20).
--
-- Choix de l'utilisateur (« Oui » à la question posée au point de contrôle 3a) : les lignes budgétaires restent
-- gérées par les admins et les éditeurs (c'est de la planification), mais enregistrer, modifier ou supprimer une
-- dépense (de la comptabilité) devient réservé aux administrateurs. Les éditeurs et les lecteurs continuent de
-- lire les dépenses et de télécharger leurs justificatifs. La fin d'essai reste appliquée par le déclencheur
-- t20_essai ; le projet exemple, rempli par une fonction de la base, n'est pas concerné.

drop policy "depenses : création par admin et éditeur" on public.depenses;
drop policy "depenses : modification par admin et éditeur" on public.depenses;
drop policy "depenses : suppression par admin et éditeur" on public.depenses;

create policy "depenses : création par les admins" on public.depenses
  for insert to authenticated with check (private.est_admin(org_id));
create policy "depenses : modification par les admins" on public.depenses
  for update to authenticated using (private.est_admin(org_id)) with check (private.est_admin(org_id));
create policy "depenses : suppression par les admins" on public.depenses
  for delete to authenticated using (private.est_admin(org_id));
