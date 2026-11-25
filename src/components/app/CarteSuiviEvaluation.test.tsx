import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContexteOrgProvider, construireContexte } from "~/hooks/useContexteOrg";
import { creerFausseBase } from "~/test/fausse-base";
import { CarteSuiviEvaluation } from "./CarteSuiviEvaluation";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

function monter(role: "admin" | "editeur" | "lecteur" = "admin", essaiFini = false) {
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
  const contexte = construireContexte(role, organisation, {
    id: "u",
    nom: "A",
    email: "a@exemple.test",
    telephone: null,
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ContexteOrgProvider valeur={contexte}>
        <CarteSuiviEvaluation />
      </ContexteOrgProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  base.reinitialiser();
  gererErreur.mockReset();
  base.tables.parametres_se = [
    {
      org_id: "o1",
      seuil_vert: 90,
      seuil_ambre: 60,
      frequence_defaut: "mensuelle",
      unites_perso: ["forages"],
      mois_debut_annee_fiscale: 1,
      updated_at: "",
    },
  ];
});

describe("Réglages du suivi-évaluation", () => {
  it("affiche les valeurs de l'organisation", async () => {
    monter();
    expect(await screen.findByLabelText(/Seuil vert/)).toHaveValue("90");
    expect(screen.getByLabelText(/Seuil ambre/)).toHaveValue("60");
    expect(screen.getByLabelText(/Unités personnalisées/)).toHaveValue("forages");
    expect(screen.getByLabelText(/Début de l’année fiscale/)).toHaveValue("1");
  });

  it("refuse un seuil ambre supérieur ou égal au seuil vert", async () => {
    monter();
    fireEvent.change(await screen.findByLabelText(/Seuil ambre/), { target: { value: "95" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(
      await screen.findByText(/Le seuil ambre doit être supérieur à 0 et inférieur au seuil vert/),
    ).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });

  it("enregistre les seuils, la fréquence, le mois fiscal et les unités nettoyées", async () => {
    monter();
    fireEvent.change(await screen.findByLabelText(/Seuil vert/), { target: { value: "85,5" } });
    fireEvent.change(screen.getByLabelText(/Seuil ambre/), { target: { value: "55" } });
    fireEvent.change(screen.getByLabelText(/Fréquence de saisie par défaut/), { target: { value: "trimestrielle" } });
    fireEvent.change(screen.getByLabelText(/Début de l’année fiscale/), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText(/Unités personnalisées/), {
      target: { value: " forages, comités ,, forages ,ménages " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "parametres_se",
      operation: "update",
      valeurs: {
        seuil_vert: 85.5,
        seuil_ambre: 55,
        frequence_defaut: "trimestrielle",
        mois_debut_annee_fiscale: 7,
        unites_perso: ["forages", "comités", "ménages"],
      },
    });
  });

  it("refuse plus de 30 unités", async () => {
    monter();
    const trente_et_une = Array.from({ length: 31 }, (_, i) => `u${i}`).join(", ");
    fireEvent.change(await screen.findByLabelText(/Unités personnalisées/), { target: { value: trente_et_une } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("30 unités au maximum, de 40 caractères chacune.")).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });

  it("est en lecture seule pour un éditeur", async () => {
    monter("editeur");
    expect(await screen.findByLabelText(/Seuil vert/)).toBeDisabled();
    expect(screen.getByText("Seul un administrateur peut modifier ces réglages.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enregistrer" })).not.toBeInTheDocument();
  });

  it("est en lecture seule après la fin d'essai, même pour un administrateur", async () => {
    monter("admin", true);
    expect(await screen.findByLabelText(/Seuil vert/)).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Enregistrer" })).not.toBeInTheDocument();
  });
});
