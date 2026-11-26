import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientSupabase, DELAI_SESSION_MS } from "./client";

const getSession = vi.fn();
vi.mock("../supabase", () => ({ getSupabase: () => ({ auth: { getSession } }) }));

beforeEach(() => {
  getSession.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("clientSupabase().sessionValide", () => {
  it("dit « ok » quand une session est disponible", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u" } } }, error: null });
    expect(await clientSupabase().sessionValide()).toBe("ok");
  });

  it("dit « reseau » quand le jeton n'a pas pu être renouvelé faute de réseau (la session existe toujours)", async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: { name: "AuthRetryableFetchError", message: "fetch failed" },
    });
    expect(await clientSupabase().sessionValide()).toBe("reseau");
  });

  it("dit « session » quand il n'y a plus de session, ou quand le serveur la refuse", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await clientSupabase().sessionValide()).toBe("session");
    getSession.mockResolvedValue({
      data: { session: null },
      error: { name: "AuthApiError", message: "refresh_token_not_found" },
    });
    expect(await clientSupabase().sessionValide()).toBe("session");
  });

  it("n'attend pas un renouvellement qui réessaie sans fin : passé le délai, c'est le réseau", async () => {
    vi.useFakeTimers();
    getSession.mockReturnValue(new Promise(() => undefined));
    const reponse = clientSupabase().sessionValide();
    await vi.advanceTimersByTimeAsync(DELAI_SESSION_MS + 10);
    expect(await reponse).toBe("reseau");
  });
});
