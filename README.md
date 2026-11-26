# Pilot M&E

Application de pilotage du suivi-évaluation (S&E / M&E) pour les ONG, PME et projets financés par des bailleurs en Afrique de l’Ouest. Brief de construction : [PILOT_ME_BRIEF_v3.md](PILOT_ME_BRIEF_v3.md).

## État d’avancement

**Lot 0 (fondations) : construit, vérifié en local.** Authentification (inscription, connexion, mot de passe oublié, réinitialisation), invitation par lien, layout de l’app (projets, équipe, paramètres), schéma de base avec RLS, quotas, fin d’essai en lecture seule et projet exemple.

**Lot 1a (indicateurs, saisie, tableau de bord) et Lot 1b (import CSV/Excel, export PDF) : construits, vérifiés par les tests, pas encore exercés dans le navigateur avec une session réelle.** Page de chaque projet avec ses onglets Tableau de bord, Indicateurs, Saisie, Import et Rapports ; jauge segmentée sur la liste des projets ; calculs d’indicateurs testés (`src/lib/kpi.ts`) ; rapport PDF avec logo, période, indicateurs, graphiques et commentaires.

**Lot 1c (landing complète, formulaire de contact, `vercel.json`) : construit.** La Edge Function `submit-lead` est déployée et testée pour de vrai ; les secrets d’envoi d’e-mail, Turnstile et Plausible ne sont pas configurés.

**Lot 1d (pitch deck, tests de bout en bout, Lighthouse) : construit et exécuté.** Le Lot 1 est complet ; deux points restent ouverts (Lighthouse performance, inscription par l’interface), voir `DECISIONS.md` section 12 et le tableau des critères d’acceptation ci-dessous.

**Lot 2 (cœur S&E) : terminé.** Programmes et taux d’avancement, cadre logique, phases et étapes, plan de travail annuel, réalisations avec preuves jointes, prochaines étapes (dont depuis l’alerte d’un indicateur), états d’avancement, documents, étiquettes et paramètres de suivi-évaluation, exercés avec une session réelle et par des tests de bout en bout (voir `DECISIONS.md`, sections 13 à 17, et `e2e/README.md`). La landing distingue ce qui est disponible de ce qui est annoncé. 

**Lot 3a (finances et budgets) : construit.** Lignes budgétaires par poste et par année, dépenses avec justificatif, taux d’exécution et taux financier dans les trois taux d’avancement (projet, programme, états d’avancement). Migration appliquée sur le vrai Supabase ; parcours joué en réel avec des comptes de test (voir `DECISIONS.md`, section 19). Les dépenses sont réservées aux administrateurs (le budget reste géré par les admins et les éditeurs).

**Lot 3b (composantes et planning) : construit.** Les composantes (axes du projet) avec leurs dates et leur statut, le planning en diagramme de Gantt dessiné en SVG, le rattachement des activités du plan de travail et l’avancement par composante. Migration appliquée sur le vrai Supabase ; parcours joué en réel avec des comptes de test (`DECISIONS.md`, section 20).

**Lot 3c (acteurs et bénéficiaires) : construit.** L’annuaire d’acteurs de l’organisation et leur rôle dans chaque projet, et les effectifs de bénéficiaires par période, catégorie, sexe et tranche d’âge (aucune fiche nominative). Migration appliquée sur le vrai Supabase ; parcours joué en réel avec des comptes de test (`DECISIONS.md`, section 21).

**Lot 3e, première moitié (rapport PDF consolidé d’un programme) : construit et vérifié en réel.** Un bouton sur la page d’un programme génère un PDF : avancement consolidé, tableau des projets, points d’attention (`DECISIONS.md`, section 22). L’envoi automatique programmé n’est pas construit (il exige un domaine d’envoi vérifié). 

**Lot 3d (localités, zones d’intervention et carte) : construit et vérifié en réel.** Un référentiel de localités sourcées (Yoff : sa hiérarchie administrative et les sept quartiers de son village traditionnel), des localités propres à chaque organisation, les zones d’intervention d’un projet avec leur carte (Leaflet, fond OpenStreetMap), et le rattachement facultatif d’une saisie ou d’une réalisation à une localité (`DECISIONS.md`, section 23). Le reste du Sénégal n’est pas chargé : il faudra un jeu de données complet, daté et sourcé.

**Lot 3f (paiement Stripe) : construit et vérifié en réel, en mode test.** Souscription par vous avec une carte de test, plan activé par le webhook, portail client, résiliation planifiée puis immédiate (lecture seule) : voir `DECISIONS.md`, section 27 ; le mode réel et le côté commercial et juridique restent à faire. Abonnement avec reconduction (compte en France, euros) : trois fonctions Edge déployées, abonnements en base, carte « Abonnement en ligne » dans Paramètres, qui n’apparaît que lorsque Stripe est configuré. Testé avec une fausse API Stripe, puis avec le vrai Stripe en mode test (`DECISIONS.md`, sections 25 et 27). **Rapports programmés : reportés** (aucun domaine d’envoi).

**Lot 4a (saisie hors ligne) : construit et vérifié en réel (Chrome).** L'application s'ouvre sans réseau après une première connexion, les valeurs d'indicateurs saisies sans réseau restent sur l'appareil et partent au retour de la connexion (identifiant tiré sur l'appareil : un rejeu ne crée pas de doublon ; un conflit avec la valeur d'un autre se règle à l'écran ; la déconnexion est bloquée tant que des saisies n'ont été ni envoyées ni supprimées). Installable (manifeste, icônes), service worker produit au build (`scripts/generer-sw.mjs`). Voir `DECISIONS.md`, section 26. Joué dans Chrome et dans le vrai Safari de bureau (`DECISIONS.md`, section 28) ; Safari sur iPhone et de vrais téléphones ne sont pas testés.

**Lot 4b (rapport de suivi par e-mail) : construit, pas encore envoyé pour de vrai.** Chaque membre choisit de recevoir, chaque semaine ou chaque mois, un e-mail récapitulatif de l'avancement de son organisation (taux des vues d'avancement, points d'attention, lien vers l'application) ; réglage dans Paramètres, envoi toutes les heures par `pg_cron` et `pg_net`, fonction `rapports-programmes` déployée. Il manque vos secrets (`RESEND_API_KEY`, `EMAIL_FROM`) pour qu'il parte ; la landing garde « Bientôt » (`DECISIONS.md`, section 29).

**Vérifié sur le vrai Supabase (projet « Pilot M&E », région eu-west-1) :** les deux migrations sont appliquées. Les 120 premières assertions pgTAP ont été rejouées en SQL puis annulées (la base ne contient aucune donnée de test) ; les droits du rôle de service ont été contrôlés et l’invitation simulée sur l’organisation réelle, également annulée. L’application est reliée à ce projet via `.env.local`.

**Déployée :** l’Edge Function `invite-member` (version 1). Les refus ont été testés depuis le navigateur (sans jeton, jeton invalide, mauvaise méthode, requête CORS préalable) ; le cas nominal, où un administrateur invite quelqu’un, ne l’a pas été. Aucun secret n’est posé : sans `APP_URL`, `RESEND_API_KEY` et `EMAIL_FROM`, aucun e-mail n’est envoyé et le lien est seulement affiché à l’administrateur.

**Pas encore vérifié :** un parcours d’inscription réel (confirmation d’e-mail comprise), le trigger d’inscription sous le rôle interne d’Auth, le temps réel et le cas nominal de l’invitation. Réglages à faire dans le tableau de bord : voir « Mise en route de la base ».

## Prérequis

- Node.js 24 LTS ou plus récent.
- Pour un backend réel : un projet Supabase (région Europe) ; pour les tests officiels de la base, Docker Desktop et la CLI Supabase ; pour la production, un compte Vercel, un nom de domaine et un fournisseur d’e-mails (Resend par défaut). Détail : section 11.1 du brief.

## Installation

```bash
npm install
cp .env.example .env.local
npm run dev
```

L’application tourne sur http://localhost:5173. Sans variables Supabase, les pages s’affichent et un bandeau indique que l’inscription et la connexion ne sont pas encore actives.

## Variables d’environnement

Front (`.env.local`, préfixe `VITE_`, aucune clé secrète) : voir [.env.example](.env.example). `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` suffisent pour le Lot 0 ; les variables de contact sont facultatives (les boutons correspondants n’apparaissent pas si elles sont vides).

Edge Functions : secrets posés avec `npx supabase secrets set --env-file supabase/functions/.env` ; modèle dans [supabase/functions/.env.example](supabase/functions/.env.example). La clé service est injectée par Supabase et ne figure dans aucun fichier.

## Mise en route de la base

1. Créer un projet Supabase, puis le relier : `npx supabase link --project-ref <ref>`.
2. Appliquer le schéma : `npx supabase db push`.
3. Renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans `.env.local`.
4. Dans Authentication > URL Configuration, ajouter l’adresse de l’application aux URL de redirection autorisées.
5. Déployer l’invitation : `npx supabase functions deploy invite-member` (déjà fait pour le projet « Pilot M&E » ; `config.toml` désactive la vérification JWT de la passerelle pour cette fonction, qui authentifie elle-même l’appelant).
6. Brancher un SMTP personnalisé (Resend) dans Authentication > SMTP ; sans lui, la confirmation d’inscription et la réinitialisation de mot de passe n’arrivent qu’aux membres de l’équipe Supabase.

**Historique des migrations.** Les migrations ont été appliquées par le MCP Supabase, qui leur donne ses propres versions, différentes de celles des fichiers locaux : `20261124100755` (`lot0_lot1`, fichier `20261123120000`), `20261124104430` (`droits_service_role`, `20261124120000`), `20261124113205` (`realtime_replica_identity`, `20261124130000`), `20261124122923` (`importer_saisies`, `20261125100000`), `20261124164409` (`lot2_coeur_se`, `20261126100000`), `20261125100814` (`acceptation_conditions`, `20261126110000`) et `20261125100843` (`fichiers_a_retirer`, `20261126120000`) `20261125105250` (`lot3a_finances`, `20261126130000`), `20261125120102` (`depenses_reservees_aux_admins`, `20261126140000`) `20261125121653` (`lot3b_composantes`, `20261126150000`) `20261125125152` (`lot3c_acteurs_beneficiaires`, `20261126160000`) `20261125144729` (`lot3d_localites`, `20261126170000`), `20261125163712` (`lot3f_abonnements`, `20261126180000`) `20261125185143` (`lot4a_saisie_hors_ligne`, `20261127100000`) les deux migrations du Lot 4b (`20261126173736` `lot4b_rapports_programmes` pour le fichier `20261127110000`, et `20261126173924` `lot4b_planificateur_rapports` pour le fichier `20261127120000`) et la migration de l’audit de sécurité (`20261126181757` `audit_securite` pour le fichier `20261127130000`). Avant le premier `npx supabase db push`, alignez l’historique : `npx supabase migration repair --status reverted 20261124100755 20261124104430 20261124113205 20261124122923 20261124164409 20261125100814 20261125100843 20261125105250 20261125120102 20261125121653 20261125125152 20261125144729 20261125163712 20261125185143 20261126173736 20261126173924 20261126181757`, puis `npx supabase migration repair --status applied 20261123120000 20261124120000 20261124130000 20261125100000 20261126100000 20261126110000 20261126120000 20261126130000 20261126140000 20261126150000 20261126160000 20261126170000 20261126180000 20261127100000 20261127110000 20261127120000 20261127130000`.

Régénérer les types après chaque migration : `npm run db:types` (lit un Supabase local : Docker requis). `src/lib/database.types.ts` est pour l’instant écrit à la main, au format de la CLI.

## E-mails d’invitation

Depuis la page Équipe, une invitation crée un lien (toujours affiché, à copier ou à partager sur WhatsApp) **et** tente d’envoyer un e-mail. L’envoi passe par [Resend](https://resend.com) ; tant qu’il n’est pas configuré, la page l’indique (« l’envoi d’e-mails n’est pas encore configuré ») et rien n’est envoyé. Une invitation en attente peut être renvoyée : cela crée un nouveau lien et invalide l’ancien.

Pour activer l’envoi, trois choses sont à faire de votre côté :
1. Créer un compte Resend, vérifier votre domaine d’envoi (enregistrements DNS SPF et DKIM) et créer une clé d’API. Sans domaine vérifié, Resend ne permet d’écrire qu’à l’adresse du propriétaire du compte : suffisant pour un premier essai, pas pour inviter d’autres personnes.
2. Dans le tableau de bord Supabase, **Edge Functions > Secrets**, ajouter :
   - `RESEND_API_KEY` : la clé d’API Resend ;
   - `EMAIL_FROM` : l’expéditeur, sur le domaine vérifié, par exemple `Pilot M&E <invitations@votre-domaine.com>` ;
   - `APP_URL` : l’adresse publique de l’application (`http://localhost:5173` pour un essai local), utilisée dans le lien de l’e-mail. **C’est aussi la seule origine admise par les fonctions appelées depuis le navigateur (CORS)** : en production, l’adresse du site, sans quoi le formulaire de la landing, les invitations et le paiement seraient refusés par le navigateur ;
   - `ALLOWED_ORIGINS` (facultatif) : autres origines admises, séparées par des virgules (un poste de développement `http://localhost:5173`, un site de prévisualisation).
3. Réessayer une invitation. En cas d’échec, la page affiche « l’e-mail n’a pas pu être envoyé » et le détail est dans les journaux de la fonction (Edge Functions > invite-member > Logs).

Les e-mails d’authentification de Supabase (confirmation d’inscription, mot de passe oublié) sont distincts : ils se règlent dans Authentication > SMTP.

## Critères d'acceptation du Lot 1 (brief, section 13)

| Critère | État |
|---|---|
| S'inscrire, créer un projet, des KPI, saisir et voir son dashboard en moins de 5 minutes | **Partiel** : connexion → tableau de bord en 15 à 20 s (chronométré par le test). L'inscription par l'interface n'est pas jouée (e-mail de confirmation) |
| Rôles (lecteur, éditeur, admin) et isolation entre organisations | **Vérifié** : pgTAP, appels API avec de vraies sessions, interface |
| Limites de plan refusées par la base et présentées avec un message d'upgrade | **Vérifié** (projets et utilisateurs en bout en bout ; indicateurs en pgTAP) |
| Contournements refusés (projet `is_demo`, `plan`, `essai_fin`, `plan_souhaite`, `leads`) | **Vérifié** : pgTAP et appels API réels |
| Fin d'essai : écritures refusées, lecture seule, export PDF disponible | **Vérifié** en bout en bout et côté API (`ESSAI_EXPIRE`) |
| Une personne invitée rejoint l'organisation sans en créer une | **Partiel** : pgTAP et page « Rejoindre » ; inscription de l'invité non jouée dans l'interface |
| Dashboard mis à jour sans rechargement | **Vérifié** (deux sessions) |
| Export PDF propre (logo, période, KPI, graphique) | **Vérifié**, hors logo téléversé dans le stockage réel |
| Import CSV/Excel avec mapping, erreurs ligne par ligne | **Vérifié** avec un CSV réel ; Excel testé en unitaire et dans le navigateur |
| Landing : Lighthouse ≥ 90, 375 px, formulaire enregistré en base | 375 px et formulaire **vérifiés** ; Lighthouse **accessibilité, bonnes pratiques et SEO à 100, performance non atteinte** (médiane 80 sur un poste très chargé) |
| Fonctions citées par la landing livrées ou « Bientôt » ; aucun chiffre non mesuré | **Vérifié** (affirmations à mesurer listées dans `PLACEHOLDERS.md`) |
| Deck de 10 slides exportable en PDF propre | **Vérifié** (10 pages, fonds conservés, rien d'invisible) |
| Contrastes AA, mouvement réduit respecté | **Vérifié** sur la landing, l'authentification, les pages légales et le deck ; écrans de l'application non contrôlés par outil |
| Aucun lorem ipsum, bouton mort, écran sans état vide, clé secrète dans le dépôt | **Vérifié** à la lecture des écrans et du dépôt (aucune clé secrète ; les clés publiques sont dans `.env.local`, ignoré) |

## Landing et formulaire de contact

La landing (`/`) est pré-rendue et ne dépend d'aucune variable pour s'afficher. Réglages (`.env.local`, et les mêmes dans Vercel) :

| Variable | Effet |
|---|---|
| `VITE_EDITEUR_NOM`, `VITE_CONTACT_EMAIL`, `VITE_WHATSAPP_NUMBER` | Pied de page, liens de contact, mentions légales et confidentialité |
| `VITE_SITE_URL` | Sitemap, `canonical`, `og:url`, `og:image` (adresses absolues obligatoires) |
| `VITE_PLAUSIBLE_DOMAIN` | Charge le script Plausible (sans cookie) et active les événements `Demo CTA Click`, `Lead Submit`, `Signup` |
| `VITE_TURNSTILE_SITE_KEY` | Affiche Cloudflare Turnstile dans le formulaire (poser aussi `TURNSTILE_SECRET_KEY` côté fonction) |

Le formulaire écrit dans la table `leads` par l'Edge Function `submit-lead` (déjà déployée sur le projet « Pilot M&E »). Pour recevoir les demandes par e-mail, poser dans Edge Functions > Secrets : `RESEND_API_KEY`, `EMAIL_FROM` et `CONTACT_EMAIL` (mêmes valeurs que pour les invitations). Sans cela, lire les demandes dans le tableau de bord Supabase (Table Editor > `leads`). `vercel.json` contient l'adresse du projet Supabase dans sa politique de sécurité : à mettre à jour si le projet change.

## Tests et vérifications

| Commande | Vérifie |
|---|---|
| `npm test` | Tests unitaires et d’interface (Vitest) : calculs d’indicateurs et d’avancement, cadre logique et plan de travail, suivi (prochaines étapes, états d’avancement, réalisations, documents, étiquettes), navigation du projet, géométrie des courbes, cartes d’indicateurs, import (lecture, validation, parcours complet), rapport PDF (contenu et rendu), landing (sections, tarifs, FAQ, démo), formulaire de contact et sa validation, traductions, erreurs, contexte d’organisation, redirections |
| `npm run db:test:local` | Migrations et 851 assertions pgTAP sur un Postgres embarqué, sans Docker |
| `npx supabase test db` | Les mêmes tests sur le vrai socle Supabase (Docker requis) : **référence** |
| `npm run typecheck` | Types TypeScript |
| `npm run lint` | ESLint |
| `npm run build` | Compilation et pré-rendu de `/`, `/mentions-legales`, `/confidentialite` ; génère aussi `sitemap.xml` si `VITE_SITE_URL` est défini |
| `npm run e2e` | Tests de bout en bout (Playwright, Chrome du poste) sur le build : pages publiques, deck, impression PDF, accessibilité ; avec `.env.e2e`, parcours authentifié, parcours du cœur S&E, accessibilité des écrans de l’application et sécurité côté API, stockage compris (voir `e2e/README.md`) |
| `npm run lighthouse` | Lighthouse mobile (médiane de plusieurs passes) sur le build |
| `npm run apercu` | Sert `build/client` avec les en-têtes et la réécriture de `vercel.json` (`http://localhost:4173`), pour vérifier la politique de sécurité sur le vrai build |

Les tests pgTAP couvrent : isolation entre organisations, droits par rôle (admin, éditeur, lecteur, anonyme), quotas de plan, fin d’essai en lecture seule, projet exemple protégé, invitations, import par lots, et les tentatives de contournement (projet `is_demo` créé par un client, modification de `plan` ou `essai_fin`, accès direct à `leads`).

## Structure

```
src/
  root.tsx, routes.ts        racine et routes (React Router, mode framework)
  pages/                     landing, auth, app, legal
  components/ui/             primitives (boutons, champs, dialogues…)
  components/app/            composants de l’application
  hooks/                     contexte d’organisation
  lib/                       supabase, auth, erreurs, constantes, formats, calculs d’indicateurs (kpi.ts), accès aux données (donnees.ts)
  i18n/                      fr.json (en.json prêt à remplir)
supabase/
  migrations/                schéma, RLS, triggers, projet exemple
  tests/                     tests pgTAP
  functions/invite-member/   invitation de membres (clé service)
scripts/                     banc de test SQL local
```

## Documents du projet

- [DECISIONS.md](DECISIONS.md) : décisions et alternatives écartées.
- [PLACEHOLDERS.md](PLACEHOLDERS.md) : tout contenu provisoire ou manquant.
