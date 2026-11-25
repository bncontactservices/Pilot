import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContexteOrgProvider } from "~/hooks/useContexteOrg";
import { creerFausseBase } from "~/test/fausse-base";
import { creerContexteOrg } from "~/test/monter-projet";
import { CarteAbonnement } from "./CarteAbonnement";

const base = creerFausseBase();
const invoke = vi.fn();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => ({ ...base.client, functions: { invoke } }) }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

const PLANS = [
  { plan: "starter", periodicite: "mensuelle", montant: 2500, devise: "EUR" },
  { plan: "starter", periodicite: "annuelle", montant: 24000, devise: "EUR" },
  { plan: "pro", periodicite: "mensuelle", montant: 5000, devise: "EUR" },
  { plan: "pro", periodicite: "annuelle", montant: 48000, devise: "EUR" },
];
const DISPONIBLE = { data: { disponible: true, mode: "test", plans: PLANS }, error: null };
const NON_DISPONIBLE = { data: { disponible: false }, error: null };

/** Répond à stripe-checkout/« etat » avec `etat`, et à tout autre appel avec `autres`. */
function repondre(
  etat: unknown,
  autres: (nom: string, corps: Record<string, unknown>) => unknown = () => ({
    data: { url: "https://checkout.stripe.com/x" },
    error: null,
  }),
) {
  invoke.mockImplementation(async (nom: string, options: { body: Record<string, unknown> }) =>
    options.body.action === "etat" ? etat : autres(nom, options.body),
  );
}

function monter(role: "admin" | "editeur" = "admin", { essaiFini = false, recherche = "" } = {}) {
  const contexte = creerContexteOrg(role, essaiFini);
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ContexteOrgProvider valeur={contexte}>
        <MemoryRouter initialEntries={[`/app/parametres${recherche}`]}>
          <CarteAbonnement />
        </MemoryRouter>
      </ContexteOrgProvider>
    </QueryClientProvider>,
  );
}

const abonnement = (extra = {}) => ({
  org_id: "o1",
  plan: "pro",
  periodicite: "mensuelle",
  statut: "active",
  periode_fin: "2026-12-25T10:00:00Z",
  annule_en_fin_de_periode: false,
  updated_at: "",
  ...extra,
});

const assign = vi.fn();
beforeEach(() => {
  base.reinitialiser();
  invoke.mockReset();
  gererErreur.mockReset();
  assign.mockReset();
  vi.stubGlobal("location", { ...window.location, assign });
});
afterEach(() => vi.unstubAllGlobals());

describe("Abonnement en ligne : ce qui s'affiche", () => {
  it("n'affiche rien à un éditeur, sans même interroger le serveur", async () => {
    repondre(DISPONIBLE);
    const { container } = monter("editeur");
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("n'affiche rien tant que le paiement en ligne n'est pas configuré et qu'il n'y a jamais eu d'abonnement", async () => {
    repondre(NON_DISPONIBLE);
    const { container } = monter();
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it("n'affiche rien non plus quand la fonction n'est pas déployée ou répond en erreur", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("Failed to send a request to the Edge Function") });
    const { container } = monter();
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it("propose les plans que le serveur confirme, avec leur prix, leurs limites, et dit qu'on est en mode test", async () => {
    repondre(DISPONIBLE);
    monter();
    expect(await screen.findByRole("heading", { name: /Abonnement en ligne/ })).toBeInTheDocument();
    expect(screen.getByText(/Mode test : aucun paiement réel/)).toBeInTheDocument();
    expect(screen.getByText(/4242 4242 4242 4242/)).toBeInTheDocument();
    const pro = screen.getByRole("heading", { name: "Pro" }).closest("li")!;
    expect(within(pro).getByText(/50,00\s€ par mois/)).toBeInTheDocument();
    expect(within(pro).getByText("3 projets, 20 indicateurs par projet, 5 utilisateurs")).toBeInTheDocument();
    const starter = screen.getByRole("heading", { name: "Starter" }).closest("li")!;
    expect(within(starter).getByText("1 projet, 5 indicateurs par projet, 1 utilisateur")).toBeInTheDocument();
  });

  it("bascule en annuel avec le prix de l'année et son équivalent mensuel", async () => {
    repondre(DISPONIBLE);
    monter();
    fireEvent.click(await screen.findByRole("radio", { name: "Annuel" }));
    const pro = screen.getByRole("heading", { name: "Pro" }).closest("li")!;
    expect(within(pro).getByText(/480,00\s€ par an/)).toBeInTheDocument();
    expect(within(pro).getByText(/soit 40,00\s€ par mois/)).toBeInTheDocument();
  });

  it("n'annonce pas le mode test quand la clé est une clé de production", async () => {
    repondre({ data: { disponible: true, mode: "live", plans: PLANS }, error: null });
    monter();
    await screen.findByRole("heading", { name: /Abonnement en ligne/ });
    expect(screen.queryByText(/Mode test/)).not.toBeInTheDocument();
  });

  it("n'affiche que les périodes pour lesquelles un prix est configuré", async () => {
    repondre({
      data: { disponible: true, mode: "test", plans: PLANS.filter((p) => p.periodicite === "mensuelle") },
      error: null,
    });
    monter();
    await screen.findByRole("heading", { name: "Pro" });
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});

describe("Abonnement en ligne : souscrire", () => {
  it("envoie le plan et la périodicité choisis au serveur, puis redirige vers l'adresse qu'il renvoie", async () => {
    repondre(DISPONIBLE);
    monter();
    fireEvent.click(await screen.findByRole("button", { name: "Souscrire à Pro" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/x"));
    expect(invoke).toHaveBeenCalledWith("stripe-checkout", {
      body: { action: "souscrire", plan: "pro", periodicite: "mensuelle" },
    });
  });

  it("souscrit au plan annuel quand c'est la période choisie", async () => {
    repondre(DISPONIBLE);
    monter();
    fireEvent.click(await screen.findByRole("radio", { name: "Annuel" }));
    fireEvent.click(screen.getByRole("button", { name: "Souscrire à Starter" }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("stripe-checkout", {
      body: { action: "souscrire", plan: "starter", periodicite: "annuelle" },
    });
  });

  it("transmet l'erreur du serveur à la gestion d'erreurs, sans rediriger", async () => {
    repondre(DISPONIBLE, () => ({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify({ erreur: "ABONNEMENT_EXISTE" }), { status: 409 })),
    }));
    monter();
    fireEvent.click(await screen.findByRole("button", { name: "Souscrire à Pro" }));
    await waitFor(() => expect(gererErreur).toHaveBeenCalled());
    expect((gererErreur.mock.calls[0]![0] as Error).message).toBe("ABONNEMENT_EXISTE");
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("Abonnement en ligne : abonnement existant", () => {
  it("montre le plan, le statut et le renouvellement, et ouvre le portail ; plus aucune offre", async () => {
    base.tables.abonnements = [abonnement()];
    repondre(DISPONIBLE, (nom) => ({
      data: { url: nom === "stripe-portal" ? "https://billing.stripe.com/p/x" : "?" },
      error: null,
    }));
    monter();
    expect(await screen.findByText("Abonnement Pro mensuel")).toBeInTheDocument();
    expect(screen.getByText("Statut : actif")).toBeInTheDocument();
    expect(screen.getByText("Prochain renouvellement le 25 décembre 2026.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Souscrire/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gérer l’abonnement" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://billing.stripe.com/p/x"));
    expect(invoke).toHaveBeenCalledWith("stripe-portal", { body: {} });
  });

  it("dit que l'abonnement ne sera pas reconduit quand il est annulé en fin de période", async () => {
    base.tables.abonnements = [abonnement({ annule_en_fin_de_periode: true })];
    repondre(DISPONIBLE);
    monter();
    expect(
      await screen.findByText("L’abonnement se termine le 25 décembre 2026 et ne sera pas reconduit."),
    ).toBeInTheDocument();
  });

  it("alerte sur un paiement en retard et renvoie vers le portail", async () => {
    base.tables.abonnements = [abonnement({ statut: "past_due" })];
    repondre(DISPONIBLE);
    monter();
    expect(await screen.findByText(/Le dernier paiement a échoué/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gérer l’abonnement" })).toBeInTheDocument();
  });

  it("explique la lecture seule après une résiliation et propose de souscrire de nouveau", async () => {
    base.tables.abonnements = [abonnement({ statut: "canceled" })];
    repondre(DISPONIBLE);
    monter("admin", { essaiFini: true });
    expect(
      await screen.findByText(/L’abonnement est terminé : l’organisation est en lecture seule/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Souscrire à Pro" })).toBeInTheDocument();
  });

  it("reste lisible, sans bouton qui ne marcherait pas, quand le paiement en ligne n'est plus configuré", async () => {
    base.tables.abonnements = [abonnement()];
    repondre(NON_DISPONIBLE);
    monter();
    expect(await screen.findByText("Abonnement Pro mensuel")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gérer l’abonnement" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Souscrire/ })).not.toBeInTheDocument();
  });
});

describe("Abonnement en ligne : retour de la page de paiement", () => {
  it("dit que le paiement est annulé et que rien n'a été débité", async () => {
    repondre(DISPONIBLE);
    monter("admin", { recherche: "?paiement=annule" });
    expect(await screen.findByText("Paiement annulé : rien n’a été débité.")).toBeInTheDocument();
  });

  it("attend l'activation du plan, puis dit que l'activation est plus lente que prévu", async () => {
    repondre(DISPONIBLE);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      // Essai terminé : le plan n'a pas encore changé, on attend que Stripe prévienne l'application.
      monter("admin", { essaiFini: true, recherche: "?paiement=succes" });
      expect(await screen.findByText("Paiement reçu. Activation de votre plan en cours…")).toBeInTheDocument();
      expect(screen.queryByText(/prend plus de temps/)).not.toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(43_000);
      });
      expect(await screen.findByText(/L’activation prend plus de temps que prévu/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("n'attend rien quand le plan est déjà actif", async () => {
    repondre(DISPONIBLE);
    const { container } = monter("admin", { recherche: "?paiement=succes" });
    await screen.findByRole("heading", { name: /Abonnement en ligne/ });
    expect(screen.queryByText(/Activation de votre plan en cours/)).not.toBeInTheDocument();
    expect(container).not.toBeEmptyDOMElement();
  });
});
