-- Temps réel : le tableau de bord s'abonne aux saisies filtrées par organisation (org_id).
-- Avec l'identité de réplication par défaut, un événement de suppression ne porte que la clé
-- primaire : le filtre sur org_id ne le retiendrait pas, et une saisie supprimée depuis un autre
-- appareil ne rafraîchirait pas le tableau de bord. « full » ajoute toutes les colonnes de la ligne.
alter table public.kpi_entries replica identity full;
