import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

// Les sections sont chargées à la demande : sur un poste chargé, leur transformation prend plus que le délai par défaut.
vi.setConfig({ testTimeout: 30_000 });
import Landing from "./Landing";

/** Les sections sous le premier écran sont chargées à la demande (React.lazy) : on attend la dernière avant de tester. */
async function monter() {
  const rendu = render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
  const attendre = { timeout: 20_000 };
  await screen.findByRole("heading", { name: "Questions fréquentes" }, attendre);
  await screen.findByRole("heading", { name: "Prêt à piloter avec la donnée ?" }, attendre);
  await screen.findByRole("contentinfo", {}, attendre);
  await screen.findByRole("heading", { name: "Programme pilotes" }, attendre);
  await screen.findByRole("heading", { name: /^Une offre simple, sans\s+paiement en ligne\.$/ }, attendre);
  await screen.findByRole("heading", { name: "Le vrai tableau de bord, pas une maquette." }, attendre);
  await screen.findByRole("heading", { name: "Centraliser vos KPI" }, attendre);
  return rendu;
}

describe("Landing : contenu et structure", () => {
  it("porte la promesse du brief et les deux appels à l'action du hero", async () => {
    await monter();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Pilotez vos projets avec des données fiables, en temps réel.",
    );
    expect(screen.getByText(/dashboards, KPI, rapports PDF en un clic/)).toBeInTheDocument();
    const [demo] = screen.getAllByRole("link", { name: "Demander une démo" }).filter((l) => l.closest("section"));
    expect(demo).toHaveAttribute("href", "#contact");
    expect(screen.getByRole("link", { name: "Voir le produit" })).toHaveAttribute("href", "#demo");
  });

  it("contient les sections A à I, et chaque ancre de la navigation mène à une section existante", async () => {
    const { container } = await monter();
    const nav = screen.getByRole("navigation", { name: "Navigation principale" });
    for (const lien of within(nav)
      .getAllByRole("link")
      .filter((l) => l.getAttribute("href")?.startsWith("#") && l.getAttribute("href") !== "#debut")) {
      expect(container.querySelector(lien.getAttribute("href")!)).not.toBeNull();
    }
    for (const id of ["probleme", "solution", "demo", "pilotes", "tarifs", "faq", "contact"])
      expect(container.querySelector(`#${id}`)).not.toBeNull();
  });

  it("la bande de confiance donne trois faits produit, sans chiffre de résultat inventé", async () => {
    await monter();
    expect(screen.getByText("Conçu pour les ONG, PME et projets bailleurs en Afrique de l’Ouest")).toBeInTheDocument();
    const hero = within(document.querySelector("section[aria-labelledby='titre-hero']") as HTMLElement);
    for (const fait of ["4 KPI en un coup d’œil", "Import Excel et CSV", "100 % exportable en PDF"])
      expect(hero.getByText(fait)).toBeInTheDocument();
  });

  it("le constat et la solution présentent trois et quatre cartes distinctes", async () => {
    await monter();
    const probleme = document.getElementById("probleme")!;
    expect(within(probleme).getAllByRole("heading", { level: 3 })).toHaveLength(3);
    const solution = document.getElementById("solution")!;
    expect(
      within(solution)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([
      "Centraliser vos KPI",
      "Saisir en 30 secondes",
      "Un dashboard en temps réel",
      "Des rapports en un clic",
    ]);
    // « Disponible » : ce qui est dans l'application ; « Bientôt » : ce qui est annoncé sans date. Une fonction n'est
    // jamais dans les deux, et ce qui est annoncé n'existe pas encore.
    const bloc = (titre: string) =>
      within(within(solution).getByText(titre, { selector: "span" }).closest("div")!.parentElement!);
    const livre = bloc("Disponible");
    for (const item of [
      "Programmes et taux d’avancement",
      "Cadre logique",
      "Plan de travail annuel",
      "Phases et étapes",
      "Réalisations et preuves jointes",
      "Prochaines étapes",
      "États d’avancement",
      "Documents du projet",
      "Budget, dépenses et taux financier",
      "Composantes et planning en diagramme de Gantt",
      "Annuaire d’acteurs et rôle par projet",
      "Effectifs de bénéficiaires par sexe et âge",
      "Rapport PDF consolidé d’un programme",
      "Localités, zones d’intervention et carte",
      "Saisie d’indicateurs hors ligne, envoyée au retour du réseau",
    ]) {
      expect(livre.getByText(item)).toBeInTheDocument();
    }
    const bientot = bloc("Bientôt");
    expect(bientot.getByText("Rapports automatiques programmés")).toBeInTheDocument();
    // La saisie hors ligne est livrée et jouée en réel : elle n'est plus annoncée « Bientôt ».
    expect(bientot.queryByText(/hors ligne/i)).not.toBeInTheDocument();
    expect(bientot.queryByText("Cadre logique")).not.toBeInTheDocument();
    expect(bientot.queryByText("Plan de travail annuel")).not.toBeInTheDocument();
    expect(bientot.queryByText("Budget, dépenses et taux financier")).not.toBeInTheDocument();
    // Le rapport PDF d'un programme est livré ; l'envoi automatique programmé, lui, ne l'est pas.
    expect(bientot.queryByText("Rapport PDF consolidé d’un programme")).not.toBeInTheDocument();
    // La carte des zones d'intervention est livrée : elle n'est plus annoncée « Bientôt ».
    expect(bientot.queryByText(/carte/i)).not.toBeInTheDocument();
  });

  it("les données de démonstration sont étiquetées comme telles, partout où elles apparaissent", async () => {
    await monter();
    expect(screen.getAllByText("Données de démonstration").length).toBeGreaterThanOrEqual(2);
  });

  it("pas de témoignage inventé : la section est le programme pilotes, avec son formulaire", async () => {
    await monter();
    const pilotes = document.getElementById("pilotes")!;
    expect(within(pilotes).getByRole("heading", { name: "Programme pilotes" })).toBeInTheDocument();
    expect(within(pilotes).getByText("Bientôt")).toBeInTheDocument();
    expect(document.querySelector("blockquote")).toBeNull();
  });
});

describe("Landing : démo interactive", () => {
  it("un repère sélectionne la zone et la légende correspondantes", async () => {
    await monter();
    const demo = document.getElementById("demo")!;
    const pin2 = within(demo).getByRole("button", { name: /^Repère 2/ });
    expect(pin2).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pin2);
    expect(pin2).toHaveAttribute("aria-pressed", "true");
    // Le repère et sa légende sont tous deux marqués comme sélectionnés.
    expect(within(demo).getAllByRole("button", { name: /L’évolution face à la cible/, pressed: true })).toHaveLength(2);
    // La légende (dernier bouton de ce nom) pilote la même sélection que le repère.
    fireEvent.click(
      within(demo)
        .getAllByRole("button", { name: /Le rapport en un clic/ })
        .at(-1)!,
    );
    expect(within(demo).getByRole("button", { name: /^Repère 4/ })).toHaveAttribute("aria-pressed", "true");
    expect(pin2).toHaveAttribute("aria-pressed", "false");
  });

  it("les quatre cartes sont les vraies cartes de l'application : statut en toutes lettres, écart et action", async () => {
    await monter();
    const demo = document.getElementById("demo")!;
    expect(within(demo).getAllByText("Sur la trajectoire")).toHaveLength(2);
    expect(within(demo).getByText("Vigilance")).toBeInTheDocument();
    expect(within(demo).getByText("En retard")).toBeInTheDocument();
    expect(within(demo).getByText(/cherchez la cause avec l’équipe/)).toBeInTheDocument();
  });
});

describe("Landing : tarifs", () => {
  const tarifs = () => document.getElementById("tarifs")!;

  it("affiche Starter, Pro (le plus choisi) et Enterprise sur devis, avec l'équivalent FCFA indicatif", async () => {
    await monter();
    const t = within(tarifs());
    expect(t.getByRole("heading", { name: "Starter" })).toBeInTheDocument();
    expect(t.getByRole("heading", { name: "Pro" })).toBeInTheDocument();
    expect(t.getByText("Le plus choisi")).toBeInTheDocument();
    expect(t.getByText("Sur devis")).toBeInTheDocument();
    expect(t.getByText(/16\s?400 FCFA par mois \(indicatif\)/)).toBeInTheDocument();
    // Limites réelles des plans (constants.ts), pas des chiffres de marketing.
    expect(t.getByText("3 projets")).toBeInTheDocument();
    expect(t.getByText("20 KPI par projet")).toBeInTheDocument();
    expect(t.getByText("5 utilisateurs")).toBeInTheDocument();
  });

  it("la facturation annuelle affiche le prix mensuel équivalent et le total annuel", async () => {
    await monter();
    const t = within(tarifs());
    expect(t.queryByText(/par an/)).not.toBeInTheDocument(); // en mensuel, aucun total annuel
    fireEvent.click(t.getByRole("button", { name: /Annuel/ }));
    expect(t.getByText("soit 240 € par an")).toBeInTheDocument();
    expect(t.getByText("soit 480 € par an")).toBeInTheDocument();
    expect(t.getByRole("button", { name: /Annuel/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(t.getByRole("button", { name: "Mensuel" }));
    expect(t.queryByText(/soit 240 € par an/)).not.toBeInTheDocument();
  });

  it("« Commencer » ouvre l'inscription avec le plan choisi ; Enterprise ouvre le formulaire", async () => {
    await monter();
    const t = within(tarifs());
    const liens = t.getAllByRole("link", { name: "Commencer" }).map((l) => l.getAttribute("href"));
    expect(liens).toEqual(["/inscription?plan=starter", "/inscription?plan=pro"]);
    expect(t.getByRole("link", { name: "Parler à l’équipe" })).toHaveAttribute("href", "#contact");
  });

  it("annonce « Bientôt » les rapports programmés et dit que le paiement en ligne n'existe pas", async () => {
    await monter();
    const t = within(tarifs());
    expect(t.getByText("Rapports automatiques programmés").parentElement).toHaveTextContent("Bientôt");
    expect(t.getByText(/Le paiement en ligne n’existe pas encore/)).toBeInTheDocument();
  });
});

describe("Landing : FAQ", () => {
  it("six questions en accordéon accessible : aria-expanded et aria-controls", async () => {
    await monter();
    const faq = within(document.getElementById("faq")!);
    const questions = faq.getAllByRole("button");
    expect(questions).toHaveLength(6);
    const premiere = questions[0]!;
    expect(premiere).toHaveAttribute("aria-expanded", "false");
    const reponse = document.getElementById(premiere.getAttribute("aria-controls")!)!;
    expect(reponse).toHaveAttribute("hidden");
    fireEvent.click(premiere);
    expect(premiere).toHaveAttribute("aria-expanded", "true");
    expect(reponse).not.toHaveAttribute("hidden");
    expect(reponse).toHaveTextContent(/Chaque organisation ne voit que ses propres données/);
    fireEvent.click(premiere);
    expect(premiere).toHaveAttribute("aria-expanded", "false");
  });

  it("l'essai annoncé est celui du produit (14 jours, sans carte)", async () => {
    await monter();
    fireEvent.click(screen.getByRole("button", { name: "Y a-t-il un essai gratuit ?" }));
    expect(screen.getByText(/14 jours avec toutes les fonctions du plan Pro, sans carte bancaire/)).toBeInTheDocument();
  });

  it("ne promet pas de sauvegardes quotidiennes ni de conformité juridique non établies", async () => {
    await monter();
    expect(document.getElementById("faq")!.textContent).not.toMatch(/sauvegarde|conforme|conformité/i);
  });
});

describe("Landing : navigation", () => {
  it("le menu mobile se déplie, expose les ancres et se referme avec Échap", async () => {
    await monter();
    const bouton = screen.getByRole("button", { name: "Ouvrir le menu" });
    expect(bouton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(bouton);
    expect(bouton).toHaveAttribute("aria-expanded", "true");
    const menu = document.getElementById("menu-mobile")!;
    expect(
      within(menu)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Problème", "Solution", "Démo", "Tarifs", "FAQ", "Se connecter"]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.getElementById("menu-mobile")).toBeNull();
    expect(bouton).toHaveFocus();
  });

  it("un lien d'évitement mène au contenu principal", async () => {
    await monter();
    expect(screen.getByRole("link", { name: "Aller au contenu" })).toHaveAttribute("href", "#contenu");
    expect(document.getElementById("contenu")?.tagName).toBe("MAIN");
  });
});

describe("Landing : pied de page", () => {
  it("renvoie vers les pages légales et la connexion", async () => {
    await monter();
    const pied = within(screen.getByRole("contentinfo"));
    expect(pied.getByRole("link", { name: "Mentions légales" })).toHaveAttribute("href", "/mentions-legales");
    expect(pied.getByRole("link", { name: "Conditions d’utilisation" })).toHaveAttribute(
      "href",
      "/conditions-utilisation",
    );
    expect(pied.getByRole("link", { name: "Politique de confidentialité" })).toHaveAttribute(
      "href",
      "/confidentialite",
    );
    expect(pied.getByRole("link", { name: "Se connecter" })).toHaveAttribute("href", "/connexion");
  });
});
