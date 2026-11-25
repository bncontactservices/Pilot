import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { Kpi } from "~/lib/donnees";
import { evaluerKpi } from "~/lib/kpi";
import { CarteKpi } from "./CarteKpi";
import { JaugeSegmentee } from "./JaugeSegmentee";

const kpi: Kpi = {
  id: "k1",
  project_id: "p1",
  org_id: "o1",
  nom: "Forages réhabilités",
  description: null,
  unite: "forages",
  cible: 40,
  valeur_base: 0,
  frequence: "mensuelle",
  sens: "croissant",
  type_agregation: "cumul",
  ordre: 1,
  epingle: true,
  noeud_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
const projet = { date_debut: "2026-01-01", date_fin: "2026-12-31" };
const contexte = { projet, periode: { debut: null, fin: "2026-07-02" }, aujourdhui: "2026-07-02" };

function afficher(
  saisies: { date: string; valeur: number }[],
  peutSaisir = true,
  actions: { onCreerEtape?: () => void; etapesOuvertes?: number } = {},
) {
  const evaluation = evaluerKpi(kpi, saisies, contexte);
  return render(
    <MemoryRouter>
      <CarteKpi kpi={kpi} evaluation={evaluation} serie={[]} peutSaisir={peutSaisir} {...actions} />
    </MemoryRouter>,
  );
}

describe("CarteKpi", () => {
  it("dit où nous en sommes, l'écart et quoi faire pour un indicateur en retard", () => {
    // 6 forages sur 40 à mi-parcours : ratio 30 %, donc en retard.
    afficher([{ date: "2026-06-20", valeur: 6 }]);
    expect(screen.getByText("En retard")).toBeInTheDocument(); // statut : un libellé, pas seulement une couleur
    expect(screen.getByText("6")).toBeInTheDocument(); // où nous en sommes
    expect(screen.getByText(/Cible : 40 forages/)).toBeInTheDocument();
    expect(screen.getByText(/En retard de 14 forages/)).toBeInTheDocument(); // l'écart : 20 attendus, 6 réalisés
    expect(screen.getByText(/cherchez la cause avec l’équipe/)).toBeInTheDocument(); // quoi faire
    expect(screen.getByRole("link", { name: /Saisir une valeur/ })).toHaveAttribute(
      "href",
      "/app/projets/p1/saisie?kpi=k1",
    );
  });

  it("signale une saisie en retard sans la confondre avec le statut", () => {
    afficher([{ date: "2026-03-01", valeur: 25 }]);
    expect(screen.getByText("Saisie en retard")).toBeInTheDocument();
    expect(screen.getByText("Sur la trajectoire")).toBeInTheDocument(); // 25 sur 40 à mi-parcours : en avance
  });

  it("affiche un état gris sans donnée, sans action suggérée", () => {
    afficher([]);
    expect(screen.getByText("Aucune donnée")).toBeInTheDocument();
    expect(screen.getByText("Aucune donnée sur la période")).toBeInTheDocument();
    expect(screen.queryByText(/cherchez la cause/)).not.toBeInTheDocument();
  });

  it("masque le lien de saisie pour un lecteur", () => {
    afficher([{ date: "2026-06-20", valeur: 6 }], false);
    expect(screen.queryByRole("link", { name: /Saisir une valeur/ })).not.toBeInTheDocument();
  });
});

describe("CarteKpi : prochaine étape depuis une alerte", () => {
  const enRetard = [{ date: "2026-06-20", valeur: 6 }]; // 6 sur 40 à mi-parcours : en retard
  const enVigilance = [{ date: "2026-06-20", valeur: 14 }]; // 14 sur 20 attendus : en vigilance

  it("propose de créer une prochaine étape sur une alerte rouge", () => {
    const creer = vi.fn();
    afficher(enRetard, true, { onCreerEtape: creer });
    fireEvent.click(screen.getByRole("button", { name: "Créer une prochaine étape" }));
    expect(creer).toHaveBeenCalledTimes(1);
  });

  it("la propose aussi en vigilance", () => {
    afficher(enVigilance, true, { onCreerEtape: () => {} });
    expect(screen.getByText("Vigilance")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer une prochaine étape" })).toBeInTheDocument();
  });

  it("ne la propose pas sans alerte ni sans droit d'écriture", () => {
    afficher([{ date: "2026-03-01", valeur: 25 }], true, { onCreerEtape: () => {} }); // sur la trajectoire
    expect(screen.queryByRole("button", { name: "Créer une prochaine étape" })).not.toBeInTheDocument();
  });

  it("n'affiche aucun bouton quand l'action n'est pas fournie (lecteur, démo, deck)", () => {
    afficher(enRetard, false);
    expect(screen.getByText(/cherchez la cause/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Créer une prochaine étape" })).not.toBeInTheDocument();
  });

  it("montre les étapes déjà ouvertes plutôt que d'en proposer une de plus", () => {
    afficher(enRetard, true, { onCreerEtape: () => {}, etapesOuvertes: 2 });
    expect(screen.queryByRole("button", { name: "Créer une prochaine étape" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2 prochaines étapes en cours" })).toHaveAttribute(
      "href",
      "/app/projets/p1/prochaines-etapes",
    );
  });
});

describe("JaugeSegmentee", () => {
  it("résume les statuts pour un lecteur d'écran et dessine un segment par indicateur", () => {
    const { container } = render(<JaugeSegmentee statuts={["ok", "warn", "alert", "alert", "none"]} />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "1 sur la trajectoire, 1 en vigilance, 2 en retard, 1 sans donnée.",
    );
    expect(container.querySelectorAll("span")).toHaveLength(5);
  });
});
