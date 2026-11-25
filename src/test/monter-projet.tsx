// Montage commun des tests d'onglets de projet : contexte d'organisation, react-query, routeur et contexte du projet.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import type { User } from "@supabase/supabase-js";
import { vi } from "vitest";
import { ContexteOrgProvider, construireContexte } from "~/hooks/useContexteOrg";
import { FileSaisiesProvider } from "~/hooks/useFileSaisies";
import { ContexteAuth } from "~/lib/auth";
import type { Kpi, Projet, SaisieLigne } from "~/lib/donnees";
import { MagasinFile } from "~/lib/hors-ligne/file";
import type { ClientSaisies } from "~/lib/hors-ligne/synchro";
import { creerStockageMemoire } from "./stockage-memoire";

export const PROJET = {
  id: "p1",
  org_id: "o1",
  nom: "Eau Kolda",
  date_debut: "2026-01-01",
  date_fin: "2027-06-30",
  devise: "XOF",
  statut: "en_cours",
  is_demo: false,
  programme_id: null,
  secteur: null,
} as unknown as Projet;

/** Contexte d'organisation de test : un rôle, un essai en cours ou terminé. */
export function creerContexteOrg(role: "admin" | "editeur" | "lecteur" = "editeur", essaiFini = false) {
  const organisation = {
    id: "o1",
    nom: "ONG Eau",
    plan: essaiFini ? ("essai" as const) : ("pro" as const),
    plan_souhaite: null,
    essai_fin: essaiFini ? "2020-01-01T00:00:00Z" : "2099-01-01T00:00:00Z",
    devise_defaut: "XOF",
    pays: "SN",
    logo_path: null,
  };
  return construireContexte(role, organisation, {
    id: "u",
    nom: "A",
    email: "a@exemple.test",
    telephone: null,
  });
}

/** Compte factice sous lequel montent les écrans (la file de saisies hors ligne en a besoin). */
export const COMPTE_DE_TEST = {
  statut: "connecte" as const,
  session: null,
  utilisateur: { id: "u" } as User,
  seDeconnecter: vi.fn(() => Promise.resolve()),
};

export function monterProjet(
  page: ReactElement,
  options: {
    role?: "admin" | "editeur" | "lecteur";
    essaiFini?: boolean;
    kpis?: Kpi[];
    saisies?: SaisieLigne[];
    /** File de saisies hors ligne et base d'envoi ; par défaut : une file vide en mémoire et la base du test. */
    magasin?: MagasinFile;
    client?: ClientSaisies;
  } = {},
) {
  const { role = "editeur", essaiFini = false, kpis = [], saisies = [], client } = options;
  const magasin = options.magasin ?? new MagasinFile(creerStockageMemoire(), "u");
  const contexte = creerContexteOrg(role, essaiFini);
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ContexteAuth.Provider value={COMPTE_DE_TEST}>
        <ContexteOrgProvider valeur={contexte}>
          <FileSaisiesProvider magasin={magasin} client={client}>
            <MemoryRouter initialEntries={["/"]}>
              <Routes>
                <Route element={<Outlet context={{ projet: PROJET, kpis, saisies }} />}>
                  <Route index element={page} />
                </Route>
              </Routes>
            </MemoryRouter>
          </FileSaisiesProvider>
        </ContexteOrgProvider>
      </ContexteAuth.Provider>
    </QueryClientProvider>,
  );
}
