import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { VERSION_CONDITIONS } from "~/lib/legal";
import Confidentialite from "./Confidentialite";
import ConditionsUtilisation from "./ConditionsUtilisation";
import MentionsLegales from "./MentionsLegales";

const afficher = (page: React.ReactElement) => render(<MemoryRouter>{page}</MemoryRouter>);
const titres = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

describe("Pages légales : datées, versionnées, sans fait inventé", () => {
  it("la version des conditions reste une date ISO, enregistrée à l'inscription (la preuve de ce qui a été accepté)", () => {
    expect(VERSION_CONDITIONS).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("aucune page légale n'affiche de ligne de version ni de mention « à valider par un juriste », à votre demande", () => {
    for (const page of [<MentionsLegales key="m" />, <Confidentialite key="c" />, <ConditionsUtilisation key="u" />]) {
      const { unmount } = afficher(page);
      expect(screen.queryByText(/Version du|à valider par un juriste/)).not.toBeInTheDocument();
      unmount();
    }
  });

  it("chaque valeur juridique qui n'est pas établie est visible comme « à compléter », jamais inventée", () => {
    afficher(<MentionsLegales />);
    // Le statut, le siège et le tribunal sont ceux que vous avez indiqués : donnés, non à compléter.
    expect(screen.getByText("Statut : Entreprise individuelle")).toBeInTheDocument();
    expect(screen.getByText("Siège social : Dakar, Sénégal")).toBeInTheDocument();
    expect(screen.getByText(/les tribunaux de Dakar sont seuls compétents/)).toBeInTheDocument();
    // Seuls l'éditeur et l'e-mail de contact, qui viennent de la configuration, peuvent rester « à compléter » (tant qu'elle manque).
    expect(screen.getByText(/^Éditeur :/)).toBeInTheDocument();
    for (const marque of screen.queryAllByText(/à compléter/, { selector: "mark" }))
      expect(marque.textContent).toMatch(/e-mail de contact|raison sociale/);
    // Aucun numéro d'immatriculation ni marque déposée n'est affirmé : rien ne l'établit.
    expect(screen.queryByText(/RCCM\s*:?\s*SN/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/marques? déposées?/i)).not.toBeInTheDocument();
  });
});

describe("Mentions légales", () => {
  it("ne garde que les rubriques des mentions légales de Farata.net, réécrites pour Pilot M&E", () => {
    afficher(<MentionsLegales />);
    expect(titres()).toEqual([
      "Éditeur du site",
      "Hébergement",
      "Propriété intellectuelle",
      "Protection des données",
      "Conditions d’utilisation",
      "Droit applicable et litiges",
      "Une question juridique ?",
    ]);
    // Hébergeur : Vercel, avec l'adresse publiée par Vercel lui-même.
    expect(screen.getByText(/Hébergeur : Vercel Inc\./)).toBeInTheDocument();
    expect(screen.getByText(/440 N Barranca Avenue #4133, Covina, CA 91723/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "vercel.com" })).toHaveAttribute("href", "https://vercel.com");
    expect(screen.getByRole("link", { name: /conditions générales d’utilisation complètes/ })).toHaveAttribute(
      "href",
      "/conditions-utilisation",
    );
    expect(screen.getByRole("link", { name: "politique de confidentialité" })).toHaveAttribute(
      "href",
      "/confidentialite",
    );
  });

  it("ne contient plus ce que le modèle n'a pas : immatriculation, téléphone, prix, autre hébergeur, responsabilité", () => {
    afficher(<MentionsLegales />);
    expect(
      screen.queryByText(/RCCM|NINEA|capital|WhatsApp|Supabase|dollars|euros|mobile money|Farata/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Responsabilité|Prix|Contact et réclamations/ }),
    ).not.toBeInTheDocument();
  });
});

describe("Politique de confidentialité", () => {
  it("couvre les informations à donner à la collecte (loi 2008-12, art. 58), sauf le transfert à l'étranger retiré sur demande", () => {
    afficher(<Confidentialite />);
    expect(titres()).toEqual([
      "Qui est responsable de vos données ?", // identité du responsable
      "Quelles données, et pourquoi ?", // catégories, finalités, caractère obligatoire ou facultatif
      "Qui reçoit vos données ?", // destinataires
      "Où sont-elles hébergées ?", // hébergement, style de Farata.net ; plus de transfert hors du Sénégal
      "Comment sont-elles protégées ?",
      "Cookies et stockage local",
      "Combien de temps ?", // durée de conservation
      "Vos droits", // accès, rectification, ne plus figurer au fichier
      "Mises à jour de cette politique",
    ]);
    expect(screen.getByText(/obligatoires : sans elles, le compte ne peut pas être créé/)).toBeInTheDocument();
    expect(screen.getByText(/ne plus figurer dans un/)).toBeInTheDocument();
  });

  it("dit où sont les données dans le style de Farata.net : jamais vendues, partagées avec les prestataires et les autorités", () => {
    afficher(<Confidentialite />);
    const hebergement = screen.getByRole("heading", { name: "Où sont-elles hébergées ?" }).closest("section")!;
    expect(within(hebergement).getByText(/Nous ne vendons jamais vos données/)).toBeInTheDocument();
    expect(within(hebergement).getByText(/Union européenne \(Irlande\)/)).toBeInTheDocument();
    expect(within(hebergement).getByText("Prestataires techniques")).toBeInTheDocument();
    expect(within(hebergement).getByText("Autorités")).toBeInTheDocument();
    expect(within(hebergement).getByText(/Les données sont chiffrées en transit/)).toBeInTheDocument();
    // Plus de champ « à compléter » sur la déclaration à la CDP dans cette rubrique ; le transfert à l'étranger n'y est plus décrit.
    expect(within(hebergement).queryByText(/à compléter/)).not.toBeInTheDocument();
    expect(within(hebergement).queryByText(/transfert|CDP/i)).not.toBeInTheDocument();
  });

  it("liste les droits un par un dans le style de Farata.net : accès, rectification, suppression, portabilité, opposition", () => {
    afficher(<Confidentialite />);
    const droits = screen.getByRole("heading", { name: "Vos droits" }).closest("section")!;
    expect(within(droits).getByText(/vous disposez des droits suivants/)).toBeInTheDocument();
    for (const droit of ["Accès", "Rectification", "Suppression", "Portabilité", "Opposition"])
      expect(within(droits).getByText(droit)).toBeInTheDocument();
    expect(within(droits).getAllByRole("listitem")).toHaveLength(5);
    // La procédure et le délai restent, ainsi que le recours à la CDP.
    expect(within(droits).getByText(/en justifiant de votre identité/)).toBeInTheDocument();
    expect(within(droits).getByText(/Commission de protection des données personnelles/)).toBeInTheDocument();
  });

  it("ne renvoie plus à une date « en haut » de page : la ligne de version n'existe plus", () => {
    afficher(<Confidentialite />);
    expect(screen.queryByText(/datée en haut/)).not.toBeInTheDocument();
    expect(screen.getByText(/la version en vigueur est celle publiée sur cette page/)).toBeInTheDocument();
  });

  it("annonce le délai d'un mois de la loi pour la rectification et la suppression", () => {
    afficher(<Confidentialite />);
    expect(screen.getByText(/dans un délai d’un mois après l’enregistrement de la demande/)).toBeInTheDocument();
  });

  it("liste les sous-traitants et ne se réclame pas d'un « intérêt légitime », que la loi sénégalaise ne connaît pas", () => {
    afficher(<Confidentialite />);
    for (const nom of ["Supabase", "Vercel", "Resend", "Plausible Analytics", "Cloudflare Turnstile"]) {
      expect(screen.getByText(new RegExp(`^${nom}`))).toBeInTheDocument();
    }
    expect(screen.queryByText(/intérêt légitime/i)).not.toBeInTheDocument();
  });
});

describe("Conditions générales d'utilisation", () => {
  it("couvre l'essentiel d'un contrat de service en ligne entre professionnels", () => {
    afficher(<ConditionsUtilisation />);
    expect(titres()).toEqual([
      "1. Objet et champ d’application",
      "2. Définitions",
      "3. Compte, rôles et accès",
      "4. Essai gratuit et plans",
      "5. Prix et paiement",
      "6. Durée, renouvellement et résiliation",
      "7. Règles d’usage",
      "8. Données de l’Organisation",
      "9. Données personnelles",
      "10. Disponibilité, support et sauvegardes",
      "11. Propriété intellectuelle",
      "12. Responsabilité",
      "13. Contenus illicites et signalement",
      "14. Communications",
      "15. Modification des conditions",
      "16. Preuve",
      "17. Dispositions générales",
      "18. Droit applicable et litiges",
      "19. Contact et réclamations",
    ]);
  });

  it("dit la vérité sur l'offre : essai de 14 jours, lecture seule ensuite, pas de paiement en ligne", () => {
    afficher(<ConditionsUtilisation />);
    const essai = screen.getByRole("heading", { name: "4. Essai gratuit et plans" }).closest("section")!;
    expect(within(essai).getByText(/essai gratuit de 14 jours/)).toBeInTheDocument();
    expect(within(essai).getByText("lecture seule")).toBeInTheDocument();
    expect(within(essai).getByText(/Aucun paiement n’est jamais prélevé automatiquement/)).toBeInTheDocument();
    const prix = screen.getByRole("heading", { name: "5. Prix et paiement" }).closest("section")!;
    expect(within(prix).getByText(/Il n’existe pas de paiement en ligne par carte/)).toBeInTheDocument();
  });

  it("fixe le sort des données à la fin du contrat avec les mêmes délais que la politique de confidentialité", () => {
    afficher(<ConditionsUtilisation />);
    const donnees = screen.getByRole("heading", { name: "8. Données de l’Organisation" }).closest("section")!;
    expect(within(donnees).getByText(/Pendant 30 jours après la fin de l’abonnement/)).toBeInTheDocument();
    expect(within(donnees).getByText(/dans un délai de 90 jours après la fermeture du compte/)).toBeInTheDocument();
  });

  it("prévoit la clause de sous-traitance exigée par la loi sur les données personnelles", () => {
    afficher(<ConditionsUtilisation />);
    const donnees = screen.getByRole("heading", { name: "9. Données personnelles" }).closest("section")!;
    expect(within(donnees).getByText("sous-traitant")).toBeInTheDocument();
    expect(
      within(donnees).getByText(/uniquement pour fournir le service et selon les instructions/),
    ).toBeInTheDocument();
    expect(within(donnees).getByText(/sous-traitants ultérieurs/)).toBeInTheDocument();
  });

  it("dit les choix que vous avez faits, et n'affirme rien d'autre sur les taxes ni sur le courrier", () => {
    afficher(<ConditionsUtilisation />);
    // Les prix ne disent plus s'ils s'entendent hors taxes ou toutes taxes comprises : rien n'est affirmé à ce sujet.
    expect(screen.queryByText(/hors taxes|toutes taxes comprises|s’entendent/)).not.toBeInTheDocument();
    // Tribunaux de Dakar : votre réponse. Plus d'adresse postale : la rubrique contact n'en parle plus.
    expect(screen.getByText(/les tribunaux de Dakar sont seuls compétents/)).toBeInTheDocument();
    expect(screen.queryByText(/courrier|adresse postale/i)).not.toBeInTheDocument();
  });

  it("dit les prix dans la devise de la section Tarifs et de Stripe (euros), et renvoie le support à l'article 19", () => {
    afficher(<ConditionsUtilisation />);
    const prix = screen.getByRole("heading", { name: "5. Prix et paiement" }).closest("section")!;
    expect(within(prix).getByText(/indiqués en euros, avec un équivalent indicatif en francs CFA/)).toBeInTheDocument();
    expect(screen.queryByText(/dollars/i)).not.toBeInTheDocument();
    // Le support n'est plus renvoyé aux mentions légales (qui ne donnent plus WhatsApp) mais à l'article 19.
    expect(screen.getByText(/aux coordonnées indiquées à l’article 19/)).toBeInTheDocument();
  });
});
