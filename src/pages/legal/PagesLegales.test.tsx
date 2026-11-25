import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { VERSION_CONDITIONS, VERSION_CONDITIONS_LISIBLE } from "~/lib/legal";
import Confidentialite from "./Confidentialite";
import ConditionsUtilisation from "./ConditionsUtilisation";
import MentionsLegales from "./MentionsLegales";

const afficher = (page: React.ReactElement) => render(<MemoryRouter>{page}</MemoryRouter>);
const titres = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

describe("Pages légales : datées, versionnées, sans fait inventé", () => {
  it("la version est une date ISO, affichée en toutes lettres sur chaque page", () => {
    expect(VERSION_CONDITIONS).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const page of [<MentionsLegales key="m" />, <Confidentialite key="c" />, <ConditionsUtilisation key="u" />]) {
      const { unmount } = afficher(page);
      expect(screen.getByText(new RegExp(`Version du ${VERSION_CONDITIONS_LISIBLE}`))).toBeInTheDocument();
      expect(screen.getByText(/à valider par un juriste/)).toBeInTheDocument();
      unmount();
    }
  });

  it("chaque valeur juridique qui n'est pas établie est visible comme « à compléter », jamais inventée", () => {
    afficher(<MentionsLegales />);
    for (const manquant of [
      /forme juridique/,
      /RCCM/,
      /NINEA/,
      /adresse complète/,
      /nom — à compléter/,
      /adresse de correspondance/,
    ]) {
      expect(screen.getAllByText(manquant, { selector: "mark" }).length).toBeGreaterThan(0);
    }
    // Aucun numéro d'immatriculation ni capital ne figure en dur dans le texte.
    expect(screen.queryByText(/RCCM\s*:?\s*SN/i)).not.toBeInTheDocument();
  });
});

describe("Mentions légales", () => {
  it("couvre les informations exigées d'un éditeur de service en ligne", () => {
    afficher(<MentionsLegales />);
    expect(titres()).toEqual([
      "Éditeur du service",
      "Contact et réclamations",
      "Hébergement",
      "Prix et conditions",
      "Propriété intellectuelle",
      "Données personnelles",
      "Responsabilité et signalement",
      "Droit applicable et litiges",
    ]);
    // Hébergeur : identité, adresse et téléphone sont demandés pour chacun.
    expect(screen.getAllByText(/adresse et téléphone de l’hébergeur/, { selector: "mark" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /conditions générales d’utilisation/ })[0]).toHaveAttribute(
      "href",
      "/conditions-utilisation",
    );
  });
});

describe("Politique de confidentialité", () => {
  it("couvre les neuf informations à donner à la collecte (loi 2008-12, art. 58)", () => {
    afficher(<Confidentialite />);
    expect(titres()).toEqual([
      "Qui est responsable de vos données ?", // identité du responsable
      "Quelles données, et pourquoi ?", // catégories, finalités, caractère obligatoire ou facultatif
      "Qui reçoit vos données ?", // destinataires
      "Où sont-elles hébergées ? Transfert hors du Sénégal", // transferts à l'étranger
      "Comment sont-elles protégées ?",
      "Cookies et stockage local",
      "Combien de temps ?", // durée de conservation
      "Vos droits", // accès, rectification, ne plus figurer au fichier
      "Mises à jour de cette politique",
    ]);
    expect(screen.getByText(/obligatoires : sans elles, le compte ne peut pas être créé/)).toBeInTheDocument();
    expect(screen.getByText(/ne plus figurer dans un/)).toBeInTheDocument();
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

  it("garde les choix commerciaux à confirmer en évidence plutôt que de les présenter comme acquis", () => {
    afficher(<ConditionsUtilisation />);
    expect(screen.getAllByText(/hors taxes ou toutes taxes comprises/, { selector: "mark" })).toHaveLength(1);
    expect(screen.getAllByText(/ville de la juridiction compétente/, { selector: "mark" })).toHaveLength(1);
  });
});
