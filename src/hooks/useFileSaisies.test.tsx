import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BandeauReseau } from "~/components/app/hors-ligne/BandeauReseau";
import { ContexteAuth } from "~/lib/auth";
import { MagasinFile, type NouvelleSaisie } from "~/lib/hors-ligne/file";
import { creerClientSaisies, simulerReseau } from "~/test/client-saisies";
import { COMPTE_DE_TEST, creerContexteOrg } from "~/test/monter-projet";
import { creerStockageMemoire } from "~/test/stockage-memoire";
import { ContexteOrgProvider } from "./useContexteOrg";
import { FileSaisiesProvider, useFileSaisies } from "./useFileSaisies";

const nouvelle = (id: string, extra: Partial<NouvelleSaisie> = {}): NouvelleSaisie => ({
  id,
  utilisateurId: "u",
  orgId: "o1",
  projetId: "p1",
  kpiId: "k1",
  date: "2026-03-01",
  valeur: 12,
  commentaire: null,
  localiteId: null,
  ...extra,
});

function Declencheur() {
  const { demanderDeconnexion } = useFileSaisies();
  return <button onClick={demanderDeconnexion}>Quitter</button>;
}

function monter(magasin: MagasinFile, client = creerClientSaisies()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ContexteAuth.Provider value={COMPTE_DE_TEST}>
        <ContexteOrgProvider valeur={creerContexteOrg()}>
          <MemoryRouter>
            <FileSaisiesProvider magasin={magasin} client={client}>
              <BandeauReseau />
              <Declencheur />
            </FileSaisiesProvider>
          </MemoryRouter>
        </ContexteOrgProvider>
      </ContexteAuth.Provider>
    </QueryClientProvider>,
  );
  return client;
}

const magasinAvec = (...saisies: NouvelleSaisie[]) => {
  const magasin = new MagasinFile(creerStockageMemoire(), "u");
  for (const s of saisies) magasin.ajouter(s);
  return magasin;
};

beforeEach(() => {
  COMPTE_DE_TEST.seDeconnecter.mockClear();
  simulerReseau(true);
});
afterEach(() => vi.restoreAllMocks());

describe("Déconnexion avec des saisies non envoyées", () => {
  it("se déconnecte tout de suite quand rien n'attend", () => {
    monter(magasinAvec());
    fireEvent.click(screen.getByRole("button", { name: "Quitter" }));
    expect(COMPTE_DE_TEST.seDeconnecter).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("bloque la déconnexion et dit combien de saisies n'ont pas été envoyées", () => {
    simulerReseau(false);
    monter(magasinAvec(nouvelle("a"), nouvelle("b", { date: "2026-03-02" })));
    fireEvent.click(screen.getByRole("button", { name: "Quitter" }));
    const dialogue = screen.getByRole("dialog");
    expect(within(dialogue).getByText("Des saisies n’ont pas été envoyées")).toBeInTheDocument();
    expect(within(dialogue).getByText(/2 saisies sont enregistrées sur cet appareil/)).toBeInTheDocument();
    expect(COMPTE_DE_TEST.seDeconnecter).not.toHaveBeenCalled();
    fireEvent.click(within(dialogue).getByRole("button", { name: "Rester connecté" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(COMPTE_DE_TEST.seDeconnecter).not.toHaveBeenCalled();
  });

  it("hors ligne, l'envoi est impossible et le dit", () => {
    simulerReseau(false);
    monter(magasinAvec(nouvelle("a")));
    fireEvent.click(screen.getByRole("button", { name: "Quitter" }));
    const dialogue = screen.getByRole("dialog");
    expect(within(dialogue).getByText(/l’envoi demande une connexion/)).toBeInTheDocument();
    expect(within(dialogue).getByRole("button", { name: "Envoyer maintenant" })).toBeDisabled();
  });

  it("envoie d'abord, puis propose de se déconnecter une fois tout parti", async () => {
    // Le bandeau envoie tout seul au montage : on l'empêche pour laisser la main au bouton du dialogue.
    simulerReseau(false);
    const client = monter(magasinAvec(nouvelle("a")));
    fireEvent.click(screen.getByRole("button", { name: "Quitter" }));
    await act(async () => simulerReseau(true));
    await waitFor(() => expect(client.inserer).toHaveBeenCalledTimes(1));
    const dialogue = await screen.findByRole("dialog");
    expect(await within(dialogue).findByText("Tout est envoyé")).toBeInTheDocument();
    expect(COMPTE_DE_TEST.seDeconnecter).not.toHaveBeenCalled();
    fireEvent.click(within(dialogue).getByRole("button", { name: "Se déconnecter" }));
    expect(COMPTE_DE_TEST.seDeconnecter).toHaveBeenCalledTimes(1);
  });

  it("supprime les saisies et se déconnecte seulement après une confirmation explicite", () => {
    simulerReseau(false);
    const magasin = magasinAvec(nouvelle("a"), nouvelle("b", { date: "2026-03-02" }));
    monter(magasin);
    fireEvent.click(screen.getByRole("button", { name: "Quitter" }));
    fireEvent.click(screen.getByRole("button", { name: "Supprimer ces saisies et me déconnecter" }));
    // Première étape : on demande confirmation, rien n'est encore supprimé.
    expect(screen.getByText(/2 saisies seront supprimées de cet appareil/)).toBeInTheDocument();
    expect(magasin.lister()).toHaveLength(2);
    expect(COMPTE_DE_TEST.seDeconnecter).not.toHaveBeenCalled();
    // Annuler revient en arrière.
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(magasin.lister()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Supprimer ces saisies et me déconnecter" }));
    fireEvent.click(screen.getByRole("button", { name: "Supprimer 2 saisies et me déconnecter" }));
    expect(magasin.lister()).toEqual([]);
    expect(COMPTE_DE_TEST.seDeconnecter).toHaveBeenCalledTimes(1);
  });

  it("une saisie refusée ou en conflit bloque aussi, et n'est pas envoyée", () => {
    simulerReseau(false);
    const magasin = magasinAvec(nouvelle("a"));
    magasin.modifier("a", { statut: "refusee", erreurCle: "erreurs.ESSAI_EXPIRE" });
    monter(magasin);
    fireEvent.click(screen.getByRole("button", { name: "Quitter" }));
    const dialogue = screen.getByRole("dialog");
    expect(within(dialogue).getByText(/1 saisie est refusée ou en conflit/)).toBeInTheDocument();
    expect(within(dialogue).getByRole("button", { name: "Envoyer maintenant" })).toBeDisabled();
  });
});

describe("BandeauReseau", () => {
  it("n'affiche rien en ligne quand tout est envoyé", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ContexteAuth.Provider value={COMPTE_DE_TEST}>
          <ContexteOrgProvider valeur={creerContexteOrg()}>
            <MemoryRouter>
              <FileSaisiesProvider magasin={magasinAvec()} client={creerClientSaisies()}>
                <BandeauReseau />
              </FileSaisiesProvider>
            </MemoryRouter>
          </ContexteOrgProvider>
        </ContexteAuth.Provider>
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("dit que la saisie reste possible hors ligne, et combien de saisies attendent", () => {
    simulerReseau(false);
    monter(magasinAvec(nouvelle("a")));
    expect(screen.getByText(/Vous êtes hors ligne\. Vous pouvez continuer à saisir/)).toBeInTheDocument();
    expect(screen.getByText(/1 saisie attend d’être envoyée/)).toBeInTheDocument();
  });

  it("propose d'envoyer maintenant quand des saisies attendent malgré une connexion annoncée", async () => {
    const client = creerClientSaisies({
      inserer: vi.fn(() => Promise.resolve({ name: "TypeError", message: "Failed to fetch" })),
    });
    monter(magasinAvec(nouvelle("a")), client);
    // L'envoi automatique échoue (connexion instable) : le bandeau le dit et garde le bouton.
    expect(await screen.findByText(/La connexion est instable : l’envoi sera retenté/)).toBeInTheDocument();
    client.inserer.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole("button", { name: "Envoyer maintenant" }));
    await waitFor(() => expect(client.inserer).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/attend d’être envoyée/)).not.toBeInTheDocument());
  });

  it("demande de se reconnecter quand la session n'est plus valide", async () => {
    const client = creerClientSaisies({ sessionValide: vi.fn(() => Promise.resolve("session" as const)) });
    monter(magasinAvec(nouvelle("a")), client);
    expect(await screen.findByText(/Reconnectez-vous pour l’envoyer/)).toBeInTheDocument();
    expect(client.inserer).not.toHaveBeenCalled();
  });

  it("signale les saisies qui demandent de l'attention, avec un lien vers la page de saisie du projet", () => {
    const magasin = magasinAvec(nouvelle("a", { projetId: "p42" }));
    magasin.modifier("a", { statut: "conflit", valeurServeur: 9, idServeur: "s" });
    monter(magasin);
    expect(screen.getByText(/1 saisie demande votre attention/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir" })).toHaveAttribute("href", "/app/projets/p42/saisie");
  });
});
