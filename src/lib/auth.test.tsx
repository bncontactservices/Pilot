import type { Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, DELAI_OUVERTURE_SESSION_MS, useAuth } from "./auth";
import { type EnregistrementCache, type StockageCache, VERSION_CACHE } from "./hors-ligne/cache";

vi.mock("./env", () => ({
  env: { supabaseUrl: "https://abc123.supabase.co", supabaseAnonKey: "cle" },
  supabaseConfigure: true,
}));

type Rappel = (evenement: string, session: Session | null) => void;
const auth = {
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
};
let rappelAuth: Rappel = () => undefined;
vi.mock("./supabase", () => ({ getSupabase: () => ({ auth }) }));

// IndexedDB n'existe pas sous jsdom : on remplace son adaptateur par un stockage en mémoire.
let contenu: EnregistrementCache | undefined;
const stockage: StockageCache = {
  lire: () => Promise.resolve(contenu),
  ecrire: (e) => {
    contenu = e;
    return Promise.resolve();
  },
  effacer: () => {
    contenu = undefined;
    return Promise.resolve();
  },
};
vi.mock("./hors-ligne/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./hors-ligne/cache")>()),
  stockageIndexedDb: () => stockage,
}));

const session = (id: string): Session =>
  ({
    access_token: "a",
    refresh_token: "r",
    expires_at: 1,
    user: { id, email: `${id}@exemple.test` },
  }) as unknown as Session;

const erreurReseau = { name: "AuthRetryableFetchError", message: "fetch failed" };

let client: QueryClient;
const vu: { courant: ReturnType<typeof useAuth> | null } = { courant: null };
function Sonde() {
  const etat = useAuth();
  useEffect(() => {
    vu.courant = etat;
  });
  return <p data-testid="statut">{etat.statut}</p>;
}
function monter() {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <Sonde />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const gardees = (proprietaire: string): EnregistrementCache => ({
  version: VERSION_CACHE,
  proprietaire,
  enregistreLe: Date.now(),
  requetes: [{ cle: ["kpis", "p1"], donnees: [{ id: "k1" }], misAJourLe: 500 }],
});

beforeEach(() => {
  client = new QueryClient();
  contenu = undefined;
  localStorage.clear();
  auth.getSession.mockReset();
  auth.signOut.mockReset().mockResolvedValue({ error: null });
  auth.onAuthStateChange.mockReset().mockImplementation((rappel: Rappel) => {
    rappelAuth = rappel;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});
afterEach(() => vi.restoreAllMocks());

describe("AuthProvider : ouverture", () => {
  it("restaure les données gardées du compte avant de rendre la main à l'application", async () => {
    contenu = gardees("u1");
    auth.getSession.mockResolvedValue({ data: { session: session("u1") }, error: null });
    monter();
    await waitFor(() => expect(screen.getByTestId("statut")).toHaveTextContent("connecte"));
    // Au moment où l'état passe à « connecté », les données sont déjà là : pas d'écran vide ni d'erreur.
    expect(client.getQueryData(["kpis", "p1"])).toEqual([{ id: "k1" }]);
  });

  it("ne restaure rien d'un autre compte, et l'efface", async () => {
    contenu = gardees("autre");
    auth.getSession.mockResolvedValue({ data: { session: session("u1") }, error: null });
    monter();
    await waitFor(() => expect(screen.getByTestId("statut")).toHaveTextContent("connecte"));
    expect(client.getQueryData(["kpis", "p1"])).toBeUndefined();
    expect(contenu).toBeUndefined();
  });

  it("sans réseau et avec un jeton périmé, ouvre l'application avec la session gardée sur l'appareil", async () => {
    contenu = gardees("u1");
    localStorage.setItem("sb-abc123-auth-token", JSON.stringify(session("u1")));
    auth.getSession.mockResolvedValue({ data: { session: null }, error: erreurReseau });
    monter();
    await waitFor(() => expect(screen.getByTestId("statut")).toHaveTextContent("connecte"));
    expect(vu.courant?.utilisateur?.id).toBe("u1");
    expect(client.getQueryData(["kpis", "p1"])).toEqual([{ id: "k1" }]);
  });

  it("sans réseau et sans session gardée, renvoie vers la connexion", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: erreurReseau });
    monter();
    await waitFor(() => expect(screen.getByTestId("statut")).toHaveTextContent("anonyme"));
  });

  it("un refus du serveur (session révoquée) n'est pas pris pour une absence de réseau", async () => {
    localStorage.setItem("sb-abc123-auth-token", JSON.stringify(session("u1")));
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: { name: "AuthApiError", message: "refresh_token_not_found" },
    });
    monter();
    await waitFor(() => expect(screen.getByTestId("statut")).toHaveTextContent("anonyme"));
  });

  it("l'événement initial « pas de session » de supabase-js n'écrase pas la reprise hors ligne", async () => {
    localStorage.setItem("sb-abc123-auth-token", JSON.stringify(session("u1")));
    auth.getSession.mockResolvedValue({ data: { session: null }, error: erreurReseau });
    monter();
    await waitFor(() => expect(screen.getByTestId("statut")).toHaveTextContent("connecte"));
    act(() => rappelAuth("INITIAL_SESSION", null));
    expect(screen.getByTestId("statut")).toHaveTextContent("connecte");
  });

  it("reprend la session renouvelée quand le réseau revient", async () => {
    localStorage.setItem("sb-abc123-auth-token", JSON.stringify(session("u1")));
    auth.getSession.mockResolvedValue({ data: { session: null }, error: erreurReseau });
    monter();
    await waitFor(() => expect(screen.getByTestId("statut")).toHaveTextContent("connecte"));
    const renouvelee = { ...session("u1"), access_token: "neuf" };
    act(() => rappelAuth("TOKEN_REFRESHED", renouvelee));
    expect(vu.courant?.session?.access_token).toBe("neuf");
  });
});

describe("AuthProvider : renouvellement du jeton qui tarde", () => {
  afterEach(() => vi.useRealTimers());

  it("n'attend pas le renouvellement quand une session est gardée : l'application s'ouvre avec elle après un court délai", async () => {
    vi.useFakeTimers();
    contenu = gardees("u1");
    localStorage.setItem("sb-abc123-auth-token", JSON.stringify(session("u1")));
    // Sans réseau, supabase-js réessaie une trentaine de secondes avant de répondre.
    auth.getSession.mockReturnValue(new Promise(() => undefined));
    monter();
    await act(async () => vi.advanceTimersByTimeAsync(DELAI_OUVERTURE_SESSION_MS - 100));
    expect(screen.getByTestId("statut")).toHaveTextContent("chargement");
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(screen.getByTestId("statut")).toHaveTextContent("connecte");
    expect(vu.courant?.utilisateur?.id).toBe("u1");
    expect(client.getQueryData(["kpis", "p1"])).toEqual([{ id: "k1" }]);
  });

  it("sans session gardée, attend la réponse de supabase-js, aussi longue soit-elle", async () => {
    vi.useFakeTimers();
    let repondre!: (valeur: unknown) => void;
    auth.getSession.mockReturnValue(new Promise((resolve) => (repondre = resolve)));
    monter();
    await act(async () => vi.advanceTimersByTimeAsync(DELAI_OUVERTURE_SESSION_MS * 3));
    expect(screen.getByTestId("statut")).toHaveTextContent("chargement");
    await act(async () => repondre({ data: { session: session("u1") }, error: null }));
    expect(screen.getByTestId("statut")).toHaveTextContent("connecte");
  });

  it("la session reprise s'actualise quand le renouvellement finit par réussir", async () => {
    vi.useFakeTimers();
    localStorage.setItem("sb-abc123-auth-token", JSON.stringify(session("u1")));
    auth.getSession.mockReturnValue(new Promise(() => undefined));
    monter();
    await act(async () => vi.advanceTimersByTimeAsync(DELAI_OUVERTURE_SESSION_MS + 100));
    expect(screen.getByTestId("statut")).toHaveTextContent("connecte");
    act(() => rappelAuth("TOKEN_REFRESHED", { ...session("u1"), access_token: "neuf" }));
    expect(vu.courant?.session?.access_token).toBe("neuf");
  });

  it("la session reprise est abandonnée si le serveur la refuse ensuite", async () => {
    vi.useFakeTimers();
    localStorage.setItem("sb-abc123-auth-token", JSON.stringify(session("u1")));
    auth.getSession.mockReturnValue(new Promise(() => undefined));
    monter();
    await act(async () => vi.advanceTimersByTimeAsync(DELAI_OUVERTURE_SESSION_MS + 100));
    act(() => rappelAuth("SIGNED_OUT", null));
    expect(screen.getByTestId("statut")).toHaveTextContent("anonyme");
  });
});

describe("AuthProvider : déconnexion et changement de compte", () => {
  it("efface les données gardées à la déconnexion", async () => {
    contenu = gardees("u1");
    auth.getSession.mockResolvedValue({ data: { session: session("u1") }, error: null });
    monter();
    await waitFor(() => expect(screen.getByTestId("statut")).toHaveTextContent("connecte"));
    act(() => rappelAuth("SIGNED_OUT", null));
    expect(screen.getByTestId("statut")).toHaveTextContent("anonyme");
    expect(client.getQueryData(["kpis", "p1"])).toBeUndefined();
    await waitFor(() => expect(contenu).toBeUndefined());
  });

  it("jette les données du compte précédent quand un autre compte se connecte", async () => {
    contenu = gardees("u1");
    auth.getSession.mockResolvedValue({ data: { session: session("u1") }, error: null });
    monter();
    await waitFor(() => expect(screen.getByTestId("statut")).toHaveTextContent("connecte"));
    act(() => rappelAuth("SIGNED_IN", session("u2")));
    expect(client.getQueryData(["kpis", "p1"])).toBeUndefined();
    await waitFor(() => expect(contenu).toBeUndefined());
  });

  it("se déconnecte sur l'appareil seulement quand il n'y a pas de réseau", async () => {
    auth.getSession.mockResolvedValue({ data: { session: session("u1") }, error: null });
    monter();
    await waitFor(() => expect(screen.getByTestId("statut")).toHaveTextContent("connecte"));
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    await act(() => vu.courant!.seDeconnecter());
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("retombe sur une déconnexion locale quand le serveur répond mal", async () => {
    auth.getSession.mockResolvedValue({ data: { session: session("u1") }, error: null });
    auth.signOut.mockResolvedValueOnce({ error: erreurReseau });
    monter();
    await waitFor(() => expect(screen.getByTestId("statut")).toHaveTextContent("connecte"));
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    await act(() => vu.courant!.seDeconnecter());
    expect(auth.signOut.mock.calls.map(([a]) => a)).toEqual([{ scope: "global" }, { scope: "local" }]);
  });
});
