// Implémentation de `BaseRapports` (voir rapports.ts) avec supabase-js et la clé de service. Fichier propre à Deno : il n'est
// pas importé par les tests, qui utilisent une fausse base. Une requête par méthode.

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { BaseRapports } from "./rapports.ts";

export function creerBaseRapports(): BaseRapports {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async verifierJeton(jeton) {
      const { data, error } = await admin.rpc("rapports_verifier_jeton", { p_jeton: jeton });
      if (error) throw error;
      return data === true;
    },
    async utilisateur(jwt) {
      const { data, error } = await admin.auth.getUser(jwt);
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email ?? null };
    },
    async membre(userId) {
      const { data, error } = await admin
        .from("memberships")
        .select("org_id, profil:profiles(nom)")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const profil = data.profil as unknown as { nom: string | null } | null;
      return { orgId: data.org_id, nom: profil?.nom ?? null };
    },
    async reserver(limite) {
      const { data, error } = await admin.rpc("rapports_reserver", { p_limite: limite });
      if (error) throw error;
      return (data ?? []) as Awaited<ReturnType<BaseRapports["reserver"]>>;
    },
    async marquer(userId, envoye) {
      const { error } = await admin.rpc("rapports_marquer", { p_user: userId, p_envoye: envoye });
      if (error) throw error;
    },
    async contenu(orgId) {
      const { data, error } = await admin.rpc("rapports_contenu", { p_org: orgId });
      if (error) throw error;
      return data as Awaited<ReturnType<BaseRapports["contenu"]>>;
    },
  };
}
