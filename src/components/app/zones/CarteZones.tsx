// Carte des zones d'intervention (Lot 3d) : Leaflet, fond de carte OpenStreetMap par défaut. Ce module n'est chargé
// qu'à l'ouverture de la page des zones (React.lazy) : Leaflet ne pèse pas sur le reste de l'application.
//
// Accessibilité : la carte est un complément visuel, la liste des zones donne la même information. La carte se
// parcourt au clavier (flèches, + et −, repères atteignables par Tab) et le contenu des fenêtres est du texte, pas du HTML.

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { limites } from "~/lib/localites";

export type PointCarte = {
  id: string;
  nom: string;
  /** Contexte de la localité (« Commune de Yoff, Arrondissement des Almadies »), affiché dans la fenêtre du repère. */
  contexte: string;
  latitude: number;
  longitude: number;
};

/** Fournisseur de fonds de carte : réglable sans toucher au code (il faut aussi l'autoriser dans la CSP de vercel.json). */
const TUILES = import.meta.env.VITE_CARTE_TUILES_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export default function CarteZones({ points }: { points: PointCarte[] }) {
  const { t } = useTranslation();
  const conteneur = useRef<HTMLDivElement>(null);
  const [fondIndisponible, setFondIndisponible] = useState(false);

  useEffect(() => {
    const element = conteneur.current;
    if (!element) return;
    const sansAnimation = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const carte = L.map(element, {
      zoomAnimation: !sansAnimation,
      fadeAnimation: !sansAnimation,
      markerZoomAnimation: !sansAnimation,
      attributionControl: true,
      // Le défilement de la page ne doit pas être capturé par la carte (surtout sur téléphone).
      scrollWheelZoom: false,
    });
    carte.attributionControl.setPrefix(false);
    const fond = L.tileLayer(TUILES, {
      maxZoom: 19,
      attribution: `© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">${t("zones.carte.attribution_lien")}</a>`,
    });
    fond.on("tileerror", () => setFondIndisponible(true));
    fond.on("tileload", () => setFondIndisponible(false));
    fond.addTo(carte);

    for (const p of points) {
      const reperes = L.marker([p.latitude, p.longitude], {
        title: p.nom,
        alt: p.nom,
        icon: L.divIcon({ className: "repere-carte", html: "<span></span>", iconSize: [22, 22], iconAnchor: [11, 11] }),
      }).addTo(carte);
      // Fenêtre construite avec des nœuds de texte : un nom de localité saisi par l'organisation n'est jamais lu comme du HTML.
      const contenu = document.createElement("div");
      const titre = document.createElement("strong");
      titre.textContent = p.nom;
      contenu.append(titre);
      if (p.contexte) {
        const suite = document.createElement("div");
        suite.textContent = p.contexte;
        contenu.append(suite);
      }
      reperes.bindPopup(contenu);
    }

    const zone = limites(points);
    if (zone) {
      if (points.length === 1) carte.setView([points[0]!.latitude, points[0]!.longitude], 14);
      else
        carte.fitBounds(
          [
            [zone.sud, zone.ouest],
            [zone.nord, zone.est],
          ],
          { padding: [32, 32], maxZoom: 15 },
        );
    } else {
      carte.setView([14.7, -17.45], 8);
    }
    return () => {
      carte.remove();
    };
  }, [points, t]);

  return (
    <div className="grid gap-2">
      <div
        ref={conteneur}
        role="region"
        aria-label={t("zones.carte.etiquette")}
        className="relative z-0 h-80 w-full overflow-hidden rounded-2xl border border-border bg-background sm:h-96"
      />
      {fondIndisponible && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("zones.carte.indisponible")}
        </p>
      )}
    </div>
  );
}
