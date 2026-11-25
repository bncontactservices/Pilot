# {{PRODUCT_NAME}} — Brief de construction (v3)

> Brief maître pour l’agent de développement (Claude Code ou équivalent). Les variables `{{LIKE_THIS}}` sont renseignées après les questions de démarrage (section 3.2). En cas de conflit entre deux passages : règles d’or > décisions arrêtées (3.1) > design system > spécification de la partie concernée.

---

## Journal des changements v2 → v3

La v3 corrige des failles de sécurité du modèle de quotas et de la RLS, aligne la landing sur ce que livre réellement le Lot 1, précise les calculs KPI et arrête les décisions d’architecture que la v2 laissait ouvertes. La numérotation des sections de la v2 est conservée.

| # | Changement | Raison | Sections |
|---|---|---|---|
| 1 | `is_demo` non modifiable côté client ; projet exemple créé uniquement par `charger_projet_exemple()`, un seul par organisation, définitions de KPI figées | Un éditeur pouvait créer via l’API un projet « exemple » qui échappe aux quotas | 9.2, 9.3, 9.4 |
| 2 | Droits par colonne sur `organisations` : `plan` et `essai_fin` modifiables uniquement avec la clé service | Un admin pouvait s’attribuer le plan Enterprise ou prolonger son essai | 9.4 |
| 3 | Aucune vue SQL au Lot 1 ; à partir du Lot 2, `v_avancement` créée avec `security_invoker = true` | Une vue Postgres ignore la RLS par défaut ; un seul calcul (TypeScript) au Lot 1 | 4.2, 9.5 |
| 4 | `audit_log` : ajout de `org_id`, colonne `table` renommée `table_name` | RLS impossible sans `org_id` ; `table` est un mot réservé SQL | 9.3 |
| 5 | `org_id` dénormalisé sur `kpis` et `kpi_entries` (rempli par trigger, immuable) | RLS simple et rapide, filtre Realtime par organisation | 9.3, 9.4 |
| 6 | Trigger d’inscription : rejoint l’organisation si un jeton d’invitation valide est fourni, sinon crée l’organisation d’essai | Une personne invitée se retrouvait avec sa propre organisation | 9.4 |
| 7 | Leads reçus par l’Edge Function `submit-lead` ; aucun accès direct à la table depuis le client | Un jeton Turnstile non vérifié côté serveur ne protège rien | 8.I, 9.4 |
| 8 | Fonctions d’aide RLS placées dans un schéma `private` | Non exposées comme RPC par l’API | 9.4 |
| 9 | « Rapports automatiques » devient « Rapport PDF en un clic » ; l’envoi programmé passe en « Bientôt » (Lot 3) | Règle d’or 6 : le Lot 1 ne livre que l’export manuel | 3.2, 4.2, 8.B, 8.D, 8.G, 10 |
| 10 | Bande de confiance : faits produit vérifiables à la place de « −80 % de temps de reporting » | Règle d’or 2 : aucun chiffre non mesuré sur une page publique | 1, 8.B |
| 11 | Dashboard abonné à Supabase Realtime | Rend vraie la promesse « en temps réel » | 9.1, 9.6 |
| 12 | Essai = limites du plan Pro ; fin d’essai = lecture seule (erreur typée `ESSAI_EXPIRE`) | Le prospect doit pouvoir tester la collaboration ; la fin d’essai n’était pas définie | 3.1, 8.G, 9.2 |
| 13 | Une organisation par utilisateur au MVP | Aucun écran de changement d’organisation n’était prévu | 3.1, 9.3 |
| 14 | Tokens de statut `--status-*` par preset, distincts de l’accent ; boutons d’action de l’app en couleur primaire | L’accent des presets A, B et C se confondait avec les couleurs de statut | 5, 6.4 |
| 15 | Courbe du hero en SVG maison (géométrie partagée avec les sparklines et le PDF) ; Recharts réservé à l’app et au deck | Tenir 200 Ko de JS initial et un LCP < 2,5 s | 8.B, 11 |
| 16 | Tailwind CSS v4 + React Router v7 en mode framework avec pré-rendu | Compatibilité shadcn/ui ; pré-rendu natif de la landing | 3.1, 7, 11, 12 |
| 17 | Calculs KPI précisés : cumul (base + somme depuis le début du projet), retard de saisie selon la fréquence, valeur aberrante sans division par zéro, cumul décroissant interdit | Ambiguïtés de la v2 | 6.4, 9.5 |
| 18 | Dashboard : filtre de période + sélecteur de projet ; pas de vue consolidée multi-projets au Lot 1 | Le filtre « projet » était ambigu | 9.6 |
| 19 | Invitations : lien copiable et partage WhatsApp en plus de l’e-mail | Canal principal du terrain ; fonctionne même sans fournisseur d’e-mail | 9.4, 9.6 |
| 20 | Indicateur « En ligne » du pied de page relié à un vrai contrôle de santé | Règle d’or 1 : un voyant toujours vert serait factice | 8.I |
| 21 | Prérequis du fondateur (comptes, e-mails, Docker, Supabase Pro), cadre légal sénégalais, ordre de coupe du Lot 1 | Absents de la v2 | 4.1, 11.1 |
| 22 | Polices auto-hébergées via `@fontsource` | Performance, CSP plus stricte, mêmes fichiers pour le PDF | 11 |
| 23 | Impression du deck : animations forcées à leur état final | Des animations en pause figeaient des éléments invisibles dans le PDF | 10 |

---

## 1. Rôle et règles d’or

Tu es Technologue Créatif Senior et Lead Ingénieur Full-Stack (React, TypeScript, Supabase). Tu construis un produit SaaS B2B haute fidélité : une application de pilotage du Suivi-Évaluation (S&E / M&E), la landing page qui la vend et le pitch deck qui la défend. Le résultat doit inspirer confiance dès la première seconde à une directrice de programme d’ONG, à un chef de projet bailleur et à un investisseur.

« Pixel perfect » signifie ici : fidélité stricte aux tokens, espacements et règles de ce brief (il n’existe pas de maquette externe). Ce n’est ni un template Bootstrap, ni un dashboard Power BI générique : c’est un produit sérieux, lisible, rapide, qui respire la donnée fiable.

**Règles d’or (valables à chaque étape)**

1. **Tout ce qui est visible fonctionne.** Chaque bouton, formulaire, lien, animation, indicateur et export est réel. Aucune fonctionnalité factice. Seul le contenu manquant (chiffres, témoignages, logo, montants) peut être un placeholder.
2. **Aucune preuve inventée.** Pas de faux témoignage, pas de logo client fictif, pas de chiffre présenté comme mesuré, pas de photo présentée comme celle d’un client ou d’une équipe utilisatrice. Toute affirmation chiffrée non fournie par l’utilisateur est listée dans `PLACEHOLDERS.md` (fichier, emplacement, valeur provisoire). Dans le deck, elle porte la mention « à valider ». Sur la landing, qui est publique, elle n’apparaît pas : on la remplace par un fait produit vérifiable (ex. « Export PDF en 1 clic »).
3. **Avancer par lots** (section 4). Chaque lot se termine par un point de contrôle : build sans erreur, tests verts, résumé de 10 lignes maximum à l’utilisateur. Ne pas entamer le lot suivant tant que le critère de sortie n’est pas atteint.
4. **Décider plutôt que discuter.** Face à une ambiguïté non bloquante, choisir l’option la plus simple, la consigner dans `DECISIONS.md` (décision, raison, alternative écartée) et continuer. Ne poser une question que si la réponse change le schéma de données ou l’architecture **et** qu’elle n’est pas déjà tranchée en 3.1.
5. **Zéro pattern générique d’IA** : pas de dégradés violets aléatoires, pas de cartes identiques empilées, pas d’icônes décoratives sans sens, pas de lorem ipsum, pas de dashboard en cartes toutes semblables.
6. **La landing ne promet que ce qui est livré.** Les fonctions des lots suivants apparaissent avec un badge « Bientôt », jamais comme acquises.
7. **Aucun compte tiers créé par l’agent.** Supabase, Vercel, fournisseur d’e-mails, Turnstile, Plausible : ces comptes sont à la charge du fondateur (section 11.1). S’il en manque un, travailler avec l’environnement local (`supabase start`) et le signaler au point de contrôle.

---

## 2. Contexte produit

Les valeurs ci-dessous sont les valeurs par défaut ; les réponses de la section 3.2 les remplacent.

- **Produit :** `{{PRODUCT_NAME}}` (défaut : Pilot M&E), SaaS de pilotage du suivi-évaluation et de la performance.
- **Promesse :** « Pilotez vos projets avec des données fiables, en temps réel. »
- **Cibles :** ONG, PME, projets financés par des bailleurs, au Sénégal et en Afrique de l’Ouest (francophone d’abord).
- **Douleurs :** données dispersées (Excel, WhatsApp, e-mails), rapports qui prennent des heures, décisions sans visibilité.
- **Concurrence :** Power BI (trop complexe), Excel (ni temps réel ni collaboration), outils M&E existants (trop chers).
- **Objectif de phase :** Lot 1 (MVP fonctionnel) + landing qui convertit + pitch deck de 10 slides, en 2 semaines. Les fonctionnalités des lots 2 et 3 sont planifiées après validation du MVP par des clients pilotes.
- **Contraintes terrain :** connexions lentes, saisie sur téléphone, WhatsApp comme canal de contact principal, devise locale FCFA (XOF).

---

## 3. Démarrage

### 3.1 Décisions arrêtées (ne pas redemander)

Ces décisions changent le schéma ou l’architecture ; elles sont tranchées. Les recopier dans `DECISIONS.md` dès le Lot 0.

| Sujet | Décision | Alternative écartée |
|---|---|---|
| Essai | `{{TRIAL_DAYS}}` jours (défaut 14), sans carte, avec les limites du plan **Pro** | Limites Starter : un seul utilisateur, impossible de tester l’équipe et les rôles |
| Fin d’essai | **Lecture seule** : consultation et export PDF possibles, toute écriture refusée par la base (`ESSAI_EXPIRE`) | Blocage complet : données inaccessibles, perte de confiance |
| Organisations | **Une seule par utilisateur** au MVP (`unique(user_id)` sur `memberships`, contrainte levable plus tard) | Multi-organisation : demande un sélecteur d’organisation et complexifie la RLS |
| Styles | **Tailwind CSS v4** (`@tailwindcss/vite`, tokens dans `@theme`, `tw-animate-css`) + shadcn/ui | Tailwind v3.4 : shadcn/ui cible v4 par défaut |
| Routage et rendu | **React Router v7 en mode framework**, `ssr: false`, pré-rendu de `/`, `/mentions-legales` et `/confidentialite` ; le reste en SPA | Mode bibliothèque : pas de pré-rendu natif |
| Calcul des KPI | **TypeScript uniquement** au Lot 1 (`src/lib/kpi.ts`) ; vue SQL à partir du Lot 2 | Double calcul TypeScript + SQL : risque d’écart entre écrans et rapports |
| E-mails | **Fournisseur dédié** (Resend par défaut) : SMTP personnalisé pour Supabase Auth, API pour les Edge Functions | SMTP par défaut de Supabase : n’écrit qu’aux membres de l’équipe Supabase, quelques envois par heure |

### 3.2 Les 4 questions de démarrage (obligatoire)

Quand l’utilisateur demande de construire le produit, ou que ce fichier est chargé dans un nouveau projet : poser **immédiatement** les 4 questions ci-dessous en **un seul appel** `AskUserQuestion`, puis construire à partir des réponses. Ne pas poser d’autres questions.

> Contrainte de l’outil : 4 questions maximum, 2 à 4 options par question, l’option « Autre » permet la saisie libre. Si l’outil n’est pas disponible, poser les 4 questions dans un seul message texte, avec les mêmes défauts.

1. **Identité.** « Nom du produit, baseline et nom du fondateur ? »
   Options : « Garder Pilot M&E (défaut) » / « Autre » (format : *Nom : baseline, par Prénom Nom*).
2. **Direction esthétique.** Presets A, B, C ou D (section 5). Recommandation si aucune préférence : **A** (ONG, bailleurs) ; **C** si l’ancrage Afrique de l’Ouest est prioritaire.
3. **Offres tarifaires et devise.**
   Options : « Garder les offres par défaut en USD » / « Garder les offres par défaut avec équivalent FCFA affiché » / « Autre » (saisie libre).
   Offres par défaut : **Starter** 25 $/mois (1 projet, 5 KPI par projet, 1 utilisateur) ; **Pro** 50 $/mois (3 projets, 20 KPI par projet, 5 utilisateurs, invitations et rôles) ; **Enterprise** sur devis (illimité, support dédié). Équivalent FCFA indicatif, taux dans une constante unique modifiable.
4. **Éléments de preuve.** « Secteurs ciblés, 1 à 2 chiffres clés mesurés (avec leur source), logo, e-mail de contact, numéro WhatsApp, lien de démo (Calendly/Tally), expertise métier du fondateur ? »
   Options : « Je les fournis (Autre) » / « Utiliser des valeurs plausibles marquées placeholder ».
   Format de saisie suggéré pour « Autre » :
   ```
   Secteurs : …
   Chiffres clés : … (source : …)
   Logo : chemin du fichier, ou « aucun »
   E-mail de contact : …
   WhatsApp : +221…
   Lien de démo : …
   Expertise du fondateur : …
   ```
   Si vide : déduire des valeurs plausibles et les marquer dans `PLACEHOLDERS.md`. Un chiffre clé sans source n’apparaît pas sur la landing (règle d’or 2).

---

## 4. Périmètre et lots

### 4.1 Lots

| Lot | Contenu | Critère de sortie |
|---|---|---|
| **0 — Fondations** | Tokens du preset, scaffold, migrations de base, authentification (y compris invitations), layout app | Inscription → connexion → page vide avec états corrects ; tests pgTAP verts |
| **1 — MVP (2 semaines)** | P0 (auth, projets, KPI, saisie, dashboard temps réel) + P1 (export PDF, import CSV/Excel) + secteurs + landing complète + deck | Section 13 (critères d’acceptation du Lot 1) |
| **2 — Cœur S&E** | Programmes, cadre logique, plan de travail annuel, phases, étapes, états d’avancement, réalisations, prochaines étapes, documents, taux d’avancement, paramètres S&E | Parcours complet d’un projet suivi de bout en bout par un client pilote |
| **3 — Extensions** | Localités et carte, acteurs, bénéficiaires, finances et budgets, planning des composantes (Gantt), rapports de programme, rapports automatiques programmés, paiement en ligne | À planifier avec les retours pilotes |

**Ordre de coupe si le Lot 1 déborde** (du premier sacrifié au dernier) :
1. vidéo et zones cliquables de la section Démo (garder le composant animé) ;
2. effet magnétique et parallaxe ;
3. animations du deck (garder les slides statiques et l’impression) ;
4. import XLSX (garder le CSV).

Ne jamais couper : tests RLS, quotas, lecture seule de fin d’essai, états vides, de chargement et d’erreur.

### 4.2 Fonctionnalités demandées, reformulées et affectées

Les 19 fonctionnalités sont conservées. Plusieurs se recoupent : les définitions retenues sont explicites pour éviter les doublons.

| # | Fonctionnalité | Définition retenue | Table(s) | Lot |
|---|---|---|---|---|
| 1 | Phases d’un projet | Grandes étapes du cycle (Conception, Démarrage, Mise en œuvre, Suivi-évaluation, Clôture), personnalisables par projet | `phases` | 2 |
| 2 | Projet par secteur d’activité | Référentiel de secteurs (Eau et assainissement, Santé, Éducation, Agriculture et sécurité alimentaire, Énergie, Gouvernance, Genre et inclusion, Environnement et climat, Emploi et entrepreneuriat, Autre) | `secteurs`, `projects.secteur_id` | 1 |
| 3 | Plan de travail annuel (PTA) | Activités planifiées par année (trimestre ou dates, responsable, budget prévu, statut, % de réalisation) | `pta_activites` | 2 |
| 4 | Classification des projets par activité | **À clarifier.** Hypothèse retenue : typologie d’intervention (étiquettes libres : formation, infrastructure, plaidoyer, appui-conseil…) en plus du secteur. Si « activité » désigne les activités du cadre logique, c’est couvert par la fonctionnalité 15 | `projet_etiquettes` | 2 |
| 5 | Taux d’avancement des projets et programmes | Trois taux distincts, calculés : **résultats** (moyenne d’atteinte des KPI), **physique** (activités du PTA réalisées), **financier** (dépenses / budget). Agrégation par programme | Lot 1 : `src/lib/kpi.ts` uniquement. Lot 2 : vue SQL `v_avancement` en `security_invoker = true` | 1 (résultats) → 2 (physique) → 3 (financier) |
| 6 | Planning des composantes | Composante = axe ou groupe de résultats d’un projet ; planning en diagramme de Gantt | `composantes` | 3 |
| 7 | États d’avancement et statuts | **Statut** = énumération (non démarré, en cours, en retard, suspendu, terminé, clôturé). **État d’avancement** = rapport périodique narratif (période, faits marquants, difficultés, risques) | `projects.statut`, `etats_avancement` | 1 (statut) → 2 (états) |
| 8 | Répartition géographique par zones | Rattachement des projets, saisies et réalisations à des localités ; carte | `localites`, `projet_localites` | 3 |
| 9 | Fichiers et documents par projet | Dépôt de pièces (rapports, contrats, justificatifs) dans un stockage privé | `documents` + bucket privé | 2 |
| 10 | Réalisations | Extrants constatés (date, description, quantité, unité, localité, lien avec une activité ou un résultat, preuves jointes) | `realisations` | 2 |
| 11 | Prochaines étapes | Actions à mener (libellé, responsable, échéance, statut), pouvant être créées depuis une alerte KPI | `prochaines_etapes` | 2 |
| 12 | Rapports projets et programmes | Rapport PDF par projet, généré en un clic (Lot 1) ; rapport consolidé par programme et envoi automatique programmé (Lot 3) | — | 1 → 3 |
| 13 | Acteurs intervenants | Annuaire d’acteurs (bailleur, partenaire de mise en œuvre, prestataire, autorité locale) et leur rôle par projet | `acteurs`, `projet_acteurs` | 3 |
| 14 | Paramètres de base du S&E | Seuils vert/ambre (défaut 90/60), fréquence par défaut, unités personnalisées, devise, mois de début d’année fiscale | `parametres_se` | 2 (constantes dans `src/lib/constants.ts` au Lot 1) |
| 15 | Cadre logique | Matrice : Objectif global, Objectifs spécifiques, Résultats attendus, Activités ; pour chaque ligne : indicateurs (reliés aux KPI), moyens de vérification, hypothèses et risques | `cadre_logique_noeuds` | 2 |
| 16 | Localités | Référentiel hiérarchique (région > département > commune > village), pré-chargé pour le Sénégal | `localites` | 3 |
| 17 | Étapes de projet | Jalons et livrables datés rattachés à une phase | `etapes` | 2 |
| 18 | Bénéficiaires | Effectifs agrégés par catégorie, sexe, tranche d’âge, localité et période. Fiches nominatives uniquement si nécessaire, avec base légale et permissions renforcées | `beneficiaires_effectifs` | 3 |
| 19 | Finances et budgets | Lignes budgétaires par poste et par année, dépenses avec justificatif, taux d’exécution | `budget_lignes`, `depenses` | 3 |

Vocabulaire de référence : **phase** (macro-période) ≠ **composante** (axe thématique) ≠ **étape / jalon** (livrable daté) ≠ **prochaine étape** (action de court terme).

---

## 5. Presets esthétiques

Chaque preset définit : palette, typographie, identité, ambiance d’image (mots-clés Unsplash pour la landing et le deck).

### Preset A — « Clarté Institutionnelle » (confiance et rigueur)
- **Identité :** le rapport annuel d’une grande fondation, devenu interface vivante. Sobre, crédible, lumineux.
- **Palette :** Bleu Nuit `#0B2545` (primaire), Émeraude `#12B886` (accent), Sable `#F7F5F0` (fond), Ardoise `#1F2933` (texte/sombre).
- **Typographie :** titres « Plus Jakarta Sans » (tracking serré) ; dramatique « Cormorant Garamond » italique ; données « IBM Plex Mono ».
- **Ambiance image :** bureaux lumineux, équipes terrain, cartes, lumière naturelle.
- **Hero :** titre en sans gras massif, mot clé de la promesse en serif italique accent.
- **Accent lisible en texte :** `#0B7A57` (≈ 4,9:1 sur Sable).

### Preset B — « Nocturne Analytics » (sombre et premium)
- **Identité :** une salle de pilotage la nuit, des KPI qui brillent comme des instruments de vol.
- **Palette :** Charbon `#0F1115` (primaire), Or `#D4A843` (accent), Crème `#F5F3EE` (fond), Ardoise `#1E2028` (texte/sombre).
- **Typographie :** titres « Inter » (tracking serré) ; dramatique « Playfair Display » italique ; données « JetBrains Mono ».
- **Ambiance image :** salles de contrôle, verre, métal, reflets chauds.
- **Hero :** titre en sans gras, mot clé en serif italique doré.
- **Accent lisible en texte sur fond clair :** `#7A5C0F` (≈ 5,6:1 sur Crème).

### Preset C — « Terrain Signal » (ancré en Afrique de l’Ouest)
- **Identité :** la précision d’un outil de terrain avec la chaleur de la terre ocre et des tissus wax contemporains.
- **Palette :** Terre `#2B1B12` (primaire), Ocre `#E08E2B` (accent), Lin `#FAF6EF` (fond), Indigo `#1D2B53` (texte/sombre).
- **Typographie :** titres « Space Grotesk » (tracking serré) ; dramatique « DM Serif Display » italique ; données « Space Mono ».
- **Ambiance image :** marchés, textures textiles, paysages sahéliens, lumière dorée.
- **Hero :** titre en sans gras, mot clé en serif italique ocre, fin motif géométrique en filigrane.
- **Accent lisible en texte :** `#9A5A0B` (≈ 5,1:1 sur Lin).

### Preset D — « Aura Data » (moderne et tech)
- **Identité :** un produit data-native, net comme une fintech, avec une signature lumineuse.
- **Palette :** Vide `#0A0A14` (primaire), Violet `#7B61FF` (accent), Fantôme `#F0EFF4` (fond), Graphite `#18181B` (texte/sombre).
- **Typographie :** titres « Sora » (tracking serré) ; dramatique « Instrument Serif » italique ; données « Fira Code ».
- **Ambiance image :** lumières abstraites, gradients sombres, textures digitales.
- **Hero :** titre en sans gras avec glow accent, mot clé en serif italique.
- **Accent lisible en texte :** `#5B3FE0` (≈ 5,7:1 sur Fantôme). Le violet pur sert aux aplats et aux glows, pas au texte courant.

### Règle de contraste (tous presets)
Les accents bruts de A, B et C offrent un contraste d’environ 2:1 à 2,4:1 sur le fond clair (D : ≈ 3,7:1), insuffisant pour le niveau AA exigé. Donc :
- définir deux tokens par accent : `--accent` (aplats, glows, icônes décoratives) et `--accent-ink` (texte, liens, bordures porteuses de sens) ;
- le libellé d’un bouton à fond accent utilise la couleur **primaire sombre**, pas du blanc (Émeraude + Bleu Nuit ≈ 6:1). Preset D : blanc sur violet ≈ 4,2:1, donc réservé au texte ≥ 18 px gras, sinon assombrir l’accent ;
- les valeurs `--accent-ink` ci-dessus sont des points de départ : vérifier chaque paire avec un contrôle de contraste automatisé (axe ou équivalent) et ajuster.

### Couleurs de statut (tous presets)
Les statuts KPI ont leurs propres tokens, distincts de l’accent : `--status-ok`, `--status-warn`, `--status-alert`, `--status-none` pour les aplats (segments de jauge, pastilles, lignes) et leurs variantes `-ink` pour le texte.

| Token | A | B | C | D |
|---|---|---|---|---|
| `--status-ok` | `#2F9E44` | `#2F9E44` | `#2F9E44` | `#2F9E44` |
| `--status-warn` | `#E8590C` | `#E8590C` | `#D9480F` | `#E8590C` |
| `--status-alert` | `#C92A2A` | `#C92A2A` | `#A61E4D` | `#C92A2A` |
| `--status-none` | `#ADB5BD` | `#ADB5BD` | `#ADB5BD` | `#ADB5BD` |
| `--status-ok-ink` | `#1E7A32` | `#1E7A32` | `#1E7A32` | `#1E7A32` |
| `--status-warn-ink` | `#A34A00` | `#A34A00` | `#A34A00` | `#A34A00` |
| `--status-alert-ink` | `#B02525` | `#B02525` | `#A61E4D` | `#B02525` |
| `--status-none-ink` | `#5C636A` | `#5C636A` | `#5C636A` | `#5C636A` |

- Valeurs de départ calculées à la main : variantes `-ink` ≥ 4,5:1 sur blanc et sur les quatre fonds ; aplats ok, warn et alert ≥ 3:1 sur blanc et sur les quatre fonds. À confirmer par le contrôle automatisé.
- `--status-none` est volontairement pâle : il est toujours accompagné de hachures et du libellé « Aucune donnée ».
- Preset C : l’ambre classique se confondrait avec l’ocre, d’où un orange rouille pour « vigilance » et un framboise pour « en retard ».
- **Dans l’app, l’accent n’est jamais une couleur de statut.** Les boutons d’action principaux utilisent la couleur primaire (libellé clair) ; l’accent reste réservé à la marque (logo, landing, deck) et aux éléments non sémantiques.

---

## 6. Système de design fixe

S’applique à tous les presets, sur la landing, l’app et le deck.

### 6.1 Texture et formes
- **Bruit :** overlay global via filtre SVG inline `<feTurbulence>` à 0,05 d’opacité, **landing et deck uniquement** (désactivé dans l’app pour la lisibilité des données). Implémentation : pseudo-élément `position: fixed; inset: 0; pointer-events: none`, filtre rendu une seule fois (ne jamais l’appliquer au contenu). Désactivé en `@media print` (PDF plus léger) ; les fonds de couleur restent imprimés.
- **Rayons :** `rounded-[2rem]` à `rounded-[3rem]` sur les conteneurs de la landing et du deck ; `rounded-2xl` à `rounded-[1.5rem]` dans l’app (densité d’information). Aucun angle vif.
- **Hiérarchie :** par l’ombre douce et l’espace, pas par des bordures épaisses.

### 6.2 Micro-interactions
- **Boutons :** `scale(1.03)` au survol, `cubic-bezier(0.25, 0.46, 0.45, 0.94)`, effet magnétique subtil.
- **Liens et éléments interactifs :** `translateY(-1px)` au survol.
- **Cartes :** `scale(1.01)` et ombre renforcée au survol.
- Les effets de survol et l’effet magnétique sont limités à `@media (hover: hover)` ; sur tactile, remplacer par un état `:active` discret.
- **`prefers-reduced-motion` :** toutes les animations se désactivent proprement (utiliser `gsap.matchMedia()`), le contenu reste entièrement visible et fonctionnel.

### 6.3 Cycle de vie des animations
- `gsap.context()` dans `useEffect` pour **toutes** les animations GSAP ; `ctx.revert()` au cleanup.
- Easing : `power3.out` (entrées), `power2.inOut` (morphismes). Stagger : 0,08 (texte), 0,15 (cartes).
- **Amélioration progressive :** le contenu est visible par défaut (pas d’`opacity: 0` en CSS) ; les animations partent de l’état visible via `gsap.from`. Les pages pré-rendues s’affichent complètes avant l’hydratation.
- **Dans l’app :** animations discrètes (200–300 ms), jamais bloquantes ; les graphiques Recharts s’animent à l’entrée uniquement.

### 6.4 Règles data-viz

**Définition d’un KPI** (pour chaque KPI affiché) :
- `type_agregation` :
  - `cumul` : chaque saisie est une **quantité réalisée** sur sa période (un incrément, ex. personnes formées ce mois-ci). `valeur_base` et `cible` sont des **niveaux** (stock initial, stock visé en fin de projet). **Valeur actuelle** = `valeur_base` + somme des saisies **du début du projet jusqu’à la fin de la période filtrée**.
  - `dernier` : valeur actuelle = dernière saisie à la date de fin de la période filtrée, même si elle est antérieure au début de la période (ex. taux d’accès).
  - `moyenne` : valeur actuelle = moyenne des saisies de la période filtrée. Aucune saisie sur la période : état gris « Aucune donnée sur la période ».
- Combinaison interdite (contrainte SQL) : `cumul` + sens `decroissant` (un cumul ne peut que croître).
- **% d’atteinte**, sens croissant = (actuelle − base) / (cible − base) × 100 ; sens décroissant = (base − actuelle) / (base − cible) × 100. Affichage borné à [0 ; 150], jauge plafonnée à 100. Si cible = base : « n/a ».
- **Delta** vs période précédente de même durée, en valeur et en % (« n/a » si la période précédente est vide ou nulle) : `cumul` compare la somme des saisies des deux périodes ; `dernier` compare les dernières valeurs ; `moyenne` compare les moyennes.
- **Écart vs trajectoire** : valeur attendue à la date du jour = base + (cible − base) × f, où f = (aujourd’hui − date de début) / (date de fin − date de début), borné à [0 ; 1]. Écart = actuelle − attendue, affiché « en avance » ou « en retard sur la trajectoire ».
- **Retard de saisie** : badge « Saisie en retard » si la dernière saisie date de plus de 1,5 × la période de la fréquence (hebdomadaire 7 j, mensuelle 30 j, trimestrielle 91 j, annuelle 365 j). Ce badge est indépendant de la couleur de statut.
- **Sparkline** des dernières saisies.

**Code couleur sémantique constant** (seuils paramétrables, défaut 90/60 ; tokens `--status-*` de la section 5) :
- vert ≥ 90 % (sur la cible) ; ambre 60–89 % (vigilance) ; rouge < 60 % (en retard) ;
- **gris** : aucune donnée saisie (état à part entière) ;
- toujours doublé d’une icône **et** d’un libellé (accessibilité daltonisme).

**Chaque KPI dit trois choses :** où nous en sommes (valeur), l’écart (vs cible et vs trajectoire), quoi faire (texte d’action suggérée sur les statuts ambre/rouge ; à partir du Lot 2, bouton « Créer une prochaine étape »).

**Graphiques :**
- Jamais de camembert décoratif. Privilégier lignes d’évolution avec ligne de cible en pointillé, barres comparatives, jauges.
- **Progression globale d’un projet** (cartes projet) : affichée par une jauge segmentée par KPI (un segment par KPI, coloré selon son statut) et non par une barre de progression basique.
- Chaque graphique a un **état vide** soigné (message + bouton d’action) et un **état de chargement** (skeleton).
- La géométrie des courbes (échelles, chemins SVG) est calculée dans `src/lib/chart-geometry.ts`, partagée par la courbe du hero, les sparklines et le graphique du PDF.

---

## 7. Architecture du projet

Un seul projet React 19 + TypeScript (mode strict), construit avec **React Router v7 en mode framework** (plugin Vite). Configuration `react-router.config.ts` : `appDirectory: "src"`, `ssr: false`, `prerender: ["/", "/mentions-legales", "/confidentialite"]`. Routes déclarées dans `src/routes.ts` ; chaque route est découpée automatiquement (code splitting par route). Déploiement statique sur Vercel : les pages pré-rendues sont servies telles quelles, les autres routes sont réécrites vers le fichier de repli SPA généré par React Router (`vercel.json`).

| Route | Accès | Rôle |
|---|---|---|
| `/` | public, pré-rendue | Landing page |
| `/deck` | public, `noindex` | Pitch deck |
| `/connexion`, `/inscription`, `/mot-de-passe-oublie`, `/reinitialiser-mot-de-passe` | public (redirige vers `/app` si connecté) | Authentification ; `/inscription?invitation=<jeton>` pour rejoindre une organisation |
| `/mentions-legales`, `/confidentialite` | public, pré-rendues | Pages légales |
| `/app/*` | protégé | Application |
| `*` | public | Page 404 soignée |

Structure :
- `src/root.tsx`, `src/routes.ts` ;
- `src/pages` (Landing, Deck, Auth, App, Legal) ;
- `src/components` ;
- `src/lib` (`supabase.ts`, `kpi.ts`, `chart-geometry.ts`, `constants.ts`, `errors.ts` pour le mapping des erreurs typées `PLAN_LIMIT:*`, `ESSAI_EXPIRE`, `DEMO_READONLY`, `DEJA_INSCRIT`) ;
- `src/i18n` (`fr.json`, `en.json`) ;
- `src/index.css` (Tailwind v4, `@theme`, bruit, utilitaires) ;
- `supabase/migrations/*.sql`, `supabase/tests/*.sql` (pgTAP), `supabase/functions/submit-lead`, `supabase/functions/invite-member`, `supabase/functions/.env.example` ;
- `public/images` (image du hero auto-hébergée), `scripts/check-images.mjs` ;
- `README.md`, `PLACEHOLDERS.md`, `DECISIONS.md`, `.env.example`, `vercel.json`.

---

## 8. Partie 1 — Landing page (« La Conversion »)

Contraintes transverses : le contenu est lisible sans animation ; sur mobile, pas de pin ScrollTrigger (cartes empilées en flux normal) ; toutes les variables viennent de la section 3.2. La landing n’embarque ni `supabase-js`, ni `@tanstack/react-query`, ni Recharts.

### A. Navbar — « La Signature Flottante »
Pilule `fixed` centrée. Transparente en haut du hero, puis `bg-[fond]/60 backdrop-blur-xl` avec bordure subtile au scroll (IntersectionObserver). Contient : logo/nom, ancres (Problème, Solution, Démo, Tarifs, FAQ), bouton « Se connecter » (ghost) et CTA « Demander une démo » (accent). Sur mobile : menu repliable accessible au clavier.

### B. Hero — « La Promesse »
- `100dvh`. Fond primaire sombre ou texture photographique avec overlay gradient lourd. L’image du hero est **auto-hébergée** (WebP optimisé dans `public/images`, préchargée), pas servie depuis un domaine tiers.
- **Titre massif :** « Pilotez vos projets avec des données fiables, en temps réel. » (un mot clé en serif italique accent).
- **Sous-titre :** « {{PRODUCT_NAME}} simplifie le suivi-évaluation : dashboards, KPI, rapports PDF en un clic. »
- **Deux CTA :** « Demander une démo » (accent, magnétique) et « Voir le produit » (outline, ancre vers Démo).
- **Visuel :** vraies cartes KPI (mêmes composants que l’app, données de démonstration) et courbe d’évolution en **SVG maison** (`src/lib/chart-geometry.ts`), dans un cadre de fenêtre `rounded-[2rem]`, légèrement incliné en perspective. Les 4 KPI et la courbe s’animent (compteurs 0 → valeur, tracé `stroke-dashoffset`).
- **Bande de confiance :** « Conçu pour les ONG, PME et projets bailleurs en Afrique de l’Ouest » + 3 faits produit en mono (défauts : « 4 KPI en un coup d’œil », « Import Excel et CSV », « 100 % exportable en PDF »). Un chiffre de résultat (ex. temps gagné) n’apparaît que s’il a été fourni avec sa source à la question 4 ; sinon il est listé dans `PLACEHOLDERS.md` comme « à mesurer chez les pilotes ».
- **Animation :** stagger fade-up (0,12 s) : badge, titre, sous-titre, CTA, mockup.

### C. Problème — « Le Constat »
Titre serif italique : « Vos données sont dispersées. Vos rapports prennent des heures. Vos décisions manquent de visibilité. »
Trois cartes visuelles **distinctes** (pas un trio d’icônes identiques) : un faisceau de fichiers Excel/WhatsApp qui se disperse ; une horloge ou pile de rapports ; un tableau flou avec un point d’interrogation. Apparition au scroll, léger parallaxe (désactivé en reduced-motion).

### D. Solution — « Le Système »
Intro : « {{PRODUCT_NAME}} centralise vos indicateurs, génère vos rapports en un clic et vous donne une vue claire de vos projets. »
Quatre fonctionnalités en cartes empilées sticky (ScrollTrigger pin sur desktop), chacune avec un mini-visuel animé distinct :
1. **Centraliser vos KPI** (projets, cibles, unités, fréquences).
2. **Saisir en 30 secondes** (formulaire simple, commentaire, historique).
3. **Dashboard en temps réel** (évolution vs cible, mis à jour dès qu’une saisie est enregistrée).
4. **Rapports en un clic** (export PDF avec logo et période).

Sous les cartes : bandeau « Bientôt » listant le cadre logique, le plan de travail annuel, la carte des zones d’intervention, le suivi budgétaire, les rapports automatiques programmés et la saisie hors ligne (sans promesse de date).

### E. Démo — « La Preuve »
Grand cadre navigateur `rounded-[3rem]` avec animation du vrai dashboard et vidéo courte (`<video preload="none">` avec poster WebP, sous-titres, moins de 2 Mo) ; à défaut de vidéo fournie, composant d’animation. Légendes cliquables (hotspots) sur les zones clés, accessibles au clavier.

### F. Témoignages — « La Confiance »
Si aucun témoignage n’est fourni : section « Programme pilotes » avec badge « Bientôt » et formulaire « Devenir client pilote » (e-mail + organisation, envoyé à `submit-lead` avec `type_demande = 'pilote'`). Ne jamais inventer de témoignage nominatif.

### G. Tarifs — « L’Offre »
Trois cartes : Starter, Pro (mise en avant, badge « Le plus choisi », échelle 1,03), Enterprise (sur devis). Inclusions avec coches. Toggle mensuel/annuel (annuel = −20 %, affiché clairement : prix mensuel équivalent et total annuel). Devise selon la réponse 3 (équivalent FCFA indicatif si choisi).
- Inclusions Pro : 3 projets, 20 KPI par projet, 5 utilisateurs, invitations et rôles. Ligne supplémentaire avec badge « Bientôt » : « Rapports automatiques programmés ».
- Inclus dans tous les plans : export PDF en un clic, import Excel/CSV, dashboard temps réel.

CTA : « Commencer » (Starter/Pro) → `/inscription?plan=starter|pro` ; « Parler à l’équipe » (Enterprise) → formulaire final (`type_demande = 'enterprise'`) ou WhatsApp. Stagger 0,15.

**Règle de plan (MVP) :** pas de paiement en ligne. « Commencer » ouvre un essai de `{{TRIAL_DAYS}}` jours (défaut 14, sans carte, à valider) **avec les limites du plan Pro**, quel que soit le plan cliqué ; le plan choisi est enregistré dans `organisations.plan_souhaite` pour le suivi commercial. À la fin de l’essai, l’organisation passe en **lecture seule** (données consultables et exportables) jusqu’à l’activation manuelle d’un plan. La facturation est manuelle (virement, mobile money) hors produit ; le paiement en ligne est au Lot 3. Les limites portent sur les projets, les KPI par projet et les utilisateurs.

### H. FAQ — « Les Réponses »
Six questions en accordéon animé (hauteur auto via GSAP), accessible au clavier (`aria-expanded`, `aria-controls`).
1. Mes données sont-elles sécurisées ? (isolation par organisation, chiffrement en transit et au repos, sauvegardes quotidiennes — qui exigent le plan Supabase Pro, voir 11.1 ; conformité à la loi sénégalaise n° 2008-12 sur les données personnelles et déclaration auprès de la CDP à vérifier avec un juriste avant publication)
2. Puis-je importer mes fichiers Excel ?
3. Combien de temps pour démarrer ? (cible : moins de 5 minutes, chronométrée par le test E2E)
4. Fonctionne-t-il avec mes indicateurs de bailleur ?
5. Y a-t-il un essai gratuit ? (`{{TRIAL_DAYS}}` jours, toutes les fonctions Pro, sans carte ; à la fin, les données restent consultables et exportables)
6. Comment fonctionne le support ?

### I. CTA final et pied de page
- Section accent pleine largeur : « Prêt à piloter avec la donnée ? » + bouton « Demander une démo » géant magnétique + lien « Écrire sur WhatsApp » (`wa.me/{{WHATSAPP}}`).
- **Formulaire court** (nom, organisation, e-mail, besoin) envoyé par `fetch` à l’Edge Function **`submit-lead`** (`type_demande = 'demo'`) :
  - validation zod côté client **et** dans la fonction ;
  - champ honeypot ;
  - jeton Turnstile vérifié côté serveur si `TURNSTILE_SECRET_KEY` est configuré ;
  - limitation simple de débit par adresse IP (IP stockée hachée et salée, jamais en clair) ;
  - insertion avec la clé service ; notification e-mail à `{{CONTACT_EMAIL}}` si une clé d’envoi est configurée, sinon l’enregistrement en base suffit ;
  - côté UI : état d’envoi, état de succès avec confirmation à l’écran, message d’erreur humain avec « Réessayer ».
- **Footer** sombre `rounded-t-[4rem]` : nom, liens, mentions légales, confidentialité, indicateur d’état en monospace. L’indicateur est **réel** : un contrôle de santé léger du backend (ex. `/auth/v1/health`) après le premier rendu ; « En ligne » (point `--status-ok` pulsant) si la réponse est bonne, « Service perturbé » (point gris) sinon.

---

## 9. Partie 2 — Application MVP (« Le Poste de Pilotage »)

### 9.1 Priorités du Lot 1
- **P0 :** authentification (inscription, connexion, réinitialisation, invitations, rôles admin / éditeur / lecteur) ; projets (nom, description, dates, budget, devise, secteur, statut) ; KPI (créer, modifier, supprimer ; cible, unité, fréquence hebdomadaire/mensuelle/trimestrielle/annuelle, valeur de base, sens, type d’agrégation) ; saisie (KPI, date, valeur, commentaire ; modification/suppression ; historique) ; dashboard (4 KPI épinglables + graphique d’évolution vs cible, **mis à jour en temps réel** via Supabase Realtime sur `kpi_entries`, qui invalide les requêtes concernées).
- **P1 :** export PDF (logo, titre, période, KPI, graphique, commentaires) ; import Excel/CSV (upload, aperçu, mapping, validation ligne par ligne, rapport d’erreurs).

### 9.2 Plans, quotas et fin d’essai

| Plan | Projets | KPI par projet | Utilisateurs | Écriture |
|---|---|---|---|---|
| Essai (`{{TRIAL_DAYS}}` jours) | 3 | 20 | 5 | jusqu’à `essai_fin`, puis lecture seule |
| Starter | 1 | 5 | 1 | oui |
| Pro | 3 | 20 | 5 | oui |
| Enterprise | illimité | illimité | illimité | oui |

- **Quotas** appliqués **côté base** (triggers `BEFORE INSERT` qui lèvent une erreur typée : `PLAN_LIMIT:projects`, `PLAN_LIMIT:kpis`, `PLAN_LIMIT:users`) **et côté UI** (dialogue d’upgrade élégant déclenché par cette erreur).
- **Les utilisateurs** comptent les `memberships` et les invitations en attente (non acceptées, non expirées).
- **Fin d’essai :** quand `plan = 'essai'` et `now() > essai_fin`, des triggers `BEFORE INSERT/UPDATE/DELETE` sur `projects`, `kpis`, `kpi_entries`, `memberships` et `invitations` lèvent `ESSAI_EXPIRE`. Côté UI : bandeau de compte à rebours à partir de J-3, puis bandeau permanent « Essai terminé — vos données restent consultables et exportables » avec CTA WhatsApp et contact ; actions d’écriture désactivées ; export PDF toujours disponible.
- **Passage à un plan inférieur** (ex. essai → Starter) : les données existantes sont conservées ; seules les créations au-delà du nouveau quota sont refusées.
- **Projet exemple** (`is_demo = true`) :
  - exclu des quotas (il compte 8 KPI) ;
  - créé **uniquement** par la fonction `charger_projet_exemple()` (`SECURITY DEFINER`) ; un seul par organisation (index unique partiel) ; `is_demo` n’est jamais modifiable côté client ;
  - dans un projet exemple, les saisies sont libres (ajout, modification, suppression) pour tester ; les KPI ne peuvent être ni créés ni supprimés, et seules leurs colonnes `epingle` et `ordre` sont modifiables ; le projet lui-même n’est pas modifiable, sauf sa suppression par un admin. Toute autre écriture lève `DEMO_READONLY` ;
  - supprimable à tout moment.

### 9.3 Modèle de données Supabase

Migrations SQL versionnées dans `supabase/migrations`, une migration par lot. Types TypeScript générés (`supabase gen types`).

**Lot 0–1**
- `profiles` : `id` (= `auth.users.id`), `nom`, `telephone`, `langue` (`fr`|`en`), `created_at`.
- `organisations` : `id`, `nom`, `logo_path`, `pays`, `devise_defaut`, `plan` (`essai`|`starter`|`pro`|`enterprise`), `plan_souhaite` (`starter`|`pro`|null), `essai_fin` (= création + `{{TRIAL_DAYS}}` jours), `created_at`.
- `memberships` : `user_id`, `org_id`, `role` (`admin`|`editeur`|`lecteur`), PK `(user_id, org_id)`, **`unique(user_id)` au MVP** (une organisation par utilisateur). Contrainte : une organisation garde toujours au moins un admin.
- `invitations` : `id`, `org_id`, `email`, `role`, `token_hash` (SHA-256 du jeton, jamais le jeton en clair), `expires_at` (7 jours), `accepted_at`, `invited_by`. Jeton à usage unique.
- `secteurs` : référentiel global en lecture seule.
- `projects` : `id`, `org_id` (immuable), `nom`, `description`, `date_debut`, `date_fin`, `budget`, `devise`, `statut`, `secteur_id`, `is_demo` (défaut `false`, non modifiable côté client), `created_by`, `created_at`, `updated_at` ; contrainte `date_fin >= date_debut` ; index unique partiel `(org_id) where is_demo`.
- `kpis` : `id`, `project_id`, `org_id` (dénormalisé, rempli par trigger depuis le projet, immuable), `nom`, `description`, `unite`, `cible`, `valeur_base`, `frequence`, `sens` (`croissant`|`decroissant`), `type_agregation` (`cumul`|`dernier`|`moyenne`), `ordre`, `epingle` ; contraintes : 4 KPI épinglés maximum par projet, `not (type_agregation = 'cumul' and sens = 'decroissant')`.
- `kpi_entries` : `id`, `kpi_id`, `org_id` (dénormalisé, rempli par trigger, immuable), `date`, `valeur`, `commentaire`, `created_by`, `created_at`, `updated_at` ; unicité `(kpi_id, date)` (l’UI propose « Une valeur existe déjà à cette date : la remplacer ? ») ; table ajoutée à la publication `supabase_realtime`.
- `audit_log` : `id`, `org_id`, `table_name`, `row_id`, `action`, `ancien`, `nouveau`, `user_id`, `at` ; alimenté uniquement par triggers (`SECURITY DEFINER`) sur `projects`, `kpis`, `kpi_entries` (base de l’« historique »).
- `leads` : `id`, `type_demande` (`demo`|`pilote`|`enterprise`), `nom`, `organisation`, `email`, `besoin`, `ip_hash`, `created_at` (+ longueurs et format e-mail contraints en SQL).
- `created_by` est forcé à `auth.uid()` par trigger.

**Lot 2** : `programmes` (+ `projects.programme_id`), `phases`, `etapes`, `pta_activites`, `cadre_logique_noeuds` (`type` : objectif_global | objectif_specifique | resultat | activite ; `parent_id`, `code` type OG / OS1 / R1.1 / A1.1.1, `libelle`, `moyens_verification`, `hypotheses` ; `kpis.noeud_id` relie un indicateur à une ligne), `etats_avancement`, `realisations`, `prochaines_etapes`, `documents`, `projet_etiquettes`, `parametres_se`, vue `v_avancement` (`security_invoker = true`, mêmes formules que `kpi.ts`, testée par pgTAP sur les mêmes cas que Vitest).

**Lot 3** : `composantes`, `localites` (+ `kpi_entries.localite_id`, `realisations.localite_id` nullable), `projet_localites`, `acteurs`, `projet_acteurs`, `beneficiaires_effectifs`, `budget_lignes`, `depenses`.

### 9.4 Row Level Security et sécurité

RLS activée sur **toutes** les tables, avec les politiques complètes fournies en migration.

- **Fonctions d’aide** dans un schéma **`private`** (non exposé par l’API), `SECURITY DEFINER` avec `set search_path = ''` : `private.is_org_member(org_id)`, `private.org_role(org_id)`, `private.org_peut_ecrire(org_id)` (plan payant, ou essai non expiré), `private.project_org(project_id)`. `grant usage on schema private` et `grant execute` au rôle `authenticated` uniquement. Elles évitent la récursion infinie sur `memberships`.
- **Lecture :** limitée aux membres de l’organisation (via `org_id`, présent sur toutes les tables métier). **Écriture** (insert/update/delete) : admin et éditeur. **Gestion des membres, des paramètres de l’organisation et suppression d’un projet :** admin uniquement. Le lecteur ne peut rien modifier.
- **Droits par colonne :**
  - `organisations` : aucun `INSERT` ni `DELETE` côté client ; `UPDATE` (admin) limité à `nom`, `logo_path`, `pays`, `devise_defaut`. `plan`, `essai_fin` et `plan_souhaite` ne changent qu’avec la clé service (tableau de bord Supabase, facturation manuelle).
  - `projects.is_demo` : ni insérable ni modifiable côté client.
  - `org_id` : immuable après insertion sur toutes les tables.
- **Exceptions explicites :**
  - `leads` : **aucun accès client**, ni `anon` ni `authenticated`. Les écritures passent par l’Edge Function `submit-lead` (clé service) ; consultation via le tableau de bord Supabase.
  - `secteurs`, `localites` (référentiels) : lecture pour les utilisateurs authentifiés, écriture réservée à la clé service.
  - `audit_log` : lecture par les membres de l’organisation, aucune écriture côté client.
- **Inscription :** un trigger `SECURITY DEFINER` sur `auth.users` crée le `profile`, puis :
  - si les métadonnées d’inscription contiennent un jeton d’invitation **valide** (haché, non expiré, non utilisé, même e-mail) : `membership` avec le rôle de l’invitation, invitation marquée acceptée, **aucune organisation créée** ;
  - sinon : `organisation` (plan `essai`, `essai_fin`, `plan_souhaite` lu depuis `?plan=`) et `membership` admin ;
  - le tout dans une seule transaction.
- **Invitations :** Edge Function `invite-member` (clé service, jamais exposée au front) : vérifie que l’appelant est admin, que l’organisation peut écrire, le quota d’utilisateurs, et que l’e-mail n’a pas déjà de compte (sinon `DEJA_INSCRIT`, une organisation par utilisateur au MVP) ; génère le jeton, stocke son hachage, envoie l’e-mail si un fournisseur est configuré et **renvoie toujours le lien** pour que l’admin puisse le copier ou le partager sur WhatsApp. Une fonction `invitation_apercu(jeton)` ne renvoie que le nom de l’organisation, pour l’afficher sur la page d’inscription.
- **Storage :** buckets privés `logos` et `documents`, chemins préfixés par `org_id/`, politiques alignées sur les rôles ; liens signés à durée courte.
- **Validation :** zod côté client **et** contraintes SQL (CHECK, NOT NULL, types énumérés).
- **Tests RLS (pgTAP, `supabase test db`)** avec quatre identités : admin de l’org 1, lecteur de l’org 1, éditeur de l’org 2, anonyme. Assertions minimales :
  - aucune lecture inter-organisations, y compris sur `audit_log` ;
  - le lecteur échoue à tout insert/update/delete ;
  - l’éditeur échoue à gérer l’équipe et à supprimer un projet ;
  - l’anonyme ne peut rien lire ni écrire en base (les leads passent par l’Edge Function) ;
  - les quotas de plan lèvent l’erreur attendue ;
  - un client ne peut pas créer de projet `is_demo` ni modifier ce champ ;
  - l’admin ne peut pas modifier `plan`, `essai_fin` ni `plan_souhaite` ;
  - après `essai_fin`, toute écriture lève `ESSAI_EXPIRE` ;
  - dans le projet exemple, créer un KPI lève `DEMO_READONLY` ;
  - une inscription avec jeton d’invitation valide rejoint l’organisation sans en créer une ; un jeton expiré ou déjà utilisé crée une organisation d’essai normale.

### 9.5 Règles métier

- **Calculs de KPI :** voir 6.4. Placés dans `src/lib/kpi.ts`, **purs et testés unitairement** (Vitest) : croissant/décroissant ; cumul (avec base non nulle, et période filtrée au milieu du projet), dernier, moyenne ; cible = base ; aucune saisie ; aucune saisie sur la période ; valeurs négatives ; retard de saisie selon chaque fréquence. **Seule source de calcul au Lot 1** : dashboard, cartes projet, projet exemple et PDF l’utilisent tous.
- **Valeur aberrante** (écran de saisie, alerte non bloquante, l’utilisateur peut confirmer) :
  - à partir de 5 saisies et si l’écart-type est non nul : écart de plus de 3 écarts-types par rapport à la moyenne de l’historique ;
  - avant 5 saisies, si la dernière valeur est non nulle : écart de plus de 50 % par rapport à la dernière valeur ;
  - dernière valeur nulle : pas de contrôle relatif ;
  - pour un KPI `cumul`, la comparaison porte sur les incréments saisis.
- **Progression globale d’un projet** = moyenne des % d’atteinte (plafonnés à 100) des KPI ayant au moins une saisie ; « Aucune donnée » sinon.
- **Statut d’un projet :** non démarré / en cours / en retard / suspendu / terminé / clôturé. Proposition automatique « en retard » si la progression est rouge, modifiable par un admin ou un éditeur.

### 9.6 Écrans (Lot 1)

1. **Auth** : split-screen (formulaire à gauche, visuel de marque à droite). Validation inline, messages d’erreur humains en français, flux de confirmation d’e-mail géré. Avec `?invitation=<jeton>` : affiche « Rejoindre {organisation} » et inscrit la personne dans cette organisation.
2. **Liste des projets** : cartes avec statut, période, secteur, progression globale (jauge segmentée), bouton « Nouveau projet », bouton « Charger un projet exemple » s’il n’y en a pas.
3. **Détail projet** : onglets Dashboard / KPI / Saisie / Import / Rapports / Équipe.
4. **Dashboard** : barre de filtres (période + sélecteur pour passer au dashboard d’un autre projet) ; 4 cartes KPI (règles 6.4) ; graphique d’évolution Recharts avec ligne de cible, tooltip riche, sélecteur de KPI ; tableau des dernières saisies ; bouton « Exporter en PDF » ; mise à jour en temps réel quand une saisie est faite depuis un autre appareil. Pas de vue consolidée multi-projets au Lot 1 : la liste des projets en tient lieu, la consolidation arrive avec les programmes (Lot 2).
5. **KPI** : tableau éditable + drawer de création/édition ; réorganisation par glisser-déposer (`@dnd-kit`, alternative clavier) ; épinglage des 4 KPI du dashboard. Pour un KPI `cumul`, le formulaire explique que chaque saisie est la quantité réalisée sur la période et s’ajoute au total.
6. **Saisie** : formulaire rapide (KPI présélectionné, date du jour par défaut, valeur, commentaire) ; raccourci clavier Entrée ; toast de confirmation ; alerte valeur aberrante ; mise à jour optimiste avec retry.
7. **Import** : dropzone CSV/XLSX, aperçu de 10 lignes, mapping colonnes → champs, validation, import par lots, choix en cas de date déjà saisie (remplacer / ignorer), résumé (importées / remplacées / rejetées) et téléchargement du rapport d’erreurs. Parsing hors du thread principal pour les gros fichiers.
8. **Rapports** : PDF via `@react-pdf/renderer` (logo de l’organisation, période, KPI, graphique, commentaires), nom de fichier propre (`Projet_Période.pdf`), mention « Projet exemple » si `is_demo`. Graphique tracé en vectoriel avec les primitives SVG de `@react-pdf` à partir de `chart-geometry.ts`. Polices du PDF en **WOFF ou TTF** locaux (le WOFF2 n’est pas supporté).
9. **Équipe** : invitation par e-mail **et** par lien (bouton « Copier le lien », bouton « Partager sur WhatsApp ») ; changement de rôle, retrait (admin uniquement) ; liste des invitations en attente avec révocation ; message d’upgrade si le quota d’utilisateurs est atteint ; message clair si la personne a déjà un compte (`DEJA_INSCRIT`).

**Écrans des lots suivants** (mêmes principes d’états et d’accessibilité) : Lot 2 — cadre logique (vue arbre + matrice), PTA (calendrier annuel), phases et étapes, états d’avancement, réalisations, prochaines étapes, documents, paramètres S&E, programmes. Lot 3 — carte des zones, acteurs, bénéficiaires, budgets et dépenses, Gantt des composantes, rapport de programme, rapports programmés.

### 9.7 Qualité produit
- **États vides, de chargement, d’erreur et de lecture seule sur chaque écran.** Aucun écran blanc ; une erreur affiche un message humain et une action (réessayer). La lecture seule (rôle lecteur ou essai terminé) masque ou désactive les actions d’écriture avec une explication.
- **Mobile-first** (saisie terrain sur téléphone en priorité) ; connexion lente tolérée : `@tanstack/react-query` (retry, optimistic updates). Mode hors ligne léger (PWA + file d’attente de saisies) recommandé comme premier chantier après le MVP.
- **Accessibilité :** contrastes AA, navigation clavier, labels, `aria`, focus visibles.
- **i18n :** interface en français ; chaînes dans `src/i18n/fr.json`, structure prête pour `en.json`. Les erreurs typées de la base sont traduites via `src/lib/errors.ts`.
- **Projet exemple** (bouton « Charger un projet exemple » + à l’onboarding) : programme **Eau et assainissement**, 8 KPI, 12 mois de saisies réalistes, badge « Exemple ». Les trajectoires sont **variées** (2 vertes, 3 ambre, 2 rouges, 1 avec le badge « Saisie en retard ») pour que le dashboard raconte une histoire. KPI suggérés :
  1. Forages réhabilités (cumul, croissant)
  2. Ménages avec accès à l’eau potable, % (dernier, croissant)
  3. Points d’eau fonctionnels, % (dernier, croissant)
  4. Personnes sensibilisées à l’hygiène (cumul, croissant)
  5. Latrines familiales construites (cumul, croissant)
  6. Comités de gestion fonctionnels (dernier, croissant)
  7. Cas de diarrhée déclarés par mois (dernier, **décroissant**)
  8. Temps moyen de collecte de l’eau, minutes (moyenne, **décroissant**)

---

## 10. Partie 3 — Pitch deck (« Le Récit »)

Route `/deck` (balise `noindex`) : 10 slides plein écran 16:9, navigation flèches/espace (et swipe), barre de progression. Mêmes polices, palette et bruit que la landing. Les mockups réutilisent les composants réels de l’app avec les données du projet exemple (pas de captures figées).

**Impression PDF :** `@media print` avec `@page { size: 13.333in 7.5in; margin: 0 }`, une slide par page (`break-after: page`), `print-color-adjust: exact`, navigation et barre de progression masquées. Les animations sont créées à l’activation de chaque slide ; sur l’événement `beforeprint`, toutes les timelines sont amenées à leur état final (`progress(1)`) pour qu’aucun élément ne reste invisible dans le PDF. Tester l’export dans Chrome.

1. **Titre :** « {{PRODUCT_NAME}} : {{BASELINE}} » + fondateur + date.
2. **Problème :** données dispersées, rapports longs, décisions aveugles (trois chiffres « à valider » ou une scène concrète).
3. **Solution :** dashboard + KPI + rapports PDF en un clic (mockup).
4. **Marché :** ONG, PME, projets bailleurs au Sénégal et en Afrique de l’Ouest ; TAM / SAM / SOM en cercles concentriques animés ; hypothèses explicites en note, marquées « à valider ».
5. **Produit :** 3 mockups réels de l’app.
6. **Business model :** abonnement SaaS Starter / Pro / Enterprise, essai de `{{TRIAL_DAYS}}` jours aux limites Pro, avec hypothèse de revenu récurrent (« à valider »).
7. **Concurrence :** matrice 2×2 ou tableau comparatif (Power BI : trop complexe ; Excel : pas de temps réel ; outils M&E existants : trop chers ; {{PRODUCT_NAME}} : simple, abordable, collaboratif).
8. **Go-to-market :** prospection directe (e-mail, LinkedIn, WhatsApp) + partenariats (cabinets, incubateurs, bailleurs) ; entonnoir visuel ; objectif des 20 premiers prospects.
9. **Équipe :** le fondateur (expert métier S&E + tech), photo placeholder (initiales), avantage clé.
10. **Ask :** ce que tu cherches (clients pilotes, feedback, financement) avec montant et usage des fonds en placeholder explicite.

---

## 11. Exigences techniques

**Stack**
- React 19, **React Router v7 en mode framework** (Vite), **TypeScript strict**.
- **Tailwind CSS v4** (`@tailwindcss/vite`, tokens dans `@theme` de `src/index.css`, `tw-animate-css`). shadcn/ui adapté aux tokens du preset.
- GSAP 3 + ScrollTrigger (landing et deck), chargés dynamiquement après le premier rendu.
- Recharts (app et deck uniquement), `@react-pdf/renderer`, **SheetJS installé depuis cdn.sheetjs.com en version ≥ 0.20** (le paquet npm `xlsx` est obsolète et touché par des CVE connues) ; PapaParse pour les gros CSV.
- `@supabase/supabase-js` (dont Realtime), `@tanstack/react-query`, `react-hook-form` + `zod`, `@dnd-kit`, `date-fns` (locale `fr`), `sonner`, Lucide React, `react-i18next`.
- Lot 3 : `react-leaflet` ou MapLibre (carte), Gantt en SVG maison.
- Qualité : ESLint, Prettier, Vitest + Testing Library, Playwright (parcours E2E), `supabase` CLI + pgTAP.

**Backend et hébergement**
- Supabase : Auth (e-mail + mot de passe, SMTP personnalisé), Postgres + RLS, Realtime, Storage (buckets privés), Edge Functions (`submit-lead`, `invite-member`). Région Europe (Paris ou Francfort) pour la latence depuis Dakar.
- Vercel (front, déploiement statique). `vercel.json` avec réécriture SPA et en-têtes de sécurité : CSP (origines autorisées : le domaine du projet Supabase en `https` et `wss`, Plausible, `challenges.cloudflare.com` si Turnstile, `images.unsplash.com` ; aucune police externe), `X-Frame-Options`, `Referrer-Policy`.
- `.env.example` (front) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PLAUSIBLE_DOMAIN`, `VITE_CONTACT_EMAIL`, `VITE_WHATSAPP_NUMBER`, `VITE_DEMO_URL`, `VITE_TURNSTILE_SITE_KEY` (optionnel).
- `supabase/functions/.env.example` (secrets des Edge Functions, posés avec `supabase secrets set`) : `RESEND_API_KEY` (optionnel), `EMAIL_FROM`, `CONTACT_EMAIL`, `APP_URL`, `TURNSTILE_SECRET_KEY` (optionnel), `IP_HASH_SALT`. La clé service est injectée automatiquement dans les Edge Functions par Supabase : elle n’apparaît dans aucun fichier.
- **Aucune clé en dur ; la clé service n’existe jamais côté front.**

**Polices et images**
- Polices **auto-hébergées** via les paquets `@fontsource` du preset : poids strictement nécessaires, `font-display: swap`, preload de la police du titre. Le PDF réutilise les fichiers WOFF de ces paquets (à défaut, TTF du dépôt `google/fonts`).
- Image du hero auto-hébergée (WebP, dimensions explicites, préchargée). Autres images : vraies URLs Unsplash correspondant à l’ambiance du preset, avec paramètres de taille et de qualité (`?auto=format&fit=crop&w=1600&q=70`), `loading="lazy"`, dimensions explicites (anti-CLS). Un script `scripts/check-images.mjs` vérifie que chaque URL répond 200 ; **repli en dégradé CSS** si une image échoue. Aucune image cassée.

**Analytics et SEO**
- Plausible (script conditionné par variable d’env, sans cookie). Événements : `Demo CTA Click` (propriété : emplacement), `Lead Submit`, `Signup`.
- `lang="fr"`, balises meta et Open Graph, favicon, `sitemap.xml`, `robots.txt` (`/app` et `/deck` en `noindex`). Landing et pages légales pré-rendues.

**Performance**
- Lighthouse mobile ≥ 90 (performance, accessibilité, bonnes pratiques, SEO) sur la landing ; JS initial ≤ 200 Ko gzip ; LCP < 2,5 s en 4G simulée.
- Code splitting par route ; `@react-pdf/renderer`, SheetJS et Recharts chargés à la demande ; la landing n’embarque ni `supabase-js`, ni `react-query`, ni Recharts.

### 11.1 Prérequis à la charge du fondateur

L’agent ne crée aucun de ces comptes (règle d’or 7).

- **Poste de travail :** Node.js LTS, Docker Desktop (Supabase local, pgTAP, boîte de réception de test pour les e-mails), Supabase CLI.
- **Supabase :** compte et projet en région Europe. Plan gratuit pour le développement ; **plan Pro avant le premier client** (sauvegardes quotidiennes, pas de mise en pause après 7 jours d’inactivité). La FAQ ne promet les sauvegardes qu’une fois ce plan actif.
- **Vercel** et **nom de domaine**.
- **E-mails :** compte Resend (ou équivalent) avec domaine vérifié (SPF, DKIM), branché en SMTP personnalisé dans Supabase Auth et utilisé par les Edge Functions. Sans lui, la confirmation d’inscription, la réinitialisation de mot de passe et les invitations par e-mail ne fonctionnent pas en production (les invitations par lien, elles, fonctionnent).
- **Optionnels :** Cloudflare Turnstile, Plausible.
- **Juridique (Sénégal) :** loi n° 2008-12 sur la protection des données à caractère personnel et déclaration auprès de la CDP ; l’hébergement en Europe constitue un transfert hors du Sénégal, à valider avec un juriste ; mentions légales (raison sociale, NINEA, RCCM, adresse, directeur de publication, hébergeurs Vercel et Supabase). Toutes ces valeurs sont listées dans `PLACEHOLDERS.md` tant qu’elles ne sont pas fournies.

---

## 12. Séquence de construction

**Lot 0 — Fondations**
1. Mapper le preset choisi à ses tokens (couleurs en variables CSS, y compris `--accent-ink` et `--status-*`, polices, ambiance) dans le bloc `@theme` de `src/index.css`.
2. Scaffolder avec `npx create-react-router@latest` (TypeScript), configurer `react-router.config.ts` (`appDirectory: "src"`, `ssr: false`, pré-rendu), installer les dépendances, configurer Tailwind v4, shadcn/ui, i18n, react-query. Écrire `DECISIONS.md` (décisions de 3.1).
3. Écrire les migrations Supabase (schéma Lot 0–1, schéma `private` et fonctions d’aide, RLS, droits par colonne, triggers : quotas, fin d’essai, projet exemple, `org_id`, `created_by`, audit, inscription), le seed de démo et le client ; écrire les tests pgTAP **avant** les écrans.
4. Construire l’authentification (y compris l’inscription par invitation et l’Edge Function `invite-member`), les rôles et le layout de l’app.
   *Point de contrôle 0.*

**Lot 1 — MVP**
5. Construire projets → KPI → saisie → dashboard (chemin P0 complet, de bout en bout, Realtime compris), avec calculs KPI testés.
6. Ajouter l’export PDF puis l’import CSV/Excel (P1).
7. Construire la landing complète (sections A à I) avec animations, Edge Function `submit-lead` et analytics.
8. Construire le deck `/deck` avec impression PDF.
9. Écrire `README.md` (installation, prérequis de 11.1, variables d’env et secrets, déploiement Vercel, seed, lancement des tests) et `PLACEHOLDERS.md` ; vérifier `npm run build` sans erreur ni warning bloquant.
10. Auto-test final (scripté avec Playwright quand c’est possible) : parcours complet (inscription → projet → 3 KPI → 6 saisies → dashboard → export PDF → import CSV), invitation par lien puis inscription de l’invité, test des 3 rôles, fin d’essai simulée (lecture seule + export PDF), mise à jour temps réel entre deux sessions, test mobile 375 px, test `prefers-reduced-motion`, Lighthouse.
    *Point de contrôle 1 : démonstration à l’utilisateur.*

**Lots 2 et 3** : démarrés seulement sur instruction explicite, un lot après l’autre, avec le même rituel (migration, tests RLS, écrans, états, point de contrôle).

---

## 13. Critères d’acceptation (Lot 1)

- Un utilisateur peut s’inscrire, créer un projet, définir des KPI, saisir des données et voir son dashboard en **moins de 5 minutes** (chronométré par le test E2E).
- Un lecteur ne peut rien modifier ; un éditeur ne peut pas gérer l’équipe ni supprimer un projet ; un admin peut tout. **Vérifié par les tests RLS**, qui prouvent aussi qu’aucune donnée d’une organisation n’est lisible par une autre.
- Les limites de plan sont refusées par la base et présentées par l’UI avec un message d’upgrade clair.
- Les tentatives de contournement sont refusées par la base (tests pgTAP) : projet `is_demo` créé par un client, modification de `plan`, `essai_fin` ou `plan_souhaite` par un admin, accès direct à `leads`.
- Après `essai_fin`, toute écriture est refusée (`ESSAI_EXPIRE`) et l’UI passe en lecture seule, export PDF toujours disponible.
- Une personne invitée (par e-mail ou par lien) rejoint l’organisation qui l’invite sans en créer une.
- Le dashboard reflète sans rechargement une saisie faite depuis un autre appareil.
- L’export PDF produit un rapport propre avec logo, période, KPI et graphique.
- L’import CSV/Excel avec mapping fonctionne sur un fichier réel et signale les erreurs ligne par ligne.
- La landing charge vite (Lighthouse ≥ 90), se lit parfaitement sur mobile (375 px), et le formulaire de démo est enregistré en base via `submit-lead`.
- Toute fonction citée par la landing est livrée au Lot 1 ou porte le badge « Bientôt » ; aucun chiffre non mesuré n’y apparaît.
- Le deck de 10 slides s’exporte en PDF propre (une slide par page, fonds conservés, aucun élément invisible).
- Contrastes AA vérifiés, y compris les tokens `--status-*` ; `prefers-reduced-motion` respecté.
- Aucun lorem ipsum, aucun bouton mort, aucun écran sans état vide, aucune clé secrète dans le dépôt.

---

## 14. Directive d’exécution

« Ne construis pas un outil de reporting ; construis l’instrument de pilotage auquel une équipe de terrain fait confiance. Chaque KPI doit dire : voici où nous en sommes, voici l’écart, voici quoi faire. Chaque section de la landing doit répondre à une objection avant qu’elle soit formulée. Chaque slide doit faire avancer la décision de l’investisseur. Pas de barres de progression basiques, pas de dashboards en cartes identiques, pas de templates. »
