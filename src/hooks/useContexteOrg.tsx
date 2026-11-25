import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext } from "react";
import { useAuth } from "~/lib/auth";
import { LIMITES_PLAN } from "~/lib/constants";
import type { Enums, Tables } from "~/lib/database.types";
import { joursRestants } from "~/lib/format";
import { getSupabase } from "~/lib/supabase";

export type ContexteOrg = {
  role: Enums<"role_membre">;
  organisation: Pick<
    Tables<"organisations">,
    "id" | "nom" | "plan" | "plan_souhaite" | "essai_fin" | "devise_defaut" | "pays" | "logo_path"
  >;
  profil: Pick<Tables<"profiles">, "id" | "nom" | "email" | "telephone">;
  limites: (typeof LIMITES_PLAN)[Enums<"plan_org">];
  estAdmin: boolean;
  /** Faux quand l'essai est terminé : l'organisation est en lecture seule. */
  peutEcrire: boolean;
  /** Admin ou éditeur, et organisation en écriture. */
  peutEditer: boolean;
  enEssai: boolean;
  joursEssaiRestants: number | null;
};

export function construireContexte(
  role: Enums<"role_membre">,
  organisation: ContexteOrg["organisation"],
  profil: ContexteOrg["profil"],
  maintenant = new Date(),
): ContexteOrg {
  const enEssai = organisation.plan === "essai";
  const essaiActif = new Date(organisation.essai_fin).getTime() > maintenant.getTime();
  const peutEcrire = !enEssai || essaiActif;
  return {
    role,
    organisation,
    profil,
    limites: LIMITES_PLAN[organisation.plan],
    estAdmin: role === "admin",
    peutEcrire,
    peutEditer: peutEcrire && (role === "admin" || role === "editeur"),
    enEssai,
    joursEssaiRestants: enEssai ? joursRestants(organisation.essai_fin, maintenant) : null,
  };
}

export function useRequeteContexteOrg() {
  const { utilisateur } = useAuth();
  return useQuery({
    queryKey: ["contexte-org", utilisateur?.id],
    enabled: Boolean(utilisateur),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("memberships")
        .select(
          "role, organisation:organisations(id, nom, plan, plan_souhaite, essai_fin, devise_defaut, pays, logo_path), profil:profiles(id, nom, email, telephone)",
        )
        .eq("user_id", utilisateur!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data?.organisation || !data.profil) return null;
      return construireContexte(data.role, data.organisation, data.profil);
    },
  });
}

const Contexte = createContext<ContexteOrg | null>(null);

export function ContexteOrgProvider({ valeur, children }: { valeur: ContexteOrg; children: ReactNode }) {
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

/** Contexte de l'organisation courante (disponible sous /app). */
export function useOrg(): ContexteOrg {
  const valeur = useContext(Contexte);
  if (!valeur) throw new Error("useOrg doit être utilisé sous ContexteOrgProvider");
  return valeur;
}
