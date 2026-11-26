import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import { CarteRapportEmail } from "./CarteRapportEmail";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

const ligne = (frequence: string) => ({
  user_id: "u",
  org_id: "o1",
  frequence,
  prochain_envoi_le: "2026-11-30T07:00:00Z",
  dernier_envoi_le: null,
});

const fonction = (disponible: boolean) => {
  base.reponsesFonctions["rapports-programmes"] = {
    data: (corps: unknown) => ((corps as { action?: string })?.action === "etat" ? { disponible } : { envoye: true }),
  };
};

beforeEach(() => {
  base.reinitialiser();
  gererErreur.mockReset();
});

describe("Carte « Rapport de suivi par e-mail »", () => {
  it("n'apparaît pas tant que le serveur ne confirme pas que l'envoi est configuré", async () => {
    fonction(false);
    monterProjet(<CarteRapportEmail />);
    await waitFor(() => expect(base.appelsFonctions.length).toBeGreaterThan(0));
    expect(screen.queryByText("Rapport de suivi par e-mail")).not.toBeInTheDocument();
  });

  it("n'apparaît pas non plus quand la fonction est en panne", async () => {
    base.reponsesFonctions["rapports-programmes"] = { erreur: new Error("fonction absente") };
    monterProjet(<CarteRapportEmail />);
    await waitFor(() => expect(base.appelsFonctions.length).toBeGreaterThan(0));
    expect(screen.queryByText("Rapport de suivi par e-mail")).not.toBeInTheDocument();
  });

  it("propose le choix à tout membre, avec l'adresse du compte, sans abonnement au départ", async () => {
    fonction(true);
    monterProjet(<CarteRapportEmail />, { role: "lecteur" });
    expect(await screen.findByText("Rapport de suivi par e-mail")).toBeInTheDocument();
    expect(screen.getByText(/à l’adresse de votre compte : a@exemple.test/)).toBeInTheDocument();
    expect(screen.getByLabelText("Fréquence")).toHaveValue("aucun");
    expect(screen.queryByText(/Prochain envoi/)).not.toBeInTheDocument();
    // Rien à enregistrer tant que le choix ne change pas.
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("s'abonne en n'envoyant que la fréquence choisie", async () => {
    fonction(true);
    monterProjet(<CarteRapportEmail />);
    fireEvent.change(await screen.findByLabelText("Fréquence"), { target: { value: "hebdomadaire" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(base.appels.some((a) => a.table === "rapports_abonnes" && a.operation === "insert")).toBe(true),
    );
    expect(base.appels.find((a) => a.operation === "insert")?.valeurs).toEqual({ frequence: "hebdomadaire" });
  });

  it("montre la prochaine date d'envoi d'un abonné, change sa fréquence, et se désabonne", async () => {
    fonction(true);
    base.tables.rapports_abonnes = [ligne("hebdomadaire")];
    monterProjet(<CarteRapportEmail />);
    expect(await screen.findByText(/Prochain envoi : lundi 30 novembre 2026, vers 7 h/)).toBeInTheDocument();
    expect(screen.getByLabelText("Fréquence")).toHaveValue("hebdomadaire");

    fireEvent.change(screen.getByLabelText("Fréquence"), { target: { value: "mensuelle" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(base.appels.some((a) => a.table === "rapports_abonnes" && a.operation === "update")).toBe(true),
    );
    expect(base.appels.find((a) => a.operation === "update")?.valeurs).toEqual({ frequence: "mensuelle" });

    fireEvent.change(screen.getByLabelText("Fréquence"), { target: { value: "aucun" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(base.appels.some((a) => a.table === "rapports_abonnes" && a.operation === "delete")).toBe(true),
    );
  });

  it("envoie un exemple à la demande, puis laisse le bouton se reposer", async () => {
    fonction(true);
    monterProjet(<CarteRapportEmail />);
    const bouton = await screen.findByRole("button", { name: "Recevoir un exemple maintenant" });
    fireEvent.click(bouton);
    await waitFor(() =>
      expect(base.appelsFonctions.some((a) => (a.corps as { action: string }).action === "exemple")).toBe(true),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Recevoir un exemple maintenant" })).toBeDisabled());
    // La requête ne porte aucune adresse : le destinataire est celui du compte, côté serveur.
    expect(base.appelsFonctions.find((a) => (a.corps as { action: string }).action === "exemple")?.corps).toEqual({
      action: "exemple",
    });
  });

  it("rend la main à la gestion d'erreur quand l'exemple échoue", async () => {
    base.reponsesFonctions["rapports-programmes"] = {
      data: (corps: unknown) => ((corps as { action?: string })?.action === "etat" ? { disponible: true } : null),
    };
    monterProjet(<CarteRapportEmail />);
    // L'état est disponible ; on fait échouer l'exemple en remplaçant la réponse avant le clic.
    const bouton = await screen.findByRole("button", { name: "Recevoir un exemple maintenant" });
    base.reponsesFonctions["rapports-programmes"] = { erreur: new Error("RAPPORTS_INDISPONIBLES") };
    fireEvent.click(bouton);
    await waitFor(() => expect(gererErreur).toHaveBeenCalled());
  });

  it("dit que le choix est conservé quand l'organisation est en lecture seule", async () => {
    fonction(true);
    monterProjet(<CarteRapportEmail />, { essaiFini: true });
    expect(await screen.findByText(/aucun rapport n’est envoyé tant qu’un plan n’est pas activé/)).toBeInTheDocument();
  });
});
