// Ouverture de l'application sans réseau (Lot 4a).
//
// Quand le jeton d'accès est périmé et que le rafraîchissement échoue faute de réseau, supabase-js répond « pas de
// session » alors que la session est toujours dans le stockage (le jeton de rafraîchissement n'est retiré que si le
// serveur le refuse). Sans cette lecture, un agent de terrain qui rouvre l'application hors couverture serait renvoyé
// vers l'écran de connexion, qu'il ne peut pas franchir.
//
// La session lue ici ne sert qu'à reconnaître le compte et à afficher les données gardées sur l'appareil. Elle ne
// donne aucun droit : toute requête reste signée par supabase-js, qui rafraîchit le jeton dès que le réseau revient.

import type { Session } from "@supabase/supabase-js";

/** Nom de la clé de stockage de supabase-js : `sb-<premier libellé du domaine>-auth-token`. */
export function cleSessionStockee(urlSupabase: string): string {
  return `sb-${new URL(urlSupabase).hostname.split(".")[0]}-auth-token`;
}

/** La session gardée par supabase-js, si elle existe et a la forme attendue ; `null` sinon. Ne lève jamais. */
export function lireSessionStockee(cle: string, stockage: Pick<Storage, "getItem"> | null): Session | null {
  try {
    const brut = stockage?.getItem(cle);
    if (!brut) return null;
    const session = JSON.parse(brut) as Partial<Session> | null;
    if (
      !session ||
      typeof session.refresh_token !== "string" ||
      !session.refresh_token ||
      typeof session.user?.id !== "string" ||
      !session.user.id
    ) {
      return null;
    }
    return session as Session;
  } catch {
    return null;
  }
}
