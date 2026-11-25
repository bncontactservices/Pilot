// Envoi des saisies en attente (Lot 4a). Aucune dépendance à React ni à Supabase : la base est injectée (`ClientSaisies`),
// ce qui permet de tester chaque cas (réseau, refus, conflit, rejeu) sans réseau.

import { analyserErreur } from "../errors";
import type { MagasinFile, SaisieEnAttente } from "./file";

/** Erreur telle que la renvoie la base (PostgREST) ou le réseau. */
export type ErreurBase = { code?: string; message?: string; name?: string } | null;

export type LigneServeur = { id: string; valeur: number };

/** Ce dont l'envoi a besoin de la base. */
export type ClientSaisies = {
  /**
   * Une session valide est-elle disponible (jeton rafraîchi si besoin) ? Sans elle, rien n'est envoyé.
   * « reseau » : le jeton n'a pas pu être renouvelé faute de réseau (passager : la session existe toujours) ;
   * « session » : il n'y a plus de session, il faut se reconnecter.
   */
  sessionValide(): Promise<"ok" | "reseau" | "session">;
  inserer(saisie: SaisieEnAttente, signal: AbortSignal): Promise<ErreurBase>;
  lireParDate(
    kpiId: string,
    date: string,
    signal: AbortSignal,
  ): Promise<{ ligne: LigneServeur | null; erreur: ErreurBase }>;
  remplacer(
    idServeur: string,
    champs: { valeur: number; commentaire: string | null; localite_id: string | null },
    signal: AbortSignal,
  ): Promise<ErreurBase>;
};

export type ResultatEnvoi =
  | { type: "envoyee" }
  | { type: "reseau" }
  | { type: "session" }
  | { type: "serveur"; erreur: ErreurBase }
  | { type: "refusee"; cle: string; erreur: ErreurBase }
  | { type: "conflit"; valeurServeur: number; idServeur: string };

/** Au-delà, une saisie qui échoue pour une cause inconnue est marquée refusée au lieu d'être rejouée sans fin. */
export const TENTATIVES_MAX = 5;
export const DELAI_ENVOI_MS = 12_000;

const delai = () => AbortSignal.timeout(DELAI_ENVOI_MS);

const estSessionExpiree = (erreur: ErreurBase) =>
  erreur?.code === "PGRST301" ||
  erreur?.code === "PGRST303" ||
  /jwt (expired|invalid)|invalid jwt/i.test(erreur?.message ?? "");

/** Envoie une saisie et dit ce qu'il en est advenu. Ne modifie pas la file. */
export async function envoyerSaisie(db: ClientSaisies, saisie: SaisieEnAttente): Promise<ResultatEnvoi> {
  const session = await db.sessionValide();
  if (session !== "ok") return { type: session };

  const erreur = await db.inserer(saisie, delai());
  if (!erreur) return { type: "envoyee" };
  if (estSessionExpiree(erreur)) return { type: "session" };

  const analyse = analyserErreur(erreur);
  if (analyse.cle === "erreurs.reseau") return { type: "reseau" };

  if (erreur.code === "23505") {
    // Soit le rejeu d'un envoi passé dont la réponse s'est perdue (la ligne porte NOTRE identifiant), soit la valeur
    // d'un autre à la même date (conflit).
    const { ligne, erreur: erreurLecture } = await db.lireParDate(saisie.kpiId, saisie.date, delai());
    if (erreurLecture) {
      return analyserErreur(erreurLecture).cle === "erreurs.reseau"
        ? { type: "reseau" }
        : { type: "serveur", erreur: erreurLecture };
    }
    if (ligne?.id === saisie.id) return { type: "envoyee" };
    if (ligne) return { type: "conflit", valeurServeur: ligne.valeur, idServeur: ligne.id };
    return { type: "refusee", cle: analyse.cle, erreur };
  }

  // Un élément lié (indicateur, localité) n'existe plus : message propre à l'envoi différé.
  if (erreur.code === "23503") return { type: "refusee", cle: "horsligne.refus.reference", erreur };
  // Refus définitifs : droits, fin d'essai, indicateur supprimé, valeur invalide…
  if (analyse.cle !== "erreurs.inconnue") return { type: "refusee", cle: analyse.cle, erreur };
  return { type: "serveur", erreur };
}

/** Remplace la valeur déjà présente à cette date par celle de l'appareil (résolution d'un conflit). */
export async function remplacerSaisie(db: ClientSaisies, saisie: SaisieEnAttente): Promise<ResultatEnvoi> {
  if (!saisie.idServeur) return { type: "refusee", cle: "erreurs.inconnue", erreur: null };
  const session = await db.sessionValide();
  if (session !== "ok") return { type: session };
  const erreur = await db.remplacer(
    saisie.idServeur,
    { valeur: saisie.valeur, commentaire: saisie.commentaire, localite_id: saisie.localiteId },
    delai(),
  );
  if (!erreur) return { type: "envoyee" };
  if (estSessionExpiree(erreur)) return { type: "session" };
  const analyse = analyserErreur(erreur);
  if (analyse.cle === "erreurs.reseau") return { type: "reseau" };
  if (analyse.cle !== "erreurs.inconnue") return { type: "refusee", cle: analyse.cle, erreur };
  return { type: "serveur", erreur };
}

/** Applique le résultat d'un envoi à la file. Rend `true` quand la saisie a quitté la file (envoyée). */
export function appliquerResultat(magasin: MagasinFile, saisie: SaisieEnAttente, resultat: ResultatEnvoi): boolean {
  switch (resultat.type) {
    case "envoyee":
      magasin.retirer(saisie.id);
      return true;
    case "conflit":
      magasin.modifier(saisie.id, {
        statut: "conflit",
        valeurServeur: resultat.valeurServeur,
        idServeur: resultat.idServeur,
        erreurCle: undefined,
      });
      return false;
    case "refusee":
      magasin.modifier(saisie.id, { statut: "refusee", erreurCle: resultat.cle });
      return false;
    case "serveur": {
      const tentatives = (saisie.tentatives ?? 0) + 1;
      magasin.modifier(
        saisie.id,
        tentatives >= TENTATIVES_MAX
          ? { statut: "refusee", erreurCle: "erreurs.inconnue", tentatives }
          : { tentatives },
      );
      return false;
    }
    default:
      // Réseau ou session : la saisie reste en attente, intacte.
      return false;
  }
}

export type BilanSynchro = {
  envoyees: number;
  /** Pourquoi l'envoi s'est arrêté avant la fin, le cas échéant. */
  arret: "reseau" | "session" | "serveur" | null;
};

/**
 * Envoie, de la plus ancienne à la plus récente, les saisies en attente du compte.
 * `ignorer` : les saisies déjà en cours d'envoi ailleurs (celle qu'on vient de taper), à ne pas doubler.
 */
export async function synchroniserFile(
  db: ClientSaisies,
  magasin: MagasinFile,
  ignorer: ReadonlySet<string> = new Set(),
): Promise<BilanSynchro> {
  let envoyees = 0;
  for (const saisie of magasin.lister().filter((s) => s.statut === "attente" && !ignorer.has(s.id))) {
    // Retirée entre-temps (suppression, autre onglet) : on passe.
    const courante = magasin.lire(saisie.id);
    if (!courante || courante.statut !== "attente") continue;
    const resultat = await envoyerSaisie(db, courante);
    if (appliquerResultat(magasin, courante, resultat)) envoyees += 1;
    if (resultat.type === "reseau" || resultat.type === "session") return { envoyees, arret: resultat.type };
    // Une erreur serveur passagère touche toutes les saisies : inutile d'insister dans ce passage.
    if (resultat.type === "serveur") return { envoyees, arret: "serveur" };
  }
  return { envoyees, arret: null };
}
