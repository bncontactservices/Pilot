// Rapport PDF consolidé d'un programme (Lot 3e) : tout ce qui est calculé ou formaté, sans rien dessiner.
// Les chiffres viennent des vues SQL d'avancement (v_avancement et v_avancement_programme), qui sont la seule source de
// la consolidation : le rapport dit exactement ce que dit la page du programme. Aucune valeur n'est recalculée ici.

import { arrondirTaux } from "../avancement";
import type { Avancement, AvancementProgramme } from "../donnees";
import { formaterMontant, formaterPeriode } from "../format";
import type { Traducteur } from "../traduction";
import type { EntreeRapport } from "./donnees";

export type StatutProjetBrut = "non_demarre" | "en_cours" | "en_retard" | "suspendu" | "termine" | "cloture";

export type EntreeRapportProgramme = {
  organisation: EntreeRapport["organisation"];
  programme: { nom: string; description: string | null; date_debut: string | null; date_fin: string | null };
  /** Consolidation du programme (v_avancement_programme) ; null si la vue n'a pas de ligne. */
  consolide: AvancementProgramme | null;
  projets: {
    id: string;
    nom: string;
    statut: StatutProjetBrut;
    date_debut: string;
    date_fin: string;
    devise: string;
    avancement: Avancement | undefined;
  }[];
  aujourdhui: string;
  t: Traducteur;
};

export type LigneProjetRapport = {
  id: string;
  nom: string;
  statut: string;
  periode: string;
  resultats: string;
  physique: string;
  financier: string;
  /** « 62 100 000 F CFA sur 250 000 000 F CFA », ou null quand le projet n'a pas de budget. */
  budget: string | null;
  /** Statut de couleur des résultats (ok, warn, alert ou none), repris tel quel de la vue. */
  statutResultats: "ok" | "warn" | "alert" | "none";
  depassement: boolean;
};

export type DonneesRapportProgramme = {
  organisation: EntreeRapport["organisation"];
  programme: { nom: string; description: string | null; periode: string | null };
  genereLe: string;
  synthese: { resultats: string; physique: string; financier: string; notes: string[] };
  projets: LigneProjetRapport[];
  /** Phrases d'alerte, une par point d'attention, dans l'ordre des projets. */
  attention: string[];
  nomFichier: string;
};

const pct = (valeur: number | null | undefined): string =>
  valeur === null || valeur === undefined ? "—" : `${arrondirTaux(Number(valeur))} %`;

function nomFichier(programme: string, jour: string): string {
  const propre = programme
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `Programme_${propre || "sans-nom"}_${jour}.pdf`;
}

export function preparerRapportProgramme(e: EntreeRapportProgramme): DonneesRapportProgramme {
  const { t, consolide } = e;

  const lignes: LigneProjetRapport[] = [...e.projets]
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
    .map((p) => {
      const a = p.avancement;
      const budget =
        a?.budget_total != null && Number(a.budget_total) > 0
          ? t("rapport.programme.budget_ligne", {
              depense: formaterMontant(Number(a.depenses_total ?? 0), p.devise),
              budget: formaterMontant(Number(a.budget_total), p.devise),
            })
          : null;
      return {
        id: p.id,
        nom: p.nom,
        statut: t(`projets.statuts.${p.statut}`),
        periode: formaterPeriode(p.date_debut, p.date_fin),
        resultats: pct(a?.taux_resultats),
        physique: pct(a?.taux_physique),
        financier: pct(a?.taux_financier),
        budget,
        statutResultats: a?.statut_resultats ?? "none",
        depassement: a?.taux_financier != null && Number(a.taux_financier) > 100,
      };
    });

  // Points d'attention : ce que la direction doit voir sans lire tout le tableau. Chacun vient d'une colonne des vues.
  const attention: string[] = [];
  for (const p of [...e.projets].sort((a, b) => a.nom.localeCompare(b.nom, "fr"))) {
    const a = p.avancement;
    if (!a) continue;
    if (a.statut_resultats === "alert") attention.push(t("rapport.programme.attention.resultats", { nom: p.nom }));
    if (a.taux_financier != null && Number(a.taux_financier) > 100) {
      attention.push(t("rapport.programme.attention.budget", { nom: p.nom, taux: pct(a.taux_financier) }));
    }
    if (a.nb_etapes_en_retard > 0) {
      attention.push(t("rapport.programme.attention.etapes", { nom: p.nom, count: a.nb_etapes_en_retard }));
    }
    if (a.nb_kpis === 0 || a.nb_kpis_avec_donnees === 0) {
      attention.push(t("rapport.programme.attention.sans_donnees", { nom: p.nom }));
    }
  }

  const notes: string[] = [t("rapport.programme.note_moyenne")];
  if (consolide && consolide.nb_projets > consolide.nb_projets_avec_resultats) {
    notes.push(
      t("rapport.programme.note_resultats", {
        count: consolide.nb_projets_avec_resultats,
        total: consolide.nb_projets,
      }),
    );
  }
  if (consolide && consolide.nb_projets_avec_budget > 0) {
    notes.push(
      t("rapport.programme.note_budget", {
        count: consolide.nb_projets_avec_budget,
        total: consolide.nb_projets,
      }),
    );
    if (consolide.nb_projets_depassement > 0) {
      notes.push(t("rapport.programme.note_depassement", { count: consolide.nb_projets_depassement }));
    }
  }

  return {
    organisation: e.organisation,
    programme: {
      nom: e.programme.nom,
      description: e.programme.description,
      periode:
        e.programme.date_debut && e.programme.date_fin
          ? formaterPeriode(e.programme.date_debut, e.programme.date_fin)
          : null,
    },
    genereLe: e.aujourdhui,
    synthese: {
      resultats: pct(consolide?.taux_resultats),
      physique: pct(consolide?.taux_physique),
      financier: pct(consolide?.taux_financier),
      notes,
    },
    projets: lignes,
    attention,
    nomFichier: nomFichier(e.programme.nom, e.aujourdhui),
  };
}
