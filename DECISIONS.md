# Décisions

Format : décision, raison, alternative écartée. Les sections 1 et 2 viennent du brief v3 (section 3.1) et des réponses de démarrage ; la section 3 liste les choix faits pendant la construction du Lot 0.

## 1. Réponses aux questions de démarrage

| Question | Réponse |
|---|---|
| Identité | Pilot M&E, baseline « Pilotez vos projets avec des données fiables, en temps réel. » Nom du fondateur : non fourni (placeholder, voir `PLACEHOLDERS.md`) |
| Direction esthétique | Preset A, « Clarté Institutionnelle » |
| Offres et devise | Offres par défaut en USD avec équivalent FCFA indicatif (taux dans `src/lib/constants.ts`) |
| Éléments de preuve | À fournir avant la landing et le deck ; aucun chiffre non mesuré n’est affiché |

## 2. Décisions arrêtées du brief (3.1)

| Sujet | Décision | Alternative écartée |
|---|---|---|
| Essai | 14 jours, sans carte, limites du plan Pro | Limites Starter : impossible de tester l’équipe et les rôles |
| Fin d’essai | Lecture seule, erreur `ESSAI_EXPIRE` | Blocage complet : données inaccessibles |
| Organisations | Une seule par utilisateur (`unique(user_id)`) | Multi-organisation : demande un sélecteur et complexifie la RLS |
| Styles | Tailwind CSS v4 | Tailwind v3.4 |
| Routage | React Router v7 en mode framework, `ssr: false`, pré-rendu de `/`, `/mentions-legales`, `/confidentialite` | Mode bibliothèque : pas de pré-rendu natif |
| Calcul des KPI | TypeScript uniquement au Lot 1 | Double calcul TypeScript + SQL |
| E-mails | Fournisseur dédié (Resend par défaut) | SMTP par défaut de Supabase |

## 3. Décisions du Lot 0

**Versions.** React Router **7.18** : le brief impose la v7, alors qu’une v8 existe à la date du scaffold (migration à étudier après le MVP). TypeScript **6.0.3**, pas 7 : le plugin React Router 7.18 n’accepte que `^5.1 || ^6`. Vite 8, Vitest 5, Zod 4, Node 24 LTS (`engines` dans `package.json`).

**Composants d’interface écrits à la main.** Le dossier `src/components/ui` suit le modèle de shadcn/ui (primitives `radix-ui`, `class-variance-authority`, tokens du preset) sans passer par la CLI `shadcn`, dont l’initialisation interactive aurait réécrit `index.css` et imposé son propre thème. Les composants s’ajoutent au besoin, un par un.

**Tokens.** `--accent` (aplats) et `--accent-ink` (texte) sont distincts ; les statuts KPI ont leurs propres tokens `--status-*` (section 5 du brief). Le token « accent » de shadcn/ui, qui sert au survol des menus, s’appelle ici `--subtle` pour ne pas le confondre avec l’accent de marque. Dans l’app, l’accent n’est jamais une couleur de statut.

**Bordure des champs.** `--input` vaut `#8a929b` (≥ 3:1 sur blanc, WCAG 1.4.11) au lieu d’une bordure pâle.

**Bruit et motifs de la landing.** Non appliqués dans l’app (brief 6.1) ; ils arrivent avec la landing au Lot 1.

**Polices auto-hébergées.** `@fontsource` : Plus Jakarta Sans 400 à 800, IBM Plex Mono 400 à 600, Cormorant Garamond italique 500 et 600 uniquement (usage dramatique). La police du titre (800) est préchargée.

**Landing provisoire.** `/` n’est qu’une page d’accueil minimale (promesse, essai, connexion) : la landing complète (sections A à I) est au Lot 1. Elle ne présente que ce qui existe.

**Découpage des routes.** Les routes qui dépendent de la session (connexion, inscription, réinitialisation, `/app`) sont sous `SessionLayout`, qui monte React Query et le contexte d’authentification. La landing et les pages légales ne chargent ni `supabase-js` ni React Query (vérifié dans le build : aucun `createClient` dans les scripts de `/`).

**Client Supabase.** Créé à la demande (`getSupabase()`), jamais pendant le pré-rendu. Sans variables d’environnement, l’application s’affiche et indique clairement que Supabase n’est pas configuré, au lieu de planter.

**Tests SQL sans Docker.** Docker n’est pas installé sur le poste de développement. `npm run db:test:local` applique les migrations sur un Postgres 17 embarqué (`embedded-postgres`) avec une imitation minimale du socle Supabase (`scripts/db-test/supabase-stub.sql`) et exécute les tests pgTAP. **Limite assumée :** ce n’est pas Supabase. `supabase test db` reste la référence et doit passer avant le Point de contrôle 1.

**Modèle de données (écarts avec le brief v3).**
- `memberships.user_id` référence `profiles(id)` et non `auth.users(id)`, pour permettre à l’API de joindre le profil d’un membre en une requête. `profiles.id` référence déjà `auth.users`.
- `profiles.email` copie l’adresse de connexion (maintenue par trigger) : l’Edge Function d’invitation en a besoin et `auth.users` n’est pas lisible côté client.
- Le contrôle de fin d’essai ne s’applique qu’aux clients (`anon`, `authenticated`) ; les quotas de plan et la protection du projet exemple s’appliquent à tous, clé service comprise (l’Edge Function d’invitation s’appuie sur le quota d’utilisateurs de la base).
- Le chargement du projet exemple désactive l’audit pour ne pas encombrer l’historique ; la durée de l’essai est une constante SQL (`private.duree_essai_jours()`), à garder égale à `DUREE_ESSAI_JOURS`.

**Invitations.** Le jeton n’est jamais stocké en clair (SHA-256). L’inscription n’accepte une invitation que si l’adresse e-mail correspond à celle invitée. Le lien est toujours renvoyé à l’admin, même sans fournisseur d’e-mails.

**Mots de passe.** 8 caractères minimum avec lettres et chiffres, côté formulaire et dans `supabase/config.toml` (`letters_digits`). Confirmation d’e-mail obligatoire (`enable_confirmations = true`).

**Redirection après connexion.** Seuls les chemins internes de l’application sont acceptés (`destinationSure`, testé) : pas de redirection ouverte.

**Script `start` supprimé.** Il n’avait jamais été vérifié ; on développe avec `npm run dev` et on déploie sur Vercel.

## 4. Projet Supabase réel (24 novembre 2026)

**Projet.** « Pilot M&E », référence `rdhjfdfbtopkgamaifda`, organisation BPrestations, Postgres 17.12. Le front s’y relie par `VITE_SUPABASE_URL` et la clé publique (« publishable ») dans `.env.local`, ignoré par git. La clé `sb_publishable_…` est préférée à la clé anon JWT historique.

**Région : Irlande (eu-west-1), pas Paris ni Francfort.** Le brief demandait Paris ou Francfort pour la latence depuis Dakar ; la région a été choisie à la création du projet. Elle reste dans l’Union européenne ; la latence supplémentaire n’a pas été mesurée. En changer impose de recréer le projet et de réappliquer la migration.

**Migration appliquée par le MCP Supabase** (version distante `20261124100755`, nom `lot0_lot1`), contenu identique au fichier local. La procédure d’alignement de l’historique est dans le README.

**Tests rejoués sur le vrai Supabase.** Les trois fichiers pgTAP ont été exécutés en SQL, avec trois adaptations : pas de `begin`/`rollback` explicites, chaque résultat d’assertion rangé dans une table `tests.sortie`, et une exception finale qui annule toute la transaction en rapportant le total. Résultat : 60/60, 29/29 et 31/31. Contrôle après coup : aucun utilisateur, organisation, schéma `tests` ni extension `pgtap` ne subsiste.

**Conseils de sécurité Supabase (advisors).**
- `leads` sans politique : voulu (aucun accès client, écriture par Edge Function).
- `invitation_apercu` exécutable par `anon` : voulu (page d’inscription par invitation) ; il ne renvoie que le nom de l’organisation et un e-mail masqué, pour un jeton valide.
- `charger_projet_exemple` exécutable par `authenticated` : voulu ; refuse les lecteurs, les anonymes et les organisations en lecture seule (testé).
- `rls_auto_enable` : fonction de la plateforme (déclencheur d’événement qui active la RLS sur les nouvelles tables), non créée par ce projet et laissée telle quelle.

**Authentification hébergée.** Les inscriptions sont ouvertes et la confirmation d’e-mail est active. Le fichier `supabase/config.toml` ne s’applique qu’en local : la longueur minimale du mot de passe et les URL de redirection du projet distant se règlent dans le tableau de bord. Le formulaire impose déjà 8 caractères avec lettres et chiffres.

**Limite de la vérification.** Le rôle interne d’Auth (`supabase_auth_admin`) ne peut pas être endossé depuis le MCP : le trigger d’inscription a été testé avec des insertions faites par le rôle administrateur, pas encore par une vraie inscription.

**Edge Function `invite-member` déployée** (version 1, 24 novembre 2026) par le MCP Supabase, avec `verify_jwt` désactivé. Raison : la fonction authentifie elle-même l’appelant (`auth.getUser` sur son jeton, puis contrôle du rôle admin, de l’essai et du quota) ; la vérification de la passerelle dépend du type de clé de signature du projet et bloquerait la requête CORS préalable, qui n’a pas d’en-tête `Authorization`. `config.toml` porte le même réglage pour les futurs déploiements par la CLI. Alternative écartée : laisser `verify_jwt` actif, avec le risque de refus selon la clé de signature.

**Durcissement avant déploiement.** L’adresse d’origine envoyée par le navigateur ne sert qu’à construire le lien montré à l’administrateur. Un e-mail n’est envoyé que si `APP_URL` est configurée, pour qu’aucun appelant ne puisse imposer le domaine du lien dans un e-mail envoyé depuis l’expéditeur du produit.

**Vérifié :** appel sans jeton (401), jeton invalide (401), mauvaise méthode (405), et la requête CORS préalable depuis `localhost:5173`. **Non vérifié :** le cas nominal, qui demande un administrateur connecté.

## 5. Défaut trouvé à l’usage : l’invitation échouait (24 novembre 2026)

**Symptôme.** Sur la page Équipe, « Inviter » échouait. Les journaux de la fonction montraient des réponses 403 : la fonction `invite-member` concluait à un refus de droits.

**Cause.** Sur ce projet Supabase, les tables créées par une migration ne donnent à `service_role` (la clé service, utilisée par les Edge Functions) que `truncate`, `references`, `trigger` et `maintain` : aucune lecture ni écriture. La fonction n’arrivait donc pas à lire le membre, et confondait cette panne avec « pas administrateur ». Mes tests ne l’avaient pas vu pour deux raisons : ils s’exécutaient avec le rôle administrateur de la base, et l’imitation locale de Supabase accordait tout par défaut, ce qui masquait le problème.

**Correctifs.**
- Migration `20261124120000_droits_service_role.sql` : droits de lecture et d’écriture accordés explicitement à `service_role`, y compris par défaut pour les futures tables. Appliquée sur le projet.
- La fonction journalise désormais les erreurs de base et répond 500 au lieu de 403 (version 2 déployée).
- L’imitation locale de Supabase reproduit maintenant les droits par défaut relevés sur le vrai projet.
- Nouveau test `04_service_role.test.sql` (14 assertions) : il échoue avec « permission denied for table memberships » sans la migration, et passe avec. Il vérifie aussi que `anon` et `authenticated` n’ont ni `truncate`, ni `references`, ni `trigger` sur les tables. Au total, 134 assertions.

**Sécurité, par effet de bord.** Les droits par défaut donnaient aussi `truncate` à `anon` et `authenticated`, ce qui permettrait de vider une table en contournant la RLS. La première migration les retirait déjà (`revoke all`) ; le nouveau test le garantit désormais.

**Vérifié sur le vrai projet :** `service_role` lit et écrit sur les 10 tables ; aucun privilège dangereux pour les rôles clients ; l’insertion d’une invitation par la clé service sur l’organisation réelle fonctionne (annulée ensuite). **Non vérifié :** l’appel complet depuis la page Équipe, qui demande votre session.

## 6. Point ouvert : statuts du projet exemple (24 novembre 2026)

En préparant la présentation, j’ai recalculé à la main les pourcentages d’atteinte du projet exemple avec les formules du brief (6.4) : les 8 indicateurs tombent **sous 60 %, donc tous « en retard »**, alors que le commentaire de la migration annonce « 2 en avance, 3 en vigilance, 2 en retard, 1 sans saisie récente ». Cause : le projet dure 24 mois et en est à mi-parcours, alors que les seuils 90/60 comparent la valeur à la cible **de fin de projet**.

À trancher au Lot 1, quand `src/lib/kpi.ts` existera : soit appliquer les seuils à l’avancement **par rapport à la trajectoire** attendue à la date du jour (le brief prévoit déjà cet écart), soit recaler les dates et les valeurs du projet exemple. En attendant, aucun écran ni aucune présentation n’affirme ces statuts. Le commentaire de la migration est donc inexact sur ce point ; il sera corrigé avec la décision.

## 7. E-mail d’invitation depuis la page Équipe (24 novembre 2026)

**Demande.** Envoyer l’invitation par e-mail en plus du lien à copier.

**Fait.** La fonction `invite-member` (version 3) envoie l’e-mail par Resend quand `APP_URL`, `RESEND_API_KEY` et `EMAIL_FROM` sont configurés, et renvoie un statut (`envoye`, `non_configure`, `echec`) que la page affiche clairement. Le lien reste toujours disponible. Les invitations en attente ont un bouton « Renvoyer » : l’ancien lien est invalidé et un nouveau est créé.

**Pas encore actif.** Aucun secret n’est posé : l’envoi réel demande un compte Resend, un domaine vérifié et les trois secrets (voir le README). L’appel de Resend n’a donc jamais été exécuté.

**Alternative écartée : l’invitation intégrée de Supabase Auth** (`inviteUserByEmail`). Elle crée le compte dès l’invitation, ce qui ferait compter la personne dans le quota et la ferait apparaître comme membre avant qu’elle ait accepté, et son service d’e-mails par défaut n’écrit qu’aux membres de l’organisation Supabase.

## 8. Statuts des indicateurs : écart à la trajectoire (24 novembre 2026)

**Décision** (elle tranche le point ouvert de la section 6). Le pourcentage d’atteinte affiché reste celui du brief (valeur actuelle par rapport à la **cible de fin de projet**). La **couleur de statut** compare, elle, l’avancement à la **trajectoire** attendue à la date du jour : ratio = pourcentage d’atteinte ÷ pourcentage de la trajectoire écoulé, avec les seuils 90 / 60 du brief. Un ratio ≥ 90 % est vert, entre 60 % et 90 % ambre, sous 60 % rouge. Sans trajectoire calculable (date du jour avant le début du projet, ou durée nulle), on retombe sur le pourcentage d’atteinte seul.

**Raison.** Le brief définit « rouge » comme « en retard ». Comparer à la cible finale rendrait tous les indicateurs rouges à mi-parcours, ce qui est trompeur. Le brief demande déjà l’écart à la trajectoire ; on s’en sert pour la couleur. Le projet exemple, conçu avec cette lecture, donne bien 2 verts, 3 ambres, 2 rouges et 1 indicateur à saisie en retard (calcul à la main, à confirmer par les tests de `kpi.ts`).

**Alternative écartée :** appliquer les seuils à la cible finale et recaler le projet exemple en fin de parcours.

## 9. Lot 1a : indicateurs, saisie, tableau de bord (24 novembre 2026)

**Périmètre.** Page d’un projet à trois onglets (Tableau de bord, Indicateurs, Saisie), cartes d’indicateurs, graphique d’évolution, jauge segmentée sur la liste des projets, temps réel. L’export PDF et l’import (onglets Rapports et Import du brief) arrivent avec le Lot 1b : aucun onglet mort n’est affiché. L’onglet « Équipe » du brief n’est pas dupliqué dans le projet : la page Équipe est celle de l’organisation.

**Remplacer une saisie sans `upsert`.** Les droits de colonne n’autorisent la modification que de `date`, `valeur` et `commentaire`. Un `upsert` écrirait aussi `kpi_id`, ce que la base refuse. Le remplacement fait donc un `update` explicite, après confirmation (« Une valeur existe déjà à cette date : la remplacer ? »).

**Lecture page par page.** PostgREST plafonne chaque réponse à 1 000 lignes : les saisies sont lues par pages triées (date, identifiant), sans quoi un projet chargé afficherait des calculs faux sans erreur.

**Temps réel.** Abonnement aux changements de `kpi_entries` filtrés par organisation, avec regroupement des rafales en un seul rafraîchissement (300 ms). Migration `20261124130000_realtime_replica_identity.sql` : `replica identity full`, pour que la suppression d’une saisie sur un autre appareil soit aussi diffusée (sans elle, l’événement ne porte que la clé primaire et le filtre l’écarte).

**Graphique.** Recharts, chargé à la demande : environ 116 Ko compressés dans un fichier à part, téléchargé seulement à l’ouverture du tableau de bord. La courbe réelle, la cible (tirets verts) et la trajectoire attendue (pointillés gris) sont tracées ; les couleurs sont écrites en clair car les attributs SVG ne résolvent pas `var(--…)`. Une description textuelle et le tableau des dernières saisies servent d’alternative aux lecteurs d’écran.

**Période du tableau de bord.** « Depuis le début », 12, 6 ou 3 derniers mois, ou dates libres. Le statut est évalué à la fin de la période (ou aujourd’hui si elle est plus récente) ; la valeur d’un cumul va toujours du début du projet à la fin de la période.

**Saisie.** Date future refusée. Pour un cumul, une date antérieure au début du projet est acceptée mais signalée comme non comptée. Une valeur aberrante déclenche une alerte confirmable ; une valeur déjà saisie à la même date propose le remplacement. La saisie apparaît tout de suite (mise à jour optimiste) et disparaît si la base la refuse ; deux nouvelles tentatives sont faites seulement en cas de coupure réseau.

**Indicateurs.** « Tableau éditable » du brief réalisé comme une liste réordonnable (glisser-déposer et clavier) avec un panneau latéral de création et de modification ; l’édition directe dans les cellules n’est pas faite. Le projet exemple autorise le réordonnancement et l’épinglage, pas la création, la modification ni la suppression, comme la base.

**Non vérifié.** Aucun de ces écrans n’a été exercé dans le navigateur avec une session réelle (cela demande un compte de test dans votre projet Supabase, que je n’ai pas créé sans votre accord). Vérifié : calculs (50 tests, dont le projet exemple), cartes d’indicateurs (5 tests), types, lint, build, compilation de chaque écran dans le serveur de développement.

## 10. Lot 1b : import CSV/Excel et export PDF (24 novembre 2026)

**Périmètre.** Onglets **Import** et **Rapports** de la page d’un projet, bouton « Exporter en PDF » du tableau de bord, et téléversement du logo de l’organisation dans les Paramètres (il en faut un pour que le PDF affiche « le logo de l’organisation » demandé par le brief).

### Import

**Une fonction SQL plutôt qu’un `upsert`.** Même contrainte qu’à la saisie (section 9) : les droits par colonne interdisent à un client de réécrire `kpi_id`, ce que ferait l’`upsert` de PostgREST. La migration `20261125100000_importer_saisies.sql` ajoute `importer_saisies(lignes jsonb, remplacer boolean)` : une transaction par lot de 500 lignes au plus, `on conflict (kpi_id, date) do update set valeur, commentaire` (ou `do nothing` en mode « ignorer »), et un compte des lignes insérées, remplacées et ignorées. Elle est en **`security invoker`** : la sécurité par ligne (admin et éditeur seulement), la fin d’essai, l’historique d’audit s’appliquent comme pour une saisie manuelle. Refusée à l’anonyme. 25 assertions pgTAP.

**Le projet exemple accepte l’import**, comme la saisie manuelle : la base ne fige que ses indicateurs.

**Format du fichier.** Une ligne par saisie : indicateur, date, valeur, commentaire facultatif. Sans colonne d’indicateur, on choisit l’indicateur concerné (cas du fichier d’un seul indicateur). **Non pris en charge :** le format « large » (une colonne par indicateur) ; à ajouter si les pilotes le demandent.

**Lecture.** CSV en UTF-8 ou Windows-1252 (Excel en français), séparateur deviné (`;`, `,`, tabulation, `|`) ; Excel `.xlsx`/`.xls` via SheetJS **0.20.3**, installé depuis `cdn.sheetjs.com` comme l’exige le brief (c’est la dernière version publiée sur ce CDN à ce jour ; le paquet npm `xlsx` est abandonné). Une cellule au format date devient `aaaa-mm-jj` à partir de son numéro de série, sans passer par un objet `Date` (pas de décalage de fuseau). Les formules ne sont pas exécutées : on lit la valeur calculée. La lecture se fait **dans un Web Worker** (128 Ko compressés, chargés au dépôt du fichier). Limites : 10 Mo, 20 000 lignes, 60 colonnes.

**Règles de validation** (testées, 78 tests pour la validation et la lecture des fichiers) :
- les dates `jj/mm/aaaa` sont lues **jour d’abord** (`03/12/2026` = 3 décembre) ; l’année sur 2 chiffres est refusée ; entre 2000 et 2100 ;
- **date dans le futur refusée**, comme à la saisie manuelle : une inversion jour/mois en produit souvent une, et la ligne apparaît alors dans le rapport d’erreurs ;
- nombres avec virgule ou point décimal, espaces et espaces insécables, séparateurs de milliers, `%`, notation `1E+05`. **Une virgule ou un point isolé est un séparateur décimal** (`1,234` vaut 1,234) ; valeur absolue < 10¹² ;
- l’indicateur est reconnu sans tenir compte des accents, de la casse ni de la ponctuation ; refusé s’il est inconnu ou si deux indicateurs du projet portent le même nom ;
- **même indicateur et même date deux fois dans le fichier : la première ligne est retenue**, les suivantes sont rejetées et renvoient à la première ;
- date déjà saisie en base : au choix **ignorer** (par défaut, rien n’est écrasé sans accord) ou **remplacer** la valeur et le commentaire ;
- le rapport d’erreurs (CSV `;` avec BOM, ouvert directement par Excel) donne le numéro de ligne du fichier, la colonne, la valeur lue et le problème ; les cellules qu’un tableur lirait comme des formules (`=`, `+`, `-`, `@`) sont neutralisées.

**Atomicité.** Chaque lot de 500 lignes est atomique, **pas l’import entier** : si le réseau coupe au troisième lot, les deux premiers sont enregistrés. L’écran le dit (« l’import s’est arrêté après N lignes ») et indique de relancer en mode « ignorer » pour reprendre sans doublon.

**Modèle téléchargeable** : un CSV avec les en-têtes attendus et une ligne d’exemple (relue sans erreur par l’import, test à l’appui).

### Export PDF

**Contenu.** Page 1 : logo (ou nom de l’organisation), titre, période, jauge segmentée et progression globale, tableau des indicateurs (valeur, cible, atteint, statut en toutes lettres). Ensuite, une carte par indicateur : chiffres, écart à la trajectoire, action suggérée si vigilance ou retard, graphique, derniers commentaires de la période (3 au plus). Pied de page : produit, projet, numéro de page. « Projet exemple » est mentionné pour le projet exemple. Nom de fichier : `Nom-du-projet_début_fin.pdf`.

**Une seule source de calcul.** Le PDF réutilise `evaluerProjet`, `serieEvolution` et `valeurAttendue` de `kpi.ts` : mêmes chiffres, mêmes statuts que l’écran (un test le vérifie). La période est celle du tableau de bord ; sur « depuis le début », le graphique va jusqu’à la fin prévue du projet, comme à l’écran.

**Graphique en vectoriel** avec les primitives SVG de `@react-pdf`, d’après `chart-geometry.ts` (`geometrieGraphique`, `graduationsNettes`, `ticksMois`, 7 nouveaux tests) comme le prévoit le brief ; `ticksMois` y a été déplacé pour être partagé avec le graphique de l’écran.

**Polices.** Les fichiers **WOFF** de `@fontsource` (Plus Jakarta Sans 400/600/700/800, IBM Plex Mono 400/500), servis par Vite : aucun appel à un service de polices. Ces fichiers ne couvrent que les caractères latins : le point « ● » des statuts n’en fait pas partie et s’affichait comme « Ï » ; il est donc dessiné. Les espaces fines insécables produites par `Intl` pour les milliers sont remplacées par des espaces insécables ordinaires. La césure automatique est coupée (elle est conçue pour l’anglais).

**Logo.** Lu dans le bucket privé `logos`, converti en PNG par un canvas (le PDF ne lit ni WebP ni SVG), 480 px au plus. Un logo absent ou illisible ne fait jamais échouer le rapport : le nom de l’organisation s’affiche à la place. Téléversement dans Paramètres, réservé aux admins : PNG, JPEG ou WebP, 1 Mo (limite du bucket), nouveau nom de fichier à chaque envoi, ancien fichier supprimé.

**Disponibilité.** L’export est ouvert à tous les rôles et reste disponible en lecture seule après la fin d’essai (brief 6.2) ; il ne dépend d’aucun droit d’écriture.

**Poids.** `@react-pdf/renderer` n’est chargé qu’au clic : environ 463 Ko compressés, dans un fichier à part. Le JS initial est inchangé (`entry.client` : 66 Ko compressés).

**Génération sur le thread principal.** `@react-pdf` n’est pas conçu pour un worker ; la durée mesurée dans le navigateur de développement est d’environ 3 s pour 2 indicateurs, premier chargement du module compris. Le bouton passe à l’état « Génération du PDF… ». À surveiller sur un projet de 20 indicateurs et plusieurs centaines de saisies.

### Pour le Lot 1c (`vercel.json`)

La politique de sécurité devra autoriser : `worker-src 'self'` (lecture des fichiers), `img-src 'self' data: blob:` (aperçu du logo) et `connect-src` vers le projet Supabase (`https` et `wss`).

### Vérifié et non vérifié

**Vérifié :** les 159 assertions pgTAP (dont 25 pour l’import), 180 tests Vitest, types, lint, build. Le **parcours d’import** est exercé au niveau de l’interface (dépôt d’un fichier, colonnes, vérification, remplacement, lots de 500, interruption, accès par rôle) avec la vraie lecture de fichier et une base simulée. La **génération du PDF** a été faite dans le vrai navigateur (fichier valide, polices chargées) et la mise en page relue à l’œil sur des pages rendues. La **lecture CSV et Excel par le Web Worker** a été exécutée dans le navigateur.

**Non vérifié :** l’écran d’import et l’onglet Rapports avec une **session réelle** et la **vraie base** (l’appel `importer_saisies` n’a été joué que dans les tests SQL), le téléversement du logo vers le bucket réel, et l’aspect visuel de ces écrans (pas de capture, faute de session). Le PDF n’a pas été ouvert dans Acrobat ou un lecteur de téléphone.

## 11. Lot 1c : landing complète, formulaire de contact, sécurité du front (24 novembre 2026)

**Éléments fournis par vous.** Éditeur : « BPrestations » ; e-mail et WhatsApp de contact ; logo laissé à mon choix. Ils sont posés dans `.env.local` (jamais commité) sous `VITE_EDITEUR_NOM`, `VITE_CONTACT_EMAIL` et `VITE_WHATSAPP_NUMBER`, et non dans le code : le même réglage alimente la landing, les mentions légales, la confidentialité et la page des paramètres. Ils sont repris à la construction : **définissez ces trois variables dans Vercel** pour qu'elles existent en ligne.

**Logo.** Je retiens le monogramme déjà dessiné pour le Lot 0 (une jauge segmentée, l'instrument de pilotage, avec son aiguille) : il n'est plus « provisoire ». Une image d'aperçu de partage (`public/images/og.png`, 1200 × 630) est générée par `scripts/og-image.swift` (macOS).

### Sections

Les neuf blocs du brief (A à I), en français, avec les éléments du preset A : navbar pilule, hero, constat, solution, démo, pilotes, tarifs, FAQ, appel final et pied de page.

- **Contenu lisible sans animation ni JavaScript.** La page est pré-rendue complète. GSAP (et ScrollTrigger) se charge après le premier rendu (≈ 45 Ko compressés, jamais dans le JS initial), dans un `gsap.context()` annulé au démontage, seulement si le mouvement est autorisé, et toutes les animations partent de l'état visible (`gsap.from`).
- **Hero sans photo.** Le brief laisse le choix entre un fond sombre et une photo. J'ai pris le fond sombre (dégradés et grille) : aucune photo ne peut passer pour celle d'un client, rien n'est à télécharger, aucune image ne peut casser. `scripts/check-images.mjs` n'a donc pas d'objet : il n'y a pas d'image distante. La maquette est faite de vraies pièces de l'application (badge de statut, sparkline, calculs de `kpi.ts`) et de la courbe SVG de `chart-geometry.ts`.
- **Données de démonstration étiquetées.** Un projet fictif, évalué par `kpi.ts` à une date de référence fixe (la page est pré-rendue : un « aujourd'hui » variable donnerait un HTML différent à chaque construction). L'étiquette « Données de démonstration » est affichée partout où elles apparaissent.
- **Démo.** À défaut de vidéo fournie, le vrai tableau de bord (les cartes `CarteKpi` de l'application) s'anime dans un cadre de navigateur, avec quatre repères cliquables au clavier. Pas de vidéo, donc pas de sous-titres à produire.
- **Solution.** Quatre cartes empilées en CSS (`position: sticky`) sur grand écran, et en flux normal sur mobile ; ScrollTrigger réduit les cartes précédentes au fil du défilement. Écart au brief : pas de « pin » ScrollTrigger, dont les espaceurs cassent facilement la mise en page ; l'effet visuel est le même.
- **Pilotes.** Aucun témoignage : section « Programme pilotes » avec badge « Bientôt » et formulaire (`type_demande = 'pilote'`).
- **Tarifs.** Starter 25 $, Pro 50 $, Enterprise sur devis, annuel −20 % avec le prix mensuel équivalent et le total annuel, équivalent FCFA indicatif arrondi à 50 FCFA, limites lues dans `LIMITES_PLAN` (pas de chiffres saisis à la main). « Commencer » ouvre `/inscription?plan=starter|pro` ; « Parler à l'équipe » présélectionne le type Enterprise du formulaire final. Les prix restent **à valider** (`PLACEHOLDERS.md`).
- **FAQ.** Six questions en accordéon (`aria-expanded`, `aria-controls`), hauteur animée par GSAP. **Deux affirmations du brief sont volontairement absentes** parce qu'elles ne sont pas vraies aujourd'hui : les « sauvegardes quotidiennes » (elles exigent le plan Supabase Pro, voir 11.1 du brief) et la « conformité à la loi n° 2008-12 » (à faire valider par un juriste). Un test vérifie que ces mots n'apparaissent pas dans la FAQ. À réintroduire quand elles seront vraies.
- **Pied de page.** Indicateur d'état **réel** : un `GET /auth/v1/health` après le premier rendu (« En ligne » si le backend répond, « Service perturbé » sinon, rien si le backend n'est pas configuré). Vérifié dans le navigateur : « En ligne ».

### Formulaire de contact et `submit-lead`

- **Fonction déployée** sur votre projet Supabase (verify_jwt désactivé : formulaire public). Contrôles dans l'ordre : méthode et taille (10 Ko) → validation → champ piège → Turnstile (si le secret est posé) → limite de débit → insertion avec la clé service → notification e-mail (si `RESEND_API_KEY`, `EMAIL_FROM` et `CONTACT_EMAIL` sont posés ; sinon l'enregistrement en base suffit).
- **Une seule règle de validation** : `supabase/functions/submit-lead/lead.ts` (sans dépendance) sert à la fois la fonction et le formulaire. Ses bornes sont celles des contraintes de la table `leads`. Le formulaire « client pilote » ne demande que l'organisation et l'e-mail.
- **Adresse IP jamais en clair** : empreinte HMAC-SHA256 stockée. La clé est `IP_HASH_SALT` ; à défaut, la clé service, afin qu'une base sans sel configuré ne contienne jamais d'empreinte devinable (un SHA-256 simple d'une IPv4 se retrouve par force brute).
- **Limite de débit** : 5 demandes par heure et 15 par jour et par adresse (429 au-delà).
- **Champ piège** : une demande qui le remplit reçoit un succès sans rien enregistrer (le robot n'apprend pas qu'il est repéré).
- **Testé pour de vrai** sur la fonction déployée : méthode refusée, JSON illisible, validation, type inconnu, corps trop gros, champ piège (rien enregistré), cinq insertions puis refus 429, empreinte de 64 caractères hexadécimaux. Puis la soumission complète depuis l'interface. **Mes lignes de test ont été supprimées** : la table `leads` est vide.
- **Notification, Turnstile : non exercés** (aucun secret n'est posé). Le code d'envoi est celui d'`invite-member` ; le composant Turnstile et la vérification serveur sont écrits mais jamais lancés.
- **Sans backend configuré**, le formulaire est remplacé par des liens WhatsApp et e-mail plutôt que d'afficher un formulaire qui ne marche pas.

### Mesure d'audience, référencement, sécurité

- **Plausible** : script et file d'attente d'événements injectés dans `<head>` seulement si `VITE_PLAUSIBLE_DOMAIN` est défini. Événements : `Demo CTA Click` (propriété `emplacement` : navbar, hero, contact), `Lead Submit` (propriété `type`), `Signup` (propriété `plan`, à l'inscription réussie). Non vérifié en ligne (pas de domaine déclaré).
- **SEO** : titre, description, Open Graph, `lang="fr"`, pages pré-rendues complètes. **Sans adresse publique, pas de `og:image`, pas de `og:url`, pas de `canonical` ni de sitemap** : ils exigent des adresses absolues. Dès que `VITE_SITE_URL` est défini, la construction les produit (`scripts/generer-sitemap.mjs`, lancé automatiquement après `npm run build`). `robots.txt` interdit `/app` et `/deck`.
- **`vercel.json`** : réécriture vers le repli SPA, en-têtes (CSP, `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`, HSTS), cache long des fichiers à empreinte, `noindex` sur `/app` et `/deck`. Vérifié en local avec `npm run apercu` (qui sert le build avec ces mêmes en-têtes) : cela a révélé une première erreur (voir plus bas).
- **Deux écarts de sécurité à connaître.** (1) `script-src` contient `'unsafe-inline'` : React Router insère des scripts en ligne dans chaque page pré-rendue (contexte de route, flux de données). Un filtrage par empreinte ou par nonce exigerait soit du rendu côté serveur, soit de recalculer les empreintes à chaque construction et de les écrire dans les en-têtes avant le déploiement ; ce n'est pas faisable proprement avec un hébergement statique. Les autres directives restent strictes (`object-src 'none'`, `base-uri`, `form-action`, `frame-ancestors 'none'`). (2) L'adresse du projet Supabase est écrite dans `connect-src` : à changer si le projet change.
- **Erreur trouvée et corrigée par cette vérification** : la CSP bloquait des polices. Vite incorpore en `data:` les très petits fichiers (sous-ensembles cyrillique et grec de `@fontsource`) ; `font-src` autorise donc `data:`, qui reste local au document.
- **Accessibilité** : contrôle automatisé axe-core (WCAG 2 A/AA, 2.1 AA et bonnes pratiques) sur chaque section, sans violation. Il a trouvé : le texte vert de statut (`#1e7a32` du brief) à **4,39:1** sur la pastille posée sur le fond Sable, donc sous 4,5:1 ; `--status-ok-ink` passe à `#1a722d` (4,89:1), dans toute l'application. Il a aussi trouvé un nom accessible du logo qui ne reprenait pas son texte visible (espace manquante entre « Pilot » et « M&E ») et des `aria-label` sur des paragraphes. Les contrastes sur le fond en dégradé du hero, que l'outil ne sait pas calculer, ont été calculés à la main (blanc 85 % sur Bleu Nuit, accent sur Bleu Nuit ≈ 6,3:1).

### Poids

JS initial de la landing : **≈ 198 Ko compressés** (632 Ko bruts mesurés dans le navigateur sur le build), contre une limite de 200 Ko : **la marge est de 2 Ko.** Ni `supabase-js`, ni `react-query`, ni Recharts, ni `@react-pdf`, ni SheetJS n'y figurent (vérifié sur les fichiers réellement chargés). Pistes si une page de plus ou un ajout dépasse : découper `fr.json` (14 Ko compressés, dont la majorité sert à l'application), alléger `tailwind-merge`.

### Vérifié et non vérifié

**Vérifié :** 240 tests Vitest au total (dont 18 sur la landing, 14 sur le formulaire, 16 sur la validation, 8 sur le client d'envoi, 4 sur les tarifs) et 159 assertions pgTAP, types, lint, build, la landing en 1280 px et en 375 px (sans débordement horizontal), le formulaire de bout en bout contre la vraie fonction, les en-têtes de `vercel.json` sur le build, axe-core.

**Non vérifié :** Lighthouse (prévu au Lot 1d avec le parcours de bout en bout), le rendu sur de vrais téléphones et dans Safari, l'image de partage telle qu'affichée par WhatsApp ou LinkedIn (elle exige une adresse publique), Plausible, Turnstile et la notification par e-mail (rien de configuré), et le déploiement sur Vercel lui-même.

## 12. Lot 1d : pitch deck, tests de bout en bout, Lighthouse (24 novembre 2026)

### Pitch deck (`/deck`)

- **Dix diapositives 16:9**, navigation aux flèches, à l'espace, aux pages, au début et à la fin, au balayage tactile, avec boutons visibles et plein écran (touche « f ») ; barre de progression ; l'adresse suit la diapositive (`#4`). La route est en `noindex` (balise, en-tête `X-Robots-Tag` et `robots.txt`).
- **Mise à l'échelle par le `rem`** : la page règle `1 rem = 1/80 de la largeur de la scène`, donc toute la mise en page (écrite en rem pour 1280 × 720) suit l'écran, sans calcul. À l'impression, `1 rem = 16 px` : la diapositive de 80 × 45 rem remplit exactement la page de 13,333 × 7,5 pouces.
- **Mockups réels** : cartes `CarteKpi`, jauge segmentée, badges de statut et courbe SVG de l'application, sur les données de démonstration (étiquetées).
- **Aucune donnée inventée.** Les effectifs de marché (TAM, SAM) ne sont pas affichés : les périmètres sont posés et chaque effectif porte « [chiffre sourcé — à compléter] ». Le revenu récurrent est une arithmétique (10 organisations × 50 $ = 500 $ par mois), marquée « hypothèse » et « aucun client payant à ce jour ». Dans la concurrence, seuls les constats du brief sont notés « Non » ; le reste est « Non évalué ». Équipe et montant demandé sont des emplacements « à compléter ». Tout est listé dans `PLACEHOLDERS.md`.
- **Impression** (vérifiée en générant le PDF avec Chrome, puis en lisant chaque page rendue) : une diapositive par page, 10 pages de 960 × 540 pt, fonds conservés, navigation et barre masquées. À l'événement `beforeprint` (et au passage en média « print »), toutes les chronologies GSAP sont créées puis amenées à leur état final : le test lance l'impression au milieu d'une animation et vérifie qu'aucun élément n'est resté invisible.
- **Trois défauts de l'impression trouvés et corrigés** : une **onzième page blanche**, au format par défaut (les éléments hors du deck, notifications et scripts, changeaient de page nommée : la page nommée `deck` s'applique maintenant au corps de page) ; des **ombres floues rastérisées en rectangles gris** (remplacées par un filet en impression) ; et la structure d'accessibilité du deck (pas de titre de niveau 1, barre de progression hors d'un repère).

### Tests de bout en bout (Playwright, Chrome du poste, aucun téléchargement de navigateur)

Ils visent le **build** servi avec les en-têtes de `vercel.json` (`npm run apercu`), pas le serveur de développement : c'est ce qui sera déployé, avec sa politique de sécurité.

- **Sans compte** (`landing`, `deck`, `accessibilite` : 32 tests, bureau et mobile 375 px) : contenu et console sans erreur ni violation de politique de sécurité, aucun débordement horizontal, ancres, validation du formulaire, bascule des tarifs, FAQ au clavier, indicateur d'état réel, mouvement réduit (GSAP jamais chargé, contenu visible), navigation du deck et balayage tactile, impression PDF, et **axe-core sur la landing, les pages d'authentification, les pages légales et les dix diapositives : aucune violation**.
- **Avec comptes** (`parcours`, `api` : 17 tests), contre le **vrai Supabase**, avec une organisation de test et trois comptes (administrateur, éditeur, lecteur) créés par SQL (l'inscription par l'interface envoie un e-mail de confirmation que le SMTP par défaut refuse pour des adresses fictives). Tout a été **supprimé ensuite** et le retour à l'état initial vérifié table par table (y compris l'historique d'audit, qui ne suit pas la suppression de l'organisation). Modèles réutilisables : `supabase/e2e/`.
  - **Parcours chronométré** : connexion, création du projet, 3 indicateurs, 6 saisies et tableau de bord avec valeurs et statuts : **15 à 20 secondes** (critère : moins de 5 minutes). L'inscription n'en fait pas partie (voir plus bas).
  - **Export PDF** réel (nom `Projet-Période.pdf`, en-tête `%PDF-`), **import CSV** réel (aperçu, vérification ligne par ligne, rapport d'erreurs téléchargé, remplacement, résumé, et tableau de bord mis à jour : 3 + 4 + 9 + 6 = 22).
  - **Limites du plan** : le 4ᵉ projet est refusé par la base et l'interface affiche « Limite de votre plan atteinte » ; le quota d'utilisateurs est annoncé, et une invitation de trop est refusée.
  - **Invitation par lien** : lien affiché, page « Rejoindre Organisation E2E (test) » sans champ de création d'organisation.
  - **Temps réel** : une saisie de l'éditeur apparaît chez l'administrateur sans rechargement (22 → 30).
  - **Rôles** (interface) : le lecteur ne peut rien modifier, l'éditeur saisit et importe mais ne gère ni l'équipe ni les suppressions, l'administrateur voit tout. **Côté API, avec de vraies sessions** : un utilisateur ne lit que son organisation ; un lecteur ne peut rien écrire (403) ; un éditeur ne supprime rien et n'invite pas ; un admin ne peut changer ni `plan`, ni `essai_fin`, ni `plan_souhaite`, ne crée pas de projet `is_demo` et ne lit pas `leads`.
  - **Fin d'essai simulée** (organisation passée en essai terminé) : lecture seule, import désactivé, création de projet impossible, données consultables, **export PDF toujours disponible** ; et la base refuse toute écriture directe avec `ESSAI_EXPIRE` (saisie, import par lots, création de projet).
  - Mobile 375 px (tableau de bord, saisie, import, rapports sans débordement) et mouvement réduit dans l'application.

### Défauts réels que ces tests ont révélés (et corrigés)

1. **L'export PDF était cassé en production.** Le moteur de mise en page de `@react-pdf` charge un module WebAssembly en ligne : la politique de sécurité de `vercel.json` le bloquait (`script-src` sans `'wasm-unsafe-eval'`, `connect-src` sans `data:`). Tout avait marché en développement, sans politique. Corrigé ; le test d'export passe maintenant sous la politique de production. `'wasm-unsafe-eval'` autorise WebAssembly sans autoriser `eval`.
2. **Un envoi du formulaire de contact trop rapide partait en HTML natif** et rechargeait la page avec le nom, l'organisation et l'e-mail **dans l'adresse**. Le bouton d'envoi reste désactivé tant que React n'est pas en place.
3. **Débordements horizontaux sur mobile dans l'application** : des grilles à colonne implicite (la liste d'onglets d'un projet, devenue plus large avec Import et Rapports, élargissait toute la page), des cartes qui ne pouvaient pas rétrécir, et des éléments « lecteur d'écran » placés en absolu qui s'échappaient des tableaux défilants.
4. **Liens d'ancre de la landing qui dépassaient leur cible**, à cause de l'estimation de hauteur des sections ignorées (`content-visibility`) : les hauteurs sont mesurées à 375, 768 et 1280 px, et un correcteur rejoint la cible à l'arrivée (aussi pour `/#faq` à l'ouverture).
5. **Étiquettes du logo** sur les pages d'authentification et légales qui ne reprenaient pas leur texte visible.

Une observation, non modifiée : après l'enregistrement d'une saisie, le formulaire se vide ; une valeur déjà tapée pour la saisie suivante pendant ce délai est effacée.

### Lighthouse (mobile, 4G lente simulée)

**Accessibilité 100, bonnes pratiques 100, SEO 100. Performance : non atteinte sur ce poste, médiane 80 (passes de 71 à 94).** FCP et LCP ≈ 1,0 s, CLS 0 ; c'est le **temps de blocage total (≈ 800 ms)** qui pèse. La mesure est très bruitée : la machine avait une charge moyenne de 40 à 60 pendant les passes, et la note varie de plus de 20 points d'une passe à l'autre. Ce que j'ai fait, mesuré à chaque étape : GSAP n'est plus chargé qu'à la première interaction (il pesait dans la fenêtre de chargement), l'entrée du hero est en CSS pur (elle ne démarre plus après le chargement de GSAP), le titre du hero reste visible dès le premier rendu (l'animer retardait le LCP à 2-3 s), `content-visibility` sur les sections sans animation de défilement, hydratation par sections (`React.lazy`). Le brief exige 90 : **à confirmer sur PageSpeed Insights après le déploiement** (machine moins chargée, réseau réel). Pistes si besoin : réduire le DOM de la landing, découper `fr.json`, inliner le CSS critique.

### Ce qui n'a pas été exercé

- **L'inscription par l'interface**, de bout en bout : elle envoie un e-mail de confirmation (SMTP par défaut de Supabase impossible pour des adresses fictives). Le déclencheur d'inscription et le rattachement par invitation sont couverts par pgTAP (159 assertions), et l'interface d'invitation par la page « Rejoindre » ; mais le parcours « un invité s'inscrit par le lien » n'a pas été joué dans l'interface.
- **Le téléversement du logo** de l'organisation vers le stockage réel et son apparition dans le PDF.
- **L'import d'un fichier Excel `.xlsx`** par l'interface (la lecture Excel est testée en unitaire et dans le navigateur, l'import de bout en bout n'a été joué qu'avec un CSV).
- **axe-core sur les écrans de l'application** (derrière la connexion) ; les couleurs de statut ont été calculées à la main.
- **Safari, téléphones réels, Plausible, Turnstile, notification par e-mail, déploiement Vercel** ; `supabase test db` (Docker indisponible : les pgTAP tournent sur un Postgres embarqué et, pour les 120 premières assertions, sur le vrai projet).

## 13. Lot 2a : socle du cœur S&E, paramètres, programmes, taux d'avancement (26 novembre 2026)

### Découpage du Lot 2

Le brief décrit le Lot 2 en un bloc (« parcours complet d'un projet suivi de bout en bout »). Comme le Lot 1, il est construit en quatre points de contrôle, avec **une seule migration** qui porte tout le schéma (`20261126100000_lot2_coeur_se.sql`) pour que les tests SQL précèdent les écrans.

| Étape | Contenu | État |
|---|---|---|
| **2a** | Schéma et RLS de tout le Lot 2, tests pgTAP, contenu du projet exemple, paramètres S&E appliqués aux calculs, programmes, taux d'avancement (résultats et physique) | **Fait** |
| 2b | Cadre logique (arbre et matrice), phases et étapes, plan de travail annuel (calendrier) | **Fait** (section 14) |
| 2c | États d'avancement, réalisations, prochaines étapes (dont le bouton « Créer une prochaine étape » depuis une alerte d'indicateur), documents, étiquettes | **Fait** (section 15) |
| 2d | Parcours E2E avec comptes de test, accessibilité des écrans de l'application, landing (badges « Bientôt » → livré), README | **Fait** (section 16) |

### Modèle de données

- **Mêmes règles que le Lot 1** : RLS partout, `org_id` dérivé du projet par déclencheur et immuable (droits par colonne : un client ne peut jamais l'écrire ni le modifier), `created_by` forcé à l'auteur, fin d'essai en lecture seule (`ESSAI_EXPIRE`) sur **toutes** les nouvelles tables, y compris `parametres_se`. Lecture par les membres ; écriture par admin et éditeur ; suppression d'un **programme** réservée aux admins (comme celle d'un projet). Le stockage `documents` refuse aussi les dépôts après la fin d'essai et n'accepte plus que des types de fichiers courants (PDF, images, Office, CSV, texte, zip) : un fichier HTML déposé dans un bucket ne doit pas pouvoir s'afficher comme une page.
- **Statut de travail unique** (`a_faire`, `en_cours`, `termine`, `reporte`, `annule`) pour les activités du PTA, les étapes et les prochaines étapes. « En retard » n'est **pas stocké** : c'est une échéance dépassée sur un élément ni terminé ni annulé.
- **Cadre logique** : hiérarchie stricte OG > OS > résultat > activité, appliquée par la base (`CADRE_PARENT_INVALIDE`), un seul objectif global par projet. Les **codes (OG, OS1, R1.1, A1.1.1) sont calculés** par la base à chaque ajout, déplacement, réordonnancement ou suppression (le client ne peut pas les écrire) : saisis à la main, ils se décaleraient à la première suppression. Supprimer une ligne supprime ce qu'elle porte ; les indicateurs reliés sont détachés, pas supprimés. Un indicateur se relie à une ligne de n'importe quel niveau ; une réalisation à un résultat ou une activité ; une activité du PTA à une activité du cadre logique (`RATTACHEMENT_INVALIDE` sinon, y compris pour un élément d'un autre projet).
- **PTA** : une activité a un trimestre **ou** des dates ; `annee` est l'année fiscale (l'année où elle commence, d'après `mois_debut_annee_fiscale`). Contraintes SQL : terminée = 100 %, à faire = 0 %. Le **responsable est un texte libre** (partenaires et prestataires ne sont pas des utilisateurs), proposé à la saisie à partir des membres.
- **États d'avancement** : les taux de résultats et physique sont **figés à la création** par la base (le client ne peut pas les fournir) : un état raconte la situation de son époque, une saisie ultérieure ne le réécrit pas.
- **Réalisations** : le lieu est un texte libre ; le référentiel de localités et `localite_id` arrivent au Lot 3, comme prévu par le brief.
- **Documents** : le chemin de stockage doit être `{org_id}/{project_id}/…` (vérifié par la base, sans remontée de dossier) ; une pièce peut être jointe à une réalisation et survit à sa suppression. **Limite connue, corrigée le 25 novembre 2026 (§18)** : supprimer un projet supprimait ses lignes `documents` mais pas les fichiers du stockage (orphelins, invisibles, mais occupant de la place) ; une file de fichiers à retirer les nettoie maintenant.
- **Étiquettes** : minuscules, espaces simplifiés, dix au plus par projet.
- **Paramètres S&E** : une ligne par organisation, créée avec elle (les organisations existantes ont été complétées). La **devise** n'est pas dupliquée : on garde `organisations.devise_defaut`, déjà réglable dans « Organisation ». Seuils : 0 < ambre < vert ≤ 100 (contrainte SQL).

### Taux d'avancement

- Trois taux : **résultats** (moyenne des atteintes plafonnées à 100 des indicateurs qui ont des données, calcul de `kpi.ts`), **physique** (moyenne du % de réalisation des activités du PTA, hors annulées ; une activité reportée compte à son % actuel), **financier** (Lot 3, affiché « Bientôt »).
- **Deux implémentations, un seul jeu de cas** : TypeScript (`kpi.ts`, `avancement.ts`) pour les écrans et le PDF, vues SQL `v_kpi_atteinte`, `v_avancement`, `v_avancement_programme` (`security_invoker = true`, la RLS de l'appelant s'applique) pour la consolidation. `avancement.test.ts` et `07_lot2_regles.test.sql` vérifient les **mêmes chiffres** (49,5 % de résultats, 37,5 % de physique, statuts vert/ambre/rouge selon les seuils, projet pas commencé, durée nulle, valeurs négatives, dépassement). Écart connu : SQL utilise la date du serveur (UTC), l'interface la date locale ; à minuit, un écran peut avoir un jour de décalage.
- **Programme** : moyenne **simple** des taux des projets qui en ont un (pas de pondération ; la pondération par budget a un sens avec le suivi financier du Lot 3). Un projet exemple n'est pas rattachable à un programme (le projet exemple n'est pas modifiable).
- Les **seuils de l'organisation** s'appliquent partout : tableau de bord, liste des projets, en-tête de projet, rapport PDF, vue SQL. Les unités personnalisées et la fréquence par défaut alimentent le formulaire d'indicateur.

### Projet exemple

Le contenu du Lot 2 (12 lignes de cadre logique, 5 phases, 7 étapes dont une en retard, 9 activités au PTA — 4 terminées, 3 en cours, 1 reportée, 1 à venir —, 5 réalisations, 4 prochaines étapes dont 2 nées d'une alerte d'indicateur, un état d'avancement, 3 étiquettes) est généré avec des **dates relatives à aujourd'hui** : l'exemple raconte toujours une histoire actuelle. Dans l'exemple, ces contenus restent **librement modifiables** (comme les saisies), seules la définition des indicateurs et le projet lui-même restent figés.
**Effet sur vos données** : la migration a ajouté ce contenu au projet exemple **déjà chargé** dans votre Supabase ; vos propres projets n'ont pas été touchés (2 projets, 9 indicateurs, 12 lignes d'historique, comme avant).

### Vérifié et non vérifié

- **Vérifié, tests automatiques** : 283 nouvelles assertions pgTAP (isolation entre organisations, droits par rôle et par colonne sur chaque table, fin d'essai, stockage, règles métier, formules d'avancement, contenu de l'exemple), soit 442 au total (159 du Lot 1), toutes vertes sur le Postgres embarqué ; typage, lint, 262 tests Vitest, build. Les écrans sont aussi testés avec une base simulée (`src/test/fausse-base.ts`).
- **Vérifié avec une session réelle** (comptes de test créés dans votre Supabase **avec votre accord**, puis supprimés ; base revenue à l'état d'avant, table par table : 1 utilisateur, 1 organisation, 2 projets, 9 indicateurs, 77 saisies, 1 programme à vous, 14 lignes d'historique) :
  - création du programme, du projet avec son programme, rattachement et détachement depuis l'en-tête du projet ;
  - chargement du projet exemple par un utilisateur réel : 12 lignes de cadre logique avec leurs codes, 8 indicateurs reliés, état d'avancement aux taux figés ;
  - réglages S&E : refus d'un seuil ambre trop haut, enregistrement, effet immédiat sur les couleurs du tableau de bord, fréquence par défaut et unités proposées dans le formulaire d'indicateur ;
  - consolidation d'un programme : 40 % / 40 % en SQL, identique à l'en-tête du projet calculé en TypeScript ;
  - lecteur : réglages en lecture seule, aucun bouton d'édition ni de suppression ;
  - **API réelle** : l'anonyme est refusé (401) sur les tables et vues du Lot 2, un lecteur ne peut pas créer de programme (403) ni modifier les paramètres (aucune ligne touchée) ;
  - mobile 375 px sans défilement horizontal (liste, programme, projet, paramètres) ; **axe-core sans violation** sur 6 écrans de l'application (premier passage sur l'app, jusqu'ici non joué).
- **Défauts trouvés à l'usage et corrigés** : après « Charger un projet exemple », le taux physique restait vide jusqu'au rechargement (le cache des taux n'était pas invalidé) ; une saisie faite sur un autre appareil ne rafraîchissait pas les taux consolidés d'un programme (ils dépendent des saisies : le temps réel les invalide maintenant) ; l'en-tête de projet affichait « Aucune activité planifiée » sur trois lignes (remplacé par « — » avec le texte pour les lecteurs d'écran) ; phrase « 1 projet(s) avec des données » remplacée par un vrai pluriel.
- **Non vérifié** : le rôle éditeur dans l'interface (couvert par pgTAP et par les tests d'écran) ; les pgTAP du Lot 2 n'ont pas été rejouées sur le vrai Supabase (elles créent des utilisateurs, même annulés) ; Safari et téléphones réels.

## 14. Lot 2b : cadre logique, phases et étapes, plan de travail annuel (26 novembre 2026)

Trois nouveaux onglets de projet, dans l'ordre du raisonnement S&E : Tableau de bord, **Cadre logique**, Indicateurs, Saisie, **Plan de travail**, **Phases et étapes**, Import, Rapports. L'onglet actif est ramené dans la zone visible de la barre d'onglets, qui défile sur téléphone (8 onglets).

### Cadre logique (`/projets/:id/cadre-logique`)

- **Deux vues du même arbre** : « Arbre » (lignes repliables, indicateurs reliés sous chaque ligne, bouton d'ajout du niveau suivant) et « Matrice » (le tableau classique : logique d'intervention, indicateurs, moyens de vérification, hypothèses et risques). La base calcule les codes ; l'écran ne fait que les afficher.
- **Réordonner = « Monter / Descendre » parmi les frères**, pas de glisser-déposer. Alternative écartée : `@dnd-kit` comme pour les indicateurs. Raison : la hiérarchie est stricte (une activité ne peut être déposée que sous un résultat), un glisser-déposer entre niveaux serait ambigu et difficile au clavier. Changer de parent se fait dans le panneau de la ligne (« Rattaché à », limité aux lignes du bon niveau).
- **Indicateurs reliés** depuis le panneau de la ligne (cases à cocher). Un indicateur n'a qu'une ligne : cocher un indicateur déjà relié ailleurs le **déplace** (le panneau le dit, avec le code actuel). Chaque indicateur affiche son statut (icône et texte, jamais la couleur seule) avec les seuils de l'organisation.
- **Suppression** : le message annonce le nombre de lignes emportées ; les indicateurs reliés sont détachés, pas supprimés.
- Dans le projet exemple, le cadre logique est modifiable (décision 13) ; lecteur et fin d'essai : aucune action, bandeau explicatif.

### Phases et étapes (`/phases`)

- **Cinq phases types en un clic** sur un projet vide (Conception, Démarrage, Mise en œuvre, Suivi-évaluation, Clôture, sans dates : « dates à préciser »). Les phases sont ensuite libres (ajout, renommage, dates, ordre, suppression).
- **Chronologie en SVG** : une barre par phase datée, les étapes en marqueurs (losange = jalon, carré = livrable ; plein vert = atteinte, rouge = en retard, contour = à venir), la date du jour en pointillés. C'est une **vue d'ensemble** : tout le détail est écrit dans les listes dessous, la figure porte un libellé pour les lecteurs d'écran. L'axe s'élargit à tout ce qui déborde du projet ; sur téléphone elle défile horizontalement plutôt que de se réduire à l'illisible.
- **Statut d'une étape modifiable en place** ; passer à « Terminé » date la réalisation du jour si aucune date réelle n'est saisie. « En retard » n'est pas stocké : échéance dépassée, ni terminée ni annulée, avec le nombre de jours.
- Supprimer une phase garde ses étapes (sans phase), elles apparaissent dans « Étapes sans phase ».

### Plan de travail annuel (`/plan-de-travail`)

- **Année fiscale** choisie dans une liste (années du projet, années déjà planifiées, année courante) ; elle suit le mois de début des paramètres S&E (« 2026–2027 » avec un début en juillet). Les trimestres comptent à partir de ce mois.
- **Un trimestre ou des dates précises** à la saisie. Avec des dates, l'année fiscale est celle de la date de début (pas de champ à renseigner en double).
- **Calendrier** (douze colonnes de mois, barre sur la période, partie sombre = réalisation d'une activité en cours, date du jour) **ou Liste** (tableau avec statut modifiable en place). Le calendrier est une aide visuelle : période, statut et avancement sont écrits à gauche ; il défile horizontalement sur téléphone.
- **Cohérence statut / pourcentage** : terminée = 100 %, à faire = 0 % (la base le refuse sinon). L'écran applique la règle quand on change le statut, et le dit sous le champ.
- Le résumé de la page est celui de **l'année affichée** (« Avancement de l'année ») ; le taux physique du projet (en-tête, cartes, programmes) couvre toutes les années. Le budget prévu exclut les activités annulées.
- **Responsable** : texte libre avec suggestions (membres de l'organisation et responsables déjà saisis).
- Une activité se relie à une activité du cadre logique (liste « A1.1.1 — … ») et à une phase.

### Vérifié et non vérifié

- **Tests automatiques** : 52 nouveaux tests Vitest (314 au total) : fonctions pures du cadre logique (arbre, ordre, parents possibles, réordonnancement) et du PTA (années fiscales dont juillet et bissextile, trimestres, positions sur le calendrier), puis les trois écrans avec une base simulée (contenu, lecture seule, fin d'essai, création, validation, statut, pourcentage). Lint, types et build verts ; pgTAP inchangés (442).
- **Session réelle** (comptes de test avec votre accord, supprimés ; base revenue à l'état d'avant, table par table : 1 utilisateur, 1 organisation, 2 projets, 9 indicateurs, 77 saisies, 1 programme à vous, 14 lignes d'historique) :
  - cadre logique : ajout d'une activité avec un indicateur déplacé depuis un autre résultat, code calculé par la base (A1.2.2), « Monter » (les deux codes s'échangent), suppression avec confirmation (renumérotation, indicateur détaché mais conservé) ;
  - plan de travail : création d'une activité au T4 reliée à A1.2.1, taux physique du projet recalculé (59,7 % → 56,7 %), passage à « Terminé » (pourcentage mis à 100 %) ;
  - chronologie, calendrier, listes affichés avec les données du projet exemple ; **axe-core sans violation** sur les trois écrans ; mobile 375 px sans débordement ;
  - lecteur : aucun bouton d'action, aucun statut modifiable, bandeau de lecture seule ; **API réelle** : insertion refusée (403) sur cadre logique, phases et PTA, modification et suppression sans effet, colonne `code` non modifiable (403), anonyme refusé (401).
- **Défauts trouvés à l'usage et corrigés** : colonnes de la matrice écrasées (tableau à colonnes fixes) ; noms d'indicateurs tronqués dans la matrice (retour à la ligne) ; nom de la dernière phase et dernière graduation coupés au bord droit de la chronologie ; listes de statut trop étroites dans les tableaux ; budget débordant de 2 px sur téléphone ; « 1 sur 1 étapes terminées » (pluriel).
- **Non vérifié par l'interface réelle** : création, modification et suppression d'une phase ou d'une étape (testées avec la base simulée ; la base elle-même est couverte par pgTAP) ; rôle éditeur ; calendrier d'une année fiscale décalée (testé en unitaire) ; axe-core sur la vue Matrice ; Safari et téléphones réels.

## 15. Lot 2c : réalisations, prochaines étapes, états d'avancement, documents, étiquettes (24 novembre 2026)

Aucune migration : tout le schéma, les droits, le stockage et le contenu de l'exemple venaient du 2a. Le 2c n'ajoute que des écrans, la lecture et l'écriture de ces tables, et un traitement des erreurs du stockage.

### Navigation du projet : douze pages, trois rubriques

Avec quatre pages de plus, la barre d'onglets du projet en comptait douze et **débordait même sur un écran de bureau** (constaté dans le navigateur : « Documents » n'était plus visible sans faire défiler). Elle est remplacée par deux niveaux : trois rubriques, puis les pages de la rubrique ouverte.

| Rubrique | Pages |
|---|---|
| **Pilotage** | Tableau de bord, Indicateurs, Saisie, Import, Rapports |
| **Planification** | Cadre logique, Plan de travail, Phases et étapes |
| **Mise en œuvre** | Réalisations, Prochaines étapes, États d'avancement, Documents |

Les adresses ne changent pas. La barre de pages garde le nom accessible « Sections du projet » (les tests de bout en bout existants naviguent dans Pilotage et continuent donc de fonctionner) ; les rubriques sont dans une barre « Rubriques du projet ». Sur téléphone, les trois rubriques tiennent sur une ligne et la barre de pages défile.

### Réalisations (`/realisations`)

- Une réalisation : date, intitulé, description, quantité, unité, lieu (texte libre), lien avec un **résultat ou une activité** du cadre logique et avec une activité du plan de travail. Les objectifs globaux et spécifiques ne sont pas proposés (la base les refuserait : `RATTACHEMENT_INVALIDE`).
- **Preuves jointes** : un document déposé « pour » une réalisation. Une réalisation sans pièce l'affiche franchement (« Aucune preuve jointe », avec le bouton pour en joindre une) et le résumé de la page compte celles qui en ont (« 6 réalisations, dont 1 avec preuve jointe ») : **aucune preuve n'est inventée ni présumée**. Supprimer une réalisation garde ses pièces dans les documents.
- Un lecteur peut télécharger les preuves mais ne peut rien écrire.

### Prochaines étapes (`/prochaines-etapes`)

- Libellé, responsable (texte libre, avec les noms des membres en suggestion), échéance, statut (les mêmes cinq statuts que partout), indicateur d'origine facultatif. « En retard » n'est pas stocké : échéance dépassée sur une action ni terminée ni annulée.
- **Tri** : le retard d'abord (le plus ancien en tête), puis les échéances à venir, puis les actions sans date, puis ce qui est fini. **Affichage par défaut : les actions ouvertes** (à faire, en cours, reportées), avec un filtre « Terminées » et « Toutes ». Le statut se change en place.
- **Depuis une alerte d'indicateur** : sur le tableau de bord, une carte d'indicateur en vigilance ou en retard propose « Créer une prochaine étape » à un éditeur ou un administrateur. Le formulaire est prérempli (texte suggéré, modifiable ; indicateur lié) ; la responsabilité et l'échéance restent à la personne. **Si une action ouverte existe déjà pour cet indicateur, la carte la signale (« 1 prochaine étape en cours », lien vers la page) au lieu d'en proposer une de plus**, pour ne pas multiplier les doublons. Le bouton n'apparaît ni pour un lecteur, ni pendant le chargement, ni sur la landing et le deck qui réutilisent la même carte.

### États d'avancement (`/etats-avancement`)

- Un état : titre, période, faits marquants, difficultés, risques. **La période proposée suit le dernier état** (lendemain de sa fin, jusqu'à aujourd'hui, sans dépasser la fin du projet) ; le formulaire dit combien de réalisations tombent dans la période.
- **Les taux de résultats et physique sont figés par la base à la création** (décision 13) ; l'écran les montre en information avant l'enregistrement, avec la mention qu'ils ne changeront plus. Ils ne sont jamais envoyés par le client, et la base refuse de les modifier (vérifié par l'API réelle : 42501). Écart connu : le formulaire calcule les taux du jour côté client, la base côté serveur (date UTC) ; à minuit, ils peuvent différer d'un jour de données.
- Les textes d'un état restent modifiables ; ses taux, jamais. **Pas d'export PDF d'un état** à ce stade (non fait, à décider avec les rapports du Lot 3).

### Documents (`/documents`) et stockage

- Dépôt dans le bucket privé `documents`, au chemin `{organisation}/{projet}/{identifiant}-{nom sans accents ni espaces}.{extension}` (le chemin est vérifié par la base : `DOCUMENT_CHEMIN_INVALIDE` pour un autre dossier ou une remontée `..`). Catégorie (rapport, contrat, justificatif, autre), description, preuve d'une réalisation.
- **Types acceptés** : PDF, images PNG/JPEG/WebP, Office et OpenDocument, CSV, texte, zip ; **20 Mo au plus**. Le refus se fait d'abord dans le formulaire (message clair), puis par le bucket (vérifié à la main : un fichier HTML est refusé en 415, un dépôt dans le dossier d'une autre organisation en 403). Le type est celui annoncé par le navigateur, complété par l'extension quand il est vide : le bucket filtre sur ce type annoncé, il n'inspecte pas le contenu du fichier (pas d'antivirus).
- **Échec à moitié fait** : le fichier est déposé puis sa ligne enregistrée ; si la ligne échoue, le fichier est retiré. À la suppression, la ligne part d'abord puis le fichier ; si le fichier ne peut pas être retiré, la personne en est prévenue (il reste invisible et occupe de la place). Limite déjà connue (décision 13) : supprimer un **projet** laisse ses fichiers.
- **Téléchargement** par lien signé qui expire au bout d'une minute, nommé d'après le document avec l'extension d'origine. Pas d'aperçu intégré, pas de versions d'un même document.
- Les erreurs du stockage (fichier trop gros, type refusé, droits) ont leurs propres messages ; elles n'ont pas de code Postgres, elles sont reconnues par leur texte.

### Étiquettes

- Sous le titre du projet : étiquettes libres (typologie d'intervention : formation, infrastructure, plaidoyer…), **dix au plus**, en minuscules, espaces simplifiés (même normalisation que la base). Ajout et retrait pour un éditeur ou un administrateur, y compris sur le projet exemple (décision 13). Les étiquettes déjà utilisées dans l'organisation sont proposées à la saisie.
- Dans la **liste des projets** : les étiquettes s'affichent sur chaque carte et une liste « Étiquette » filtre les projets (elle n'apparaît que si au moins une étiquette existe).

### Accessibilité

axe-core a trouvé un vrai défaut sur les trois premiers écrans écrits : des titres de niveau 3 sans titre de niveau 2 au-dessus (l'ordre des titres saute). Les cartes sont maintenant des titres de niveau 2. Le **tableau de bord** avait le même défaut depuis le Lot 1 (cartes d'indicateurs en niveau 3 juste sous le titre de la page) : un titre de niveau 2 masqué visuellement (« Indicateurs du tableau de bord ») a été ajouté.

### Vérifié et non vérifié

- **Tests automatiques** : 391 tests Vitest (77 nouveaux) : fonctions pures du suivi (tri et retard des actions, période suggérée, types et tailles de fichiers, chemin de stockage, normalisation des étiquettes, taille lisible), erreurs de stockage, puis chaque écran avec une base simulée qui sait maintenant enregistrer les dépôts, retraits et liens signés du stockage (contenu, lecture seule, fin d'essai, création, validation, statut en place, suppression avec confirmation, dépôt et refus de fichier, téléchargement, taux jamais envoyés), la carte d'indicateur avec son bouton, les étiquettes et la navigation en rubriques (chacune des douze pages appartient à une rubrique et une seule). Types, lint et build verts ; pgTAP inchangés (442), aucune migration.
- **Session réelle** (comptes de test créés dans votre Supabase **avec votre accord**, puis supprimés ; base revenue à l'état d'avant, table par table, stockage compris : 1 utilisateur, 1 organisation, 1 programme à vous, 2 projets, 9 indicateurs, 77 saisies, 12 lignes de cadre logique, 5 phases, 7 étapes, 9 activités, 5 réalisations, 4 prochaines étapes, 1 état, 3 étiquettes, 21 lignes d'historique, 0 fichier) :
  - **rôle éditeur, pour la première fois** : dépôt d'un vrai PDF comme preuve d'une réalisation (fichier présent dans le stockage, ligne en base avec le bon chemin, bon auteur, lien avec la réalisation), création d'une réalisation avec quantité décimale et lien A2.1.1, création d'une prochaine étape depuis l'alerte d'un indicateur (la carte passe de « Créer une prochaine étape » à « 1 prochaine étape en cours »), passage de cette action à « Terminé », rédaction d'un état d'avancement (taux enregistrés par la base : 34,32 % et 59,67 %, identiques à la vue SQL), ajout d'étiquettes (normalisation, doublon refusé, plafond de dix), suppression d'un document (ligne et fichier partis ensemble) ;
  - **lecteur** : aucun bouton d'écriture sur les cinq écrans, étiquettes figées, téléchargement possible ; **API réelle** : insertion refusée (403/42501) sur réalisations, prochaines étapes, états, documents, étiquettes et dépôt de fichier, suppression et modification sans effet ; anonyme refusé (401) sur les tables et la vue, liste du stockage vide ;
  - **règles de la base** : fichier HTML refusé (415), dossier d'une autre organisation refusé (403), chemin hors du projet et remontée `..` refusés (`DOCUMENT_CHEMIN_INVALIDE`), onzième étiquette refusée (`ETIQUETTES_MAX`), taux d'un état non modifiables (42501) ;
  - **lien signé** : le fichier se lit (200, contenu intact) ;
  - **axe-core sans violation** sur les quatre écrans, avec le formulaire de chaque écran ouvert, et sur le tableau de bord ; mobile 375 px sans débordement horizontal sur les cinq écrans.
- **Défauts trouvés à l'usage et corrigés** : la barre d'onglets débordait à douze pages, même sur bureau (→ rubriques) ; les trois rubriques passaient sur deux lignes sur téléphone ; avec dix étiquettes, la carte d'avancement de l'en-tête était écrasée (→ largeur fixe) ; l'ordre des titres (voir plus haut).
- **Non vérifié** : le nom du fichier téléchargé (le navigateur intégré ne montre pas l'en-tête `Content-Disposition` ; le téléchargement par lien signé est vérifié, pas la boîte de dialogue du navigateur) ; le **glisser-déposer** d'un fichier (le choix par bouton est exercé, le dépôt par glisser n'est testé nulle part) ; un fichier proche de 20 Mo ; la modification d'un document, d'une réalisation ou d'une prochaine étape par l'interface réelle (testée avec la base simulée) ; la fin d'essai sur le stockage (couverte par pgTAP, pas rejouée en réel) ; le rôle administrateur sur ces écrans ; axe-core sur les écrans de la rubrique Planification après le changement de navigation ; Safari et téléphones réels.

## 16. Lot 2d : parcours de bout en bout, accessibilité des écrans, landing (24 novembre 2026)

Le Lot 2 est complet. Ce dernier point de contrôle ne change pas le schéma ; il ajoute les tests de bout en bout qui manquaient au cœur S&E, rend la landing fidèle à ce qui existe, et a fait remonter un défaut réel.

### Landing : « Disponible » et « Bientôt »

- Le bloc sous les quatre fonctions de la section « Solution » est scindé en deux : **« Disponible »** (programmes et taux d'avancement, cadre logique, plan de travail annuel, phases et étapes, réalisations et preuves jointes, prochaines étapes, états d'avancement, documents du projet) et **« Bientôt »** (carte des zones, suivi budgétaire, rapports automatiques programmés, saisie hors ligne).
- **Règle** : une fonction passe de « Bientôt » à « Disponible » quand elle est livrée **et exercée dans l'application**, pas avant. Le test de landing vérifie qu'aucune fonction n'est dans les deux listes et que ce qui est annoncé « Bientôt » n'y figure pas déjà.
- La réponse de la FAQ « bailleurs » ne dit plus que le cadre logique est « prévu pour une prochaine étape » : elle décrit le cadre logique, le plan de travail annuel et les preuves jointes qui existent.
- Inchangés, parce que ces fonctions n'existent toujours pas : « Rapports automatiques programmés » dans les tarifs (badge « Bientôt »), « Programme pilotes » (badge « Bientôt »), le paiement en ligne.

### Tests de bout en bout (Playwright, Chrome du poste, vrai Supabase)

Tout est décrit dans `e2e/README.md`. Aides communes dans `e2e/aide.ts` (comptes, connexion, session d'un rôle, navigation par rubriques, axe-core, débordement horizontal) ; `parcours.spec.ts` et `accessibilite.spec.ts` les réutilisent.

| Fichier | Ce qu'il joue |
|---|---|
| `coeur-se.spec.ts` | Un projet suivi de bout en bout avec les trois rôles (neuf tests de la phase 1, un de la phase 2) : projet, indicateurs, cadre logique à quatre niveaux avec codes calculés, indicateur relié, cinq phases types, jalon atteint, activité du plan de travail (le taux physique du projet suit), saisie, alerte d'indicateur → prochaine étape → terminée, état d'avancement aux taux figés (une saisie de plus change le projet, pas l'état), étiquettes, programme et consolidation, filtre de la liste ; l'éditeur enregistre une réalisation et dépose une preuve (HTML et plus de 20 Mo refusés, vrai PDF, téléchargement), la modifie puis la supprime (le fichier part avec) ; le lecteur consulte et télécharge, rien ne s'écrit ; nettoyage par l'administrateur. Phase 2 : bandeau de fin d'essai et aucune action d'écriture sur sept écrans. |
| `accessibilite-app.spec.ts` | axe-core sur **chaque écran de l'application** (liste des projets, programmes, équipe, paramètres, les douze pages du projet), **chaque formulaire ouvert** (nouveau projet, nouveau programme, réalisation, prochaine étape, état, dépôt de document, phase, étape, activité, ligne du cadre logique) et les vues alternatives (matrice du cadre logique, liste du plan de travail). Sur téléphone (375 px) : aucun débordement horizontal sur seize écrans, trois rubriques sur une ligne. Le projet d'exemple fournit le contenu ; il est chargé puis supprimé. |
| `api.spec.ts` (complété) | Lecteur refusé (403) sur réalisations, prochaines étapes, états, documents, étiquettes et dépôt de fichier ; éditeur : HTML refusé, dossier d'une autre organisation refusé, PDF accepté puis retiré, chemin de document invalide refusé, taux d'un état non modifiables, rattachement invalide refusé ; anonyme refusé (401) sur huit tables et vues ; phase 2 : `ESSAI_EXPIRE` sur les nouvelles tables et dépôt de fichier refusé. |

Le parcours du cœur S&E a besoin de **place dans le quota de trois projets de l'essai** : s'il n'y en a pas, il le dit et s'arrête (`test.skip` explicite) au lieu d'échouer sans explication. Entre deux passages, `supabase/e2e/creer_comptes.sql` donne les requêtes de nettoyage (projets, programmes, fichiers).

### Défaut réel trouvé par ces tests : le nom du fichier téléchargé

Un document « Bon de réception » se téléchargeait sous le nom **« Bon de r%C3%A9ception.pdf »**. La cause est dans `supabase-js` : l'option `download` de `createSignedUrl` encode le nom, puis la bibliothèque encode l'adresse entière une seconde fois ; le serveur décode une fois et renvoie le texte encore encodé. Contournement : le lien signé est demandé sans l'option et le nom (avec l'extension du fichier d'origine) est ajouté à l'adresse, encodé une seule fois (`src/lib/documents.ts`). Le serveur renvoie alors `filename*=UTF-8''…` correct (vérifié sur l'en-tête réel) et le test de bout en bout lit « Bon de réception.pdf ». Cinq tests unitaires verrouillent le cas (accents, apostrophe, tiret long, lien sans paramètre, erreur du stockage). C'était exactement ce que la décision 15 listait comme « non vérifié » ; le jouer en navigateur réel l'a démenti.

Autres constats, côté tests seulement : la notification de succès est annoncée deux fois dans le DOM (un texte visible et un texte pour lecteurs d'écran) : les tests cherchent donc `.first()` ; une saisie « aberrante » (écart net avec les valeurs précédentes) demande une confirmation avant d'être enregistrée, ce qui est voulu ; **sans délai d'action, Playwright attendait un bouton absent pendant dix minutes** : `actionTimeout: 20 s` est maintenant dans `playwright.config.ts`, un élément manquant échoue en vingt secondes.

### Vérifié et non vérifié

- **Tests automatiques** : 398 tests Vitest (7 de plus qu'au 2c : le nom du fichier téléchargé, la landing), typage, lint et build verts ; pgTAP inchangés (442), aucune migration.
- **Tests de bout en bout joués pour de vrai** (trois comptes de test et une organisation de test créés dans votre Supabase **avec votre accord**, puis supprimés ; base revenue à l'état d'avant, table par table, stockage compris : 1 utilisateur, 1 organisation, 1 programme à vous, 2 projets, 9 indicateurs, 77 saisies, 12 lignes de cadre logique, 5 phases, 7 étapes, 9 activités, 5 réalisations, 4 prochaines étapes, 1 état, 3 étiquettes, 21 lignes d'historique, 1 invitation, 0 fichier ; fichier d'identifiants et traces Playwright, qui contiennent les mots de passe de test, supprimés) :
  - **phase 1, passe complète sur la suite entière** (bureau et téléphone) : 60 réussis, 51 ignorés par construction (tests réservés au bureau, au téléphone ou à la phase 2), **1 échec** : un contrôle d'API du Lot 1 qui supposait qu'un projet et un indicateur traînent déjà dans l'organisation (corrigé : la spec d'API crée et supprime son propre projet). Landing, deck et accessibilité des pages publiques sont passés avec la nouvelle landing ;
  - **après ces corrections, rejoués séparément** : API 7 réussis ; parcours du Lot 1 10 réussis ; cœur S&E 9 réussis ; accessibilité des écrans 1 réussi au bureau (**aucune violation** sur tous les écrans, formulaires et vues alternatives, dont la **matrice du cadre logique**, jusqu'ici jamais contrôlée) et 1 réussi sur téléphone ;
  - **phase 2 (essai terminé)** : parcours du Lot 1, API (deux tests) et cœur S&E : tous réussis ;
  - je n'ai **pas** rejoué la suite entière d'une seule traite après le dernier jeu de corrections : chaque morceau modifié l'a été, séparément.
- **Lighthouse (mobile, médiane de trois passes)** après le changement de landing : accessibilité, bonnes pratiques et SEO **100** ; performance **89** (passes : 78, 89, 89). Le point ouvert du Lot 1 (performance sous 90, médiane de 80 alors) reste ouvert, à 1 point du seuil, sans régression due à la landing.
- **Défauts trouvés par ces tests** : le nom du fichier téléchargé (corrigé, plus haut) ; côté tests, plusieurs courses et suppositions fausses, toutes corrigées : une suppression « constatée » avant d'avoir eu lieu (tant qu'une confirmation est ouverte, le reste de la page est masqué aux technologies d'assistance et `getByRole` ne voit plus rien) qui laissait un projet de test derrière elle ; un projet créé en double dans le test des limites de plan du Lot 1 quand le formulaire était rouvert pendant sa fermeture (la cause exacte côté application n'est pas établie : en usage humain, deux créations en 0,6 s avec le même nom sont improbables) ; un décompte de projets lu avant le chargement de la liste.
- **Non vérifié** : Safari et téléphones réels (les tests utilisent Chrome et l'émulation d'un téléphone) ; le parcours du cœur S&E sur téléphone (il est volontairement réservé au bureau ; seul le débordement des écrans est contrôlé sur téléphone) ; le glisser-déposer d'un fichier (le choix par bouton est joué, pas le glisser) ; un fichier proche de 20 Mo réellement envoyé (seul le refus au-delà de la limite est joué) ; le rôle administrateur sur les écrans du suivi (le parcours utilise l'administrateur pour créer et supprimer, sans contrôler ses droits propres sur ces écrans).

### Ce qui reste, hors du Lot 2

Le Lot 3 (localités et carte, acteurs, bénéficiaires, finances et budgets, planning des composantes, rapports de programme, rapports programmés, paiement en ligne) n'est pas commencé : il exige votre instruction explicite. Restent aussi les éléments à fournir par vous (domaine, envoi d'e-mails, etc., voir `PLACEHOLDERS.md`) et le point de performance de la landing.

## 17. Pages légales : conditions d'utilisation, confidentialité, mentions légales (25 novembre 2026)

Sur votre demande (« procéder à la meilleure des manières, conformément à ce qui se fait de mieux au Sénégal »), les trois textes ont été rédigés ou refaits à partir de la loi elle-même, pas de modèles de sites.

### Sources lues

- **Loi n° 2008-12** (données à caractère personnel) : texte intégral lu (WIPO Lex). Retenu : définitions (art. 4), cas où le consentement n'est pas requis (art. 33), déclaration préalable et récépissé (art. 18, 22), transfert à l'étranger (art. 49 à 51), contrat écrit avec les sous-traitants (art. 39, 70), sécurité (art. 71), les neuf informations à donner à la collecte (art. 58), droits d'accès (art. 62), d'opposition (art. 68), de rectification et de suppression avec **délai d'un mois** (art. 69), traceurs (art. 61).
- **Loi n° 2008-08** (transactions électroniques) : articles 1 à 24 lus ; art. 5 (éditeur et hébergeur) et art. 10 (informations à rendre accessibles : raison sociale, adresse, e-mail, **téléphone**, RCCM, capital, NINEA, prix) ; art. 24 (conditions contractuelles accessibles, conservables et reproductibles). **Décret n° 2008-718** : lu en entier (art. 8 : mentions pour le consommateur ; art. 34 à 39 : contrats électroniques entre professionnels, conditions « datées », version applicable à produire en cas de litige).
- **Modèles consultés** : jourbeni.com (confidentialité et conditions) pour la structure d'un contrat de SaaS ; farata.sn était injoignable. Aucun des deux ne sert de référence juridique : celui qui a pu être lu ne cite aucune loi sénégalaise.

### Ce que cela a changé

- **Plus d'« intérêt légitime ».** La loi sénégalaise ne connaît pas cette base (art. 33 : consentement, obligation légale, mission d'intérêt public, exécution d'un contrat, sauvegarde des intérêts de la personne). L'ancienne politique s'en réclamait pour la sécurité et la mesure d'audience ; elle s'appuie maintenant sur l'exécution du contrat, l'obligation de sécurité (art. 71) et, pour les demandes de contact, le consentement et les mesures précontractuelles.
- **Politique de confidentialité** : les neuf informations de l'article 58 sont toutes présentes (responsable, finalités, catégories de données et caractère obligatoire ou facultatif, destinataires, durée, droits, possibilité de ne plus figurer au fichier, transfert à l'étranger) ; **délai de réponse d'un mois**, qui est celui de la loi ; sous-traitants nommés ; cookies et stockage local décrits tels que le code les utilise (la session est dans le stockage local du navigateur, aucun cookie publicitaire) ; mention de l'Irlande comme transfert à déclarer à la CDP.
- **Mentions légales** : alignées sur l'article 10 de la loi 2008-08 (téléphone, adresse, RCCM, capital, NINEA, hébergeur avec adresse et téléphone, prix hors taxes ou toutes taxes comprises, réclamations par e-mail et par courrier).
- **Conditions générales d'utilisation (nouvelle page, 19 articles)** : service **réservé aux professionnels** (ce qui écarte les règles propres aux consommateurs, dont la rétractation de 7 jours ouvrables) ; comptes et rôles tels que le produit les applique ; essai de 14 jours puis **lecture seule** (c'est ce que fait la base) ; prix et paiement par virement ou mobile money, sans paiement en ligne ; résiliation ; règles d'usage (20 Mo, types de fichiers) ; données de l'organisation, restitution et suppression ; **clause de sous-traitance** (art. 9) qui tient lieu du contrat écrit exigé par les articles 39 et 70 ; disponibilité sans engagement de sauvegarde (Supabase Pro n'est pas activé) ; responsabilité plafonnée ; signalement de contenus illicites (les éléments de l'article 3 de la loi 2008-08) ; modification avec préavis ; droit sénégalais.
- **Acceptation expresse à l'inscription** : une case à cocher, jamais précochée, bloque la création du compte (inscription directe et invitation). Elle transmet **la version** acceptée avec la demande d'inscription ; depuis le §18, la base l'enregistre dans le profil avec **sa propre horloge** (`conditions_version`, `conditions_acceptees_le`), ce qui permet de produire la version applicable (décret 2008-718, art. 36). Les deux textes s'ouvrent dans un nouvel onglet pour ne pas perdre le formulaire.
- **Une seule source** : `src/lib/legal.ts` porte la version et les durées (90 jours, 30 jours, 24 mois, préavis de 30 jours) pour que les pages et l'enregistrement ne divergent pas. Les valeurs sont des **choix proposés**, listés dans `PLACEHOLDERS.md`.

### Limites, dites franchement

- **Aucun avocat n'a relu ces textes** ; chaque page l'affiche. Ils sont une base sérieuse, pas un avis juridique.
- **Preuve de l'acceptation** : à l'origine (version du 25 novembre au matin), elle ne reposait que sur les métadonnées du compte, modifiables par l'utilisateur, avec la date de son navigateur. Cette limite est levée au §18 (colonnes protégées, horloge de la base). Les comptes créés avant ce changement n'ont aucune acceptation enregistrée.
- **Non lu** : articles 25 à 54 de la loi 2008-08 (formation du contrat, signature, conservation précise) ; la règle d'un éventuel « double clic » n'a donc pas été vérifiée, la case à cocher en tient lieu. Les normes simplifiées et le formulaire de déclaration de la CDP (art. 19) n'ont pas été lus.
- **Réforme** : un projet de loi remplaçant la loi 2008-12 est évoqué depuis 2019 ; je n'ai trouvé aucune preuve qu'il ait été voté, sans pouvoir l'exclure.
- **Régime du transfert vers l'Irlande** (art. 49 à 51) : à trancher par un juriste ; la loi ne donne pas de liste de pays adéquats.
- **À votre charge** : déclarer le traitement à la CDP avant l'ouverture au public (seul le récépissé autorise la mise en œuvre), accepter les contrats de traitement des données de Supabase, Vercel et Resend, et fournir les faits listés dans `PLACEHOLDERS.md`.

### Vérifié

Types, lint et 412 tests Vitest verts (dont les nouveaux : chaque page couvre les rubriques exigées, signale en évidence ce qui reste à compléter, ne contient aucun fait inventé ; l'inscription refuse sans acceptation et enregistre la version et la date). Accessibilité automatique (axe) sans violation sur les trois pages légales et l'inscription. Pages prérendues et ajoutées au plan du site. Rien n'a été joué avec un compte réel : aucune inscription n'a été créée.

## 18. Acceptation protégée et nettoyage des fichiers de projets supprimés (25 novembre 2026)

Les deux points proposés à la fin du §17 (« Vas-y ») : une preuve d'acceptation que le client ne peut pas écrire, et la suppression réelle des fichiers d'un projet supprimé. Deux migrations, **écrites, testées en local (477 assertions pgTAP) puis appliquées sur le vrai Supabase** : `20261126110000_acceptation_conditions.sql` et `20261126120000_fichiers_a_retirer.sql` (versions du projet distant : `20261125100814`, `20261125100843`).

### Acceptation des conditions, enregistrée par la base

- Deux colonnes sur `public.profiles` : `conditions_version` (étiquette `aaaa-mm-jj`, validée par son format) et `conditions_acceptees_le` (**horloge de la base**, au moment de la création du compte). Elles sont renseignées ensemble ou pas du tout (contrainte). Les droits par colonne existants (écriture limitée à nom, téléphone, langue) les protègent déjà : un membre ne peut pas les modifier, ce qui est testé (refus `42501`).
- Le déclencheur d'inscription `private.creer_compte` lit `conditions_version` dans les métadonnées d'inscription (le formulaire l'envoie), ignore toute date envoyée par le client, et fonctionne pour l'inscription directe comme sur invitation. Le formulaire n'envoie plus de date.
- **Choix : la base n'impose pas l'acceptation.** Un compte créé sans version (script d'administration, tableau de bord, appel direct à l'API) est accepté avec NULL, ce qui le rend repérable. Imposer la version aurait cassé la création de comptes hors formulaire et les scripts de test ; c'est durcissable plus tard si une inscription par un tiers (Google, par exemple) est ajoutée avec son propre écran d'acceptation.
- **Ce que cela prouve, et ne prouve pas** : la base horodate l'inscription et conserve l'étiquette de version déclarée ; elle ne voit pas la case cochée. Un appel direct à l'API d'authentification peut déclarer une version sans passer par l'écran. En cas de litige, la version se retrouve dans l'historique du dépôt (`src/lib/legal.ts`, pages légales). Une réacceptation à chaque nouvelle version n'existe pas encore : la colonne garde la dernière acceptation à l'inscription seulement.
- Aucun compte existant n'est modifié : le seul profil de la base garde NULL.

### Fichiers des documents supprimés : une file tenue par la base, vidée par l'application

- **Le problème** : supprimer un projet supprime ses lignes `documents` en cascade, pas les fichiers du bucket. La base ne peut pas les retirer elle-même (supprimer dans `storage.objects` n'enlève que la ligne de métadonnées, pas le fichier). Seule l'API de stockage supprime vraiment.
- **La solution, sans tâche planifiée ni clé de service** : un déclencheur `AFTER DELETE` sur `documents` inscrit chaque chemin dans `private.fichiers_a_retirer` (table privée, illisible par les clients), quel que soit le chemin de la suppression : document seul, projet, organisation. Deux fonctions : `fichiers_a_retirer()` (chemins que la personne peut retirer) et `fichiers_retires(chemins)` (vide la file). L'application retire les fichiers par l'API de stockage avec les droits de la personne connectée (`retirerFichiersOrphelins`, `src/lib/documents.ts`), puis vide la file.
- **Quand** : juste après la suppression d'un projet ; après la suppression d'un document ; et au chargement de l'application par un admin ou un éditeur (`useNettoyageFichiers`). Un échec (réseau, onglet fermé) se rattrape donc tout seul à la session suivante.
- **Droits** : les mêmes que la politique de stockage « suppression par admin et éditeur » (rôle admin ou éditeur, organisation autorisée à écrire). Sans cela, l'API de stockage répondrait « succès » sans rien supprimer (la sécurité par ligne masque les fichiers) et la file serait vidée à tort. Un lecteur ne voit rien ; une organisation dont l'essai est terminé garde ses chemins en file, invisibles, jusqu'à ce qu'elle puisse écrire.
- **Une organisation supprimée** laisse ses chemins en file (pas de clé étrangère, exprès). Procédure d'exploitation, dans cet ordre : supprimer l'organisation en SQL (les chemins entrent en file, testé), supprimer le dossier `{org_id}/` du bucket `documents` depuis le tableau de bord Supabase (Storage), puis `delete from private.fichiers_a_retirer where org_id = '…'` (voir `PLACEHOLDERS.md`). Le même geste sert à la fermeture d'un compte promise dans les conditions (90 jours).
- **Non traité** : les fichiers qui seraient orphelins sans qu'une ligne `documents` n'ait jamais existé (échec du retrait après un dépôt dont l'enregistrement a échoué : rare, l'application tente déjà de les retirer). La base contenait 0 fichier et 0 document au moment de la migration : rien à rattraper.

### Vérifié et non vérifié

- **Vérifié** : 477 assertions pgTAP passent en local (442 → 477 : 14 pour l'acceptation, 21 pour la file, dont la suppression d'une organisation à l'essai terminé) ; 425 tests Vitest ; types et lint propres. Sur le vrai Supabase : colonnes, droits (le client ne peut ni écrire ni insérer les colonnes, `anon` ne les lit pas), fonction d'inscription à jour, déclencheur et fonctions présents, droits d'exécution (`anon` refusé), table de file illisible, aucune donnée modifiée. Les conseillers de sécurité ne signalent rien de nouveau, hormis les deux fonctions exécutables par `authenticated` (voulu : elles vérifient le rôle elles-mêmes) et la table de file sans règle (voulu : tout refus).
- **Vérifié en réel (même jour, comptes de test avec votre accord, tous supprimés ensuite)** : `e2e/fichiers-acceptation.spec.ts`, 5 tests, avec de vraies sessions sur le vrai Supabase. (1) Le déclencheur d'inscription réel, sur la vraie table des comptes, enregistre la version et une date de la base pour l'administrateur (inscription directe) et pour l'éditeur (inscription sur invitation), et rien pour le lecteur sans version. (2) Un membre ne peut ni modifier ni forger son acceptation (refus 403, code 42501, valeurs intactes), mais modifie toujours ses autres champs. (3) Le lecteur ne voit rien dans la file et ne peut rien en retirer ; l'anonyme est refusé. (4) Supprimer un projet **dans l'application** retire son fichier du bucket réel et vide la file. (5) Supprimer un projet par l'API seule, sans nettoyage, laisse le fichier et son chemin en file ; l'éditeur qui ouvre l'application le retire tout seul. Les parcours existants (`coeur-se`, `api` : 16 réussis, 3 ignorés car hors phase) passent toujours, dont la suppression d'un document puis celle du projet avec ses fichiers. Après suppression des comptes, la base est identique à son état de départ, table par table (1 utilisateur, 1 organisation, 2 projets, 0 document, 0 fichier, file vide).
- **Toujours non vérifié** : l'inscription **par le formulaire** (la confirmation d'e-mail exige un SMTP : Resend sans domaine, voir `PLACEHOLDERS.md`) ; le chemin réel du formulaire jusqu'aux métadonnées est couvert par un test d'écran, et le déclencheur par le test réel ci-dessus, mais pas bout en bout. La phase 2 (fin d'essai) n'a pas été rejouée pour la file (couverte en pgTAP). Lighthouse et les autres points du §16 restent ouverts.
