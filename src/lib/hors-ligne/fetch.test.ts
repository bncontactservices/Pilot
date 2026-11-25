import { describe, expect, it, vi } from "vitest";
import { creerFetchSansRetrogradation } from "./fetch";

const CLE = "sb_publishable_cle";
const donnees = "https://abc.supabase.co/rest/v1/kpis?select=*";

function monter(sessionGardee: boolean) {
  const base = vi.fn(() => Promise.resolve(new Response("{}")));
  return { base, f: creerFetchSansRetrogradation(CLE, () => sessionGardee, base as unknown as typeof fetch) };
}

describe("creerFetchSansRetrogradation", () => {
  it("refuse comme une coupure réseau une requête de données qui partirait en anonyme alors qu'une session est gardée", async () => {
    const { base, f } = monter(true);
    await expect(f(donnees, { headers: { Authorization: `Bearer ${CLE}`, apikey: CLE } })).rejects.toThrow(TypeError);
    expect(base).not.toHaveBeenCalled();
  });

  it("laisse passer une requête signée avec le jeton de la personne", async () => {
    const { base, f } = monter(true);
    await f(donnees, { headers: { Authorization: "Bearer eyJ.jeton.personnel" } });
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("laisse passer une requête anonyme quand aucune session n'est gardée (page d'invitation, par exemple)", async () => {
    const { base, f } = monter(false);
    await f("https://abc.supabase.co/rest/v1/rpc/invitation_apercu", { headers: { Authorization: `Bearer ${CLE}` } });
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("ne touche ni à la connexion ni aux fonctions publiques, même avec une session périmée gardée", async () => {
    const { base, f } = monter(true);
    await f("https://abc.supabase.co/auth/v1/token?grant_type=password", {
      headers: { Authorization: `Bearer ${CLE}` },
    });
    await f("https://abc.supabase.co/functions/v1/submit-lead", { headers: { Authorization: `Bearer ${CLE}` } });
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("lit l'en-tête d'une Request comme celui d'un init", async () => {
    const { base, f } = monter(true);
    await expect(f(new Request(donnees, { headers: { Authorization: `Bearer ${CLE}` } }))).rejects.toThrow(TypeError);
    expect(base).not.toHaveBeenCalled();
  });
});
