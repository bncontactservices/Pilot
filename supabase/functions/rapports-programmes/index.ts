// Edge Function « rapports-programmes » : branchement de traiterRapports (logique et garde-fous dans ../_shared/rapports.ts).
// Secrets à poser dans Edge Functions > Secrets : RESEND_API_KEY, EMAIL_FROM, APP_URL (voir DECISIONS.md, section 29).
// Déployée avec verify_jwt désactivé : le planificateur (pg_cron) s'authentifie par le jeton de private.rapports_config, et
// les membres par leur session, vérifiée dans la fonction.

import { creerBaseRapports } from "../_shared/base-rapports.ts";
import { traiterRapports } from "../_shared/rapports.ts";

const base = creerBaseRapports();

Deno.serve((requete) =>
  traiterRapports(requete, {
    env: (nom) => Deno.env.get(nom),
    fetch,
    base,
    maintenant: () => Date.now(),
    journal: (...elements) => console.error(...elements),
  }),
);
