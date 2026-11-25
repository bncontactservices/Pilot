// Contenu du rapport PDF : tout ce qui est calculé ou formaté, sans rien dessiner.
// Les calculs viennent de kpi.ts (la seule source de calcul) et la géométrie du graphique
// de chart-geometry.ts ; le composant RapportPdf.tsx ne fait que mettre en page.

import { geometrieGraphique, type GeometrieGraphique } from "../chart-geometry";
import {
  formaterDate,
  formaterNombre,
  formaterPeriode,
  formaterPourcentage,
  formaterValeur,
  formaterMontant,
} from "../format";
import {
  evaluerProjet,
  isoDepuisJour,
  numeroJour,
  type Periode,
  type Seuils,
  serieEvolution,
  type StatutKpi,
  valeurAttendue,
} from "../kpi";
import type { Traducteur } from "../traduction";
import type { Kpi, Projet, SaisieLigne } from "../donnees";

export const LARGEUR_GRAPHIQUE = 480;
export const HAUTEUR_GRAPHIQUE = 140;
const MARGES = { haut: 8, droite: 10, bas: 20, gauche: 46 };
const COMMENTAIRES_MAX = 3;

export type EntreeRapport = {
  organisation: { nom: string; logo: { src: string; largeur: number; hauteur: number } | null };
  projet: Projet;
  kpis: Kpi[];
  saisies: SaisieLigne[];
  periode: Periode;
  aujourdhui: string;
  /** Seuils vert/ambre de l'organisation (90 / 60 par défaut). */
  seuils?: Seuils;
  t: Traducteur;
};

export type KpiRapport = {
  id: string;
  nom: string;
  statut: StatutKpi;
  statutLibelle: string;
  valeur: string;
  cible: string;
  atteint: string;
  /** « Attendu à ce jour : … En retard de … », ou null. */
  ecart: string | null;
  action: string | null;
  derniereSaisie: string | null;
  nbSaisies: number;
  graphique: (GeometrieGraphique & { etiquettesX: string[]; etiquettesY: string[]; unite: string }) | null;
  commentaires: { date: string; valeur: string; texte: string }[];
};

export type DonneesRapport = {
  organisation: EntreeRapport["organisation"];
  projet: { nom: string; description: string | null; meta: string; estExemple: boolean };
  periode: string;
  genereLe: string;
  progression: { texte: string; fraction: number | null; trajectoire: string | null };
  statuts: StatutKpi[];
  comptes: { statut: StatutKpi; libelle: string; nombre: number }[];
  kpis: KpiRapport[];
  nomFichier: string;
};

function nomFichier(projet: string, debut: string, fin: string): string {
  const propre = projet
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${propre || "Projet"}_${debut}_${fin}.pdf`;
}

export function preparerRapport(e: EntreeRapport): DonneesRapport {
  const { projet, kpis, saisies, periode, aujourdhui, t } = e;
  const evaluation = evaluerProjet(kpis, saisies, { projet, periode, aujourdhui, seuils: e.seuils });

  const debutProjet = numeroJour(projet.date_debut);
  const finProjet = numeroJour(projet.date_fin);
  const debutAffiche = numeroJour(periode.debut ?? projet.date_debut);
  const finAffichee = periode.debut ? numeroJour(periode.fin) : finProjet;
  const fraction = (x: number) =>
    finProjet > debutProjet ? Math.min(1, Math.max(0, (x - debutProjet) / (finProjet - debutProjet))) : 0;

  const parKpi = new Map<string, SaisieLigne[]>();
  for (const s of saisies) parKpi.set(s.kpi_id, [...(parKpi.get(s.kpi_id) ?? []), s]);

  const lignes: KpiRapport[] = kpis.map((kpi) => {
    const ev = evaluation.evaluations.find((x) => x.id === kpi.id)!;
    const saisiesKpi = parKpi.get(kpi.id) ?? [];
    const serie = serieEvolution(kpi, saisiesKpi, projet.date_debut).filter(
      (p) => numeroJour(p.date) >= debutAffiche && numeroJour(p.date) <= finAffichee,
    );

    let graphique: KpiRapport["graphique"] = null;
    if (serie.length > 0) {
      const geometrie = geometrieGraphique({
        largeur: LARGEUR_GRAPHIQUE,
        hauteur: HAUTEUR_GRAPHIQUE,
        marges: MARGES,
        domaineX: [debutAffiche, finAffichee],
        serie: serie.map((p) => ({ x: numeroJour(p.date), valeur: p.valeur })),
        cible: kpi.cible,
        base: kpi.valeur_base,
        trajectoire: [
          { x: debutAffiche, valeur: valeurAttendue(kpi, fraction(debutAffiche)) },
          { x: finAffichee, valeur: valeurAttendue(kpi, fraction(finAffichee)) },
        ],
      });
      graphique = {
        ...geometrie,
        etiquettesX: geometrie.axeX.map((tick) => formaterDate(isoDepuisJour(tick.jour), "MMM yy")),
        etiquettesY: geometrie.axeY.map((tick) => formaterNombre(Math.round(tick.valeur * 100) / 100)),
        unite: kpi.unite,
      };
    }

    const commentaires = saisiesKpi
      .filter((s) => s.commentaire && numeroJour(s.date) >= debutAffiche && numeroJour(s.date) <= finAffichee)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, COMMENTAIRES_MAX)
      .map((s) => ({ date: formaterDate(s.date), valeur: formaterValeur(s.valeur, kpi.unite), texte: s.commentaire! }));

    const ecart =
      ev.ecart !== null && ev.attendue !== null
        ? t(ev.enAvance ? "kpi.carte.ecart_avance" : "kpi.carte.ecart_retard", {
            attendue: formaterValeur(ev.attendue, kpi.unite),
            ecart: formaterValeur(Math.abs(ev.ecart), kpi.unite),
          })
        : null;

    return {
      id: kpi.id,
      nom: kpi.nom,
      statut: ev.statut,
      statutLibelle: t(`kpi.statuts.${ev.statut}`),
      valeur: ev.valeur === null ? "—" : formaterValeur(ev.valeur, kpi.unite),
      cible: formaterValeur(kpi.cible, kpi.unite),
      atteint: ev.pourcent === null ? "—" : formaterPourcentage(ev.pourcent),
      ecart,
      action: ev.statut === "warn" || ev.statut === "alert" ? t(`kpi.actions.${ev.statut}`) : null,
      derniereSaisie: ev.derniereSaisie ? formaterDate(ev.derniereSaisie) : null,
      nbSaisies: serie.length,
      graphique,
      commentaires,
    };
  });

  const fin = formaterDate(periode.fin, "d MMMM yyyy");
  const meta = [
    formaterPeriode(projet.date_debut, projet.date_fin),
    projet.secteur?.libelle,
    projet.budget !== null ? formaterMontant(projet.budget, projet.devise) : null,
    t(`projets.statuts.${projet.statut}`),
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    organisation: e.organisation,
    projet: { nom: projet.nom, description: projet.description, meta, estExemple: projet.is_demo },
    periode: periode.debut
      ? t("rapport.periode", { debut: formaterDate(periode.debut, "d MMMM yyyy"), fin })
      : t("rapport.periode_depuis_debut", { fin }),
    genereLe: formaterDate(aujourdhui, "d MMMM yyyy"),
    progression: {
      texte:
        evaluation.progression === null ? t("rapport.progression_aucune") : formaterPourcentage(evaluation.progression),
      fraction: evaluation.progression,
      trajectoire:
        evaluation.fraction === null
          ? null
          : t("rapport.trajectoire_attendue", { pourcent: formaterPourcentage(evaluation.fraction * 100) }),
    },
    statuts: evaluation.evaluations.map((x) => x.statut),
    comptes: (["ok", "warn", "alert", "none"] as const).map((statut) => ({
      statut,
      libelle: t(`kpi.statuts.${statut}`),
      nombre: evaluation.comptes[statut],
    })),
    kpis: lignes,
    nomFichier: nomFichier(projet.nom, periode.debut ?? projet.date_debut, periode.fin),
  };
}
