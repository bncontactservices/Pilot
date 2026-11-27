-- =============================================================================
-- Pilot M&E - Migration : plus de localités préchargées, c'est l'organisation qui renseigne les siennes
-- Le Lot 3d avait chargé un référentiel de la plateforme (org_id nul) : la commune de Yoff, sa hiérarchie administrative
-- et les sept quartiers de son village traditionnel (12 lignes), puis rattaché le projet exemple à cette commune. Ce
-- n'est plus voulu : chaque organisation crée elle-même ses localités et choisit les zones de ses projets.
--
--   1. Les saisies d'indicateur et les réalisations rattachées à une localité du référentiel perdent ce rattachement
--      (la localité n'existe plus) ; leurs valeurs, dates et textes ne changent pas.
--   2. Les zones d'intervention qui désignaient le référentiel sont retirées.
--   3. Une localité d'une organisation qui était rangée sous une ligne du référentiel devient une racine : elle
--      garde son nom, son niveau, ses coordonnées et sa source.
--   4. Les lignes du référentiel sont supprimées (au moment de cette migration, il ne contenait que Yoff).
--   5. Le projet exemple n'est plus rattaché d'office à une commune : le déclencheur et les deux fonctions du Lot 3d
--      qui le faisaient sont supprimés. Un projet exemple déjà chargé perd sa zone (étape 2).
-- Le mécanisme du référentiel (org_id nul, lecture seule pour le client, écrit par la plateforme seule) reste en place,
-- sans aucune ligne : seules les données partent. Le réglage pilot.chargement_exemple lève, le temps de la transaction,
-- la protection « projet exemple en lecture seule » pour les projets exemple concernés.
-- Rejouable : sans ligne de référentiel, il ne reste rien à faire.
-- =============================================================================

do $$
begin
  perform set_config('pilot.chargement_exemple', 'on', true);

  update public.kpi_entries
  set localite_id = null
  where localite_id in (select id from public.localites where org_id is null);

  update public.realisations
  set localite_id = null
  where localite_id in (select id from public.localites where org_id is null);

  delete from public.projet_localites
  where localite_id in (select id from public.localites where org_id is null);

  update public.localites
  set parent_id = null
  where org_id is not null and parent_id in (select id from public.localites where org_id is null);

  -- Une seule instruction : les parents et leurs enfants partent ensemble (la clé étrangère est contrôlée en fin d'instruction).
  delete from public.localites where org_id is null;
end
$$;

drop trigger if exists t96_contenu_exemple_lot3d on public.projects;
drop function if exists private.charger_contenu_exemple_lot3d_trigger();
drop function if exists private.charger_contenu_exemple_lot3d(uuid);
