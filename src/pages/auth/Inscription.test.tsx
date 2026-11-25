import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VERSION_CONDITIONS } from "~/lib/legal";
import Inscription from "./Inscription";

const signUp = vi.fn();
vi.mock("~/lib/supabase", () => ({
  getSupabase: () => ({ auth: { signUp }, rpc: vi.fn().mockResolvedValue({ data: [], error: null }) }),
}));

function afficher(chemin = "/inscription") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[chemin]}>
        <Inscription />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function remplir() {
  fireEvent.change(screen.getByLabelText("Votre nom"), { target: { value: "Awa Diop" } });
  fireEvent.change(screen.getByLabelText(/^Nom de votre organisation/), { target: { value: "ONG Eau Kolda" } });
  fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: "awa@exemple.test" } });
  fireEvent.change(screen.getByLabelText(/^Mot de passe/), { target: { value: "motdepasse1" } });
}

beforeEach(() => {
  signUp.mockReset();
  signUp.mockResolvedValue({ data: { session: null }, error: null });
});

describe("Inscription : acceptation des conditions", () => {
  it("propose une case jamais précochée, avec les deux textes ouverts dans un nouvel onglet", () => {
    afficher();
    const case_ = screen.getByRole("checkbox", { name: /J’ai lu et j’accepte/ });
    expect(case_).not.toBeChecked();
    const conditions = screen.getByRole("link", { name: "conditions d’utilisation" });
    expect(conditions).toHaveAttribute("href", "/conditions-utilisation");
    expect(conditions).toHaveAttribute("target", "_blank");
    expect(conditions).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    const confidentialite = screen.getByRole("link", { name: "politique de confidentialité" });
    expect(confidentialite).toHaveAttribute("href", "/confidentialite");
    expect(confidentialite).toHaveAttribute("target", "_blank");
  });

  it("refuse de créer le compte tant que les conditions ne sont pas acceptées", async () => {
    afficher();
    remplir();
    fireEvent.click(screen.getByRole("button", { name: "Créer mon espace" }));
    expect(
      await screen.findByText(
        "Cochez la case pour accepter les conditions d’utilisation et la politique de confidentialité.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /J’ai lu et j’accepte/ })).toHaveAttribute("aria-invalid", "true");
    expect(signUp).not.toHaveBeenCalled();
  });

  it("transmet la version acceptée, sans date : l'horloge est celle de la base", async () => {
    afficher("/inscription?plan=pro");
    remplir();
    fireEvent.click(screen.getByRole("checkbox", { name: /J’ai lu et j’accepte/ }));
    fireEvent.click(screen.getByRole("button", { name: "Créer mon espace" }));
    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    const { options } = signUp.mock.calls[0]![0] as { options: { data: Record<string, string> } };
    expect(options.data).toMatchObject({ nom: "Awa Diop", organisation: "ONG Eau Kolda", plan: "pro" });
    expect(options.data.conditions_version).toBe(VERSION_CONDITIONS);
    expect(options.data).not.toHaveProperty("conditions_acceptees_le");
  });
});
