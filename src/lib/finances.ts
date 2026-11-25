// Finances et budgets d'un projet (Lot 3a) : exécution du budget par poste et par année, taux financier.
//
// Les vues SQL v_avancement (taux_financier, budget_total, depenses_total) et v_avancement_programme appliquent les
// mêmes formules ; finances.test.ts et supabase/tests/10_lot3a_finances.test.sql vérifient les mêmes cas.
// Toutes les sommes d'un projet sont dans sa devise : aucune conversion n'est faite ni proposée.

export type LigneBudget = { id: string; annee: number; poste: string; montant_prevu: number };
export type DepenseSuivie = { budget_ligne_id: string; montant: number };

/** Arrondit au centime : évite d'afficher 0,1 + 0,2 = 0,30000000000000004. */
export const arrondirMontant = (valeur: number): number => Math.round((valeur + Number.EPSILON) * 100) / 100;

/**
 * Taux financier = dépenses / budget, en pourcentage. Pas de plafond : un dépassement (> 100 %) est une information
 * à voir. Sans budget (nul ou absent), il n'y a pas de taux : on ne divise pas par zéro.
 */
export function tauxFinancier(budget: number, depense: number): number | null {
  return budget > 0 ? (depense / budget) * 100 : null;
}

export type SyntheseLigne = LigneBudget & {
  depense: number;
  /** Ce qu'il reste à dépenser ; négatif en cas de dépassement. */
  reste: number;
  /** Taux d'exécution de la ligne ; null quand elle n'a pas de budget prévu. */
  taux: number | null;
  /** Dépenses supérieures au budget prévu (y compris une dépense sur une ligne à zéro). */
  depassement: boolean;
  nbDepenses: number;
};

export type SyntheseAnnee = {
  annee: number;
  prevu: number;
  depense: number;
  taux: number | null;
  lignes: SyntheseLigne[];
};

export type SyntheseBudget = {
  lignes: SyntheseLigne[];
  annees: SyntheseAnnee[];
  prevu: number;
  depense: number;
  reste: number;
  taux: number | null;
  depassements: number;
};

/** Synthèse du budget : une ligne par poste, regroupée par année (la plus récente d'abord), et le total. */
export function syntheseBudget(lignes: LigneBudget[], depenses: DepenseSuivie[]): SyntheseBudget {
  const parLigne = new Map<string, { montant: number; nombre: number }>();
  for (const d of depenses) {
    const cumul = parLigne.get(d.budget_ligne_id) ?? { montant: 0, nombre: 0 };
    parLigne.set(d.budget_ligne_id, { montant: cumul.montant + Number(d.montant), nombre: cumul.nombre + 1 });
  }

  const synthese: SyntheseLigne[] = lignes.map((l) => {
    const cumul = parLigne.get(l.id) ?? { montant: 0, nombre: 0 };
    const prevu = Number(l.montant_prevu);
    const depense = arrondirMontant(cumul.montant);
    return {
      ...l,
      montant_prevu: prevu,
      depense,
      reste: arrondirMontant(prevu - depense),
      taux: tauxFinancier(prevu, depense),
      depassement: depense > prevu,
      nbDepenses: cumul.nombre,
    };
  });

  const parAnnee = new Map<number, SyntheseLigne[]>();
  for (const l of synthese) parAnnee.set(l.annee, [...(parAnnee.get(l.annee) ?? []), l]);
  const annees = [...parAnnee.entries()]
    .sort(([a], [b]) => b - a)
    .map(([annee, groupe]) => {
      const prevu = arrondirMontant(groupe.reduce((s, l) => s + l.montant_prevu, 0));
      const depense = arrondirMontant(groupe.reduce((s, l) => s + l.depense, 0));
      return {
        annee,
        prevu,
        depense,
        taux: tauxFinancier(prevu, depense),
        lignes: [...groupe].sort((a, b) => a.poste.localeCompare(b.poste, "fr")),
      };
    });

  const prevu = arrondirMontant(synthese.reduce((s, l) => s + l.montant_prevu, 0));
  const depense = arrondirMontant(synthese.reduce((s, l) => s + l.depense, 0));
  return {
    lignes: synthese,
    annees,
    prevu,
    depense,
    reste: arrondirMontant(prevu - depense),
    taux: tauxFinancier(prevu, depense),
    depassements: synthese.filter((l) => l.depassement).length,
  };
}

/**
 * Écart entre le budget saisi à la création du projet (projects.budget) et la somme des lignes budgétaires :
 * null quand l'un des deux manque ou quand ils concordent. Sert à signaler une incohérence, jamais à la corriger.
 */
export function ecartBudgetProjet(budgetProjet: number | null, prevuLignes: number): number | null {
  if (budgetProjet === null || prevuLignes <= 0) return null;
  const ecart = arrondirMontant(prevuLignes - Number(budgetProjet));
  return ecart === 0 ? null : ecart;
}

/** Années proposées à la création d'une ligne : celles du projet, la plus proche d'aujourd'hui d'abord (à égalité, la plus tardive). */
export function anneesProposees(dateDebut: string, dateFin: string, aujourdhui: string): number[] {
  const debut = Number(dateDebut.slice(0, 4));
  const fin = Number(dateFin.slice(0, 4));
  const annees: number[] = [];
  for (let a = debut; a <= Math.max(debut, fin); a += 1) annees.push(a);
  const courante = Number(aujourdhui.slice(0, 4));
  return annees.sort((a, b) => Math.abs(a - courante) - Math.abs(b - courante) || b - a);
}
