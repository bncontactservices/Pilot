// Adaptateur Supabase de `ClientSaisies` : une requête par méthode, rien d'autre.

import { analyserErreur } from "../errors";
import { getSupabase } from "../supabase";
import type { ClientSaisies } from "./synchro";

export function clientSupabase(): ClientSaisies {
  return {
    async sessionValide() {
      // `getSession` rafraîchit le jeton s'il est périmé. Sans session, supabase-js enverrait la clé anonyme : la base
      // répondrait « refusé » et la saisie serait marquée refusée à tort. On n'envoie donc rien.
      try {
        const { data, error } = await getSupabase().auth.getSession();
        if (data.session) return "ok";
        // Le renouvellement a échoué faute de réseau (ou est en pause : supabase-js garde l'échec une minute, même
        // après le retour du réseau) : la session existe toujours, l'envoi sera retenté.
        if (error && analyserErreur(error).cle === "erreurs.reseau") return "reseau";
        return "session";
      } catch (erreur) {
        return analyserErreur(erreur).cle === "erreurs.reseau" ? "reseau" : "session";
      }
    },
    async inserer(s, signal) {
      const { error } = await getSupabase()
        .from("kpi_entries")
        .insert({
          id: s.id,
          kpi_id: s.kpiId,
          date: s.date,
          valeur: s.valeur,
          commentaire: s.commentaire,
          localite_id: s.localiteId,
        })
        .abortSignal(signal);
      return error;
    },
    async lireParDate(kpiId, date, signal) {
      const { data, error } = await getSupabase()
        .from("kpi_entries")
        .select("id, valeur")
        .eq("kpi_id", kpiId)
        .eq("date", date)
        .abortSignal(signal)
        .maybeSingle();
      return { ligne: data ?? null, erreur: error };
    },
    async remplacer(idServeur, champs, signal) {
      const { error } = await getSupabase().from("kpi_entries").update(champs).eq("id", idServeur).abortSignal(signal);
      return error;
    },
  };
}
