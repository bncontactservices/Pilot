// Lance la lecture d'un fichier d'import dans un Web Worker ; repli sur le thread principal
// quand les workers ne sont pas disponibles (tests, navigateurs très anciens).

import { IMPORT_MAX_OCTETS } from "./constants";
import { type Classeur, type CodeErreurLecture, ErreurLecture } from "./import";

export async function lireFichierImport(fichier: File): Promise<Classeur> {
  if (fichier.size > IMPORT_MAX_OCTETS) throw new ErreurLecture("trop_gros");
  const donnees = await fichier.arrayBuffer();
  if (typeof Worker === "undefined") {
    const { lireFichier } = await import("./import-lecture");
    return lireFichier(donnees, fichier.name);
  }
  return new Promise<Classeur>((resolve, reject) => {
    const worker = new Worker(new URL("../workers/import.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (
      evenement: MessageEvent<{ ok: true; classeur: Classeur } | { ok: false; code: CodeErreurLecture }>,
    ) => {
      worker.terminate();
      if (evenement.data.ok) resolve(evenement.data.classeur);
      else reject(new ErreurLecture(evenement.data.code));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new ErreurLecture("illisible"));
    };
    worker.postMessage({ donnees, nom: fichier.name }, [donnees]);
  });
}
