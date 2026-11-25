import { describe, expect, it } from "vitest";
import {
  aDesCoordonnees,
  aplatir,
  chemin,
  contexte,
  estReferentiel,
  formaterCoordonnees,
  indexer,
  libelleLieu,
  limites,
  type LocaliteListe,
  lireLatitude,
  lireLongitude,
  niveauxPossibles,
  parentsPossibles,
  rechercher,
} from "./localites";

const loc = (
  id: string,
  nom: string,
  niveau: LocaliteListe["niveau"],
  parent: string | null,
  extra = {},
): LocaliteListe => ({
  id,
  org_id: null,
  parent_id: parent,
  niveau,
  nom,
  latitude: null,
  longitude: null,
  ...extra,
});

const region = loc("r", "Région de Dakar", "region", null);
const dept = loc("d", "Département de Dakar", "departement", "r");
const arr = loc("a", "Arrondissement des Almadies", "arrondissement", "d");
const yoff = loc("y", "Commune de Yoff", "commune", "a", { latitude: 14.760358, longitude: -17.468149 });
const village = loc("v", "Village traditionnel de Yoff", "village", "y");
const layene = loc("l", "Layène", "quartier", "v");
const tonghor = loc("t", "Tonghor", "quartier", "v");
const propre = loc("p", "Village de l’organisation", "village", "y", { org_id: "o1" });
const toutes = [layene, propre, yoff, tonghor, region, village, arr, dept];
const index = indexer(toutes);

describe("hiérarchie", () => {
  it("donne le chemin de la racine à la localité", () => {
    expect(chemin(index, "l").map((l) => l.nom)).toEqual([
      "Région de Dakar",
      "Département de Dakar",
      "Arrondissement des Almadies",
      "Commune de Yoff",
      "Village traditionnel de Yoff",
      "Layène",
    ]);
    expect(chemin(index, "inconnue")).toEqual([]);
  });

  it("s'arrête sur un parent absent de la liste, et ne boucle pas sur un cycle", () => {
    expect(chemin(indexer([layene]), "l").map((l) => l.nom)).toEqual(["Layène"]);
    const a = loc("a1", "A", "region", "b1");
    const b = loc("b1", "B", "departement", "a1");
    expect(chemin(indexer([a, b]), "a1").map((l) => l.nom)).toEqual(["B", "A"]);
  });

  it("situe une localité par ses ancêtres les plus proches", () => {
    expect(contexte(index, "l")).toEqual([
      "Village traditionnel de Yoff",
      "Commune de Yoff",
      "Arrondissement des Almadies",
    ]);
    expect(contexte(index, "l", 1)).toEqual(["Village traditionnel de Yoff"]);
    expect(contexte(index, "r")).toEqual([]);
    expect(libelleLieu(index, "l")).toBe("Layène, Village traditionnel de Yoff, Commune de Yoff");
    expect(libelleLieu(index, "inconnue")).toBe("");
  });

  it("distingue le référentiel de la plateforme des localités de l'organisation", () => {
    expect(estReferentiel(yoff)).toBe(true);
    expect(estReferentiel(propre)).toBe(false);
  });

  it("propose pour un enfant des niveaux plus fins que son parent, et pour un niveau des parents plus larges", () => {
    expect(niveauxPossibles(yoff)).toEqual(["village", "quartier"]);
    expect(niveauxPossibles(layene)).toEqual([]);
    expect(niveauxPossibles(null)).toHaveLength(6);
    expect(
      parentsPossibles(toutes, "village")
        .map((l) => l.nom)
        .sort(),
    ).toEqual(["Arrondissement des Almadies", "Commune de Yoff", "Département de Dakar", "Région de Dakar"]);
    expect(parentsPossibles(toutes, "region")).toEqual([]);
  });

  it("aplatit en arbre : chaque localité sous son parent, frères par ordre alphabétique", () => {
    const lignes = aplatir(toutes);
    expect(lignes.map((l) => `${l.profondeur}:${l.localite.nom}`)).toEqual([
      "0:Région de Dakar",
      "1:Département de Dakar",
      "2:Arrondissement des Almadies",
      "3:Commune de Yoff",
      "4:Village de l’organisation",
      "4:Village traditionnel de Yoff",
      "5:Layène",
      "5:Tonghor",
    ]);
  });

  it("traite comme une racine une localité dont le parent n'est pas dans la liste", () => {
    expect(aplatir([layene, tonghor]).map((l) => `${l.profondeur}:${l.localite.nom}`)).toEqual([
      "0:Layène",
      "0:Tonghor",
    ]);
  });
});

describe("recherche", () => {
  it("ignore les accents et la casse, sur le nom et sur celui des ancêtres", () => {
    expect(rechercher(toutes, "layene").map((l) => l.nom)).toEqual(["Layène"]);
    expect(rechercher(toutes, "TONGHOR").map((l) => l.nom)).toEqual(["Tonghor"]);
    // « village traditionnel » trouve le village et ses quartiers.
    expect(
      rechercher(toutes, "traditionnel")
        .map((l) => l.nom)
        .sort(),
    ).toEqual(["Layène", "Tonghor", "Village traditionnel de Yoff"]);
    expect(rechercher(toutes, "   ")).toHaveLength(toutes.length);
    expect(rechercher(toutes, "kolda")).toEqual([]);
  });
});

describe("coordonnées", () => {
  it("lit des degrés décimaux, avec virgule, espaces et vrai signe moins", () => {
    expect(lireLatitude("14.7603583")).toEqual({ etat: "ok", valeur: 14.760358 });
    expect(lireLatitude(" 14,7603 ")).toEqual({ etat: "ok", valeur: 14.7603 });
    expect(lireLongitude("−17,468149")).toEqual({ etat: "ok", valeur: -17.468149 });
    expect(lireLongitude("-17.5")).toEqual({ etat: "ok", valeur: -17.5 });
    expect(lireLatitude("0")).toEqual({ etat: "ok", valeur: 0 });
  });

  it("distingue l'absence de coordonnée d'une coordonnée invalide", () => {
    expect(lireLatitude("")).toEqual({ etat: "absent" });
    expect(lireLatitude("   ")).toEqual({ etat: "absent" });
    expect(lireLatitude("14°46'")).toEqual({ etat: "invalide" });
    expect(lireLatitude("quatorze")).toEqual({ etat: "invalide" });
    expect(lireLatitude("91")).toEqual({ etat: "invalide" });
    expect(lireLatitude("-90.000001")).toEqual({ etat: "invalide" });
    expect(lireLongitude("181")).toEqual({ etat: "invalide" });
    expect(lireLongitude("1e3")).toEqual({ etat: "invalide" });
  });

  it("n'a de coordonnées que si la latitude et la longitude sont toutes deux là", () => {
    expect(aDesCoordonnees(yoff)).toBe(true);
    expect(aDesCoordonnees(layene)).toBe(false);
    expect(aDesCoordonnees({ latitude: 14.7, longitude: null })).toBe(false);
  });

  it("formate les coordonnées avec le point cardinal", () => {
    expect(formaterCoordonnees(14.760358, -17.468149)).toMatch(/^14,760358 N, 17,468149 O$/);
    expect(formaterCoordonnees(-3.5, 12)).toMatch(/^3,5000 S, 12,0000 E$/);
  });
});

describe("cadrage de la carte", () => {
  it("donne le rectangle qui contient tous les points", () => {
    expect(
      limites([
        { latitude: 14.76, longitude: -17.47 },
        { latitude: 14.7, longitude: -17.4 },
        { latitude: 14.8, longitude: -17.5 },
      ]),
    ).toEqual({ sud: 14.7, nord: 14.8, ouest: -17.5, est: -17.4 });
    expect(limites([])).toBeNull();
  });
});
