-- Fichiers à retirer du stockage après la suppression d'un document (DECISIONS.md §18).
--
-- Problème : supprimer un projet supprime en cascade ses lignes `documents`, mais pas les fichiers du bucket privé
-- « documents ». La base ne peut pas les retirer elle-même : supprimer directement dans storage.objects n'enlève
-- que la ligne de métadonnées, pas le fichier (et Supabase l'interdit). Seule l'API de stockage supprime
-- vraiment.
--
-- Solution : chaque ligne `documents` supprimée, par n'importe quel chemin (document, projet, organisation),
-- inscrit son chemin dans une file privée. L'application retire ensuite les fichiers par l'API de stockage avec les
-- droits de la personne connectée, puis vide la file. Si cela échoue (réseau, onglet fermé), la file garde le
-- chemin et la prochaine session d'un admin ou éditeur de l'organisation recommence : le nettoyage se rattrape tout
-- seul, sans tâche planifiée ni clé de service.
--
-- Les droits d'une organisation dont l'essai est terminé interdisent la suppression de fichiers (politique de
-- stockage) : ses chemins restent en file, invisibles pour les clients, jusqu'à ce qu'elle puisse écrire à nouveau.
-- Les chemins d'une organisation supprimée restent aussi en file : l'équipe d'exploitation les retire depuis le
-- tableau de bord (Storage → documents → dossier de l'organisation) puis vide la file (voir PLACEHOLDERS.md).

create table private.fichiers_a_retirer (
  storage_path text primary key check (char_length(storage_path) <= 500),
  -- Sans clé étrangère : la ligne doit survivre à la suppression de l'organisation.
  org_id uuid not null,
  cree_le timestamptz not null default now()
);
create index fichiers_a_retirer_org_id_idx on private.fichiers_a_retirer (org_id, cree_le);

alter table private.fichiers_a_retirer enable row level security;
revoke all on private.fichiers_a_retirer from public, anon, authenticated;

create function private.mettre_en_file_fichier()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.fichiers_a_retirer (storage_path, org_id)
  values (old.storage_path, old.org_id)
  on conflict (storage_path) do nothing;
  return old;
end
$$;

-- Après suppression : le déclencheur ne s'exécute que si la suppression a abouti (droits, fin d'essai).
create trigger t80_fichier_a_retirer after delete on public.documents
  for each row execute function private.mettre_en_file_fichier();

-- Chemins que la personne connectée peut retirer maintenant : mêmes conditions que la politique de stockage
-- « suppression par admin et éditeur » (rôle admin ou éditeur, organisation autorisée à écrire).
create function public.fichiers_a_retirer()
returns setof text
language sql stable security definer set search_path = ''
as $$
  select f.storage_path
  from private.fichiers_a_retirer f
  where private.peut_editer(f.org_id) and private.org_peut_ecrire(f.org_id)
  order by f.cree_le, f.storage_path
  limit 200
$$;

-- Vide la file des chemins dont le fichier a été retiré. Ne touche que les organisations où la personne est admin
-- ou éditeur ; renvoie le nombre de chemins retirés de la file.
create function public.fichiers_retires(p_chemins text[])
returns integer
language sql security definer set search_path = ''
as $$
  with retires as (
    delete from private.fichiers_a_retirer f
    where f.storage_path = any (coalesce(p_chemins, '{}'::text[])) and private.peut_editer(f.org_id)
    returning 1
  )
  select count(*)::integer from retires
$$;

revoke execute on function public.fichiers_a_retirer() from public, anon;
grant execute on function public.fichiers_a_retirer() to authenticated, service_role;
revoke execute on function public.fichiers_retires(text[]) from public, anon;
grant execute on function public.fichiers_retires(text[]) to authenticated, service_role;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;
