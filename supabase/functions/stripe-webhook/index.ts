// Edge Function « stripe-webhook » : branchement de traiterWebhook (logique et garde-fous dans ../_shared/paiement.ts).
// Secrets à poser dans Edge Functions > Secrets : voir DECISIONS.md, section 24. Déployée avec verify_jwt désactivé :
// Stripe n'envoie pas de jeton Supabase, la fonction authentifie l'appelant par la signature de l'événement.

import { creerBase } from "../_shared/base.ts";
import { traiterWebhook } from "../_shared/paiement.ts";

const base = creerBase();

Deno.serve((requete) =>
  traiterWebhook(requete, {
    env: (nom) => Deno.env.get(nom),
    fetch,
    base,
    maintenant: () => Date.now(),
    journal: (...elements) => console.error(...elements),
  }),
);
