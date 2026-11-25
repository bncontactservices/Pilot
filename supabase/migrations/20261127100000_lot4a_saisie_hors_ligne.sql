-- Lot 4a : saisie hors ligne.
--
-- Une saisie faite sans réseau attend sur l'appareil, puis part au retour de la connexion. Sur une connexion instable,
-- une requête peut aboutir sans que la réponse revienne : l'appareil croit l'envoi raté et le rejoue. Pour que ce
-- rejeu ne soit jamais pris pour un conflit avec la valeur d'un autre, la saisie porte un identifiant tiré sur
-- l'appareil au moment de la saisie : le rejeu retrouve sa propre ligne (même identifiant) au lieu d'un doublon.
--
-- Seule la colonne `id` s'ouvre à l'insertion. L'organisation et l'auteur restent posés par la base (déclencheurs),
-- et l'identifiant ne se modifie jamais (aucun droit de mise à jour sur `id`).

grant insert (id) on public.kpi_entries to authenticated;
