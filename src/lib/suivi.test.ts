import { describe, expect, it } from "vitest";
import { formaterTaille } from "./format";
import {
  cheminDocument,
  dansLaPeriode,
  estOuverte,
  nomDocumentSuggere,
  normaliserEtiquette,
  periodeSuggeree,
  resumeProchainesEtapes,
  suggestionsResponsables,
  TAILLE_MAX_DOCUMENT,
  trierProchainesEtapes,
  typeDocument,
  verifierFichier,
} from "./suivi";

const AUJOURDHUI = "2026-06-15";
const action = (
  id: string,
  statut: "a_faire" | "en_cours" | "termine" | "reporte" | "annule",
  echeance: string | null,
) => ({
  id,
  statut,
  echeance,
  created_at: id,
});

describe("prochaines étapes", () => {
  const liste = [
    action("terminee", "termine", "2026-05-01"),
    action("sans-date", "a_faire", null),
    action("a-venir", "en_cours", "2026-07-01"),
    action("retard-recent", "a_faire", "2026-06-10"),
    action("retard-ancien", "reporte", "2026-04-02"),
    action("annulee", "annule", "2026-03-01"),
    action("aujourdhui", "a_faire", AUJOURDHUI),
  ];

  it("distingue ouvertes, en retard et terminées", () => {
    expect(resumeProchainesEtapes(liste, AUJOURDHUI)).toEqual({ ouvertes: 5, enRetard: 2, terminees: 1 });
    expect(estOuverte("reporte")).toBe(true);
    expect(estOuverte("annule")).toBe(false);
  });

  it("met d'abord le retard, puis les échéances, puis ce qui n'a pas de date, puis ce qui est fini", () => {
    expect(trierProchainesEtapes(liste, AUJOURDHUI).map((a) => a.id)).toEqual([
      "retard-ancien",
      "retard-recent",
      "aujourdhui",
      "a-venir",
      "sans-date",
      "annulee",
      "terminee",
    ]);
  });

  it("ne modifie pas la liste d'origine", () => {
    const copie = [...liste];
    trierProchainesEtapes(liste, AUJOURDHUI);
    expect(liste).toEqual(copie);
  });
});

describe("responsables proposés", () => {
  it("réunit membres et noms déjà saisis, sans doublon ni valeur vide, triés", () => {
    expect(
      suggestionsResponsables(
        [{ nom: "Awa Diop" }, { nom: null }, { nom: "Moussa" }],
        ["Moussa", null, "Équipe terrain"],
      ),
    ).toEqual(["Awa Diop", "Équipe terrain", "Moussa"]);
    expect(suggestionsResponsables()).toEqual([]);
  });
});

describe("période proposée pour un état d'avancement", () => {
  const projet = { date_debut: "2026-01-01", date_fin: "2027-06-30" };

  it("part du début du projet sans état précédent", () => {
    expect(periodeSuggeree([], projet, AUJOURDHUI)).toEqual({ debut: "2026-01-01", fin: AUJOURDHUI });
  });

  it("reprend le lendemain du dernier état, quel que soit l'ordre de la liste", () => {
    const etats = [{ periode_fin: "2026-05-31" }, { periode_fin: "2026-03-31" }];
    expect(periodeSuggeree(etats, projet, AUJOURDHUI)).toEqual({ debut: "2026-06-01", fin: AUJOURDHUI });
  });

  it("reste une période valide quand le dernier état couvre déjà aujourd'hui", () => {
    expect(periodeSuggeree([{ periode_fin: "2026-09-30" }], projet, AUJOURDHUI)).toEqual({
      debut: AUJOURDHUI,
      fin: AUJOURDHUI,
    });
  });

  it("ne dépasse pas la fin du projet", () => {
    const termine = { date_debut: "2025-01-01", date_fin: "2025-12-31" };
    expect(periodeSuggeree([], termine, AUJOURDHUI)).toEqual({ debut: "2025-01-01", fin: "2025-12-31" });
  });

  it("propose le premier jour d'un projet pas encore commencé", () => {
    const futur = { date_debut: "2026-09-01", date_fin: "2027-08-31" };
    expect(periodeSuggeree([], futur, AUJOURDHUI)).toEqual({ debut: "2026-09-01", fin: "2026-09-01" });
  });

  it("filtre les éléments d'une période, bornes comprises", () => {
    const elements = [{ date: "2026-03-31" }, { date: "2026-04-01" }, { date: "2026-06-30" }, { date: "2026-07-01" }];
    expect(dansLaPeriode(elements, "2026-04-01", "2026-06-30").map((e) => e.date)).toEqual([
      "2026-04-01",
      "2026-06-30",
    ]);
  });
});

describe("documents", () => {
  it("accepte les types courants et refuse les autres", () => {
    expect(verifierFichier({ name: "rapport.pdf", type: "application/pdf", size: 1000 })).toBeNull();
    expect(verifierFichier({ name: "photo.JPG", type: "image/jpeg", size: 1000 })).toBeNull();
    expect(verifierFichier({ name: "page.html", type: "text/html", size: 1000 })).toBe("type");
    expect(verifierFichier({ name: "script.exe", type: "application/x-msdownload", size: 1000 })).toBe("type");
  });

  it("refuse un fichier vide ou trop gros, limite comprise", () => {
    expect(verifierFichier({ name: "a.pdf", type: "application/pdf", size: 0 })).toBe("vide");
    expect(verifierFichier({ name: "a.pdf", type: "application/pdf", size: TAILLE_MAX_DOCUMENT })).toBeNull();
    expect(verifierFichier({ name: "a.pdf", type: "application/pdf", size: TAILLE_MAX_DOCUMENT + 1 })).toBe(
      "trop_gros",
    );
  });

  it("déduit le type de l'extension quand le navigateur n'en donne pas", () => {
    expect(typeDocument({ name: "liste.csv", type: "" })).toBe("text/csv");
    expect(typeDocument({ name: "budget.xlsx", type: "" })).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(typeDocument({ name: "sans-extension", type: "" })).toBeNull();
    // Un type annoncé inconnu, mais une extension connue : on retient l'extension.
    expect(typeDocument({ name: "notes.txt", type: "application/octet-stream" })).toBe("text/plain");
  });

  it("construit un chemin accepté par la base : {org}/{projet}/…, sans accents ni espaces", () => {
    const chemin = cheminDocument("org-1", "proj-1", "Rapport d’étape — T2 (final).PDF", "abc");
    expect(chemin).toBe("org-1/proj-1/abc-Rapport-d-etape-T2-final.pdf");
    expect(chemin).not.toContain("..");
    expect(cheminDocument("o", "p", "../../secret", "id")).toBe("o/p/id-secret");
    expect(cheminDocument("o", "p", "///", "id")).toBe("o/p/id-fichier");
  });

  it("propose un nom lisible sans l'extension", () => {
    expect(nomDocumentSuggere("Rapport T2.pdf")).toBe("Rapport T2");
    expect(nomDocumentSuggere("archive")).toBe("archive");
    expect(nomDocumentSuggere("v1.2 final.docx")).toBe("v1.2 final");
  });

  it("écrit les tailles en unités lisibles", () => {
    expect(formaterTaille(850)).toBe("850 o");
    expect(formaterTaille(12_700)).toBe("12,4 Ko");
    expect(formaterTaille(3_355_443)).toBe("3,2 Mo");
  });
});

describe("étiquettes", () => {
  it("applique la normalisation de la base : minuscules, espaces simplifiés", () => {
    expect(normaliserEtiquette("  Appui   Conseil ")).toBe("appui conseil");
    expect(normaliserEtiquette("FORMATION")).toBe("formation");
  });
});
