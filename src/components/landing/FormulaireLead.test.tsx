import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reglages = vi.hoisted(() => ({ configure: true, turnstile: undefined as string | undefined }));
vi.mock("~/lib/env", () => ({
  env: {
    get turnstileSiteKey() {
      return reglages.turnstile;
    },
    contactEmail: "contact@exemple.test",
    whatsappNumber: "221700000000",
    plausibleDomain: undefined,
  },
  get supabaseConfigure() {
    return reglages.configure;
  },
}));
const envoyerLead = vi.fn();
vi.mock("~/lib/lead-client", () => ({ envoyerLead: (...args: unknown[]) => envoyerLead(...args) }));
vi.mock("~/components/landing/Turnstile", () => ({ Turnstile: () => <div data-testid="turnstile" /> }));
const evenement = vi.fn();
vi.mock("~/lib/analytics", () => ({ evenement: (...args: unknown[]) => evenement(...args) }));

import { FormulaireLead } from "./FormulaireLead";

const remplir = (libelle: RegExp, valeur: string) =>
  fireEvent.change(screen.getByLabelText(libelle), { target: { value: valeur } });

beforeEach(() => {
  reglages.configure = true;
  reglages.turnstile = undefined;
  envoyerLead.mockReset();
  evenement.mockReset();
});

describe("FormulaireLead (démo)", () => {
  const monter = () => render(<FormulaireLead type="demo" libelleEnvoi="Envoyer ma demande" emplacement="contact" />);

  it("refuse un formulaire vide, signale chaque champ et n'envoie rien", () => {
    monter();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer ma demande" }));
    expect(screen.getAllByText("Ce champ est obligatoire.")).toHaveLength(3);
    expect(screen.getByLabelText("Nom")).toHaveFocus();
    expect(envoyerLead).not.toHaveBeenCalled();
  });

  it("refuse une adresse e-mail invalide", () => {
    monter();
    remplir(/^Nom/, "Awa Diop");
    remplir(/^Organisation/, "ONG Eau Vive");
    remplir(/^E-mail/, "pas-un-email");
    fireEvent.click(screen.getByRole("button", { name: "Envoyer ma demande" }));
    expect(screen.getByText("Cette adresse e-mail n’est pas valide.")).toBeInTheDocument();
    expect(envoyerLead).not.toHaveBeenCalled();
  });

  it("envoie la demande normalisée, confirme à l'écran et mesure l'événement", async () => {
    envoyerLead.mockResolvedValue({ ok: true });
    monter();
    remplir(/^Nom/, " Awa Diop ");
    remplir(/^Organisation/, "ONG Eau Vive");
    remplir(/^E-mail/, "Awa@Exemple.org");
    fireEvent.click(screen.getByRole("button", { name: "Envoyer ma demande" }));
    expect(await screen.findByRole("heading", { name: "Demande bien reçue" })).toBeInTheDocument();
    expect(screen.getByText(/awa@exemple\.org/)).toBeInTheDocument();
    expect(envoyerLead).toHaveBeenCalledWith(
      { type_demande: "demo", nom: "Awa Diop", organisation: "ONG Eau Vive", email: "awa@exemple.org", besoin: null },
      { turnstile: undefined, piege: "" },
    );
    expect(evenement).toHaveBeenCalledWith("Lead Submit", { type: "demo", emplacement: "contact" });
  });

  it("transmet le champ piège quand un robot le remplit", async () => {
    envoyerLead.mockResolvedValue({ ok: true });
    const { container } = monter();
    remplir(/^Nom/, "Robot");
    remplir(/^Organisation/, "Spam SA");
    remplir(/^E-mail/, "bot@exemple.test");
    fireEvent.change(container.querySelector("input[name='site_web']")!, { target: { value: "http://spam" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer ma demande" }));
    await waitFor(() => expect(envoyerLead).toHaveBeenCalled());
    expect(envoyerLead.mock.calls[0]![1].piege).toBe("http://spam");
  });

  it("le champ piège est invisible et hors du parcours clavier", () => {
    const { container } = monter();
    const piege = container.querySelector("input[name='site_web']") as HTMLInputElement;
    expect(piege.tabIndex).toBe(-1);
    expect(piege.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it.each([
    ["reseau", /La connexion a échoué/],
    ["serveur", /momentanément indisponible/],
    ["debit", /plusieurs demandes en peu de temps/],
    ["captcha", /vérification anti-robot a échoué/],
  ])("affiche une erreur humaine pour « %s » et permet de réessayer", async (raison, message) => {
    envoyerLead.mockResolvedValueOnce({ ok: false, raison }).mockResolvedValueOnce({ ok: true });
    monter();
    remplir(/^Nom/, "Awa Diop");
    remplir(/^Organisation/, "ONG Eau Vive");
    remplir(/^E-mail/, "awa@exemple.org");
    fireEvent.click(screen.getByRole("button", { name: "Envoyer ma demande" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Votre demande n’a pas pu être envoyée");
    // « Réessayer » renvoie les valeurs conservées.
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("heading", { name: "Demande bien reçue" })).toBeInTheDocument();
    expect(envoyerLead).toHaveBeenCalledTimes(2);
  });

  it("reporte les erreurs de validation renvoyées par le serveur sur les champs", async () => {
    envoyerLead.mockResolvedValue({ ok: false, raison: "validation", champs: { email: "email_invalide" } });
    monter();
    remplir(/^Nom/, "Awa Diop");
    remplir(/^Organisation/, "ONG Eau Vive");
    remplir(/^E-mail/, "awa@exemple.org");
    fireEvent.click(screen.getByRole("button", { name: "Envoyer ma demande" }));
    expect(await screen.findByText("Cette adresse e-mail n’est pas valide.")).toBeInTheDocument();
  });

  it("désactive le bouton pendant l'envoi pour éviter un double envoi", async () => {
    let terminer: (v: unknown) => void = () => {};
    envoyerLead.mockReturnValue(new Promise((resolve) => (terminer = resolve)));
    monter();
    remplir(/^Nom/, "Awa Diop");
    remplir(/^Organisation/, "ONG Eau Vive");
    remplir(/^E-mail/, "awa@exemple.org");
    fireEvent.click(screen.getByRole("button", { name: "Envoyer ma demande" }));
    const bouton = await screen.findByRole("button", { name: "Envoi en cours…" });
    expect(bouton).toBeDisabled();
    terminer({ ok: true });
    expect(await screen.findByRole("heading", { name: "Demande bien reçue" })).toBeInTheDocument();
  });

  it("avec Turnstile configuré, n'envoie pas sans jeton", () => {
    reglages.turnstile = "cle-de-site";
    monter();
    fireEvent.focus(screen.getByLabelText("Nom"));
    expect(screen.getByTestId("turnstile")).toBeInTheDocument();
    remplir(/^Nom/, "Awa Diop");
    remplir(/^Organisation/, "ONG Eau Vive");
    remplir(/^E-mail/, "awa@exemple.org");
    fireEvent.click(screen.getByRole("button", { name: "Envoyer ma demande" }));
    expect(screen.getByText(/vérification anti-robot a échoué/)).toBeInTheDocument();
    expect(envoyerLead).not.toHaveBeenCalled();
  });
});

describe("FormulaireLead (client pilote)", () => {
  it("ne demande que l'organisation et l'e-mail", async () => {
    envoyerLead.mockResolvedValue({ ok: true });
    render(<FormulaireLead type="pilote" compact libelleEnvoi="Devenir client pilote" emplacement="pilotes" />);
    expect(screen.queryByLabelText(/^Nom/)).not.toBeInTheDocument();
    remplir(/^Organisation/, "PME Sahel");
    remplir(/^E-mail/, "contact@pme.sn");
    fireEvent.click(screen.getByRole("button", { name: "Devenir client pilote" }));
    await screen.findByRole("heading", { name: "Demande bien reçue" });
    expect(envoyerLead.mock.calls[0]![0]).toEqual({
      type_demande: "pilote",
      nom: null,
      organisation: "PME Sahel",
      email: "contact@pme.sn",
      besoin: null,
    });
  });
});

describe("FormulaireLead sans backend configuré", () => {
  it("propose WhatsApp et l'e-mail plutôt qu'un formulaire qui ne marche pas", () => {
    reglages.configure = false;
    render(<FormulaireLead type="demo" libelleEnvoi="Envoyer" emplacement="contact" />);
    expect(screen.queryByRole("button", { name: "Envoyer" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute(
      "href",
      expect.stringContaining("https://wa.me/221700000000"),
    );
    expect(screen.getByRole("link", { name: /e-mail/ })).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:contact@exemple.test"),
    );
  });
});
