import { describe, expect, it } from "vitest";
import {
  aplatir,
  comparerNoeuds,
  compterDescendants,
  construireArbre,
  deplacer,
  type Noeud,
  parentsPossibles,
  prochainOrdre,
  typeEnfant,
  typeParent,
} from "./cadre-logique";

const n = (
  id: string,
  type: Noeud["type"],
  parent_id: string | null,
  code: string,
  ordre = 1,
  created_at = "2026-01-01T00:00:00Z",
): Noeud => ({
  id,
  type,
  parent_id,
  code,
  libelle: `Ligne ${code}`,
  moyens_verification: null,
  hypotheses: null,
  ordre,
  created_at,
});

// OG ─ OS1 ─ R1.1 ─ A1.1.1 / A1.1.2 ; OS1 ─ R1.2 ; OG ─ OS2
const noeuds: Noeud[] = [
  n("og", "objectif_global", null, "OG"),
  n("os2", "objectif_specifique", "og", "OS2", 2),
  n("os1", "objectif_specifique", "og", "OS1", 1),
  n("r12", "resultat", "os1", "R1.2", 2),
  n("r11", "resultat", "os1", "R1.1", 1),
  n("a112", "activite", "r11", "A1.1.2", 2),
  n("a111", "activite", "r11", "A1.1.1", 1),
];

describe("hiérarchie des types", () => {
  it("chaque niveau a un parent et un enfant attendus", () => {
    expect(typeEnfant("objectif_global")).toBe("objectif_specifique");
    expect(typeEnfant("objectif_specifique")).toBe("resultat");
    expect(typeEnfant("resultat")).toBe("activite");
    expect(typeEnfant("activite")).toBeNull();
    expect(typeParent("objectif_global")).toBeNull();
    expect(typeParent("activite")).toBe("resultat");
  });
});

describe("arbre", () => {
  const arbre = construireArbre(noeuds);

  it("n'a qu'une racine et trie les frères par rang", () => {
    expect(arbre).toHaveLength(1);
    expect(arbre[0]!.enfants.map((e) => e.code)).toEqual(["OS1", "OS2"]);
    expect(arbre[0]!.enfants[0]!.enfants.map((e) => e.code)).toEqual(["R1.1", "R1.2"]);
  });

  it("donne la profondeur de chaque ligne", () => {
    const profondeurs = Object.fromEntries(aplatir(arbre).map((x) => [x.code, x.profondeur]));
    expect(profondeurs).toEqual({ OG: 0, OS1: 1, "R1.1": 2, "A1.1.1": 3, "A1.1.2": 3, "R1.2": 2, OS2: 1 });
  });

  it("aplatit dans l'ordre de lecture", () => {
    expect(aplatir(arbre).map((x) => x.code)).toEqual(["OG", "OS1", "R1.1", "A1.1.1", "A1.1.2", "R1.2", "OS2"]);
  });

  it("masque les descendants d'une branche repliée", () => {
    expect(aplatir(arbre, new Set(["os1"])).map((x) => x.code)).toEqual(["OG", "OS1", "OS2"]);
  });

  it("compte ce qu'emporte la suppression d'une ligne", () => {
    const os1 = arbre[0]!.enfants[0]!;
    expect(compterDescendants(os1)).toBe(4);
    expect(compterDescendants(arbre[0]!.enfants[1]!)).toBe(0);
  });

  it("ignore une ligne dont le parent n'existe pas", () => {
    expect(aplatir(construireArbre([n("x", "resultat", "inconnu", "R9.9")]))).toEqual([]);
  });

  it("départage les rangs égaux par date de création puis identifiant", () => {
    const a = n("a", "objectif_specifique", "og", "OS1", 1, "2026-01-01T00:00:00Z");
    const b = n("b", "objectif_specifique", "og", "OS2", 1, "2026-01-02T00:00:00Z");
    expect(comparerNoeuds(a, b)).toBeLessThan(0);
    expect(comparerNoeuds(a, { ...a, id: "b" })).toBeLessThan(0);
  });
});

describe("rattachements", () => {
  it("propose les lignes du niveau juste au-dessus, dans l'ordre des codes", () => {
    expect(parentsPossibles(noeuds, "activite").map((x) => x.code)).toEqual(["R1.1", "R1.2"]);
    expect(parentsPossibles(noeuds, "objectif_specifique").map((x) => x.code)).toEqual(["OG"]);
    expect(parentsPossibles(noeuds, "objectif_global")).toEqual([]);
  });

  it("place une nouvelle ligne à la fin de ses frères", () => {
    expect(prochainOrdre([{ ordre: 1 }, { ordre: 4 }])).toBe(5);
    expect(prochainOrdre([])).toBe(1);
  });
});

describe("réordonnancement", () => {
  const freres = noeuds.filter((x) => x.parent_id === "r11");

  it("échange deux frères et ne renvoie que les rangs modifiés", () => {
    expect(deplacer(freres, "a112", -1)).toEqual([
      { id: "a112", ordre: 1 },
      { id: "a111", ordre: 2 },
    ]);
  });

  it("refuse de monter le premier ou de descendre le dernier", () => {
    expect(deplacer(freres, "a111", -1)).toBeNull();
    expect(deplacer(freres, "a112", 1)).toBeNull();
    expect(deplacer(freres, "inconnu", 1)).toBeNull();
  });

  it("départage des rangs égaux : seule la ligne reculée change de rang", () => {
    const egaux = [
      n("x", "resultat", "os1", "R1.1", 1, "2026-01-01T00:00:00Z"),
      n("y", "resultat", "os1", "R1.2", 1, "2026-01-02T00:00:00Z"),
    ];
    expect(deplacer(egaux, "y", -1)).toEqual([{ id: "x", ordre: 2 }]);
  });
});
