# Placeholders

Tout contenu manquant ou provisoire. Règle d’or 2 du brief : aucune preuve inventée. Chaque ligne donne le fichier, l’emplacement et la valeur provisoire.

## Valeurs commerciales à valider

| Fichier | Emplacement | Valeur provisoire | À faire |
|---|---|---|---|
| `src/lib/constants.ts` | `PRIX_MENSUEL_USD` | Starter 25 $, Pro 50 $ | Valider les prix avec vous |
| `src/lib/constants.ts` | `TAUX_USD_XOF` | 565 | Confirmer le taux indicatif affiché |
| `src/lib/constants.ts` | `REMISE_ANNUELLE` | 20 % | Valider la remise annuelle |
| `src/lib/constants.ts` | `DUREE_ESSAI_JOURS` | 14 | Valider ; à garder égal à `private.duree_essai_jours()` dans la migration |

## Contact et identité (variables d'environnement, `.env.local` et Vercel)

| Variable | État | Effet tant qu'elle est vide |
|---|---|---|
| `VITE_EDITEUR_NOM` | **BPrestations** (fourni) | Le nom de l'éditeur n'est pas affiché dans le pied de page ni les pages légales |
| `VITE_CONTACT_EMAIL` | **fourni** | Les liens « Écrire par e-mail » ne sont pas affichés |
| `VITE_WHATSAPP_NUMBER` | **fourni** | Les boutons WhatsApp ne sont pas affichés |
| `VITE_SITE_URL` | **vide : adresse publique à fournir** | Pas de sitemap, de `canonical`, de `og:url` ni d'`og:image` (adresses absolues obligatoires) |
| `VITE_PLAUSIBLE_DOMAIN` | vide : compte Plausible à créer | Aucune mesure d'audience |
| `VITE_TURNSTILE_SITE_KEY` | vide : facultatif | Pas de vérification anti-robot (le champ piège et la limite de débit restent actifs) |
| `VITE_DEMO_URL` | vide | Sans effet : la démo de la landing est le tableau de bord animé |

Ces trois variables fournies doivent aussi être définies **dans Vercel** : elles sont lues à la construction. Le compte Vercel existe ; l'état du projet (déploiement, domaine, variables) n'est pas vérifié : le connecteur n'a pas encore l'autorisation d'accéder à votre équipe Vercel.

## Secrets des Edge Functions (Supabase > Edge Functions > Secrets)

| Secret | État | Effet tant qu'il est vide |
|---|---|---|
| `RESEND_API_KEY`, `EMAIL_FROM` | Compte Resend créé, mais **aucun domaine n'y est enregistré** (vérifié le 25 novembre 2026). À faire : ajouter le domaine d'envoi chez Resend, poser les enregistrements DNS demandés, attendre « Verified », puis poser la clé et l'expéditeur dans les secrets. Je ne peux pas voir les secrets Supabase : leur présence n'est pas vérifiée | Ni invitation ni notification de demande par e-mail |
| `CONTACT_EMAIL` | à poser (adresse de réception des demandes) | Les demandes sont seulement enregistrées dans la table `leads` |
| `TURNSTILE_SECRET_KEY`, `IP_HASH_SALT` | facultatifs | Pas de vérification Turnstile ; l'empreinte des IP utilise la clé service |

## Identité et preuves

| Élément | État |
|---|---|
| Nom du fondateur / éditeur | **BPrestations** (fourni). Dans le deck : initiales « BP », photo et parcours à compléter |
| Logo | **Monogramme retenu** (une jauge segmentée) : `src/components/brand/Logo.tsx`, `public/favicon.svg`, `public/images/og.png`. À remplacer si vous avez votre propre logo |
| Chiffres clés | Aucun affiché. Un chiffre de résultat (temps gagné) n'apparaîtra que fourni avec sa source |
| Témoignages | Aucun : la landing présente le programme pilotes (« Bientôt ») |
| Photos | Aucune : le hero est un fond sombre, aucune photo ne peut passer pour celle d'un client |
| Vidéo de démonstration | Non fournie : la démo est le tableau de bord réel animé, sur des données de démonstration étiquetées |
| Secteurs ciblés, expertise du fondateur | Non fournis |

## Affirmations de la landing à valider ou à mesurer

| Texte (clé i18n) | Statut |
|---|---|
| « Saisir en 30 secondes » (`landing.solution.saisir`) | Objectif du brief, **à mesurer** chez les pilotes |
| « Notre objectif est de moins de 5 minutes » (FAQ `demarrer`) | Objectif, chronométré par le parcours de bout en bout du Lot 1d |
| « Nous répondons en jours ouvrés » (FAQ `support`) | Engagement du support : **à valider** (horaires, délai) |
| Sauvegardes quotidiennes (FAQ `securite`) | **Phrase retirée** : vraie seulement avec Supabase Pro. À remettre une fois activé |
| Conformité à la loi sénégalaise n° 2008-12 (FAQ `securite`) | **Phrase retirée** : à faire valider par un juriste |
| Chiffrement « au repos chez notre hébergeur, dans l'Union européenne (Irlande) » | Exact pour le projet actuel (eu-west-1). À revoir si la région change |
| Prix (25 $ et 50 $), remise de 20 %, taux 565, essai de 14 jours | À valider (voir « Valeurs commerciales ») |

## Pitch deck (`src/components/deck/Diapos.tsx`)

Tout ce qui n'est pas établi y est marqué « à valider » (pastille orange) ou « à compléter » (cadre en tirets).

| Diapositive | Élément | État |
|---|---|---|
| 4 Marché | Effectifs TAM et SAM | **Aucun chiffre** : « [chiffre sourcé — à compléter] » ; périmètres posés, à confirmer |
| 6 Business model | Prix, durée d'essai, et revenu récurrent (10 organisations × 50 $ = 500 $ par mois) | Arithmétique sur des prix « à valider » ; « aucun client payant à ce jour » |
| 7 Concurrence | Comparaison Excel, Power BI, outils existants | Seuls les constats du brief sont notés « Non » (positionnement « à valider ») ; le reste est « Non évalué » : à documenter |
| 8 Go-to-market | Objectif de 20 premiers prospects ; taux de conversion | Objectif du brief ; aucun taux annoncé |
| 9 Équipe | Photo, parcours S&E, parcours technique, avantage clé | **À compléter** : initiales « BP » (fournies : BPrestations) en attendant une photo |
| 10 Demande | Montant recherché et usage des fonds | **À compléter** |
| 2 Problème | « Scène type » du lundi 17 h | Illustration, étiquetée comme telle : pas un cas client |

## Pages légales (`src/pages/legal/`)

Trois pages, rédigées en entier sur la base de la loi sénégalaise n° 2008-12 (données personnelles), de la loi n° 2008-08 et du décret n° 2008-718 (transactions et commerce électroniques) : **mentions légales**, **politique de confidentialité**, **conditions générales d'utilisation** (`/conditions-utilisation`, nouvelle). Chacune est datée (`src/lib/legal.ts`) et porte « provisoire, à valider par un juriste ». Ce qui n'est pas établi s'affiche « [... — à compléter] » sur fond orangé : **je n'invente aucun fait juridique**.

### À fournir par vous (faits)

| Page | Valeurs |
|---|---|
| Mentions légales | Forme juridique, capital, numéro RCCM, NINEA, adresse du siège, adresse postale de correspondance, directeur ou directrice de la publication ; raison sociale, adresse **et téléphone** de Vercel et de Supabase (la loi demande ceux de l'hébergeur) ; tribunal compétent ; prix **hors taxes ou toutes taxes comprises** |
| Confidentialité | Numéro de déclaration (récépissé) auprès de la CDP ; région de traitement de Resend |
| Conditions d'utilisation | Tribunal compétent ; adresse postale ; prix hors taxes ou toutes taxes comprises |

### Démarches à accomplir par vous (je ne peux pas les faire)

1. **Déclarer le traitement à la CDP avant l'ouverture au public** (loi 2008-12, art. 18 et 22) : seul le récépissé autorise la mise en œuvre ; la déclaration doit mentionner le transfert vers un pays tiers (ici l'Irlande). Le numéro du récépissé alimente la politique de confidentialité.
2. **Accepter les contrats de traitement des données** (DPA) proposés par Supabase, Vercel et Resend : la loi exige un contrat écrit avec chaque sous-traitant (art. 39 et 70).
3. **Faire valider les textes par un juriste sénégalais** (voir ci-dessous).

### Choix proposés par défaut, à confirmer

Ce sont des décisions commerciales ou de gestion, écrites dans les textes par souci de complétude. Elles se changent en un endroit (`src/lib/legal.ts` pour les durées, les pages pour le reste).

| Choix | Valeur proposée |
|---|---|
| Suppression des données après fermeture du compte | 90 jours (ou plus tôt sur demande écrite) |
| Consultation et export après la fin de l'abonnement ; remise d'une copie sur demande | 30 jours ; 30 jours |
| Conservation des demandes de contact | 24 mois après le dernier échange |
| Préavis avant modification des conditions ou des prix | 30 jours, par e-mail à l'administrateur |
| Paiement | Virement ou mobile money, d'avance pour la période, à réception de la facture |
| Impayé | Suspension de l'écriture puis résiliation 15 jours après rappel écrit |
| Renouvellement | Tacite, sur paiement ; résiliation à tout moment, effective en fin de période, période commencée non remboursée |
| Mise en demeure avant résiliation pour manquement | 15 jours |
| Plafond de responsabilité | Sommes payées sur les 12 derniers mois ; rien de dû pour un dommage subi pendant l'essai gratuit |
| Litiges | Droit sénégalais, phase amiable de 30 jours |
| Sauvegardes | Aucun engagement de restitution (Supabase Pro n'est pas activé) |
| Réponse aux demandes de droits | 1 mois (c'est le délai de la loi pour la rectification et la suppression ; appliqué aussi à l'accès) |

### À faire valider par un juriste

- Le **régime du transfert vers l'Irlande** (art. 49 à 51 : « niveau de protection suffisant », information préalable de la CDP, autorisation si le niveau est jugé insuffisant). La loi ne donne pas de liste de pays adéquats.
- La qualification de Pilot M&E : **responsable du traitement** pour les comptes et les demandes de contact, **sous-traitant** pour les données saisies par les organisations ; la clause de sous-traitance de l'article 9 des conditions.
- Le statut d'**éditeur ou d'hébergeur** (loi 2008-08, art. 3 et 5) et la procédure de signalement de contenus illicites.
- La limitation de responsabilité, le renouvellement tacite, le choix du droit sénégalais et de la juridiction.
- Que la loi 2008-12 n'ait pas été modifiée ou remplacée : un projet de réforme est évoqué depuis 2019 et rien n'indique qu'il soit voté, mais je n'ai pas pu le confirmer.
- Le service est présenté comme **réservé aux professionnels** : les règles propres aux consommateurs (rétractation de 7 jours ouvrables, décret 2008-718, art. 12 et suivants) ne sont donc pas reprises.

**Acceptation à l'inscription** : une case à cocher (jamais précochée) est obligatoire ; la version acceptée est transmise avec l'inscription et **la base l'enregistre dans le profil avec sa propre horloge** (`profiles.conditions_version` et `conditions_acceptees_le`, que le client ne peut pas modifier). Les comptes créés avant ce changement, ou hors formulaire, ont NULL. Pour retrouver qui a accepté quoi : `select p.email, p.conditions_version, p.conditions_acceptees_le from public.profiles p order by p.conditions_acceptees_le;` dans l'éditeur SQL. À chaque nouvelle version des textes, changer `VERSION_CONDITIONS` dans `src/lib/legal.ts` (c'est aussi la date affichée en haut des pages) ; il n'existe pas encore de réacceptation demandée aux comptes existants.

**Fichiers d'un projet supprimé** : la suppression d'un document ou d'un projet retire maintenant aussi les fichiers du stockage, par l'application, avec rattrapage automatique si cela échoue (`DECISIONS.md` section 18). Reste à faire à la main, pour **la fermeture d'un compte** (suppression « fichiers compris » sous 90 jours, ou sur demande de l'administrateur), car la suppression d'une organisation entière ne passe pas par l'application :

1. Dans l'éditeur SQL : supprimer l'organisation, ce qui supprime ses données en cascade et inscrit les chemins de ses fichiers dans la file : `delete from public.organisations where id = '<identifiant de l'organisation>';`
2. Dans le tableau de bord Supabase, Storage, bucket `documents` : supprimer le dossier portant l'identifiant de l'organisation.
3. Vider la file de ces chemins : `delete from private.fichiers_a_retirer where org_id = '<identifiant de l'organisation>';`

Sauvegardez ou remettez d'abord à l'administrateur l'export de ses données si elles lui sont dues (30 jours après la fin de l'abonnement, conditions d'utilisation, article 8). Les chemins d'une organisation dont l'essai est terminé restent en attente, avec leurs fichiers, jusqu'à ce qu'elle puisse écrire à nouveau ou que vous la supprimiez.

## Cœur suivi-évaluation (Lot 2)

| Élément | État |
|---|---|
| Projet d'exemple | Données **fictives**, étiquetées « Exemple » partout où elles s'affichent |
| Export PDF d'un état d'avancement | Non fait : à décider |
| Quota de stockage de fichiers par plan | Aucun : seule la limite de 20 Mo par fichier existe |
| Nettoyage des fichiers d'un projet supprimé | Fait (file en base, vidée par l'application) ; la fermeture d'un compte reste manuelle (voir ci-dessus) |

## Page d’accueil

La landing complète est en place (Lot 1c) et distingue désormais ce qui est disponible de ce qui est annoncé « Bientôt » (Lot 2d). Restent à fournir pour l'améliorer : adresse publique, témoignages et chiffres sourcés des pilotes, vidéo, logo définitif.
