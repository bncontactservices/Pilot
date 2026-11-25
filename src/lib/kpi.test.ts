import { describe, expect, it } from "vitest";
import {
  ajouterJours,
  compterStatuts,
  deltaKpi,
  detecterAberrant,
  ecartTrajectoire,
  evaluerKpi,
  evaluerProjet,
  fractionTrajectoire,
  type KpiDef,
  numeroJour,
  periodePredefinie,
  pourcentAtteinte,
  progressionProjet,
  retardSaisie,
  serieEvolution,
  statutKpi,
  statutProjet,
  valeurActuelle,
  valeurAttendue,
} from "./kpi";

const projet = { date_debut: "2026-01-01", date_fin: "2026-12-31" };
const kpi = (surcharge: Partial<KpiDef> = {}): KpiDef => ({
  cible: 100,
  valeur_base: 0,
  sens: "croissant",
  type_agregation: "cumul",
  frequence: "mensuelle",
  ...surcharge,
});
const s = (date: string, valeur: number) => ({ date, valeur });

describe("dates", () => {
  it("ajoute des jours sans décalage de fuseau", () => {
    expect(ajouterJours("2026-02-28", 1)).toBe("2026-03-01");
    expect(ajouterJours("2026-03-01", -1)).toBe("2026-02-28");
    expect(numeroJour("2026-03-29") - numeroJour("2026-03-28")).toBe(1); // changement d'heure en Europe
  });
});

describe("valeurActuelle", () => {
  const saisies = [s("2026-01-31", 5), s("2026-02-28", 7), s("2025-12-31", 100)];
  it("cumul : base + somme depuis le début du projet jusqu'à la fin de la période", () => {
    expect(
      valeurActuelle(kpi({ valeur_base: 10 }), saisies, { debut: null, fin: "2026-03-31" }, projet.date_debut),
    ).toBe(22);
  });
  it("cumul : ignore le début de la période filtrée et les saisies avant le projet", () => {
    expect(valeurActuelle(kpi(), saisies, { debut: "2026-02-01", fin: "2026-03-31" }, projet.date_debut)).toBe(12);
  });
  it("cumul : aucune donnée avant la fin de la période", () => {
    expect(valeurActuelle(kpi(), saisies, { debut: null, fin: "2026-01-15" }, projet.date_debut)).toBeNull();
  });
  it("dernier : dernière saisie à la date de fin, même avant le début de la période", () => {
    const k = kpi({ type_agregation: "dernier" });
    expect(
      valeurActuelle(
        k,
        [s("2026-02-01", 30), s("2026-01-01", 20)],
        { debut: "2026-03-01", fin: "2026-03-31" },
        projet.date_debut,
      ),
    ).toBe(30);
    expect(valeurActuelle(k, [], { debut: null, fin: "2026-03-31" }, projet.date_debut)).toBeNull();
  });
  it("moyenne : moyenne des saisies de la période, null si la période est vide", () => {
    const k = kpi({ type_agregation: "moyenne" });
    const lot = [s("2026-03-05", 10), s("2026-03-20", 20), s("2026-01-10", 99)];
    expect(valeurActuelle(k, lot, { debut: "2026-03-01", fin: "2026-03-31" }, projet.date_debut)).toBe(15);
    expect(valeurActuelle(k, lot, { debut: "2026-05-01", fin: "2026-05-31" }, projet.date_debut)).toBeNull();
  });
  it("accepte une valeur de base non nulle et des valeurs négatives", () => {
    expect(
      valeurActuelle(
        kpi({ valeur_base: -5 }),
        [s("2026-02-01", -3)],
        { debut: null, fin: "2026-03-01" },
        projet.date_debut,
      ),
    ).toBe(-8);
  });
});

describe("pourcentAtteinte", () => {
  it("sens croissant", () => {
    expect(pourcentAtteinte(kpi(), 50)).toBe(50);
    expect(pourcentAtteinte(kpi({ valeur_base: 35, cible: 80 }), 52)).toBeCloseTo(37.78, 2);
  });
  it("sens décroissant", () => {
    expect(pourcentAtteinte(kpi({ sens: "decroissant", valeur_base: 120, cible: 40 }), 105)).toBe(18.75);
  });
  it("borne le résultat à [0 ; 150]", () => {
    expect(pourcentAtteinte(kpi(), -20)).toBe(0);
    expect(pourcentAtteinte(kpi(), 400)).toBe(150);
    expect(pourcentAtteinte(kpi({ sens: "decroissant", valeur_base: 50, cible: 10 }), 80)).toBe(0);
  });
  it("renvoie null quand la cible égale la base ou sans valeur", () => {
    expect(pourcentAtteinte(kpi({ cible: 0, valeur_base: 0 }), 5)).toBeNull();
    expect(pourcentAtteinte(kpi(), null)).toBeNull();
  });
});

describe("trajectoire", () => {
  it("calcule la part de durée écoulée, bornée", () => {
    expect(fractionTrajectoire(projet, "2026-07-02")).toBe(0.5);
    expect(fractionTrajectoire(projet, "2025-06-01")).toBe(0);
    expect(fractionTrajectoire(projet, "2030-01-01")).toBe(1);
    expect(fractionTrajectoire({ date_debut: "2026-01-01", date_fin: "2026-01-01" }, "2026-01-01")).toBeNull();
  });
  it("valeur attendue et écart, selon le sens", () => {
    expect(valeurAttendue(kpi({ valeur_base: 10, cible: 30 }), 0.5)).toBe(20);
    expect(ecartTrajectoire(kpi(), 60, 0.5)).toEqual({ attendue: 50, ecart: 10, enAvance: true });
    expect(ecartTrajectoire(kpi(), 40, 0.5)?.enAvance).toBe(false);
    const decroissant = kpi({ sens: "decroissant", valeur_base: 100, cible: 0 });
    expect(ecartTrajectoire(decroissant, 40, 0.5)).toEqual({ attendue: 50, ecart: -10, enAvance: true });
    expect(ecartTrajectoire(kpi(), null, 0.5)).toBeNull();
    expect(ecartTrajectoire(kpi(), 10, null)).toBeNull();
  });
});

describe("statutKpi", () => {
  it("compare l'avancement à la trajectoire (mi-parcours)", () => {
    expect(statutKpi(kpi(), 52.5, 0.5)).toBe("ok"); // ratio 105
    expect(statutKpi(kpi(), 40, 0.5)).toBe("warn"); // ratio 80
    expect(statutKpi(kpi(), 25, 0.5)).toBe("alert"); // ratio 50
  });
  it("applique les seuils inclusivement : 90 est vert, 60 est ambre", () => {
    expect(statutKpi(kpi(), 45, 0.5)).toBe("ok");
    expect(statutKpi(kpi(), 30, 0.5)).toBe("warn");
    expect(statutKpi(kpi(), 29, 0.5)).toBe("alert");
  });
  it("accepte des seuils personnalisés", () => {
    expect(statutKpi(kpi(), 40, 0.5, { vert: 70, ambre: 50 })).toBe("ok");
  });
  it("retombe sur le pourcentage d'atteinte sans trajectoire", () => {
    expect(statutKpi(kpi(), 95, null)).toBe("ok");
    expect(statutKpi(kpi(), 70, 0)).toBe("warn");
  });
  it("est gris sans donnée ou sans cible exploitable", () => {
    expect(statutKpi(kpi(), null, 0.5)).toBe("none");
    expect(statutKpi(kpi({ cible: 0 }), 5, 0.5)).toBe("none");
  });
});

describe("retardSaisie", () => {
  it("dépasse 1,5 fois la période de la fréquence", () => {
    expect(retardSaisie("mensuelle", ajouterJours("2026-07-02", -46), "2026-07-02")).toBe(true);
    expect(retardSaisie("mensuelle", ajouterJours("2026-07-02", -45), "2026-07-02")).toBe(false);
    expect(retardSaisie("hebdomadaire", ajouterJours("2026-07-02", -11), "2026-07-02")).toBe(true);
    expect(retardSaisie("trimestrielle", ajouterJours("2026-07-02", -136), "2026-07-02")).toBe(false);
    expect(retardSaisie("annuelle", ajouterJours("2026-07-02", -548), "2026-07-02")).toBe(true);
  });
  it("ne signale rien sans saisie", () => {
    expect(retardSaisie("mensuelle", null, "2026-07-02")).toBe(false);
  });
});

describe("deltaKpi", () => {
  const trimestre = { debut: "2026-04-01", fin: "2026-06-30" };
  it("cumul : compare les quantités saisies sur les deux périodes", () => {
    const saisies = [
      s("2026-01-31", 10),
      s("2026-02-28", 20),
      s("2026-03-31", 30),
      s("2026-04-30", 40),
      s("2026-05-31", 50),
      s("2026-06-30", 60),
    ];
    expect(deltaKpi(kpi(), saisies, trimestre)).toEqual({ valeur: 90, pourcent: 150 });
  });
  it("dernier : compare les dernières valeurs", () => {
    const saisies = [s("2026-03-15", 40), s("2026-06-15", 55)];
    expect(deltaKpi(kpi({ type_agregation: "dernier" }), saisies, trimestre)).toEqual({ valeur: 15, pourcent: 37.5 });
  });
  it("moyenne : compare les moyennes", () => {
    const saisies = [s("2026-02-10", 10), s("2026-04-10", 10), s("2026-05-10", 20)];
    expect(deltaKpi(kpi({ type_agregation: "moyenne" }), saisies, trimestre)).toEqual({ valeur: 5, pourcent: 50 });
  });
  it("renvoie un pourcentage nul quand la période précédente vaut 0", () => {
    const saisies = [s("2026-03-15", 0), s("2026-06-15", 8)];
    expect(deltaKpi(kpi({ type_agregation: "dernier" }), saisies, trimestre)).toEqual({ valeur: 8, pourcent: null });
  });
  it("renvoie null depuis le début du projet ou sans période comparable", () => {
    expect(deltaKpi(kpi(), [s("2026-05-01", 1)], { debut: null, fin: "2026-06-30" })).toBeNull();
    expect(deltaKpi(kpi(), [s("2026-05-01", 1)], trimestre)).toBeNull();
  });
});

describe("progressionProjet et compterStatuts", () => {
  it("fait la moyenne des pourcentages plafonnés à 100 des indicateurs avec données", () => {
    const evaluations = [
      { pourcent: 100, valeur: 1 },
      { pourcent: 150, valeur: 2 },
      { pourcent: 50, valeur: 3 },
      { pourcent: null, valeur: null },
    ];
    expect(progressionProjet(evaluations)).toBeCloseTo(83.33, 2);
  });
  it("renvoie null sans donnée", () => {
    expect(progressionProjet([{ pourcent: null, valeur: null }])).toBeNull();
    expect(progressionProjet([])).toBeNull();
  });
  it("compte les statuts", () => {
    expect(compterStatuts([{ statut: "ok" }, { statut: "ok" }, { statut: "none" }, { statut: "alert" }])).toEqual({
      ok: 2,
      warn: 0,
      alert: 1,
      none: 1,
    });
  });
});

describe("detecterAberrant", () => {
  it("moins de 5 saisies : écart de plus de 50 % avec la dernière valeur", () => {
    expect(detecterAberrant([10], 20)).toBe(true);
    expect(detecterAberrant([10], 14)).toBe(false);
    expect(detecterAberrant([10, 10, 10, 10], 16)).toBe(true);
  });
  it("ne contrôle pas quand la dernière valeur est nulle ou sans historique", () => {
    expect(detecterAberrant([0], 100)).toBe(false);
    expect(detecterAberrant([], 100)).toBe(false);
  });
  it("5 saisies ou plus : écart de plus de 3 écarts-types", () => {
    const historique = [100, 102, 98, 101, 99];
    expect(detecterAberrant(historique, 106)).toBe(true);
    expect(detecterAberrant(historique, 103)).toBe(false);
  });
  it("ne contrôle pas quand l'écart-type est nul", () => {
    expect(detecterAberrant([5, 5, 5, 5, 5], 6)).toBe(false);
  });
});

describe("periodePredefinie", () => {
  it("calcule des périodes glissantes, le jour d'arrivée compris", () => {
    expect(periodePredefinie("tout", "2026-07-02")).toEqual({ debut: null, fin: "2026-07-02" });
    expect(periodePredefinie("12m", "2026-07-02")).toEqual({ debut: "2025-07-03", fin: "2026-07-02" });
    expect(periodePredefinie("6m", "2026-07-02")).toEqual({ debut: "2026-01-03", fin: "2026-07-02" });
    expect(periodePredefinie("3m", "2026-07-02")).toEqual({ debut: "2026-04-03", fin: "2026-07-02" });
  });
  it("ramène le jour à la fin du mois visé", () => {
    expect(periodePredefinie("6m", "2026-08-31").debut).toBe("2026-03-01"); // 28 février + 1 jour
  });
});

describe("projet exemple (migration lot0_lot1)", () => {
  // Reproduit les données générées par charger_projet_exemple() un 24 novembre 2026.
  const aujourdhui = "2026-11-24";
  const debutProjet = "2025-11-01";
  const finProjet = "2027-10-31";
  const jour28 = (moisDepuisDebut: number) =>
    new Date(Date.UTC(2025, 10 + moisDepuisDebut, 1) + 27 * 86_400_000).toISOString().slice(0, 10);
  const mensuel = (valeurs: number[]) => valeurs.map((v, i) => s(jour28(i), v));
  const trimestriel = (valeurs: number[]) => valeurs.map((v, i) => s(jour28(3 * (i + 1) - 1), v));

  const kpis: {
    nom: string;
    def: KpiDef;
    saisies: ReturnType<typeof s>[];
    valeur: number;
    statut: string;
    retard: boolean;
  }[] = [
    {
      nom: "Forages réhabilités",
      def: kpi({ cible: 40 }),
      saisies: mensuel([1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1]),
      valeur: 21,
      statut: "ok",
      retard: false,
    },
    {
      nom: "Ménages avec accès à l'eau",
      def: kpi({ cible: 80, valeur_base: 35, type_agregation: "dernier", frequence: "trimestrielle" }),
      saisies: trimestriel([41, 45, 49, 52]),
      valeur: 52,
      statut: "warn",
      retard: false,
    },
    {
      nom: "Points d'eau fonctionnels",
      def: kpi({ cible: 90, valeur_base: 55, type_agregation: "dernier" }),
      saisies: mensuel([56, 57, 59, 60, 62, 63, 65, 67, 69, 70, 72, 74]),
      valeur: 74,
      statut: "ok",
      retard: false,
    },
    {
      nom: "Personnes sensibilisées",
      def: kpi({ cible: 12000 }),
      saisies: mensuel([180, 240, 310, 350, 420, 390, 460, 380, 330, 450, 480, 510]),
      valeur: 4500,
      statut: "warn",
      retard: false,
    },
    {
      nom: "Latrines familiales",
      def: kpi({ cible: 1500 }),
      saisies: mensuel([0, 0, 12, 18, 25, 30, 22, 35, 40, 38, 42, 38]),
      valeur: 300,
      statut: "alert",
      retard: false,
    },
    {
      nom: "Comités de gestion",
      def: kpi({ cible: 40, valeur_base: 4, type_agregation: "dernier", frequence: "trimestrielle" }),
      saisies: trimestriel([7, 11, 15, 18]),
      valeur: 18,
      statut: "warn",
      retard: false,
    },
    {
      nom: "Cas de diarrhée",
      def: kpi({ cible: 40, valeur_base: 120, sens: "decroissant", type_agregation: "dernier" }),
      saisies: mensuel([124, 131, 118, 122, 127, 135, 129, 117, 112, 110, 108, 105]),
      valeur: 105,
      statut: "alert",
      retard: false,
    },
    {
      nom: "Temps de collecte",
      def: kpi({ cible: 20, valeur_base: 45, sens: "decroissant", type_agregation: "moyenne" }),
      saisies: mensuel([46, 44, 43, 41, 40, 38, 37]),
      valeur: 289 / 7,
      statut: "alert",
      retard: true,
    },
  ];

  it("raconte une histoire : 2 verts, 3 ambres, 3 rouges dont un sans saisie récente", () => {
    const evaluations = kpis.map((k) =>
      evaluerKpi(k.def, k.saisies, {
        projet: { date_debut: debutProjet, date_fin: finProjet },
        periode: { debut: null, fin: aujourdhui },
        aujourdhui,
      }),
    );
    expect(evaluations.map((e) => e.statut)).toEqual(kpis.map((k) => k.statut));
    expect(evaluations.map((e) => e.retardSaisie)).toEqual(kpis.map((k) => k.retard));
    evaluations.forEach((e, i) => expect(e.valeur).toBeCloseTo(kpis[i]!.valeur, 6));
    expect(compterStatuts(evaluations)).toEqual({ ok: 2, warn: 3, alert: 3, none: 0 });
  });
});

describe("serieEvolution et statutProjet", () => {
  it("cumule les saisies à partir de la valeur de base pour un cumul", () => {
    const saisies = [s("2026-02-28", 7), s("2026-01-31", 5), s("2025-12-31", 100)];
    expect(serieEvolution(kpi({ valeur_base: 10 }), saisies, projet.date_debut)).toEqual([
      { date: "2026-01-31", valeur: 15, commentaire: undefined },
      { date: "2026-02-28", valeur: 22, commentaire: undefined },
    ]);
  });
  it("garde les valeurs saisies pour « dernier » et « moyenne », triées par date", () => {
    const saisies = [s("2026-02-28", 7), s("2026-01-31", 5)];
    expect(
      serieEvolution(kpi({ type_agregation: "dernier" }), saisies, projet.date_debut).map((p) => p.valeur),
    ).toEqual([5, 7]);
  });
  it("statut du projet : progression comparée à la trajectoire", () => {
    expect(statutProjet(null, 0.5)).toBe("none");
    expect(statutProjet(50, 0.5)).toBe("ok");
    expect(statutProjet(35, 0.5)).toBe("warn");
    expect(statutProjet(20, 0.5)).toBe("alert");
  });
});

describe("evaluerProjet", () => {
  it("évalue chaque indicateur avec ses propres saisies et résume le projet", () => {
    const kpis = [
      { id: "a", ...kpi({ cible: 100 }) },
      { id: "b", ...kpi({ cible: 100 }) },
      { id: "c", ...kpi({ cible: 100 }) },
    ];
    const saisies = [
      { kpi_id: "a", date: "2026-03-01", valeur: 60 },
      { kpi_id: "b", date: "2026-03-01", valeur: 10 },
    ];
    const resultat = evaluerProjet(kpis, saisies, {
      projet,
      periode: { debut: null, fin: "2026-07-02" },
      aujourdhui: "2026-07-02",
    });
    expect(resultat.evaluations.map((e) => [e.id, e.statut])).toEqual([
      ["a", "ok"],
      ["b", "alert"],
      ["c", "none"],
    ]);
    expect(resultat.progression).toBe(35);
    expect(resultat.fraction).toBe(0.5);
    expect(resultat.statut).toBe("warn"); // 35 / 0,5 = 70
    expect(resultat.comptes).toEqual({ ok: 1, warn: 0, alert: 1, none: 1 });
  });
  it("renvoie un statut gris sans aucun indicateur", () => {
    expect(
      evaluerProjet([], [], { projet, periode: { debut: null, fin: "2026-07-02" }, aujourdhui: "2026-07-02" }).statut,
    ).toBe("none");
  });
});
