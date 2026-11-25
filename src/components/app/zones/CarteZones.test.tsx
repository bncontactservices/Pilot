import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CarteZones from "./CarteZones";

// Leaflet tourne dans jsdom (sans taille ni images) : on vérifie ce que la page y met, pas le rendu.
const points = [
  {
    id: "y",
    nom: "Commune de Yoff",
    contexte: "Arrondissement des Almadies, Département de Dakar",
    latitude: 14.760358,
    longitude: -17.468149,
  },
  { id: "v", nom: "Village de test", contexte: "", latitude: 14.77, longitude: -17.47 },
];

describe("carte des zones d'intervention", () => {
  it("est une région nommée qui décrit son rôle, et pose un repère nommé par zone", () => {
    const { container } = render(<CarteZones points={points} />);
    expect(screen.getByRole("region", { name: /Carte des zones d’intervention du projet/ })).toBeInTheDocument();
    const reperes = container.querySelectorAll(".leaflet-marker-icon");
    expect(reperes).toHaveLength(2);
    expect([...reperes].map((r) => r.getAttribute("title")).sort()).toEqual(["Commune de Yoff", "Village de test"]);
    // Atteignables au clavier.
    for (const r of reperes) expect(r.getAttribute("tabindex")).toBe("0");
  });

  it("cite OpenStreetMap avec un lien vers sa page de licence", () => {
    const { container } = render(<CarteZones points={points} />);
    const lien = container.querySelector(".leaflet-control-attribution a");
    expect(lien).toHaveTextContent("les contributeurs d’OpenStreetMap");
    expect(lien).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    expect(lien).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("demande les images de fond à OpenStreetMap par défaut", () => {
    const { container } = render(<CarteZones points={points} />);
    const adresses = [...container.querySelectorAll<HTMLImageElement>(".leaflet-tile")].map((i) => i.src);
    // jsdom n'a pas de taille de conteneur : Leaflet peut ne demander aucune image ; s'il en demande, c'est à OSM.
    for (const a of adresses) expect(a).toMatch(/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/);
  });

  it("affiche le nom d'une localité comme du texte, jamais comme du HTML", () => {
    const piege = {
      id: "x",
      nom: '<img src="x" onerror="alert(1)">Piège',
      contexte: "<b>contexte</b>",
      latitude: 14.7,
      longitude: -17.4,
    };
    const { container } = render(<CarteZones points={[piege]} />);
    const repere = container.querySelector(".leaflet-marker-icon") as HTMLElement;
    act(() => {
      fireEvent.click(repere);
    });
    const fenetre = container.querySelector(".leaflet-popup-content") as HTMLElement;
    expect(fenetre).not.toBeNull();
    expect(fenetre.querySelector("img")).toBeNull();
    expect(fenetre.querySelector("b")).toBeNull();
    expect(fenetre.textContent).toContain('<img src="x" onerror="alert(1)">Piège');
    expect(fenetre.textContent).toContain("<b>contexte</b>");
  });

  it("ne plante pas sans point", () => {
    const { container } = render(<CarteZones points={[]} />);
    expect(container.querySelectorAll(".leaflet-marker-icon")).toHaveLength(0);
  });

  it("nettoie la carte quand la page se ferme", () => {
    const { container, unmount } = render(<CarteZones points={points} />);
    expect(container.querySelector(".leaflet-container")).not.toBeNull();
    unmount();
    expect(document.querySelector(".leaflet-container")).toBeNull();
  });
});
