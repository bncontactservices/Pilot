import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContexteOrgProvider } from "~/hooks/useContexteOrg";
import { creerFausseBase } from "~/test/fausse-base";
import { creerContexteOrg, PROJET } from "~/test/monter-projet";
import ProjetLayout from "./ProjetLayout";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => vi.fn() }));

const PAGES = [
  "indicateurs",
  "saisie",
  "import",
  "rapports",
  "cadre-logique",
  "plan-de-travail",
  "phases",
  "realisations",
  "prochaines-etapes",
  "etats-avancement",
  "documents",
];

function afficher(chemin: string, role: "admin" | "editeur" | "lecteur" = "editeur") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ContexteOrgProvider valeur={creerContexteOrg(role)}>
        <MemoryRouter initialEntries={[`/app/projets/p1${chemin}`]}>
          <Routes>
            <Route path="/app/projets/:projetId" element={<ProjetLayout />}>
              <Route index element={<p>Page : tableau de bord</p>} />
              {PAGES.map((p) => (
                <Route key={p} path={p} element={<p>Page : {p}</p>} />
              ))}
            </Route>
          </Routes>
        </MemoryRouter>
      </ContexteOrgProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  base.reinitialiser();
  base.tables.projects = [{ ...PROJET }];
});

const liens = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole("link")
    .map((l) => l.textContent);

describe("Navigation du projet : trois rubriques, puis les pages de la rubrique ouverte", () => {
  it("ouvre Pilotage sur le tableau de bord, avec ses cinq pages", async () => {
    afficher("");
    const rubriques = await screen.findByRole("navigation", { name: "Rubriques du projet" });
    expect(liens(rubriques)).toEqual(["Pilotage", "Planification", "Mise en œuvre"]);
    expect(within(rubriques).getByRole("link", { name: "Pilotage" })).toHaveAttribute("aria-current", "true");
    const pages = screen.getByRole("navigation", { name: "Sections du projet" });
    expect(liens(pages)).toEqual(["Tableau de bord", "Indicateurs", "Saisie", "Import", "Rapports"]);
    expect(within(pages).getByRole("link", { name: "Tableau de bord" })).toHaveAttribute("aria-current", "page");
  });

  it("ouvre Planification sur le cadre logique, le plan de travail ou les phases", async () => {
    afficher("/plan-de-travail");
    const pages = await screen.findByRole("navigation", { name: "Sections du projet" });
    expect(liens(pages)).toEqual([
      "Cadre logique",
      "Composantes",
      "Plan de travail",
      "Phases et étapes",
      "Acteurs",
      "Zones",
    ]);
    expect(within(pages).getByRole("link", { name: "Plan de travail" })).toHaveAttribute("aria-current", "page");
    const rubriques = screen.getByRole("navigation", { name: "Rubriques du projet" });
    expect(within(rubriques).getByRole("link", { name: "Planification" })).toHaveAttribute("aria-current", "true");
    expect(within(rubriques).getByRole("link", { name: "Pilotage" })).not.toHaveAttribute("aria-current");
  });

  it("ouvre Mise en œuvre sur les six pages du suivi de terrain", async () => {
    afficher("/documents");
    const pages = await screen.findByRole("navigation", { name: "Sections du projet" });
    expect(liens(pages)).toEqual([
      "Réalisations",
      "Prochaines étapes",
      "États d’avancement",
      "Documents",
      "Finances",
      "Bénéficiaires",
    ]);
    expect(within(pages).getByRole("link", { name: "Documents" })).toHaveAttribute("aria-current", "page");
  });

  it("trouve la rubrique de chacune des douze pages, une et une seule", async () => {
    for (const page of PAGES) {
      const { unmount } = afficher(`/${page}`);
      const rubriques = await screen.findByRole("navigation", { name: "Rubriques du projet" });
      const ouvertes = within(rubriques)
        .getAllByRole("link")
        .filter((l) => l.getAttribute("aria-current") === "true");
      expect(ouvertes, page).toHaveLength(1);
      const pages = screen.getByRole("navigation", { name: "Sections du projet" });
      expect(
        within(pages)
          .getAllByRole("link")
          .filter((l) => l.getAttribute("aria-current") === "page"),
        page,
      ).toHaveLength(1);
      unmount();
    }
  });

  it("mène chaque rubrique à sa première page", async () => {
    afficher("");
    const rubriques = await screen.findByRole("navigation", { name: "Rubriques du projet" });
    expect(within(rubriques).getByRole("link", { name: "Pilotage" })).toHaveAttribute("href", "/app/projets/p1");
    expect(within(rubriques).getByRole("link", { name: "Planification" })).toHaveAttribute(
      "href",
      "/app/projets/p1/cadre-logique",
    );
    expect(within(rubriques).getByRole("link", { name: "Mise en œuvre" })).toHaveAttribute(
      "href",
      "/app/projets/p1/realisations",
    );
  });
});

describe("En-tête du projet : étiquettes", () => {
  it("affiche les étiquettes, modifiables par un éditeur seulement", async () => {
    base.tables.projet_etiquettes = [{ project_id: "p1", org_id: "o1", etiquette: "formation", created_at: "" }];
    afficher("");
    expect(await screen.findByText("formation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retirer l’étiquette formation" })).toBeInTheDocument();
  });

  it("les montre en lecture seule à un lecteur", async () => {
    base.tables.projet_etiquettes = [{ project_id: "p1", org_id: "o1", etiquette: "formation", created_at: "" }];
    afficher("", "lecteur");
    expect(await screen.findByText("formation")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retirer/ })).not.toBeInTheDocument();
  });
});
