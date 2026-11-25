// Données gardées sur l'appareil pour ouvrir l'application sans réseau (Lot 4a).
//
// Seul ce qui sert à ouvrir un projet et à saisir est gardé : l'organisation, les projets, les indicateurs, les saisies
// déjà faites, les localités et les zones. Ni l'équipe, ni les invitations, ni les documents, ni le paiement.
// Les données sont celles du compte connecté et sont effacées à la déconnexion ; un autre compte ne les voit jamais
// (le propriétaire est vérifié à la restauration). Ce n'est pas un chiffrement : un appareil partagé doit se fermer
// par la déconnexion (voir DECISIONS.md).

import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** À augmenter quand la forme des données change : l'ancien contenu est alors jeté au lieu d'être relu de travers. */
export const VERSION_CACHE = 1;
export const DUREE_MAX_MS = 30 * 24 * 60 * 60 * 1000;
const DELAI_ECRITURE_MS = 1500;

/**
 * Premiers éléments des clés de requête gardées. Les taux d'avancement (« avancements ») sont exclus : ils sont
 * calculés par la base, et leurs `Map` ne passent pas par le stockage.
 */
const RACINES = new Set([
  "contexte-org",
  "projets",
  "projets-selecteur",
  "projet",
  "kpis",
  "saisies",
  "org-kpis",
  "org-saisies",
  "localites",
  "zones",
  "parametres-se",
  "programmes",
  "secteurs",
]);

export type RequeteGardee = { cle: QueryKey; donnees: unknown; misAJourLe: number };
export type EnregistrementCache = {
  version: number;
  proprietaire: string;
  enregistreLe: number;
  requetes: RequeteGardee[];
};

export type StockageCache = {
  lire(): Promise<EnregistrementCache | undefined>;
  ecrire(enregistrement: EnregistrementCache): Promise<void>;
  effacer(): Promise<void>;
};

export function estGardee(cle: QueryKey): boolean {
  return typeof cle[0] === "string" && RACINES.has(cle[0]);
}

/** Les lignes ajoutées en attendant la réponse du serveur (« provisoire-… ») n'existent pas encore : on ne les garde pas. */
function nettoyer(cle: QueryKey, donnees: unknown): unknown {
  if (cle[0] === "saisies" && Array.isArray(donnees)) {
    return donnees.filter((ligne) => !(typeof ligne?.id === "string" && ligne.id.startsWith("provisoire-")));
  }
  return donnees;
}

export function exporterCache(client: QueryClient, proprietaire: string, maintenant = Date.now()): EnregistrementCache {
  const requetes: RequeteGardee[] = [];
  for (const requete of client.getQueryCache().getAll()) {
    if (requete.state.status !== "success" || requete.state.data === undefined || !estGardee(requete.queryKey))
      continue;
    requetes.push({
      cle: requete.queryKey,
      donnees: nettoyer(requete.queryKey, requete.state.data),
      misAJourLe: requete.state.dataUpdatedAt,
    });
  }
  return { version: VERSION_CACHE, proprietaire, enregistreLe: maintenant, requetes };
}

/**
 * Remet dans le client les données gardées pour ce compte. Rend le nombre de requêtes restaurées.
 * Un contenu d'un autre compte, d'une autre version ou trop ancien est effacé.
 */
export async function restaurerCache(
  client: QueryClient,
  utilisateurId: string,
  stockage: StockageCache,
  maintenant = Date.now(),
): Promise<number> {
  const gardees = await stockage.lire().catch(() => undefined);
  if (!gardees) return 0;
  if (
    gardees.version !== VERSION_CACHE ||
    gardees.proprietaire !== utilisateurId ||
    maintenant - gardees.enregistreLe > DUREE_MAX_MS ||
    !Array.isArray(gardees.requetes)
  ) {
    await stockage.effacer().catch(() => undefined);
    return 0;
  }
  let n = 0;
  for (const { cle, donnees, misAJourLe } of gardees.requetes) {
    if (!Array.isArray(cle) || !estGardee(cle)) continue;
    // Ce qui est déjà en mémoire est plus récent que ce qui dort sur l'appareil.
    if (client.getQueryData(cle) !== undefined) continue;
    client.setQueryData(cle, donnees, { updatedAt: misAJourLe });
    n += 1;
  }
  return n;
}

/** Écrit le contenu du client sur l'appareil, à chaque changement (regroupés). Rend la fonction d'arrêt. */
export function memoriserCache(
  client: QueryClient,
  utilisateurId: string,
  stockage: StockageCache,
  delai = DELAI_ECRITURE_MS,
): () => void {
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const ecrire = () => {
    minuterie = undefined;
    void stockage.ecrire(exporterCache(client, utilisateurId)).catch(() => undefined);
  };
  const arreter = client.getQueryCache().subscribe((evenement) => {
    if (evenement.type !== "updated" && evenement.type !== "removed") return;
    if (!estGardee(evenement.query.queryKey)) return;
    clearTimeout(minuterie);
    minuterie = setTimeout(ecrire, delai);
  });
  return () => {
    arreter();
    clearTimeout(minuterie);
  };
}

const NOM_BASE = "pilot-hors-ligne";
const NOM_MAGASIN = "cache";
const CLE = "requetes";

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const demande = indexedDB.open(NOM_BASE, 1);
    demande.onupgradeneeded = () => demande.result.createObjectStore(NOM_MAGASIN);
    demande.onsuccess = () => resolve(demande.result);
    demande.onerror = () => reject(demande.error);
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (magasin: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const base = await ouvrir();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = base.transaction(NOM_MAGASIN, mode);
      const demande = action(tx.objectStore(NOM_MAGASIN));
      tx.oncomplete = () => resolve(demande.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    base.close();
  }
}

/** IndexedDB, ou `null` quand le navigateur n'en offre pas (le mode hors ligne se limite alors à la file). */
export function stockageIndexedDb(): StockageCache | null {
  if (typeof indexedDB === "undefined") return null;
  return {
    lire: () => transaction("readonly", (m) => m.get(CLE)) as Promise<EnregistrementCache | undefined>,
    ecrire: async (enregistrement) => {
      await transaction("readwrite", (m) => m.put(enregistrement, CLE));
    },
    effacer: async () => {
      await transaction("readwrite", (m) => m.delete(CLE));
    },
  };
}
