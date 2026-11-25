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
