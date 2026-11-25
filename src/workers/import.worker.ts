// Worker de lecture des fichiers d'import (CSV et Excel) : le thread principal reste fluide.
import { ErreurLecture } from "~/lib/import";
import { lireFichier } from "~/lib/import-lecture";

self.onmessage = (evenement: MessageEvent<{ donnees: ArrayBuffer; nom: string }>) => {
  try {
    self.postMessage({ ok: true, classeur: lireFichier(evenement.data.donnees, evenement.data.nom) });
  } catch (erreur) {
    self.postMessage({ ok: false, code: erreur instanceof ErreurLecture ? erreur.code : "illisible" });
  }
};
