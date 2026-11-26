-- =============================================================================
-- Pilot M&E - Migration : plus de tiret long (U+2014) dans le texte du projet exemple
-- L'application affiche désormais un tiret simple (« - ») partout où elle utilisait un tiret long. Le projet exemple est écrit
-- par des fonctions SQL (charger_projet_exemple et les fonctions de contenu par lot) : leur texte est réécrit ici, et les
-- lignes d'un projet exemple déjà chargé sont corrigées de la même façon.
--
--   1. Fonctions : chaque fonction de public ou de private dont la définition contient un tiret long est recréée à
--      l'identique, avec un tiret simple (droits, propriétaire et paramètres conservés par CREATE OR REPLACE). Les noms
--      d'activités cités par une fonction pour en retrouver une autre (composantes, lot 3b) changent donc ensemble.
--   2. Lignes : seules celles des projets exemple (is_demo). Le chargement du projet exemple écrit avec le réglage
--      pilot.chargement_exemple, qui lève la protection « projet exemple en lecture seule » le temps de la transaction.
-- Le tiret long est construit à partir de ses octets UTF-8 (et non écrit dans le fichier ni obtenu par chr, qui échoue sur une base
-- SQL_ASCII comme celle des tests locaux). Rejouable : sans tiret long, il ne reste rien à faire.
-- =============================================================================

do $$
declare
  r record;
  tiret constant text := convert_from('\xe28094'::bytea, 'UTF8');
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f' and pg_get_functiondef(p.oid) like '%' || tiret || '%'
    order by p.oid
  loop
    execute replace(pg_get_functiondef(r.oid), tiret, '-');
  end loop;
end
$$;

do $$
declare
  tiret constant text := convert_from('\xe28094'::bytea, 'UTF8');
begin
  perform set_config('pilot.chargement_exemple', 'on', true);

  update public.projects
  set nom = replace(nom, tiret, '-'), description = replace(description, tiret, '-')
  where is_demo and (nom like '%' || tiret || '%' or description like '%' || tiret || '%');

  update public.etapes e
  set nom = replace(e.nom, tiret, '-'), description = replace(e.description, tiret, '-')
  from public.projects p
  where p.id = e.project_id and p.is_demo and (e.nom like '%' || tiret || '%' or e.description like '%' || tiret || '%');

  update public.pta_activites a
  set intitule = replace(a.intitule, tiret, '-'), description = replace(a.description, tiret, '-')
  from public.projects p
  where p.id = a.project_id and p.is_demo and (a.intitule like '%' || tiret || '%' or a.description like '%' || tiret || '%');

  update public.etats_avancement s
  set titre = replace(s.titre, tiret, '-'),
      faits_marquants = replace(s.faits_marquants, tiret, '-'),
      difficultes = replace(s.difficultes, tiret, '-'),
      risques = replace(s.risques, tiret, '-')
  from public.projects p
  where p.id = s.project_id and p.is_demo
    and (s.titre || coalesce(s.faits_marquants, '') || coalesce(s.difficultes, '') || coalesce(s.risques, '')) like '%' || tiret || '%';

  update public.depenses d
  set libelle = replace(d.libelle, tiret, '-')
  from public.projects p
  where p.id = d.project_id and p.is_demo and d.libelle like '%' || tiret || '%';
end
$$;
