# Tests de bout en bout

```bash
npm run build          # le build est servi avec les en-têtes de vercel.json
npm run e2e            # pages publiques, deck, impression PDF (aucun compte requis)
npm run lighthouse     # Lighthouse mobile, médiane de 3 passes (LH_PASSES=5 pour plus de stabilité)
```

## Parcours authentifié (`parcours.spec.ts`)

Il se connecte au **vrai projet Supabase** avec trois comptes de test (administrateur, éditeur, lecteur) d'une organisation
de test. Sans ces comptes, il est ignoré. Les identifiants sont lus dans `.env.e2e` (ignoré par git) :

```
E2E_ADMIN_EMAIL=…   E2E_ADMIN_MDP=…
E2E_EDITEUR_EMAIL=… E2E_EDITEUR_MDP=…
E2E_LECTEUR_EMAIL=… E2E_LECTEUR_MDP=…
```

Les comptes se créent par SQL (e-mails confirmés d'office, rattachement par invitation) : l'inscription par l'interface
envoie un e-mail de confirmation, ce que le SMTP par défaut de Supabase refuse pour des adresses fictives.
`supabase/e2e/creer_comptes.sql` et `supprimer_comptes.sql` en donnent le modèle. **À supprimer après usage.**

- Phase 1 (`npm run e2e`) : parcours complet chronométré (< 5 min), export PDF, import CSV, limites de plan,
  invitation par lien, rôles, temps réel entre deux sessions, mobile 375 px, mouvement réduit.
- Phase 2 (`E2E_PHASE=2 npm run e2e`) : après `update public.organisations set essai_fin = now() - interval '1 day'`
  sur l'organisation de test, vérifie la lecture seule et l'export PDF, y compris pour le cœur S&E et le stockage.

## Cœur suivi-évaluation (Lot 2)

Mêmes comptes de test que ci-dessus.

- `coeur-se.spec.ts` : un projet suivi de bout en bout avec les trois rôles. L'administrateur crée le projet, ses
  indicateurs et son cadre logique complet (les codes OG, OS1, R1.1, A1.1.1 sont calculés par la base), pose les cinq
  phases types et un jalon, planifie une activité au plan de travail (le taux physique du projet suit), saisit une
  valeur, crée une prochaine étape depuis l'alerte de l'indicateur, rédige un état d'avancement (taux figés, qui ne
  bougent plus après une nouvelle saisie), étiquette le projet et le rattache à un programme. L'éditeur enregistre
  une réalisation et dépose une preuve (refus d'un fichier HTML et d'un fichier de plus de 20 Mo, vrai PDF, téléchargement),
  puis modifie et supprime le document (le fichier part avec). Le lecteur consulte et télécharge sans pouvoir rien
  écrire. Le projet et le programme de test sont supprimés à la fin.
  **Place nécessaire** : le parcours crée un projet, et l'essai en autorise trois. S'il n'y a pas de place (le parcours
  du Lot 1 en laisse trois), il le dit et s'arrête : supprimer d'abord les projets de test (voir `supabase/e2e/creer_comptes.sql`).
- `accessibilite-app.spec.ts` : axe-core (WCAG 2 A/AA, 2.1 AA, bonnes pratiques) sur chaque écran de l'application,
  formulaires ouverts et vues alternatives comprises (matrice du cadre logique, liste du plan de travail), puis, sur
  téléphone, l'absence de débordement horizontal et les trois rubriques sur une ligne. Le projet d'exemple fournit le
  contenu ; il est chargé s'il manque et supprimé à la fin.
- `api.spec.ts` : refus de la base et du stockage avec de vraies sessions (lecteur, éditeur, anonyme, fin d'essai).
- `fichiers-acceptation.spec.ts` : l'acceptation des conditions enregistrée par la base (administrateur et éditeur avec une
  version, lecteur sans ; un membre ne peut ni la modifier ni la forger) et le nettoyage des fichiers d'un projet supprimé
  (suppression dans l'application, puis suppression par l'API seule rattrapée à l'ouverture de l'application). Il crée deux
  projets de test avec un fichier chacun et les supprime à la fin ; il demande de la place pour deux projets. **Les comptes
  doivent avoir été créés avec la version à jour de `supabase/e2e/creer_comptes.sql`** (métadonnée `conditions_version`).
- `finances.spec.ts` (Lot 3a) : un budget par poste et par année, des dépenses (dont une avec un vrai PDF comme
  justificatif, téléchargé), un dépassement signalé, le taux financier dans l'en-tête du projet, le taux figé dans
  un état d'avancement, le refus de supprimer une ligne qui a des dépenses, la lecture seule du lecteur, puis la
  suppression du projet (dépenses et fichier du justificatif compris). Il crée « Projet E2E finances » et demande une
  place libre dans le quota de trois projets.
- `composantes.spec.ts` (Lot 3b) : créer des composantes (une datée, une à planifier), refus d'un doublon de nom et d'une
  seule date, planning en diagramme de Gantt, rattachement d'une activité du plan de travail, lecture seule du lecteur,
  refus de la base (lecteur, rattachement à un autre projet, doublon) et suppression d'une composante qui garde ses
  activités. Il crée deux projets de test (« Projet E2E composantes » et un second) : il demande de la place pour deux
  projets dans le quota de trois.
- `acteurs-beneficiaires.spec.ts` (Lot 3c) : l'annuaire d'acteurs de l'organisation (doublon de nom et adresse mal formée refusés,
  suppression réservée aux admins), le rôle d'un acteur dans un projet (dont la création d'un acteur depuis le projet, qui
  ouvre aussitôt le rôle), les effectifs de bénéficiaires (synthèse, part des femmes, cumul de plusieurs périodes avec son
  avertissement, doublon refusé), la lecture seule du lecteur, les refus de la base (lecteur, marquage « exemple »,
  effectif négatif, période à l'envers) et la suppression du projet (rôles et effectifs partent, l'annuaire reste). Il crée
  « Projet E2E acteurs » et deux acteurs, qu'il supprime à la fin ; il demande une place libre dans le quota de trois projets.
- `rapport-programme.spec.ts` (Lot 3e) : la page d'un programme de deux projets (l'un avec un indicateur, une saisie et la moitié de
  son budget dépensé, l'autre sans donnée) et le téléchargement du rapport PDF consolidé par un administrateur et par un
  lecteur (un vrai PDF, nommé d'après le programme et la date), plus l'accessibilité de la page et, sur téléphone (375 px), l'absence de débordement. Il crée un programme et
  deux projets de test, qu'il supprime à la fin ; il demande de la place pour deux projets dans le quota de trois.
- `zones.spec.ts` (Lot 3d) : les zones d'intervention d'un projet, choisies dans le référentiel de Yoff (la commune a des coordonnées
  sourcées, ses quartiers n'en ont pas), la création d'une localité de l'organisation (refusée si elle recrée une localité du
  référentiel, ou avec une latitude hors limites), la carte (un repère par zone avec coordonnées, repère atteignable au clavier,
  images de fond OpenStreetMap, aucune violation de la politique de sécurité), une réalisation et une saisie rattachées à une
  localité, le retrait d'une zone qui laisse les rattachements, la suppression d'une localité refusée tant qu'une zone s'en sert,
  la lecture seule du lecteur, et les refus de la base (lecteur, écriture du référentiel, niveau figé, localité hors zone). **Il
  charge des images depuis tile.openstreetmap.org : il exige un accès au réseau.** Il crée « Projet E2E zones » et des localités
  « … E2E », qu'il supprime à la fin ; il demande une place libre dans le quota de trois projets.
- `hors-ligne.spec.ts` (Lot 4a) : la saisie hors ligne, contre le build et le vrai Supabase. (1) Le serveur de l'application est ARRÊTÉ (le test lance
  son propre serveur sur le port 4191 et le tue), le navigateur est hors ligne et le jeton d'accès est rendu périmé : l'application s'ouvre depuis le
  cache du service worker, reprend la session gardée, affiche les données gardées ; une valeur saisie sans réseau reste dans la file et survit à un
  rechargement ; au retour du réseau elle part, et la ligne de la base porte l'identifiant tiré sur l'appareil (**ce scénario dure deux minutes** :
  supabase-js garde un renouvellement de jeton échoué pendant une minute, même après le retour du réseau). (2) Rejeu : la requête atteint la base, sa
  réponse est coupée, l'appareil renvoie, une seule ligne. (3) Conflit réel avec la valeur d'un autre compte, résolu en remplaçant. (4) Déconnexion
  bloquée tant que des saisies attendent, puis envoyées ou supprimées avec confirmation. (5) Téléphone (375 px) sans débordement. Axe sur le bandeau
  hors ligne, la carte d'attente, le conflit et la fenêtre de déconnexion. Il crée « Projet E2E hors ligne », qu'il supprime à la fin ; il demande une
  place libre dans le quota de trois projets. Le port 4191 doit être libre.
