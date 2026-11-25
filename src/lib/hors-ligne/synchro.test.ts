import { describe, expect, it, vi } from "vitest";
import { creerClientSaisies } from "~/test/client-saisies";
import { creerStockageMemoire } from "~/test/stockage-memoire";
import { MagasinFile, type NouvelleSaisie, type SaisieEnAttente } from "./file";
import {
  appliquerResultat,
  envoyerSaisie,
  type ErreurBase,
  remplacerSaisie,
  synchroniserFile,
  TENTATIVES_MAX,
} from "./synchro";

const nouvelle = (id: string, extra: Partial<NouvelleSaisie> = {}): NouvelleSaisie => ({
  id,
  utilisateurId: "u1",
  orgId: "o1",
  projetId: "p1",
  kpiId: "k1",
  date: "2026-03-01",
  valeur: 12,
  commentaire: null,
  localiteId: null,
  ...extra,
});
const enAttente = (id: string, extra: Partial<SaisieEnAttente> = {}): SaisieEnAttente => ({
  ...nouvelle(id),
  creeLe: "2026-03-01T10:00:00Z",
  statut: "attente",
  ...extra,
});

const reseau: ErreurBase = { name: "TypeError", message: "TypeError: Failed to fetch" };
const delai: ErreurBase = { name: "TimeoutError", message: "TimeoutError: signal timed out" };
const pg = (code: string, message = "erreur"): ErreurBase => ({ code, message });

const creerBase = creerClientSaisies;

describe("envoyerSaisie", () => {
  it("envoie la saisie avec son identifiant", async () => {
    const base = creerBase();
    expect(await envoyerSaisie(base, enAttente("a"))).toEqual({ type: "envoyee" });
    expect(base.inserer).toHaveBeenCalledWith(expect.objectContaining({ id: "a", kpiId: "k1" }), expect.anything());
  });

  it("n'envoie rien sans session valide : la clé anonyme ferait refuser la saisie à tort", async () => {
    const base = creerBase({ sessionValide: vi.fn(() => Promise.resolve("session" as const)) });
    expect(await envoyerSaisie(base, enAttente("a"))).toEqual({ type: "session" });
    expect(base.inserer).not.toHaveBeenCalled();
  });

  it("garde la saisie quand le jeton n'a pas pu être renouvelé faute de réseau : la session existe toujours", async () => {
    const base = creerBase({ sessionValide: vi.fn(() => Promise.resolve("reseau" as const)) });
    expect(await envoyerSaisie(base, enAttente("a"))).toEqual({ type: "reseau" });
    expect(base.inserer).not.toHaveBeenCalled();
  });

  it.each([
    ["échec réseau", reseau],
    ["délai dépassé", delai],
  ])("garde la saisie sur un %s", async (_nom, erreur) => {
    const base = creerBase({ inserer: vi.fn(() => Promise.resolve(erreur)) });
    expect(await envoyerSaisie(base, enAttente("a"))).toEqual({ type: "reseau" });
  });

  it("demande une nouvelle connexion quand le jeton est refusé", async () => {
    const base = creerBase({ inserer: vi.fn(() => Promise.resolve(pg("PGRST301", "JWT expired"))) });
    expect(await envoyerSaisie(base, enAttente("a"))).toEqual({ type: "session" });
  });

  it("reconnaît le rejeu d'un envoi déjà passé : la ligne porte NOTRE identifiant", async () => {
    const base = creerBase({
      inserer: vi.fn(() => Promise.resolve(pg("23505"))),
      lireParDate: vi.fn(() => Promise.resolve({ ligne: { id: "a", valeur: 12 }, erreur: null as ErreurBase })),
    });
    expect(await envoyerSaisie(base, enAttente("a"))).toEqual({ type: "envoyee" });
  });

  it("signale un conflit quand la valeur en place est celle d'un autre", async () => {
    const base = creerBase({
      inserer: vi.fn(() => Promise.resolve(pg("23505"))),
      lireParDate: vi.fn(() => Promise.resolve({ ligne: { id: "autre", valeur: 99 }, erreur: null as ErreurBase })),
    });
    expect(await envoyerSaisie(base, enAttente("a"))).toEqual({
      type: "conflit",
      valeurServeur: 99,
      idServeur: "autre",
    });
  });

  it("garde la saisie quand le réseau tombe entre l'insertion et la lecture du conflit", async () => {
    const base = creerBase({
      inserer: vi.fn(() => Promise.resolve(pg("23505"))),
      lireParDate: vi.fn(() => Promise.resolve({ ligne: null, erreur: reseau })),
    });
    expect(await envoyerSaisie(base, enAttente("a"))).toEqual({ type: "reseau" });
  });

  it("refuse quand un doublon n'est pas visible (ligne d'une autre organisation, ou supprimée entre-temps)", async () => {
    const base = creerBase({ inserer: vi.fn(() => Promise.resolve(pg("23505"))) });
    expect(await envoyerSaisie(base, enAttente("a"))).toMatchObject({ type: "refusee", cle: "erreurs.doublon" });
  });

  it.each([
    ["fin d'essai", pg("P0001", "ESSAI_EXPIRE"), "erreurs.ESSAI_EXPIRE"],
    ["droits insuffisants", pg("42501", "new row violates row-level security policy"), "erreurs.acces_refuse"],
    ["indicateur supprimé", pg("P0001", "KPI_INTROUVABLE"), "erreurs.KPI_INTROUVABLE"],
    ["localité hors du projet", pg("P0001", "LOCALITE_HORS_PROJET"), "erreurs.LOCALITE_HORS_PROJET"],
    ["valeur invalide", pg("23514"), "erreurs.donnees_invalides"],
    ["élément lié supprimé", pg("23503"), "horsligne.refus.reference"],
  ])("refuse définitivement : %s", async (_nom, erreur, cle) => {
    const base = creerBase({ inserer: vi.fn(() => Promise.resolve(erreur)) });
    expect(await envoyerSaisie(base, enAttente("a"))).toMatchObject({ type: "refusee", cle });
  });

  it("traite une erreur inconnue comme passagère (panne du serveur) : elle sera retentée", async () => {
    const base = creerBase({ inserer: vi.fn(() => Promise.resolve(pg("", "<html>502 Bad Gateway</html>"))) });
    expect(await envoyerSaisie(base, enAttente("a"))).toMatchObject({ type: "serveur" });
  });
});

describe("appliquerResultat", () => {
  const magasinAvec = (extra: Partial<SaisieEnAttente> = {}) => {
    const magasin = new MagasinFile(creerStockageMemoire(), "u1");
    const saisie = magasin.ajouter(nouvelle("a"));
    if (Object.keys(extra).length) magasin.modifier("a", extra);
    return { magasin, saisie: magasin.lire("a")! ?? saisie };
  };

  it("retire la saisie envoyée", () => {
    const { magasin, saisie } = magasinAvec();
    expect(appliquerResultat(magasin, saisie, { type: "envoyee" })).toBe(true);
    expect(magasin.lister()).toEqual([]);
  });

  it("marque un conflit avec la valeur en place, sans rien perdre", () => {
    const { magasin, saisie } = magasinAvec();
    appliquerResultat(magasin, saisie, { type: "conflit", valeurServeur: 99, idServeur: "s1" });
    expect(magasin.lister()[0]).toMatchObject({ statut: "conflit", valeurServeur: 99, idServeur: "s1", valeur: 12 });
  });

  it("marque un refus avec son motif, et garde la valeur pour que l'utilisateur la voie", () => {
    const { magasin, saisie } = magasinAvec();
    appliquerResultat(magasin, saisie, { type: "refusee", cle: "erreurs.ESSAI_EXPIRE", erreur: null });
    expect(magasin.lister()[0]).toMatchObject({ statut: "refusee", erreurCle: "erreurs.ESSAI_EXPIRE", valeur: 12 });
  });

  it("laisse intacte une saisie dont l'envoi a échoué faute de réseau ou de session", () => {
    const { magasin, saisie } = magasinAvec();
    expect(appliquerResultat(magasin, saisie, { type: "reseau" })).toBe(false);
    expect(appliquerResultat(magasin, saisie, { type: "session" })).toBe(false);
    expect(magasin.lister()[0]).toMatchObject({ statut: "attente" });
    expect(magasin.lister()[0]!.tentatives).toBeUndefined();
  });

  it("compte les erreurs du serveur et finit par marquer la saisie refusée au lieu de la rejouer sans fin", () => {
    const { magasin } = magasinAvec();
    for (let i = 1; i < TENTATIVES_MAX; i++) {
      appliquerResultat(magasin, magasin.lire("a")!, { type: "serveur", erreur: null });
      expect(magasin.lire("a")).toMatchObject({ statut: "attente", tentatives: i });
    }
    appliquerResultat(magasin, magasin.lire("a")!, { type: "serveur", erreur: null });
    expect(magasin.lire("a")).toMatchObject({
      statut: "refusee",
      erreurCle: "erreurs.inconnue",
      tentatives: TENTATIVES_MAX,
    });
  });
});

describe("synchroniserFile", () => {
  const remplir = (...ids: string[]) => {
    const magasin = new MagasinFile(creerStockageMemoire(), "u1");
    ids.forEach((id, i) =>
      magasin.ajouter(nouvelle(id, { creeLe: `2026-03-0${i + 1}T10:00:00Z`, date: `2026-03-0${i + 1}` })),
    );
    return magasin;
  };

  it("envoie de la plus ancienne à la plus récente et vide la file", async () => {
    const magasin = remplir("a", "b", "c");
    const base = creerBase();
    expect(await synchroniserFile(base, magasin)).toEqual({ envoyees: 3, arret: null });
    expect(base.inserer.mock.calls.map(([s]) => (s as SaisieEnAttente).id)).toEqual(["a", "b", "c"]);
    expect(magasin.lister()).toEqual([]);
  });

  it("s'arrête au premier échec réseau et garde le reste, dans l'ordre, pour la prochaine fois", async () => {
    const magasin = remplir("a", "b", "c");
    const inserer = vi.fn<() => Promise<ErreurBase>>().mockResolvedValueOnce(null).mockResolvedValueOnce(reseau);
    const bilan = await synchroniserFile(creerBase({ inserer }), magasin);
    expect(bilan).toEqual({ envoyees: 1, arret: "reseau" });
    expect(magasin.lister().map((s) => [s.id, s.statut])).toEqual([
      ["b", "attente"],
      ["c", "attente"],
    ]);
    expect(inserer).toHaveBeenCalledTimes(2);
  });

  it("continue après un refus ou un conflit : les autres saisies n'en dépendent pas", async () => {
    const magasin = remplir("a", "b", "c");
    const inserer = vi
      .fn<() => Promise<ErreurBase>>()
      .mockResolvedValueOnce(pg("P0001", "KPI_INTROUVABLE"))
      .mockResolvedValueOnce(pg("23505"))
      .mockResolvedValueOnce(null);
    const lireParDate = vi.fn(() => Promise.resolve({ ligne: { id: "autre", valeur: 7 }, erreur: null as ErreurBase }));
    const bilan = await synchroniserFile(creerBase({ inserer, lireParDate }), magasin);
    expect(bilan).toEqual({ envoyees: 1, arret: null });
    expect(magasin.lister().map((s) => [s.id, s.statut])).toEqual([
      ["a", "refusee"],
      ["b", "conflit"],
    ]);
  });

  it("n'insiste pas sur une panne du serveur dans un même passage", async () => {
    const magasin = remplir("a", "b");
    const inserer = vi.fn((): Promise<ErreurBase> => Promise.resolve(pg("", "502")));
    const bilan = await synchroniserFile(creerBase({ inserer }), magasin);
    expect(bilan).toEqual({ envoyees: 0, arret: "serveur" });
    expect(inserer).toHaveBeenCalledTimes(1);
    expect(magasin.lire("a")?.tentatives).toBe(1);
  });

  it("saute les saisies déjà en cours d'envoi ailleurs, sans les doubler", async () => {
    const magasin = remplir("a", "b");
    const base = creerBase();
    expect(await synchroniserFile(base, magasin, new Set(["a"]))).toEqual({ envoyees: 1, arret: null });
    expect(base.inserer.mock.calls.map(([s]) => (s as SaisieEnAttente).id)).toEqual(["b"]);
    expect(magasin.lister().map((s) => s.id)).toEqual(["a"]);
  });

  it("n'envoie pas les saisies déjà refusées ou en conflit", async () => {
    const magasin = remplir("a", "b");
    magasin.modifier("a", { statut: "refusee", erreurCle: "erreurs.ESSAI_EXPIRE" });
    const base = creerBase();
    await synchroniserFile(base, magasin);
    expect(base.inserer).toHaveBeenCalledTimes(1);
    expect(magasin.lire("a")?.statut).toBe("refusee");
  });

  it("saute une saisie supprimée pendant l'envoi (autre onglet, suppression par l'utilisateur)", async () => {
    const magasin = remplir("a", "b");
    const inserer = vi.fn(() => {
      magasin.retirer("b");
      return Promise.resolve(null as ErreurBase);
    });
    const bilan = await synchroniserFile(creerBase({ inserer }), magasin);
    expect(bilan).toEqual({ envoyees: 1, arret: null });
    expect(inserer).toHaveBeenCalledTimes(1);
  });

  it("deux envois de la même saisie (deux onglets) ne la dupliquent pas : le second reconnaît son identifiant", async () => {
    const magasin = remplir("a");
    const base = creerBase({
      inserer: vi.fn(() => Promise.resolve(pg("23505"))),
      lireParDate: vi.fn(() => Promise.resolve({ ligne: { id: "a", valeur: 12 }, erreur: null as ErreurBase })),
    });
    expect(await synchroniserFile(base, magasin)).toEqual({ envoyees: 1, arret: null });
    expect(magasin.lister()).toEqual([]);
  });
});

describe("remplacerSaisie", () => {
  const conflit = enAttente("a", {
    statut: "conflit",
    idServeur: "s1",
    valeurServeur: 99,
    valeur: 12,
    commentaire: "c",
    localiteId: "l1",
  });

  it("remplace la ligne en place par les valeurs de l'appareil", async () => {
    const base = creerBase();
    expect(await remplacerSaisie(base, conflit)).toEqual({ type: "envoyee" });
    expect(base.remplacer).toHaveBeenCalledWith(
      "s1",
      { valeur: 12, commentaire: "c", localite_id: "l1" },
      expect.anything(),
    );
  });

  it("garde le conflit si le réseau manque, et refuse sans ligne à remplacer", async () => {
    expect(await remplacerSaisie(creerBase({ remplacer: vi.fn(() => Promise.resolve(reseau)) }), conflit)).toEqual({
      type: "reseau",
    });
    expect(await remplacerSaisie(creerBase(), enAttente("b"))).toMatchObject({ type: "refusee" });
  });

  it("rend le motif d'un refus (droits, fin d'essai)", async () => {
    const base = creerBase({ remplacer: vi.fn(() => Promise.resolve(pg("P0001", "ESSAI_EXPIRE"))) });
    expect(await remplacerSaisie(base, conflit)).toMatchObject({ type: "refusee", cle: "erreurs.ESSAI_EXPIRE" });
  });
});
