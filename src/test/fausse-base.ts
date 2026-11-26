// Fausse base pour les tests d'écrans : un constructeur de requêtes chaînables qui répond avec des lignes
// préparées par table et enregistre les écritures. Aucun accès réseau.

type Ligne = Record<string, unknown>;
export type Appel = {
  table: string;
  operation: "insert" | "update" | "delete" | "upload" | "remove" | "signed" | "rpc";
  valeurs?: unknown;
};

export function creerFausseBase() {
  const tables: Record<string, Ligne[]> = {};
  const appels: Appel[] = [];
  // Réponses des fonctions appelées par `rpc`, par nom (aucune par défaut : `data` vaut null).
  const reponsesRpc: Record<string, unknown> = {};
  // Edge Functions : réponse par nom (`data`, ou `erreur` pour simuler un refus), et appels enregistrés.
  const reponsesFonctions: Record<string, { data?: unknown | ((corps: unknown) => unknown); erreur?: Error }> = {};
  const appelsFonctions: { nom: string; corps: unknown }[] = [];

  function requete(table: string) {
    const q: Record<string, unknown> = {};
    const lire = () => Promise.resolve({ data: tables[table] ?? [], error: null });
    const ecrire = (operation: "insert" | "update" | "delete", valeurs?: unknown) => {
      appels.push({ table, operation, valeurs });
      const suite: Record<string, unknown> = {
        eq: () => suite,
        abortSignal: () => suite,
        select: () => suite,
        single: () => Promise.resolve({ data: { id: "nouveau" }, error: null }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return suite;
    };
    for (const nom of ["select", "order", "eq", "in", "limit", "range", "not", "is", "abortSignal"]) q[nom] = () => q;
    q.maybeSingle = () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null });
    q.insert = (valeurs: unknown) => ecrire("insert", valeurs);
    q.update = (valeurs: unknown) => ecrire("update", valeurs);
    q.delete = () => ecrire("delete");
    q.then = (resolve: (v: unknown) => unknown) => lire().then(resolve);
    return q;
  }

  // Stockage de fichiers : les appels sont enregistrés comme les écritures de tables (table « stockage:{bucket} »).
  const stockage = {
    from: (bucket: string) => ({
      upload: (chemin: string, _fichier: unknown, options?: unknown) => {
        appels.push({ table: `stockage:${bucket}`, operation: "upload", valeurs: { chemin, options } });
        return Promise.resolve({ data: { path: chemin }, error: null });
      },
      remove: (chemins: string[]) => {
        appels.push({ table: `stockage:${bucket}`, operation: "remove", valeurs: chemins });
        return Promise.resolve({ data: [], error: null });
      },
      createSignedUrl: (chemin: string, duree: number, options?: unknown) => {
        appels.push({ table: `stockage:${bucket}`, operation: "signed", valeurs: { chemin, duree, options } });
        return Promise.resolve({ data: { signedUrl: `https://stockage.test/${chemin}?jeton=abc` }, error: null });
      },
    }),
  };

  return {
    tables,
    appels,
    reponsesRpc,
    reponsesFonctions,
    appelsFonctions,
    client: {
      from: (table: string) => requete(table),
      // Fonctions de la base : l'appel est enregistré (table « rpc:{nom} »), les arguments sont dans `valeurs`.
      rpc: (nom: string, args?: unknown) => {
        appels.push({ table: `rpc:${nom}`, operation: "rpc", valeurs: args });
        return Promise.resolve({ data: reponsesRpc[nom] ?? null, error: null });
      },
      storage: stockage,
      functions: {
        invoke: (nom: string, options?: { body?: unknown }) => {
          appelsFonctions.push({ nom, corps: options?.body });
          const r = reponsesFonctions[nom];
          const data = typeof r?.data === "function" ? r.data(options?.body) : r?.data;
          return Promise.resolve(r?.erreur ? { data: null, error: r.erreur } : { data: data ?? null, error: null });
        },
      },
      // Session : toujours valide (l'envoi des saisies hors ligne la vérifie avant d'écrire).
      auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u" } } }, error: null }) },
      // Temps réel : aucun événement n'est émis dans les tests.
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => Promise.resolve("ok"),
    },
    reinitialiser() {
      for (const cle of Object.keys(tables)) delete tables[cle];
      for (const cle of Object.keys(reponsesRpc)) delete reponsesRpc[cle];
      for (const cle of Object.keys(reponsesFonctions)) delete reponsesFonctions[cle];
      appelsFonctions.length = 0;
      appels.length = 0;
    },
  };
}
