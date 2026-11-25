import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContexteOrgProvider } from "~/hooks/useContexteOrg";
import { creerFausseBase } from "~/test/fausse-base";
import { creerContexteOrg } from "~/test/monter-projet";
import { BandeauEssai } from "./BandeauEssai";

const base = creerFausseBase();
const invoke = vi.fn();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => ({ ...base.client, functions: { invoke } }) }));

function monter(role: "admin" | "editeur") {
  // Essai terminé : le bandeau est permanent, c'est là que « Payer en ligne » est utile.
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ContexteOrgProvider valeur={creerContexteOrg(role, true)}>
        <MemoryRouter>
          <BandeauEssai />
        </MemoryRouter>
      </ContexteOrgProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => invoke.mockReset());

describe("Bandeau de fin d'essai : paiement en ligne", () => {
  it("propose « Payer en ligne » à un administrateur quand le serveur confirme que le paiement est configuré", async () => {
    invoke.mockResolvedValue({ data: { disponible: true, mode: "test", plans: [] }, error: null });
    monter("admin");
    const lien = await screen.findByRole("link", { name: "Payer en ligne" });
    expect(lien).toHaveAttribute("href", "/app/parametres#abonnement");
    expect(screen.getByText(/Votre essai est terminé/)).toBeInTheDocument();
  });

  it("ne propose rien tant que le paiement en ligne n'est pas configuré, ou si la fonction répond en erreur", async () => {
    invoke.mockResolvedValue({ data: { disponible: false }, error: null });
    const { unmount } = monter("admin");
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("link", { name: "Payer en ligne" })).not.toBeInTheDocument();
    unmount();
    invoke.mockResolvedValue({ data: null, error: new Error("réseau") });
    monter("admin");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("link", { name: "Payer en ligne" })).not.toBeInTheDocument();
  });

  it("ne propose rien à un éditeur, et n'interroge même pas le serveur", async () => {
    invoke.mockResolvedValue({ data: { disponible: true, mode: "test", plans: [] }, error: null });
    monter("editeur");
    await new Promise((r) => setTimeout(r, 50));
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Payer en ligne" })).not.toBeInTheDocument();
    expect(screen.getByText(/Votre essai est terminé/)).toBeInTheDocument();
  });
});
