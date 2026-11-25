// File d'attente des saisies d'indicateurs faites sans réseau (Lot 4a).
//
// Chaque saisie est écrite sur l'appareil AVANT d'être envoyée : si l'onglet se ferme ou si la connexion tombe en
// pleine requête, elle n'est pas perdue. Une entrée par saisie (clé propre), pour que deux onglets qui ajoutent en
// même temps ne s'écrasent pas. Les entrées sont rangées par compte : un autre compte, sur le même appareil, ne les
// voit ni ne les envoie.

export type StatutSaisie = "attente" | "refusee" | "conflit";

export type SaisieEnAttente = {
  /** Identifiant de la future ligne : tiré sur l'appareil, il rend le rejeu d'un envoi sans danger (voir migration 4a). */
  id: string;
  utilisateurId: string;
  orgId: string;
  projetId: string;
  kpiId: string;
  /** AAAA-MM-JJ */
  date: string;
  valeur: number;
  commentaire: string | null;
  localiteId: string | null;
  /** Horodatage ISO de la saisie sur l'appareil (jamais modifié : sert à ordonner les envois). */
  creeLe: string;
  statut: StatutSaisie;
  /** Clé i18n du motif du refus (statut « refusee »). */
  erreurCle?: string;
  /** Valeur déjà présente dans la base à cette date, et identifiant de sa ligne (statut « conflit »). */
  valeurServeur?: number;
  idServeur?: string;
  /** Échecs de l'envoi dont la cause n'est pas la connexion. */
  tentatives?: number;
};

export type NouvelleSaisie = Omit<
  SaisieEnAttente,
  "statut" | "creeLe" | "erreurCle" | "valeurServeur" | "idServeur" | "tentatives"
> &
  Partial<Pick<SaisieEnAttente, "creeLe">>;

/** Ce qu'il faut de `Storage` : `localStorage` convient, un faux en mémoire aussi (tests). */
export type StockageSync = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const PREFIXE = "pilot.file.v1.";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ErreurStockage extends Error {
  constructor(public readonly cause?: unknown) {
    super("STOCKAGE_INDISPONIBLE");
    this.name = "ErreurStockage";
  }
}

/** `localStorage`, ou `null` quand le navigateur le refuse (navigation privée de certains navigateurs, stockage bloqué). */
export function stockageParDefaut(): StockageSync | null {
  try {
    if (typeof window === "undefined") return null;
    const essai = `${PREFIXE}essai`;
    window.localStorage.setItem(essai, "1");
    window.localStorage.removeItem(essai);
    return window.localStorage;
  } catch {
    return null;
  }
}

function lireEntree(brut: string | null): SaisieEnAttente | null {
  if (!brut) return null;
  try {
    const s = JSON.parse(brut) as Partial<SaisieEnAttente>;
    if (
      typeof s.id !== "string" ||
      typeof s.utilisateurId !== "string" ||
      typeof s.orgId !== "string" ||
      typeof s.projetId !== "string" ||
      typeof s.kpiId !== "string" ||
      typeof s.date !== "string" ||
      !DATE.test(s.date) ||
      typeof s.valeur !== "number" ||
      !Number.isFinite(s.valeur) ||
      typeof s.creeLe !== "string" ||
      (s.statut !== "attente" && s.statut !== "refusee" && s.statut !== "conflit")
    ) {
      return null;
    }
    return {
      ...(s as SaisieEnAttente),
      commentaire: typeof s.commentaire === "string" ? s.commentaire : null,
      localiteId: typeof s.localiteId === "string" ? s.localiteId : null,
    };
  } catch {
    return null;
  }
}

/**
 * Les saisies d'un compte. Un magasin par compte ; `lister()` rend la même liste (même référence) tant que rien ne
 * change, ce qui le rend utilisable avec `useSyncExternalStore`.
 */
export class MagasinFile {
  private instantane: SaisieEnAttente[] | null = null;
  private readonly ecouteurs = new Set<() => void>();

  constructor(
    private readonly stockage: StockageSync | null,
    readonly utilisateurId: string,
  ) {}

  get disponible(): boolean {
    return this.stockage !== null;
  }

  private cle(id: string) {
    return `${PREFIXE}${this.utilisateurId}.${id}`;
  }

  private changer() {
    this.instantane = null;
    for (const ecouteur of this.ecouteurs) ecouteur();
  }

  /** Les saisies du compte, de la plus ancienne à la plus récente. */
  lister = (): SaisieEnAttente[] => {
    if (this.instantane) return this.instantane;
    const lignes: SaisieEnAttente[] = [];
    const stockage = this.stockage;
    if (stockage) {
      const debut = `${PREFIXE}${this.utilisateurId}.`;
      for (let i = 0; i < stockage.length; i++) {
        const cle = stockage.key(i);
        if (!cle?.startsWith(debut)) continue;
        const saisie = lireEntree(stockage.getItem(cle));
        // Une entrée d'un autre compte ou abîmée est ignorée, jamais effacée ici.
        if (saisie && saisie.utilisateurId === this.utilisateurId) lignes.push(saisie);
      }
    }
    lignes.sort((a, b) => (a.creeLe < b.creeLe ? -1 : a.creeLe > b.creeLe ? 1 : a.id < b.id ? -1 : 1));
    this.instantane = lignes;
    return lignes;
  };

  /** Écrit une saisie (nouvelle ou modifiée). Lève `ErreurStockage` si l'appareil la refuse : rien n'est alors promis. */
  ecrire(saisie: SaisieEnAttente): void {
    if (!this.stockage) throw new ErreurStockage();
    try {
      this.stockage.setItem(this.cle(saisie.id), JSON.stringify(saisie));
    } catch (erreur) {
      throw new ErreurStockage(erreur);
    }
    this.changer();
  }

  ajouter(nouvelle: NouvelleSaisie): SaisieEnAttente {
    const saisie: SaisieEnAttente = {
      ...nouvelle,
      creeLe: nouvelle.creeLe ?? new Date().toISOString(),
      statut: "attente",
    };
    this.ecrire(saisie);
    return saisie;
  }

  lire(id: string): SaisieEnAttente | null {
    return this.stockage ? lireEntree(this.stockage.getItem(this.cle(id))) : null;
  }

  /** Modifie une saisie encore présente ; ne fait rien si elle a été retirée entre-temps (autre onglet, suppression). */
  modifier(id: string, changements: Partial<SaisieEnAttente>): SaisieEnAttente | null {
    const actuelle = this.lire(id);
    if (!actuelle) return null;
    const suivante: SaisieEnAttente = {
      ...actuelle,
      ...changements,
      id: actuelle.id,
      utilisateurId: actuelle.utilisateurId,
    };
    this.ecrire(suivante);
    return suivante;
  }

  retirer(id: string): void {
    if (!this.stockage) return;
    try {
      this.stockage.removeItem(this.cle(id));
    } catch {
      // Rien à faire : l'entrée sera reprise au prochain passage.
    }
    this.changer();
  }

  /** Retire toutes les saisies du compte (déconnexion avec suppression voulue). */
  vider(): void {
    for (const saisie of this.lister()) this.retirer(saisie.id);
  }

  /** Les abonnés sont prévenus à chaque changement, y compris venant d'un autre onglet. */
  abonner = (rappel: () => void): (() => void) => {
    this.ecouteurs.add(rappel);
    const surStockage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith(`${PREFIXE}${this.utilisateurId}.`)) this.changer();
    };
    if (typeof window !== "undefined") window.addEventListener("storage", surStockage);
    return () => {
      this.ecouteurs.delete(rappel);
      if (typeof window !== "undefined") window.removeEventListener("storage", surStockage);
    };
  };
}

/** Une saisie existe-t-elle déjà dans la file pour cet indicateur à cette date ? */
export function trouverDansLaFile(lignes: SaisieEnAttente[], kpiId: string, date: string): SaisieEnAttente | undefined {
  return lignes.find((s) => s.kpiId === kpiId && s.date === date);
}

export function genererIdentifiant(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Repli pour les navigateurs sans `randomUUID` (contexte non sécurisé) : UUID v4 depuis `getRandomValues`.
  const octets = crypto.getRandomValues(new Uint8Array(16));
  octets[6] = (octets[6]! & 0x0f) | 0x40;
  octets[8] = (octets[8]! & 0x3f) | 0x80;
  const hex = Array.from(octets, (o) => o.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
