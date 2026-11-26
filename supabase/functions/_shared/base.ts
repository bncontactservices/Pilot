// Implémentation de `Base` (voir paiement.ts) avec supabase-js et la clé de service. Fichier propre à Deno : il n'est pas
// importé par les tests, qui utilisent une fausse base. Il reste volontairement mince : une requête par méthode.

import { createClient } from "jsr:@supabase/supabase-js@2.119.2";
import type { Base } from "./paiement.ts";

export function creerBase(): Base {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async utilisateur(jwt) {
      const { data, error } = await admin.auth.getUser(jwt);
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email ?? null };
    },
    async membre(userId) {
      const { data, error } = await admin
        .from("memberships")
        .select("org_id, role, organisation:organisations(nom, plan)")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const organisation = data.organisation as unknown as { nom: string; plan: string };
      return { orgId: data.org_id, role: data.role, orgNom: organisation.nom, plan: organisation.plan };
    },
    async abonnement(orgId) {
      const { data, error } = await admin
        .from("abonnements")
        .select("stripe_customer_id, stripe_subscription_id, statut")
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data
        ? { client: data.stripe_customer_id, abonnement: data.stripe_subscription_id, statut: data.statut }
        : null;
    },
    async lierClient(orgId, client) {
      const { data, error } = await admin.rpc("stripe_lier_client", { p_org: orgId, p_client: client });
      if (error) throw error;
      if (data === "org_inconnue") throw new Error("ORG_INCONNUE");
      return data as string;
    },
    async appliquer(a) {
      const { data, error } = await admin.rpc("stripe_appliquer_abonnement", {
        p_evenement_id: a.evenementId,
        p_type: a.type,
        p_evenement_le: a.evenementLe.toISOString(),
        p_client: a.client,
        p_abonnement: a.abonnement,
        p_org: a.org,
        p_plan: a.plan,
        p_periodicite: a.periodicite,
        p_statut: a.statut,
        p_periode_fin: a.periodeFin ? a.periodeFin.toISOString() : null,
        p_annule: a.annuleEnFinDePeriode,
      });
      if (error) throw error;
      return data as string;
    },
  };
}
