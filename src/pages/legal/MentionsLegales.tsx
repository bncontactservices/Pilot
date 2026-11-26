import { Link } from "react-router";
import i18n from "~/i18n";
import { env } from "~/lib/env";
import { VERSION_CONDITIONS_LISIBLE } from "~/lib/legal";
import { ACompleter, PageLegale } from "./PageLegale";

export const meta = () => [{ title: i18n.t("legal.mentions_meta") }];

// Informations exigées d'un éditeur de service en ligne par la loi sénégalaise n° 2008-08 sur les transactions
// électroniques (articles 5 et 10) : identité, coordonnées, immatriculation, directeur de la publication, hébergeur, prix.
export default function MentionsLegales() {
  return (
    <PageLegale
      titre="Mentions légales"
      majLe={`Version du ${VERSION_CONDITIONS_LISIBLE} - provisoire, à valider par un juriste avant publication`}
    >
      <section>
        <h2>Éditeur du service</h2>
        <p>
          Pilot M&amp;E est édité par {env.editeur ?? <ACompleter>raison sociale</ACompleter>},{" "}
          <ACompleter>forme juridique</ACompleter> au capital de <ACompleter>montant</ACompleter>, immatriculée au
          registre du commerce et du crédit mobilier (RCCM) sous le numéro <ACompleter>RCCM</ACompleter>, numéro
          d’identification NINEA <ACompleter>NINEA</ACompleter>, dont le siège social est situé{" "}
          <ACompleter>adresse complète</ACompleter>.
        </p>
        <p>
          Directeur ou directrice de la publication : <ACompleter>nom</ACompleter>.
        </p>
      </section>
      <section>
        <h2>Contact et réclamations</h2>
        <ul>
          <li>
            E-mail :{" "}
            {env.contactEmail ? (
              <a href={`mailto:${env.contactEmail}`}>{env.contactEmail}</a>
            ) : (
              <ACompleter>e-mail de contact</ACompleter>
            )}
          </li>
          <li>
            Téléphone et WhatsApp : {env.whatsappNumber ? `+${env.whatsappNumber}` : <ACompleter>numéro</ACompleter>}
          </li>
          <li>
            Adresse postale : <ACompleter>adresse de correspondance</ACompleter>
          </li>
        </ul>
        <p>Les réclamations s’adressent à l’e-mail ou à l’adresse postale ci-dessus.</p>
      </section>
      <section>
        <h2>Hébergement</h2>
        <p>Le service repose sur deux hébergeurs :</p>
        <ul>
          <li>
            le site et l’application web sont diffusés par Vercel Inc. (
            <ACompleter>adresse et téléphone de l’hébergeur</ACompleter>) ;
          </li>
          <li>
            les données des comptes et des projets, l’authentification et les fichiers déposés sont hébergés par
            Supabase (<ACompleter>raison sociale, adresse et téléphone de l’hébergeur</ACompleter>), dans un centre de
            données situé dans l’Union européenne (Irlande, région eu-west-1).
          </li>
        </ul>
      </section>
      <section>
        <h2>Prix et conditions</h2>
        <p>
          Les prix sont indiqués dans la section Tarifs de la page d’accueil, en dollars américains avec un équivalent
          indicatif en francs CFA ; ils s’entendent <ACompleter>hors taxes ou toutes taxes comprises</ACompleter>. Le
          service s’adresse à des professionnels ; ses conditions d’accès, de paiement et de résiliation figurent dans
          les <Link to="/conditions-utilisation">conditions générales d’utilisation</Link>.
        </p>
      </section>
      <section>
        <h2>Propriété intellectuelle</h2>
        <p>
          La marque, le logo, les textes, l’interface et le logiciel Pilot M&amp;E sont protégés et appartiennent à
          l’éditeur ou lui sont concédés. Toute reproduction, représentation ou réutilisation, totale ou partielle, sans
          autorisation écrite préalable est interdite. L’accès au service donne à une organisation un droit d’usage
          personnel et non exclusif, pour la durée de son essai ou de son abonnement.
        </p>
        <p>
          Les données saisies par les utilisateurs (projets, indicateurs, valeurs, documents) restent la propriété de
          leur organisation, qui peut les exporter.
        </p>
      </section>
      <section>
        <h2>Données personnelles</h2>
        <p>
          Les données personnelles traitées par Pilot M&amp;E, leurs finalités, leurs destinataires et vos droits sont
          décrits dans la <Link to="/confidentialite">politique de confidentialité</Link>.
        </p>
      </section>
      <section>
        <h2>Responsabilité et signalement</h2>
        <p>
          L’éditeur s’efforce d’assurer l’accès au service, sans pouvoir garantir l’absence d’interruption. Les taux
          d’avancement, les statuts et les rapports calculés par Pilot M&amp;E reposent sur les données saisies par
          l’organisation, qui reste responsable de leur exactitude et de l’usage qu’elle en fait auprès de ses
          bailleurs. L’éditeur n’est pas responsable du contenu des sites tiers vers lesquels pourraient pointer des
          liens.
        </p>
        <p>
          Un contenu que vous estimez illicite peut être signalé à l’éditeur selon la procédure décrite dans les{" "}
          <Link to="/conditions-utilisation">conditions générales d’utilisation</Link>.
        </p>
      </section>
      <section>
        <h2>Droit applicable et litiges</h2>
        <p>
          Les présentes mentions sont régies par le droit sénégalais. En cas de litige, une solution amiable est
          recherchée en priorité ; à défaut, le tribunal compétent est <ACompleter>juridiction</ACompleter>.
        </p>
      </section>
    </PageLegale>
  );
}
