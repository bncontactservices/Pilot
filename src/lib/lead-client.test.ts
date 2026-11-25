import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./env", () => ({
  env: { supabaseUrl: "https://exemple.supabase.co", supabaseAnonKey: "cle-publique" },
  supabaseConfigure: true,
}));

import { envoyerLead } from "./lead-client";

const lead = {
  type_demande: "demo",
  nom: "Awa Diop",
  organisation: "ONG Eau Vive",
  email: "awa@exemple.org",
  besoin: null,
} as const;
const reponse = (statut: number, corps: unknown) => new Response(JSON.stringify(corps), { status: statut });

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("envoyerLead", () => {
  it("envoie la demande à la fonction avec la clé publique, le piège vide et le jeton éventuel", async () => {
    vi.mocked(fetch).mockResolvedValue(reponse(200, { ok: true }));
    expect(await envoyerLead(lead, { turnstile: "jeton" })).toEqual({ ok: true });
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("https://exemple.supabase.co/functions/v1/submit-lead");
    expect((init!.headers as Record<string, string>).apikey).toBe("cle-publique");
    expect(JSON.parse(init!.body as string)).toEqual({ ...lead, turnstile: "jeton", site_web: "" });
  });

  it.each([
    [
      422,
      { error: "VALIDATION", champs: { email: "email_invalide" } },
      { ok: false, raison: "validation", champs: { email: "email_invalide" } },
    ],
    [429, { error: "TROP_DE_DEMANDES" }, { ok: false, raison: "debit" }],
    [403, { error: "CAPTCHA" }, { ok: false, raison: "captcha" }],
    [500, { error: "ENREGISTREMENT" }, { ok: false, raison: "serveur" }],
    [413, { error: "TROP_GROS" }, { ok: false, raison: "serveur" }],
  ])("traduit la réponse %i", async (statut, corps, attendu) => {
    vi.mocked(fetch).mockResolvedValue(reponse(statut, corps));
    expect(await envoyerLead(lead)).toEqual(attendu);
  });

  it("une réponse illisible est une erreur de service, pas un plantage", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 502 }));
    expect(await envoyerLead(lead)).toEqual({ ok: false, raison: "serveur" });
  });

  it("une coupure réseau est signalée comme telle", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await envoyerLead(lead)).toEqual({ ok: false, raison: "reseau" });
  });
});
