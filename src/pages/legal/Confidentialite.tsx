import { Link } from "react-router";
import i18n from "~/i18n";
import { env } from "~/lib/env";
import { CONSERVATION_DEMANDES_MOIS, DELAI_SUPPRESSION_JOURS } from "~/lib/legal";
import { ACompleter, PageLegale } from "./PageLegale";

export const meta = () => [{ title: i18n.t("legal.confidentialite_meta") }];

function Contact() {
  return env.contactEmail ? (
    <a href={`mailto:${env.contactEmail}`}>{env.contactEmail}</a>
  ) : (
    <ACompleter>e-mail de contact</ACompleter>
  );
}

// Rédigée selon la loi sénégalaise n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère personnel :
// la collecte directe impose d'informer la personne de neuf points (art. 58) — responsable, finalités, catégories de
// données, destinataires, caractère obligatoire ou facultatif, possibilité de ne plus figurer au fichier, droits d'accès
// et de rectification, durée de conservation, transferts à l'étranger — qui étaient chacun traités ci-dessous.
// Sur demande (27 novembre 2026), la rubrique d'hébergement est réécrite dans le style de celle de Farata.net (« Partage des
// données ») : elle ne parle plus du transfert hors du Sénégal ni de la déclaration à la CDP (voir DECISIONS.md, section 36).
export default function Confidentialite() {
  return (
    <PageLegale titre="Politique de confidentialité">
      <section>
        <h2>Qui est responsable de vos données ?</h2>
        <p>
          {env.editeur ?? <ACompleter>raison sociale</ACompleter>}, éditeur de Pilot M&amp;E (voir les{" "}
          <Link to="/mentions-legales">mentions légales</Link>), est responsable du traitement des données de compte et
          de contact décrites ci-dessous. Contact pour toute question : <Contact />.
        </p>
        <p>
          Pour les données personnelles que votre organisation saisit dans ses projets (par exemple le nom d’un
          responsable, d’un partenaire ou d’un bénéficiaire), c’est l’organisation qui est responsable du traitement.
          Pilot M&amp;E les traite pour son compte, comme sous-traitant, dans les conditions décrites aux{" "}
          <Link to="/conditions-utilisation">conditions générales d’utilisation</Link>.
        </p>
      </section>
      <section>
        <h2>Quelles données, et pourquoi ?</h2>
        <p>
          Les informations demandées à l’inscription (nom, adresse e-mail, mot de passe, nom de l’organisation) sont
          obligatoires : sans elles, le compte ne peut pas être créé. Le téléphone et le logo sont facultatifs.
        </p>
        <ul>
          <li>
            <strong>Compte et organisation</strong> : nom, adresse e-mail, téléphone facultatif, mot de passe (stocké
            sous forme chiffrée), nom, pays, devise, logo facultatif et plan de l’organisation, membres et rôles,
            invitations en attente (adresse e-mail et rôle de la personne invitée). Finalité : fournir le service
            (exécution du contrat).
          </li>
          <li>
            <strong>Données de pilotage</strong> : programmes, projets, indicateurs, valeurs et commentaires, cadre
            logique, plan de travail, phases et étapes, réalisations, prochaines étapes, états d’avancement, étiquettes,
            et les documents déposés (avec nom, catégorie, taille et auteur du dépôt), l’annuaire d’acteurs (nom d’une
            organisation et, si l’organisation les saisit, la fonction, l’adresse e-mail et le téléphone d’une personne
            à contacter) et, pour les bénéficiaires, des <strong>effectifs agrégés</strong> (nombre de personnes par
            période, catégorie, sexe et tranche d’âge) : Pilot M&amp;E n’enregistre aucune fiche nominative de
            bénéficiaire. Les <strong>localités</strong> (nom, niveau, rattachement et, facultativement, coordonnées
            d’un lieu : village, quartier, commune) désignent des lieux d’intervention, pas des personnes. Un «
            responsable » désigné dans ces écrans est un simple nom saisi librement : ce n’est pas nécessairement un
            utilisateur. Finalité : fournir le service (exécution du contrat).
          </li>
          <li>
            <strong>Historique des modifications</strong> : qui a modifié quoi, et quand. Finalité : assurer la sécurité
            et la traçabilité des données, que la loi impose au responsable de mettre en œuvre.
          </li>
          <li>
            <strong>Rapport de suivi par e-mail</strong>, si vous le demandez dans votre profil : la fréquence choisie
            (chaque semaine ou chaque mois) et les dates du prochain et du dernier envoi. Le message est envoyé à
            l’adresse de votre compte et reprend l’avancement de votre organisation. Finalité : vous envoyer le rapport
            que vous avez demandé (consentement). Vous pouvez l’arrêter à tout moment dans votre profil ; la ligne est
            alors supprimée.
          </li>
          <li>
            <strong>Demandes de contact</strong> (démonstration, client pilote, offre Enterprise) : nom, organisation,
            e-mail et besoin exprimé, ainsi qu’une empreinte non réversible de l’adresse IP, conservée seulement pour
            limiter les envois abusifs (l’adresse elle-même n’est jamais enregistrée). Finalité : répondre à votre
            demande, que vous adressez volontairement (consentement et mesures précontractuelles).
          </li>
        </ul>
        <p>
          Aucune donnée n’est vendue, louée ni utilisée à des fins publicitaires, et aucune prospection commerciale
          n’est envoyée sans votre consentement préalable. Pilot M&amp;E n’est pas conçu pour des données sensibles
          (santé, opinions, appartenance syndicale, vie sexuelle, origine ethnique, données génétiques).
        </p>
      </section>
      <section>
        <h2>Qui reçoit vos données ?</h2>
        <p>
          Les données d’une organisation ne sont visibles que de ses membres, selon leur rôle. Pour faire fonctionner le
          service, l’éditeur s’appuie sur des sous-traitants, choisis pour leurs garanties de sécurité et liés par des
          engagements de confidentialité :
        </p>
        <ul>
          <li>Supabase : base de données, authentification et stockage des fichiers (Union européenne, Irlande).</li>
          <li>Vercel : diffusion du site et de l’application.</li>
          <li>
            Resend : envoi des e-mails d’invitation et de notification, et du rapport de suivi que vous choisissez de
            recevoir.
          </li>
          <li>
            Plausible Analytics : mesure d’audience sans cookie, conçue pour ne pas identifier les visiteurs, si elle
            est activée.
          </li>
          <li>Cloudflare Turnstile : vérification anti-robot du formulaire de contact, si elle est activée.</li>
          <li>
            OpenStreetMap (fondation OpenStreetMap) : images du fond de carte, chargées seulement lorsque la carte des
            zones d’intervention d’un projet est affichée. Votre navigateur les demande directement à ses serveurs :
            votre adresse IP et les caractéristiques de votre navigateur lui sont visibles, mais ni vos données de
            pilotage ni les coordonnées de vos localités ne lui sont transmises, à l’exception de la zone de carte
            affichée.
          </li>
        </ul>
        <p>Les données peuvent aussi être communiquées à une autorité, sur réquisition légale.</p>
      </section>
      <section>
        <h2>Où sont-elles hébergées ?</h2>
        <p>
          Nous ne vendons jamais vos données. Elles sont hébergées dans l’Union européenne (Irlande) et ne sont
          partagées qu’avec :
        </p>
        <ul>
          <li>
            <strong>Prestataires techniques</strong> : hébergement (Vercel), base de données, authentification et
            fichiers (Supabase), e-mails (Resend), ainsi que les services cités plus haut lorsqu’ils sont activés.
          </li>
          <li>
            <strong>Autorités</strong> : si la loi l’exige ou pour protéger nos droits et la sécurité des utilisateurs.
          </li>
        </ul>
        <p>Les données sont chiffrées en transit.</p>
      </section>
      <section>
        <h2>Comment sont-elles protégées ?</h2>
        <ul>
          <li>La base de données elle-même interdit à un membre d’une organisation de lire les données d’une autre.</li>
          <li>Chaque personne n’accède qu’à ce que son rôle autorise (administrateur, éditeur ou lecteur).</li>
          <li>Les mots de passe sont stockés sous forme chiffrée et les échanges sont chiffrés (HTTPS).</li>
          <li>
            Les fichiers sont stockés dans un espace privé et ne se téléchargent que par un lien temporaire, d’une
            minute, délivré aux membres de l’organisation.
          </li>
          <li>Les modifications sont tracées dans un historique.</li>
        </ul>
        <p>
          L’éditeur informe sans délai injustifié l’organisation concernée en cas d’incident de sécurité touchant ses
          données.
        </p>
      </section>
      <section>
        <h2>Cookies et stockage local</h2>
        <p>
          Pilot M&amp;E n’utilise aucun cookie publicitaire ni de suivi. Pour vous garder connecté, l’application
          conserve votre session dans le stockage local de votre navigateur ; elle s’efface quand vous vous déconnectez.
          Si la vérification anti-robot Turnstile est activée, Cloudflare peut déposer des données techniques dans votre
          navigateur le temps de cette vérification, nécessaire à l’envoi du formulaire ; vous pouvez à la place nous
          écrire par e-mail ou par WhatsApp.
        </p>
        <p>
          Pour que la saisie d’indicateurs reste possible sans réseau, l’application garde aussi, sur l’appareil et dans
          le stockage de votre navigateur : l’enveloppe de l’application (ses fichiers, par un « service worker ») ; ce
          qui sert à ouvrir un projet et à saisir (votre organisation, vos projets, leurs indicateurs, leurs saisies,
          les localités et zones d’intervention) ; et les valeurs saisies sans réseau qui n’ont pas encore été envoyées.
          Ces données sont celles de votre compte seul. Le contenu gardé pour l’ouverture sans réseau s’efface à la
          déconnexion. Une saisie non envoyée n’est jamais supprimée sans que vous l’ayez voulu : la déconnexion vous
          demande de l’envoyer ou de la supprimer ; si votre session se termine d’elle-même, elle reste sur l’appareil,
          à la disposition de votre seul compte, jusqu’à son envoi. Ces données ne sont pas chiffrées au-delà de la
          protection de l’appareil : sur un appareil partagé, déconnectez-vous après usage.
        </p>
      </section>
      <section>
        <h2>Combien de temps ?</h2>
        <ul>
          <li>
            <strong>Données d’une organisation</strong> : tant que son compte est actif. À la fin de l’essai,
            l’organisation passe en lecture seule : ses données restent consultables et exportables jusqu’à l’activation
            d’un plan. Après la fermeture du compte, elles sont supprimées, fichiers compris, dans un délai de{" "}
            {DELAI_SUPPRESSION_JOURS} jours, ou plus tôt sur demande écrite de l’administrateur.
          </li>
          <li>
            <strong>Demandes de contact</strong> : {CONSERVATION_DEMANDES_MOIS} mois à compter du dernier échange.
          </li>
          <li>
            <strong>Historique des modifications</strong> : conservé avec les données de l’organisation, et supprimé
            avec elles.
          </li>
        </ul>
      </section>
      <section>
        <h2>Vos droits</h2>
        <p>
          Conformément à la loi sénégalaise n° 2008-12 sur la protection des données à caractère personnel, vous
          disposez des droits suivants :
        </p>
        <ul>
          <li>
            <strong>Accès</strong> : obtenir la confirmation que vos données sont traitées, et en demander une copie.
          </li>
          <li>
            <strong>Rectification</strong> : corriger des informations inexactes ou incomplètes.
          </li>
          <li>
            <strong>Suppression</strong> : demander la suppression de votre compte et de vos données.
          </li>
          <li>
            <strong>Portabilité</strong> : recevoir vos données dans un format structuré et lisible.
          </li>
          <li>
            <strong>Opposition</strong> : vous opposer, pour des motifs légitimes, à certains traitements, et sans frais
            à toute prospection. Vous pouvez aussi demander à ne plus figurer dans un fichier.
          </li>
        </ul>
        <p>
          Pour les exercer, écrivez à <Contact />, en justifiant de votre identité. La rectification ou la suppression
          est faite sans frais, dans un délai d’un mois après l’enregistrement de la demande ; nous répondons dans le
          même délai à une demande d’accès. Si vos données figurent dans les projets d’une organisation cliente, nous
          vous orientons vers elle, qui en est responsable, et l’aidons à répondre.
        </p>
        <p>
          Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la Commission de protection des
          données personnelles (CDP), autorité de contrôle sénégalaise. Numéro de déclaration de l’éditeur auprès de la
          CDP : <ACompleter>numéro</ACompleter>.
        </p>
      </section>
      <section>
        <h2>Mises à jour de cette politique</h2>
        <p>
          Cette politique peut évoluer avec le produit : la version en vigueur est celle publiée sur cette page.
          L’éditeur conserve les versions successives.
        </p>
      </section>
    </PageLegale>
  );
}
