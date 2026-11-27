import { Link } from "react-router";
import i18n from "~/i18n";
import { env } from "~/lib/env";
import { ACompleter, PageLegale } from "./PageLegale";

export const meta = () => [{ title: i18n.t("legal.mentions_meta") }];

// Cette page ne reprend que les rubriques des mentions légales de Farata.net (https://farata.net/mentions-legales), sur
// demande du 27 novembre 2026 : éditeur, hébergement, propriété intellectuelle, protection des données, conditions
// d'utilisation, droit applicable et litiges, question juridique, plus la ligne « Éditeur » que les conditions d'utilisation et la
// politique de confidentialité citent pour identifier l'éditeur. Les textes sont réécrits pour Pilot M&E. Les faits propres
// à l'éditeur ne sont jamais repris d'ailleurs : ils restent « à compléter » (PLACEHOLDERS.md). Les informations que la loi
// sénégalaise n° 2008-08 demande à un éditeur (immatriculation, téléphone, hébergeur des données, prix) ne figurent plus ici :
// voir DECISIONS.md, section 34.
export default function MentionsLegales() {
  const contact = env.contactEmail ? (
    <a href={`mailto:${env.contactEmail}`}>{env.contactEmail}</a>
  ) : (
    <ACompleter>e-mail de contact</ACompleter>
  );
  return (
    <PageLegale titre="Mentions légales">
      <section>
        <h2>Éditeur du site</h2>
        <p>Informations légales concernant le site Pilot M&amp;E, conformément aux obligations réglementaires.</p>
        <ul>
          <li>Nom du site : Pilot M&amp;E</li>
          <li>Éditeur : {env.editeur ?? <ACompleter>raison sociale</ACompleter>}</li>
          <li>Statut : Entreprise individuelle</li>
          <li>Siège social : Dakar, Sénégal</li>
          <li>E-mail de contact : {contact}</li>
          <li>Directeur ou directrice de la publication : le gérant ou la gérante de Pilot M&amp;E</li>
        </ul>
      </section>
      <section>
        <h2>Hébergement</h2>
        <ul>
          <li>Hébergeur : Vercel Inc.</li>
          <li>Adresse : 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis</li>
          <li>
            Site web :{" "}
            <a href="https://vercel.com" rel="noreferrer">
              vercel.com
            </a>
          </li>
        </ul>
      </section>
      <section>
        <h2>Propriété intellectuelle</h2>
        <p>
          Le contenu du site (textes, images, logos, graphismes, interface) est protégé par le droit d’auteur et le
          droit des marques. Aucune reproduction, représentation, modification, publication ni adaptation, totale ou
          partielle et par quelque moyen que ce soit, n’est permise sans l’autorisation écrite préalable de l’éditeur.
        </p>
        <p>
          Le nom Pilot M&amp;E, son logo et ses éléments graphiques appartiennent à l’éditeur : les utiliser sans son
          autorisation est interdit.
        </p>
      </section>
      <section>
        <h2>Protection des données</h2>
        <p>
          Conformément à la loi sénégalaise n° 2008-12 sur la protection des données à caractère personnel, vous
          disposez d’un droit d’accès, de rectification, de suppression et d’opposition pour des motifs légitimes à
          l’égard de vos données.
        </p>
        <p>
          Pour plus de détails sur la collecte et le traitement de vos données personnelles, consultez la{" "}
          <Link to="/confidentialite">politique de confidentialité</Link>.
        </p>
      </section>
      <section>
        <h2>Conditions d’utilisation</h2>
        <p>En utilisant Pilot M&amp;E, vous acceptez les conditions générales d’utilisation.</p>
        <ul>
          <li>
            Le service est réservé aux professionnels : organisations non gouvernementales, entreprises et structures
            qui suivent et évaluent des projets.
          </li>
          <li>Les identifiants sont personnels et confidentiels.</li>
          <li>
            Chaque organisation reste responsable des données qu’elle saisit, de leur exactitude et de leur licéité.
          </li>
          <li>
            Un accès qui menace la sécurité du service ou qui sert un usage illicite peut être suspendu ou fermé sans
            délai.
          </li>
        </ul>
        <p>
          <Link to="/conditions-utilisation">Voir les conditions générales d’utilisation complètes</Link>
        </p>
      </section>
      <section>
        <h2>Droit applicable et litiges</h2>
        <p>
          Les présentes mentions légales sont régies par le droit sénégalais. En cas de litige, et après une tentative
          de résolution amiable, les tribunaux de Dakar sont seuls compétents.
        </p>
        <p>Pour toute réclamation, écrivez à : {contact}</p>
      </section>
      <section>
        <h2>Une question juridique ?</h2>
        <p>Pour toute question concernant ces mentions légales, n’hésitez pas à nous contacter : {contact}</p>
      </section>
    </PageLegale>
  );
}
