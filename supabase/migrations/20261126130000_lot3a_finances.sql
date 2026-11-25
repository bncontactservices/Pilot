-- =============================================================================
-- Pilot M&E — Migration Lot 3a : finances et budgets
-- Lignes budgétaires par poste et par année, dépenses avec justificatif, taux financier
-- (dépenses / budget) dans les vues d'avancement et dans les états d'avancement.
--
-- Mêmes règles que les Lots 1 et 2 : RLS sur toutes les tables, org_id dérivé du projet et immuable,
-- droits par colonne, écriture refusée après la fin d'essai (ESSAI_EXPIRE), schéma `private`.
--
-- Choix :
--   - Toutes les sommes d'un projet sont dans la devise du projet (projects.devise) : aucune conversion.
--   - Taux financier d'un projet = dépenses / somme des lignes budgétaires, en %, SANS plafond : un
--     dépassement (> 100 %) est une information à voir. Sans ligne budgétaire, le taux est NULL.
--   - Taux financier d'un programme = moyenne simple des taux des projets qui ont un budget, chaque taux
--     plafonné à 100 (comme le taux de résultats) ; nb_projets_depassement compte ceux qui dépassent.
--     Les devises pouvant différer d'un projet à l'autre, on ne somme jamais les montants d'un programme.
--   - Une ligne budgétaire qui a des dépenses ne peut pas être supprimée (23503, traduit par l'application) ;
--     la suppression du projet, elle, emporte tout en cascade.
--   - Le justificatif d'une dépense est un document du même projet ; si le document est supprimé,
--     la dépense reste, sans justificatif.
--
-- Projet exemple : il reçoit un budget et des dépenses fictifs (trigger sur projects), comme les
-- autres contenus d'exemple ; les projets exemples déjà chargés les reçoivent à l'application.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.budget_lignes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  -- Même convention que le plan de travail : l'année où l'exercice commence.
  annee smallint not null check (annee between 2000 and 2100),
  poste text not null check (char_length(poste) between 1 and 160),
  montant_prevu numeric(16, 2) not null check (montant_prevu >= 0),
  notes text check (char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index budget_lignes_poste_annee_idx on public.budget_lignes (project_id, annee, lower(poste));
create index budget_lignes_org_id_idx on public.budget_lignes (org_id);

create table public.depenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  -- Pas de « on delete » : NO ACTION refuse la suppression d'une ligne qui a des dépenses, mais laisse
  -- la suppression du projet (qui supprime lignes et dépenses dans la même instruction) aboutir.
  budget_ligne_id uuid not null references public.budget_lignes (id),
  date date not null check (date between '2000-01-01' and '2100-12-31'),
  libelle text not null check (char_length(libelle) between 1 and 200),
  montant numeric(16, 2) not null check (montant > 0),
  fournisseur text check (char_length(fournisseur) <= 160),
  -- Numéro de facture, de bon ou de pièce.
  reference text check (char_length(reference) <= 80),
  document_id uuid references public.documents (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index depenses_project_id_idx on public.depenses (project_id);
create index depenses_org_id_idx on public.depenses (org_id);
create index depenses_budget_ligne_id_idx on public.depenses (budget_ligne_id);
create index depenses_document_id_idx on public.depenses (document_id);

-- Taux financier figé à la rédaction d'un état d'avancement, comme les deux autres taux.
alter table public.etats_avancement add column taux_financier numeric(7, 2);

-- -----------------------------------------------------------------------------
-- Vues d'avancement : ajout du taux financier (colonnes ajoutées à la fin)
-- -----------------------------------------------------------------------------

create or replace view public.v_avancement with (security_invoker = true) as
select
  p.id as project_id,
  p.org_id,
  p.programme_id,
  r.nb_kpis,
  r.nb_kpis_avec_donnees,
  r.taux_resultats,
  f.fraction_ecoulee,
  case
    when r.taux_resultats is null then 'none'
    when r.taux_resultats / d.diviseur >= coalesce(s.seuil_vert, 90) then 'ok'
    when r.taux_resultats / d.diviseur >= coalesce(s.seuil_ambre, 60) then 'warn'
    else 'alert'
  end as statut_resultats,
  a.nb_activites,
  a.nb_activites_realisees,
  a.taux_physique,
  e.nb_etapes,
  e.nb_etapes_terminees,
  e.nb_etapes_en_retard,
  fin.budget_total,
  fin.depenses_total,
  case when fin.budget_total > 0 then coalesce(fin.depenses_total, 0) / fin.budget_total * 100 end as taux_financier
from public.projects p
left join public.parametres_se s on s.org_id = p.org_id
cross join lateral (
  select
    count(*) as nb_kpis,
    count(*) filter (where x.valeur is not null and x.pct_atteinte is not null) as nb_kpis_avec_donnees,
    avg(least(100::numeric, x.pct_atteinte)) filter (where x.valeur is not null and x.pct_atteinte is not null) as taux_resultats
  from public.v_kpi_atteinte x
  where x.project_id = p.id
) r
cross join lateral (
  select case
    when p.date_fin <= p.date_debut then null
    else least(1::numeric, greatest(0::numeric, (current_date - p.date_debut)::numeric / (p.date_fin - p.date_debut)))
  end as fraction_ecoulee
) f
cross join lateral (
  select case when f.fraction_ecoulee > 0 then f.fraction_ecoulee else 1::numeric end as diviseur
) d
cross join lateral (
  select
    count(*) filter (where t.statut <> 'annule') as nb_activites,
    count(*) filter (where t.statut = 'termine') as nb_activites_realisees,
    avg(t.pct_realisation) filter (where t.statut <> 'annule') as taux_physique
  from public.pta_activites t
  where t.project_id = p.id
) a
cross join lateral (
  select
    count(*) filter (where g.statut <> 'annule') as nb_etapes,
    count(*) filter (where g.statut = 'termine') as nb_etapes_terminees,
    count(*) filter (where g.statut not in ('termine', 'annule') and g.date_prevue < current_date) as nb_etapes_en_retard
  from public.etapes g
  where g.project_id = p.id
) e
cross join lateral (
  select
    (select sum(b.montant_prevu) from public.budget_lignes b where b.project_id = p.id) as budget_total,
    (select sum(x.montant) from public.depenses x where x.project_id = p.id) as depenses_total
) fin;

create or replace view public.v_avancement_programme with (security_invoker = true) as
select
  g.id as programme_id,
  g.org_id,
  count(a.project_id) as nb_projets,
  count(a.taux_resultats) as nb_projets_avec_resultats,
  avg(a.taux_resultats) as taux_resultats,
  count(a.taux_physique) as nb_projets_avec_pta,
  avg(a.taux_physique) as taux_physique,
  count(a.taux_financier) as nb_projets_avec_budget,
  -- least() ignore NULL : sans le filtre, un projet sans budget compterait pour 100 %.
  avg(least(100::numeric, a.taux_financier)) filter (where a.taux_financier is not null) as taux_financier,
  count(*) filter (where a.taux_financier > 100) as nb_projets_depassement
from public.programmes g
left join public.v_avancement a on a.programme_id = g.id
group by g.id, g.org_id;

-- -----------------------------------------------------------------------------
-- Fonctions de trigger
-- -----------------------------------------------------------------------------

-- Les trois taux sont figés à la rédaction d'un état d'avancement (le client ne les fournit pas).
create or replace function private.figer_taux_etat()
returns trigger language plpgsql set search_path = ''
as $$
begin
  select round(a.taux_resultats, 2), round(a.taux_physique, 2), round(a.taux_financier, 2)
  into new.taux_resultats, new.taux_physique, new.taux_financier
  from public.v_avancement a
  where a.project_id = new.project_id;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

-- budget_lignes
create trigger t10_org_id before insert on public.budget_lignes
  for each row execute function private.renseigner_org_depuis_projet();
create trigger t11_created_by before insert on public.budget_lignes
  for each row execute function private.renseigner_created_by();
create trigger t20_essai before insert or update or delete on public.budget_lignes
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.budget_lignes
  for each row execute function private.maj_updated_at();

-- depenses : la ligne budgétaire et le justificatif appartiennent au même projet
create trigger t10_org_id before insert on public.depenses
  for each row execute function private.renseigner_org_depuis_projet();
create trigger t11_created_by before insert on public.depenses
  for each row execute function private.renseigner_created_by();
create trigger t12_ligne before insert or update of budget_ligne_id on public.depenses
  for each row execute function private.verifier_parent_meme_projet('budget_lignes', 'budget_ligne_id');
create trigger t13_justificatif before insert or update of document_id on public.depenses
  for each row execute function private.verifier_parent_meme_projet('documents', 'document_id');
create trigger t20_essai before insert or update or delete on public.depenses
  for each row execute function private.verifier_ecriture_essai();
create trigger t90_updated_at before update on public.depenses
  for each row execute function private.maj_updated_at();

-- -----------------------------------------------------------------------------
-- Droits (colonne par colonne)
-- -----------------------------------------------------------------------------

revoke all on public.budget_lignes, public.depenses from anon, authenticated;

grant select, delete on public.budget_lignes to authenticated;
grant insert (project_id, annee, poste, montant_prevu, notes) on public.budget_lignes to authenticated;
grant update (annee, poste, montant_prevu, notes) on public.budget_lignes to authenticated;

grant select, delete on public.depenses to authenticated;
grant insert (project_id, budget_ligne_id, date, libelle, montant, fournisseur, reference, document_id)
  on public.depenses to authenticated;
grant update (budget_ligne_id, date, libelle, montant, fournisseur, reference, document_id)
  on public.depenses to authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security : lecture par les membres, écriture par admin et éditeur
-- -----------------------------------------------------------------------------

alter table public.budget_lignes enable row level security;
alter table public.depenses enable row level security;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['budget_lignes', 'depenses'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.is_org_member(org_id))',
      v_table || ' : lecture par les membres', v_table);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.peut_editer(org_id))',
      v_table || ' : création par admin et éditeur', v_table);
    execute format('create policy %I on public.%I for update to authenticated using (private.peut_editer(org_id)) with check (private.peut_editer(org_id))',
      v_table || ' : modification par admin et éditeur', v_table);
    execute format('create policy %I on public.%I for delete to authenticated using (private.peut_editer(org_id))',
      v_table || ' : suppression par admin et éditeur', v_table);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Contenu du projet exemple (données fictives)
-- -----------------------------------------------------------------------------

-- Budget de 250 000 000 FCFA (celui du projet exemple) sur trois exercices, et une dizaine de dépenses
-- étalées sur les douze derniers mois. Les montants par exercice sont assez larges pour qu'aucun poste ne
-- dépasse son budget quelle que soit la date du jour, sauf « Pilotage et suivi-évaluation » : une dépense
-- récente le fait dépasser, pour montrer l'alerte de dépassement.
create function private.charger_contenu_exemple_lot3a(p_projet uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_debut date;
  v_annee integer := extract(year from current_date)::integer;
begin
  select p.date_debut into v_debut from public.projects p where p.id = p_projet and p.is_demo;
  if v_debut is null or exists (select 1 from public.budget_lignes b where b.project_id = p_projet) then
    return;
  end if;

  insert into public.budget_lignes (project_id, annee, poste, montant_prevu)
  select p_projet, a.annee, l.poste, l.montants[a.rang]::numeric
  from (values (v_annee - 1, 1), (v_annee, 2), (v_annee + 1, 3)) as a(annee, rang)
  cross join (values
    ('Réhabilitation des forages', array[32000000, 32000000, 32000000]),
    ('Latrines familiales', array[24000000, 24000000, 24000000]),
    ('Sensibilisation à l''hygiène', array[9000000, 9000000, 9000000]),
    ('Pilotage et suivi-évaluation', array[7000000, 7000000, 7000000]),
    ('Fonctionnement', array[11000000, 11000000, 12000000])
  ) as l(poste, montants);

  insert into public.depenses (project_id, budget_ligne_id, date, libelle, montant, fournisseur, reference)
  select p_projet, b.id, d.jour, d.libelle, d.montant, d.fournisseur, d.reference
  from (
    select (v_debut + make_interval(months => x.k))::date + 13 as jour,
           x.poste, x.libelle, x.montant, x.fournisseur, x.reference
    from (values
      (1, 'Réhabilitation des forages', 'Pompes et tuyauterie — lot 1', 9000000, 'Sahel Hydraulique (fictif)', 'FAC-001'),
      (3, 'Réhabilitation des forages', 'Travaux de réhabilitation de six forages', 8000000, 'Entreprise Forage Plus (fictive)', 'FAC-002'),
      (6, 'Réhabilitation des forages', 'Pompes et tuyauterie — lot 2', 6500000, 'Sahel Hydraulique (fictif)', 'FAC-003'),
      (2, 'Latrines familiales', 'Dalles de latrines — première livraison', 5000000, 'Dalles du Fleuve (fictif)', 'FAC-004'),
      (5, 'Latrines familiales', 'Main-d''œuvre : maçons des villages', 4200000, null, 'ETAT-005'),
      (8, 'Latrines familiales', 'Dalles de latrines — seconde livraison', 5500000, 'Dalles du Fleuve (fictif)', 'FAC-006'),
      (2, 'Sensibilisation à l''hygiène', 'Formation des relais communautaires', 1600000, 'Centre de formation (fictif)', 'FAC-007'),
      (6, 'Sensibilisation à l''hygiène', 'Séances de sensibilisation du trimestre', 1900000, null, 'ETAT-008'),
      (9, 'Sensibilisation à l''hygiène', 'Séances de sensibilisation du trimestre', 2000000, null, 'ETAT-009'),
      (1, 'Pilotage et suivi-évaluation', 'Enquête de base auprès des ménages', 2000000, 'Cabinet d''enquête (fictif)', 'FAC-010'),
      (5, 'Pilotage et suivi-évaluation', 'Enquête trimestrielle', 1800000, 'Cabinet d''enquête (fictif)', 'FAC-011'),
      (0, 'Fonctionnement', 'Loyer et charges de l''antenne locale', 2400000, null, 'QUIT-012'),
      (4, 'Fonctionnement', 'Loyer et charges de l''antenne locale', 2400000, null, 'QUIT-013'),
      (8, 'Fonctionnement', 'Loyer et charges de l''antenne locale', 2400000, null, 'QUIT-014')
    ) as x(k, poste, libelle, montant, fournisseur, reference)
  ) d
  join public.budget_lignes b
    on b.project_id = p_projet and b.poste = d.poste and b.annee = extract(year from d.jour)::integer;

  -- Dépense récente qui fait dépasser le budget de « Pilotage et suivi-évaluation » de son exercice.
  insert into public.depenses (project_id, budget_ligne_id, date, libelle, montant, fournisseur, reference)
  select p_projet, b.id, current_date - 15, 'Évaluation à mi-parcours', 7400000, 'Cabinet d''évaluation (fictif)', 'FAC-015'
  from public.budget_lignes b
  where b.project_id = p_projet
    and b.poste = 'Pilotage et suivi-évaluation'
    and b.annee = extract(year from current_date - 15)::integer;
end
$$;

create function private.charger_contenu_exemple_lot3a_trigger()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.charger_contenu_exemple_lot3a(new.id);
  return null;
end
$$;

-- Le projet exemple est créé par charger_projet_exemple() : son contenu financier suit sans toucher à cette fonction.
create trigger t95_contenu_exemple_lot3a after insert on public.projects
  for each row when (new.is_demo) execute function private.charger_contenu_exemple_lot3a_trigger();

-- Les projets exemples déjà chargés reçoivent le même contenu.
do $$
declare
  v_projet uuid;
begin
  for v_projet in select p.id from public.projects p where p.is_demo loop
    perform private.charger_contenu_exemple_lot3a(v_projet);
  end loop;
end
$$;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;
