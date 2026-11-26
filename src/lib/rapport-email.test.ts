// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  composerRapport,
  type ContenuRapport,
  echapperHtml,
  formaterTaux,
  type ParametresMessage,
  pointsAttention,
  type ProjetRapport,
} from "../../supabase/functions/_shared/rapport-email";

const projet = (extra: Partial<ProjetRapport> = {}): ProjetRapport => ({
  id: "p1",
  nom: "Forages Kolda",
  statut: "en_cours",
  programme_id: null,
  date_fin: "2027-12-31",
  statut_resultats: "ok",
  taux_resultats: 82.5,
  taux_physique: 40,
  taux_financier: 55.2,
  nb_etapes_en_retard: 0,
  nb_kpis: 4,
  nb_kpis_avec_donnees: 4,
  ...extra,
});

const contenu = (extra: Partial<ContenuRapport> = {}): ContenuRapport => ({
  organisation: { nom: "ONG Eau", devise: "XOF" },
  seuils: { vert: 90, ambre: 60 },
  programmes: [],
  projets: [projet()],
  ...extra,
});

const parametres = (extra: Partial<ParametresMessage> = {}): ParametresMessage => ({
  contenu: contenu(),
  destinataire: "Awa",
  cadence: "hebdomadaire",
  appUrl: "https://app.exemple.org",
  date: new Date("2026-11-30T07:00:00Z"),
  ...extra,
});

describe("formaterTaux", () => {
  it("met un pourcentage à la française, ou un tiret quand il n'y a pas de donnée", () => {
    expect(formaterTaux(82.5)).toBe("82,5 %");
    expect(formaterTaux(100)).toBe("100 %");
    expect(formaterTaux(0)).toBe("0 %");
    expect(formaterTaux(null)).toBe("—");
    expect(formaterTaux(undefined)).toBe("—");
  });
});

describe("echapperHtml", () => {
  it("neutralise tout ce qui ouvre une balise ou un attribut", () => {
    expect(echapperHtml(`<img src=x onerror="alert('x')"> & "q"`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; &quot;q&quot;",
    );
    expect(echapperHtml(null)).toBe("");
  });
});

describe("pointsAttention", () => {
  it("reprend les règles du rapport de programme : résultats en alerte, budget dépassé, étapes en retard, aucune donnée", () => {
    const points = pointsAttention([
      projet({ nom: "B", statut_resultats: "alert" }),
      projet({ nom: "A", taux_financier: 120 }),
      projet({ nom: "C", nb_etapes_en_retard: 1 }),
      projet({ nom: "D", nb_etapes_en_retard: 3 }),
      projet({ nom: "E", nb_kpis: 0, nb_kpis_avec_donnees: 0, statut_resultats: "none", taux_resultats: null }),
    ]);
    expect(points).toEqual([
      "« A » : le budget est dépassé (120 % du budget prévu).",
      "« B » : les résultats sont en retard sur la trajectoire attendue (statut rouge).",
      "« C » : 1 étape en retard.",
      "« D » : 3 étapes en retard.",
      "« E » : aucune donnée d'indicateur, les résultats ne sont pas évalués.",
    ]);
  });

  it("ne signale rien pour un projet en règle, ni un budget à exactement 100 %", () => {
    expect(pointsAttention([projet(), projet({ taux_financier: 100 })])).toEqual([]);
  });

  it("un projet qui cumule plusieurs défauts a plusieurs points", () => {
    expect(
      pointsAttention([projet({ statut_resultats: "alert", taux_financier: 130, nb_etapes_en_retard: 2 })]),
    ).toHaveLength(3);
  });
});

describe("composerRapport", () => {
  it("compose un message à la cadence demandée, avec le nom de l'organisation et la date", () => {
    const m = composerRapport(parametres());
    expect(m.sujet).toBe("Rapport de suivi hebdomadaire — ONG Eau · 30 novembre 2026");
    expect(composerRapport(parametres({ cadence: "mensuelle" })).sujet).toMatch(/^Rapport de suivi mensuel — ONG Eau/);
    expect(composerRapport(parametres({ cadence: "exemple" })).sujet).toBe("Exemple de rapport de suivi — ONG Eau");
  });

  it("reprend les chiffres des vues, tels quels, dans le texte comme dans le HTML", () => {
    const m = composerRapport(
      parametres({
        contenu: contenu({
          programmes: [
            {
              id: "g1",
              nom: "Eau et assainissement",
              nb_projets: 2,
              taux_resultats: 71.3,
              taux_physique: 38,
              taux_financier: null,
              nb_projets_depassement: 0,
            },
          ],
        }),
      }),
    );
    for (const sortie of [m.texte, m.html]) {
      expect(sortie).toContain("Eau et assainissement");
      expect(sortie).toContain("71,3 %");
      expect(sortie).toContain("82,5 %");
      expect(sortie).toContain("55,2 %");
    }
    // Un taux inconnu est un tiret, jamais un zéro inventé.
    expect(m.texte).toContain("financier —");
  });

  it("dit « aucun point d'attention » quand tout est en règle, et les liste sinon", () => {
    expect(composerRapport(parametres()).texte).toContain("Aucun point d'attention");
    const m = composerRapport(parametres({ contenu: contenu({ projets: [projet({ statut_resultats: "alert" })] }) }));
    expect(m.texte).toContain("« Forages Kolda » : les résultats sont en retard");
    expect(m.html).toContain("<li>");
    expect(m.html).not.toContain("Aucun point d&#39;attention");
  });

  it("n'invente rien quand l'organisation n'a aucun projet suivi", () => {
    const m = composerRapport(parametres({ contenu: contenu({ projets: [] }) }));
    expect(m.texte).toContain("Aucun projet n'est en cours de suivi dans ONG Eau");
    expect(m.texte).not.toContain("PROJETS");
    expect(m.html).not.toContain('<h2 style="margin:28px 0 8px;font-size:17px;color:#0B2545">Projets</h2>');
  });

  it("échappe chaque nom venu des données : une balise dans un nom de projet, d'organisation ou de membre reste du texte", () => {
    const piege = `<script>alert(1)</script>`;
    const m = composerRapport(
      parametres({
        destinataire: piege,
        contenu: contenu({
          organisation: { nom: `Org ${piege}`, devise: "XOF" },
          projets: [projet({ nom: piege, statut_resultats: "alert" })],
          programmes: [
            {
              id: "g",
              nom: piege,
              nb_projets: 1,
              taux_resultats: 1,
              taux_physique: 1,
              taux_financier: 1,
              nb_projets_depassement: 0,
            },
          ],
        }),
      }),
    );
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("ne laisse aucun saut de ligne dans l'objet, même avec un nom d'organisation piégé", () => {
    const m = composerRapport(
      parametres({ contenu: contenu({ organisation: { nom: "Org\r\nBcc: autre@exemple.test", devise: "XOF" } }) }),
    );
    expect(m.sujet).not.toMatch(/[\r\n]/);
  });

  it("explique pourquoi le message arrive et comment l'arrêter, avec des liens bâtis sur l'adresse de l'application seulement", () => {
    const m = composerRapport(parametres());
    expect(m.html).toContain("parce que vous l&#39;avez demandé dans votre profil");
    expect(m.html).toContain('href="https://app.exemple.org/app/parametres"');
    expect(m.html).toContain('href="https://app.exemple.org/app"');
    expect(m.texte).toContain("https://app.exemple.org/app/parametres");
    const exemple = composerRapport(parametres({ cadence: "exemple" }));
    expect(exemple.texte).toContain("Ceci est un exemple");
    expect(exemple.texte).toContain("il ne change rien à vos envois programmés");
  });

  it("salue sans nom quand le membre n'en a pas", () => {
    expect(composerRapport(parametres({ destinataire: null })).texte.startsWith("Bonjour,\n")).toBe(true);
    expect(composerRapport(parametres({ destinataire: "  " })).texte.startsWith("Bonjour,\n")).toBe(true);
    expect(composerRapport(parametres()).texte.startsWith("Bonjour Awa,\n")).toBe(true);
  });

  it("donne un statut en toutes lettres à chaque projet, pas seulement une couleur", () => {
    const m = composerRapport(
      parametres({
        contenu: contenu({
          projets: [
            projet({ nom: "A", statut_resultats: "ok" }),
            projet({ nom: "B", statut_resultats: "warn" }),
            projet({ nom: "C", statut_resultats: "alert" }),
            projet({ nom: "D", statut_resultats: null, taux_resultats: null }),
          ],
        }),
      }),
    );
    for (const libelle of ["Dans la trajectoire", "À surveiller", "En retard", "Pas de donnée"])
      expect(m.html).toContain(libelle);
    expect(m.texte).toContain("(en retard)");
  });
});
