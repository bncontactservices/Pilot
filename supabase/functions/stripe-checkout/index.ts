// Edge Function « stripe-checkout » : branchement de traiterPaiement (logique et garde-fous dans ../_shared/paiement.ts).
// Secrets à poser dans Edge Functions > Secrets : voir DECISIONS.md, section 24. Déployée avec verify_jwt désactivé :
// la fonction authentifie elle-même l'appelant (jeton de session, rôle administrateur), comme invite-member.

import { creerBase } from "../_shared/base.ts";
import { traiterPaiement } from "../_shared/paiement.ts";

const base = creerBase();

Deno.serve((requete) =>
  traiterPaiement(requete, {
    env: (nom) => Deno.env.get(nom),
    fetch,
    base,
    maintenant: () => Date.now(),
    journal: (...elements) => console.error(...elements),
  }),
);
