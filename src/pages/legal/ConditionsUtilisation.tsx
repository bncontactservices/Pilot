import { Link } from "react-router";
import i18n from "~/i18n";
import { DUREE_ESSAI_JOURS } from "~/lib/constants";
import { env } from "~/lib/env";
import { DELAI_EXPORT_JOURS, DELAI_SUPPRESSION_JOURS, PREAVIS_MODIFICATION_JOURS } from "~/lib/legal";
import { ACompleter, PageLegale } from "./PageLegale";

export const meta = () => [{ title: i18n.t("legal.conditions_meta") }];

function Contact() {
  return env.contactEmail ? (
    <a href={`mailto:${env.contactEmail}`}>{env.contactEmail}</a>
  ) : (
    <ACompleter>e-mail de contact</ACompleter>
  );
}

export default function ConditionsUtilisation() {
  const editeur = env.editeur ?? <ACompleter>raison sociale</ACompleter>;
  return (
    <PageLegale titre="Conditions générales d’utilisation">
      <section>
        <h2>1. Objet et champ d’application</h2>
        <p>
          Les présentes conditions régissent l’accès et l’utilisation de Pilot M&amp;E, logiciel en ligne de
          suivi-évaluation de projets, édité par {editeur} (« l’Éditeur », voir les{" "}
          <Link to="/mentions-legales">mentions légales</Link>).
        </p>
        <p>
          Le service est destiné à des <strong>professionnels</strong> : organisations non gouvernementales,
          entreprises, associations et porteurs de projets qui l’utilisent pour leur activité. Il n’est pas proposé aux
          consommateurs. En s’inscrivant, la personne déclare agir pour le compte d’une organisation et avoir le pouvoir
          de l’engager.
        </p>
        <p>
          Le contrat est conclu entre l’Éditeur et l’organisation cliente. Chaque personne invitée à rejoindre une
          organisation s’engage, à titre personnel, à respecter ces conditions. Elles forment, avec la{" "}
          <Link to="/confidentialite">politique de confidentialité</Link> et l’offre choisie (page Tarifs),
          l’intégralité de l’accord ; en cas de contradiction, ces conditions l’emportent sur l’offre, sauf mention
          expresse contraire.
        </p>
      </section>

      <section>
        <h2>2. Définitions</h2>
        <ul>
          <li>
            <strong>Organisation</strong> : la personne morale ou le groupement qui ouvre un espace sur Pilot M&amp;E.
          </li>
          <li>
            <strong>Utilisateur</strong> : toute personne qui accède à l’espace d’une Organisation, avec l’un des trois
            rôles : administrateur, éditeur ou lecteur.
          </li>
          <li>
            <strong>Données de l’Organisation</strong> : tout ce que l’Organisation et ses Utilisateurs saisissent,
            importent ou déposent dans le service (programmes, projets, indicateurs, valeurs, cadre logique, plan de
            travail, réalisations, documents, etc.).
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Compte, rôles et accès</h2>
        <ul>
          <li>
            Un administrateur crée l’espace de l’Organisation, invite les autres Utilisateurs (par e-mail ou par lien)
            et choisit leur rôle. L’administrateur peut tout faire ; l’éditeur peut saisir et modifier les données du
            suivi mais ne gère ni l’équipe ni la suppression des projets ; le lecteur consulte et exporte, sans rien
            modifier.
          </li>
          <li>
            L’Organisation répond des personnes qu’elle invite, des rôles qu’elle leur donne et de l’usage qu’elles font
            du service. Elle retire sans délai l’accès d’une personne qui quitte l’équipe.
          </li>
          <li>
            Les identifiants sont personnels et confidentiels. L’Utilisateur donne des informations exactes, ne les
            partage pas, et prévient l’Éditeur sans délai s’il soupçonne un accès non autorisé.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Essai gratuit et plans</h2>
        <p>
          Toute nouvelle Organisation bénéficie d’un essai gratuit de {DUREE_ESSAI_JOURS} jours, sans carte bancaire et
          avec les limites du plan Pro. À la fin de l’essai, si aucun plan n’est activé, l’Organisation passe en{" "}
          <strong>lecture seule</strong> : ses données restent consultables et exportables, mais plus modifiables,
          jusqu’à l’activation d’un plan. Aucun paiement n’est jamais prélevé automatiquement.
        </p>
        <p>
          Les plans (Starter, Pro, Enterprise) et leurs limites (projets, indicateurs par projet, utilisateurs) sont
          ceux de la page Tarifs. Ces limites sont appliquées par le service. Un plan est activé par l’équipe de
          l’Éditeur après réception du paiement.
        </p>
      </section>

      <section>
        <h2>5. Prix et paiement</h2>
        <ul>
          <li>
            Les prix sont ceux affichés sur la page Tarifs à la date de l’activation du plan. Ils sont indiqués en
            euros, avec un équivalent indicatif en francs CFA.
          </li>
          <li>
            Le paiement se fait par virement, d’avance pour la période choisie (mensuelle ou annuelle), à réception de
            la facture. Il n’existe pas de paiement en ligne par carte.
          </li>
          <li>
            Sans paiement dans les 15 jours suivant un rappel écrit, l’Éditeur peut suspendre l’accès en écriture, puis
            résilier le contrat. Les données restent alors conservées dans les conditions de l’article 8.
          </li>
          <li>
            Un changement de prix s’applique au renouvellement suivant, sous réserve d’un préavis de{" "}
            {PREAVIS_MODIFICATION_JOURS} jours adressé à l’administrateur.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Durée, renouvellement et résiliation</h2>
        <ul>
          <li>
            L’abonnement est conclu pour la période choisie et se renouvelle pour une durée identique, sur paiement,
            tant que l’Organisation ne l’a pas résilié.
          </li>
          <li>
            L’Organisation peut résilier à tout moment par e-mail à <Contact />. La résiliation prend effet à la fin de
            la période en cours, qui n’est pas remboursée, sauf manquement de l’Éditeur.
          </li>
          <li>
            Chaque partie peut résilier le contrat si l’autre manque à ses obligations et n’y remédie pas dans les 15
            jours suivant une mise en demeure écrite. L’Éditeur peut suspendre ou fermer sans délai un accès qui menace
            la sécurité du service ou qui sert un usage illicite.
          </li>
        </ul>
      </section>

      <section>
        <h2>7. Règles d’usage</h2>
        <p>L’Organisation et ses Utilisateurs s’engagent à :</p>
        <ul>
          <li>
            utiliser le service conformément à la loi et à ces conditions, et pour leur activité de suivi-évaluation ;
          </li>
          <li>
            ne pas porter atteinte à la sécurité ou au bon fonctionnement du service : pas de tentative d’accès aux
            données d’une autre organisation, pas de code malveillant, pas d’extraction massive, pas de contournement
            des limites du plan, pas d’ingénierie inverse ;
          </li>
          <li>
            ne déposer comme documents que des fichiers licites, dans les formats acceptés par le service (PDF, images,
            documents bureautiques, CSV, texte, archives zip) et de 20 Mo au plus ;
          </li>
          <li>
            n’y mettre aucun contenu illicite, diffamatoire, discriminatoire ou portant atteinte aux droits de tiers.
          </li>
        </ul>
      </section>

      <section>
        <h2>8. Données de l’Organisation</h2>
        <ul>
          <li>
            Les Données de l’Organisation restent sa propriété. Elle accorde à l’Éditeur le seul droit de les héberger,
            de les traiter et de les afficher pour fournir le service. L’Éditeur ne les vend pas, ne les loue pas et ne
            les utilise pas pour ses propres besoins.
          </li>
          <li>
            L’Organisation reste responsable de leur exactitude, de leur licéité et de l’usage qu’elle en fait, y
            compris dans les rapports remis à ses bailleurs.
          </li>
          <li>
            <strong>Exportation et restitution.</strong> Les rapports PDF se téléchargent à tout moment, y compris
            pendant la lecture seule. Pendant {DELAI_EXPORT_JOURS} jours après la fin de l’abonnement, l’Organisation
            peut consulter ses données et en demander par écrit une copie dans un format structuré courant (CSV ou
            JSON), remise dans les {DELAI_EXPORT_JOURS} jours.
          </li>
          <li>
            <strong>Suppression.</strong> Les données sont supprimées, fichiers compris, dans un délai de{" "}
            {DELAI_SUPPRESSION_JOURS} jours après la fermeture du compte, ou plus tôt sur demande écrite de
            l’administrateur.
          </li>
          <li>
            Le projet d’exemple fourni à l’essai contient des données fictives, étiquetées comme telles : elles ne
            décrivent aucun projet réel.
          </li>
        </ul>
      </section>

      <section>
        <h2>9. Données personnelles</h2>
        <p>
          Pour les données de ses propres Utilisateurs (compte, connexion), l’Éditeur est responsable du traitement :
          voir la <Link to="/confidentialite">politique de confidentialité</Link>. Pour les données personnelles que
          l’Organisation saisit dans ses projets (par exemple des noms de responsables, de partenaires ou de
          bénéficiaires), l’Organisation est responsable du traitement et l’Éditeur agit comme son{" "}
          <strong>sous-traitant</strong>, au sens de la loi sénégalaise n° 2008-12. À ce titre :
        </p>
        <ul>
          <li>
            l’Éditeur traite ces données uniquement pour fournir le service et selon les instructions de l’Organisation,
            exprimées par ces conditions et par l’usage du service ;
          </li>
          <li>
            les personnes qui y accèdent chez l’Éditeur sont tenues à la confidentialité et n’y accèdent que pour le
            support ou la maintenance ;
          </li>
          <li>
            l’Éditeur met en œuvre des mesures de sécurité adaptées, détaillées dans la politique de confidentialité
            (isolement des données par organisation, contrôle d’accès par rôle, chiffrement des échanges, historique des
            modifications) et informe l’Organisation sans délai injustifié en cas d’incident touchant ses données ;
          </li>
          <li>
            l’Éditeur recourt aux sous-traitants ultérieurs listés dans la politique de confidentialité, liés par des
            engagements de sécurité et de confidentialité ; l’Organisation les accepte et sera informée de tout
            changement ;
          </li>
          <li>
            l’Éditeur aide l’Organisation à répondre aux demandes d’exercice des droits des personnes concernées ;
          </li>
          <li>au terme du contrat, l’Éditeur restitue puis supprime les données dans les conditions de l’article 8.</li>
        </ul>
        <p>
          L’Organisation s’engage, pour sa part, à respecter la loi n° 2008-12 : informer les personnes dont elle saisit
          les données, disposer d’un fondement licite pour ces données et accomplir ses propres formalités auprès de la
          Commission de protection des données personnelles (CDP), y compris pour l’hébergement dans l’Union européenne.
          Pilot M&amp;E n’est pas conçu pour des données sensibles (santé, opinions politiques ou religieuses,
          appartenance syndicale, vie sexuelle, origine ethnique, données génétiques) : l’Organisation n’en saisit pas,
          sauf si la loi l’autorise et si les formalités requises sont accomplies.
        </p>
      </section>

      <section>
        <h2>10. Disponibilité, support et sauvegardes</h2>
        <ul>
          <li>
            L’Éditeur met en œuvre les moyens raisonnables pour que le service soit accessible en continu, sans garantir
            l’absence d’interruption. Les maintenances sont, autant que possible, annoncées à l’avance.
          </li>
          <li>
            Le support se fait par e-mail ou par WhatsApp, en jours ouvrés, aux coordonnées indiquées à l’article 19.
          </li>
          <li>
            Les sauvegardes dépendent de l’offre de l’hébergeur. L’Éditeur ne garantit pas de pouvoir restituer des
            données perdues à la suite d’un incident : l’Organisation exporte régulièrement ses rapports.
          </li>
        </ul>
      </section>

      <section>
        <h2>11. Propriété intellectuelle</h2>
        <p>
          Pilot M&amp;E, son code, son interface, sa documentation, sa marque et son logo appartiennent à l’Éditeur ou
          lui sont concédés. L’Organisation reçoit, pour la durée de son essai ou de son abonnement, un droit d’usage
          personnel, non exclusif et non cessible, limité à ses besoins propres. Les suggestions qu’elle formule peuvent
          être utilisées librement par l’Éditeur pour améliorer le service.
        </p>
      </section>

      <section>
        <h2>12. Responsabilité</h2>
        <ul>
          <li>
            L’Éditeur est tenu d’une obligation de moyens. Pilot M&amp;E est un outil d’aide au pilotage : les taux, les
            statuts et les rapports qu’il calcule reposent sur les données saisies, et ne remplacent ni une évaluation
            indépendante ni un audit. L’Éditeur n’est pas responsable des décisions prises à partir de ces résultats.
          </li>
          <li>
            L’Éditeur ne répond pas des dommages indirects (perte de financement, de chance, d’image ou de données), ni
            de ceux dus à un usage non conforme, à un cas de force majeure ou à un fait de l’hébergeur ou d’un autre
            tiers qu’il ne contrôle pas.
          </li>
          <li>
            Sa responsabilité, toutes causes confondues, est limitée aux sommes payées par l’Organisation au cours des
            12 derniers mois (aucune somme n’étant due pour un dommage subi pendant l’essai gratuit). Ces limites ne
            s’appliquent pas en cas de dol ou de faute lourde.
          </li>
        </ul>
      </section>

      <section>
        <h2>13. Contenus illicites et signalement</h2>
        <p>
          Toute personne qui estime qu’un contenu hébergé par le service est illicite peut le signaler à <Contact />, en
          précisant la date du signalement, son identité, la description du contenu et de son emplacement, les motifs
          juridiques invoqués et, le cas échéant, les démarches déjà faites auprès de l’auteur. L’Éditeur retire ou rend
          inaccessible sans délai un contenu manifestement illicite, avertit l’Organisation concernée et coopère avec
          les autorités judiciaires.
        </p>
      </section>

      <section>
        <h2>14. Communications</h2>
        <p>
          L’Organisation accepte de recevoir par voie électronique, à l’adresse de son administrateur, les informations
          relatives au contrat : factures, rappels, modifications des conditions, incidents. L’Éditeur n’envoie pas de
          prospection commerciale sans consentement préalable.
        </p>
      </section>

      <section>
        <h2>15. Modification des conditions</h2>
        <p>
          L’Éditeur peut modifier ces conditions, notamment pour tenir compte de l’évolution du service ou de la loi. La
          version en vigueur est datée et publiée sur cette page ; toute modification substantielle est annoncée à
          l’administrateur par e-mail {PREAVIS_MODIFICATION_JOURS} jours avant son entrée en vigueur. À défaut de
          résiliation dans ce délai, la poursuite de l’usage vaut acceptation. L’Éditeur conserve les versions
          successives et la date d’acceptation de chaque inscription, et peut produire la version applicable à un
          contrat donné.
        </p>
      </section>

      <section>
        <h2>16. Preuve</h2>
        <p>
          Les conditions sont acceptées par voie électronique, en cochant la case prévue à l’inscription : la date et la
          version acceptées sont enregistrées. Les enregistrements informatiques de l’Éditeur, conservés dans des
          conditions raisonnables de sécurité, font foi entre les parties, sauf preuve contraire.
        </p>
      </section>

      <section>
        <h2>17. Dispositions générales</h2>
        <p>
          Si une clause est déclarée nulle, les autres restent applicables. Le fait de ne pas se prévaloir d’une clause
          n’est pas une renonciation à la faire valoir. L’Éditeur peut céder le contrat à une société qui reprend son
          activité ; l’Organisation ne peut le céder sans accord écrit. Les présentes conditions sont rédigées en
          français, qui fait foi.
        </p>
      </section>

      <section>
        <h2>18. Droit applicable et litiges</h2>
        <p>
          Les présentes conditions sont régies par le droit sénégalais. En cas de différend, les parties cherchent
          d’abord une solution amiable, dans un délai de 30 jours à compter de la réclamation écrite. À défaut, les
          tribunaux de Dakar sont seuls compétents.
        </p>
      </section>

      <section>
        <h2>19. Contact et réclamations</h2>
        <p>
          Pour toute question ou réclamation : <Contact />
          {env.whatsappNumber ? `, téléphone et WhatsApp +${env.whatsappNumber}` : null}.
        </p>
      </section>
    </PageLegale>
  );
}
