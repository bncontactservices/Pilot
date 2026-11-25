-- =============================================================================
-- Pilot M&E — Migration Lot 3b : composantes et planning
-- Une composante est un axe du projet (un groupe de résultats ou de travaux) : elle a ses dates, son statut et ses
-- activités du plan de travail. Le planning se lit en diagramme de Gantt.
--
-- Vocabulaire du brief : phase (macro-période) ≠ composante (axe thématique) ≠ étape ou jalon (livrable daté) ≠
-- prochaine étape (action de court terme). Les phases et les étapes existent déjà ; la composante est nouvelle.
--
-- Mêmes règles que les lots précédents : RLS (lecture par les membres, écriture par admin et éditeur),
-- org_id dérivé du projet et immuable, droits par colonne, ESSAI_EXPIRE après la fin d'essai.
--
-- Choix :
--   - Les dates d'une composante vont par paire (les deux ou aucune) : une composante sans dates est « à planifier »
--     et n'apparaît pas sur le diagramme.
--   - Une activité du plan de travail appartient à au plus une composante (pta_activites.composante_id) ; supprimer
--     la composante détache ses activités sans les supprimer.
--   - Le statut est saisi (même énumération que les activités) ; « en retard » se calcule (date de fin passée, ni
--     terminée ni annulée), comme pour les prochaines étapes.
--
-- Projet exemple : il reçoit quatre composantes fictives, dont les dates et le statut se déduisent de ses activités,
-- et ses activités leur sont rattachées. Les projets exemples déjà chargés reçoivent le même contenu.
-- =============================================================================

create table public.composantes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 160),
  description text check (char_length(description) <= 1000),
  responsable text check (char_length(responsable) <= 120),
  date_debut date,
  date_fin date,
  statut public.statut_travail not null default 'a_faire',
  ordre integer not null default 0 check (ordre between 0 and 10000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint composantes_dates_ensemble check ((date_debut is null) = (date_fin is null)),
  constraint composantes_dates_coherentes check (date_fin is null or date_fin >= date_debut)
);
create unique index composantes_nom_idx on public.composantes (project_id, lower(nom));
create index composantes_org_id_idx on public.composantes (org_id);

alter table public.pta_activites
  add column composante_id uuid references public.composantes (id) on delete set null;
create index pta_composante_id_idx on public.pta_activites (composante_id);

-- Triggers --------------------------------------------------------------------------------------------------
create trigger t10_org_id before insert on public.composantes
  for each row execute function private.renseigner_org_depuis_projet();
create trigger t11_created_by before insert on public.composantes
  for each row execute function private.renseigner_created_by();
create trigger t20_essai before insert or update or delete on public.composantes
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.composantes
  for each row execute function private.maj_updated_at();

-- L'activité et sa composante appartiennent au même projet.
create trigger t14_composante before insert or update of composante_id on public.pta_activites
  for each row execute function private.verifier_parent_meme_projet('composantes', 'composante_id');

-- Droits ------------------------------------------------------------------------------------------------------
revoke all on public.composantes from anon, authenticated;
grant select, delete on public.composantes to authenticated;
grant insert (project_id, nom, description, responsable, date_debut, date_fin, statut, ordre)
  on public.composantes to authenticated;
grant update (nom, description, responsable, date_debut, date_fin, statut, ordre)
  on public.composantes to authenticated;
grant insert (composante_id), update (composante_id) on public.pta_activites to authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- RLS ---------------------------------------------------------------------------------------------------------
alter table public.composantes enable row level security;

create policy "composantes : lecture par les membres" on public.composantes
  for select to authenticated using (private.is_org_member(org_id));
create policy "composantes : création par admin et éditeur" on public.composantes
  for insert to authenticated with check (private.peut_editer(org_id));
create policy "composantes : modification par admin et éditeur" on public.composantes
  for update to authenticated using (private.peut_editer(org_id)) with check (private.peut_editer(org_id));
create policy "composantes : suppression par admin et éditeur" on public.composantes
  for delete to authenticated using (private.peut_editer(org_id));

-- Contenu du projet exemple (données fictives) ----------------------------------------------------------------

-- Quatre composantes qui reprennent les axes du cadre logique de l'exemple. Les dates (activités les plus tôt et
-- les plus tard, marge de deux semaines) et le statut se déduisent des activités rattachées : terminée si toutes le
-- sont, en cours si l'une l'est ou l'a été, reportée si toutes le sont, à faire sinon.
create function private.charger_contenu_exemple_lot3b(p_projet uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.projects p where p.id = p_projet and p.is_demo)
     or exists (select 1 from public.composantes c where c.project_id = p_projet) then
    return;
  end if;

  with def (ordre, nom, description, responsable, intitules) as (
    values
      (1, 'Accès à l''eau potable',
        'Diagnostic, réhabilitation des forages et formation des artisans qui les entretiennent.',
        'Ingénieur hydraulicien',
        array['Diagnostic des forages en panne', 'Réhabilitation des forages — lot 1',
              'Réhabilitation des forages — lot 2', 'Formation des artisans réparateurs']),
      (2, 'Gouvernance des points d''eau',
        'Comités de gestion des points d''eau : mise en place, règles et comptes.',
        'Animateur social',
        array['Mise en place des comités de gestion']),
      (3, 'Hygiène et assainissement',
        'Sensibilisation des ménages et appui à la construction de latrines.',
        'Chargé d''infrastructures',
        array['Séances de sensibilisation à l''hygiène', 'Appui à la construction des latrines']),
      (4, 'Suivi-évaluation et capitalisation',
        'Enquêtes auprès des usagers et capitalisation des acquis du projet.',
        'Responsable S&E',
        array['Enquête de satisfaction des usagers', 'Atelier de capitalisation des acquis'])
  ),
  creees as (
    insert into public.composantes (project_id, nom, description, responsable, date_debut, date_fin, statut, ordre)
    select p_projet, d.nom, d.description, d.responsable, a.debut - 14, a.fin + 14,
           case
             when a.nb = a.nb_terminees then 'termine'::public.statut_travail
             when a.nb_en_cours > 0 or a.nb_terminees > 0 then 'en_cours'
             when a.nb = a.nb_reportees then 'reporte'
             else 'a_faire'
           end,
           d.ordre
    from def d
    cross join lateral (
      select min(t.date_debut) as debut, max(t.date_fin) as fin, count(*) as nb,
             count(*) filter (where t.statut = 'termine') as nb_terminees,
             count(*) filter (where t.statut = 'en_cours') as nb_en_cours,
             count(*) filter (where t.statut = 'reporte') as nb_reportees
      from public.pta_activites t
      where t.project_id = p_projet and t.intitule = any (d.intitules) and t.date_debut is not null
    ) a
    where a.nb > 0
    returning id, nom
  )
  update public.pta_activites t
  set composante_id = c.id
  from creees c
  join def d on d.nom = c.nom
  where t.project_id = p_projet and t.intitule = any (d.intitules);
end
$$;

create function private.charger_contenu_exemple_lot3b_trigger()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.charger_contenu_exemple_lot3b(new.id);
  return null;
end
$$;

-- Les activités de l'exemple sont créées après le projet, dans la même transaction (charger_projet_exemple) :
-- le déclencheur est différé jusqu'à la fin de la transaction, quand tout le contenu existe.
create constraint trigger t96_contenu_exemple_lot3b after insert on public.projects
  deferrable initially deferred
  for each row when (new.is_demo) execute function private.charger_contenu_exemple_lot3b_trigger();

-- Les projets exemples déjà chargés reçoivent le même contenu.
do $$
declare
  v_projet uuid;
begin
  for v_projet in select p.id from public.projects p where p.is_demo loop
    perform private.charger_contenu_exemple_lot3b(v_projet);
  end loop;
end
$$;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;
