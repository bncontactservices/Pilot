import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import { EtiquettesProjet } from "./EtiquettesProjet";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

const ligne = (etiquette: string) => ({ project_id: "p1", org_id: "o1", etiquette, created_at: "" });

beforeEach(() => {
  base.reinitialiser();
  gererErreur.mockReset();
});

describe("Étiquettes du projet", () => {
  it("affiche les étiquettes, avec une action de retrait pour un éditeur", async () => {
    base.tables.projet_etiquettes = [ligne("formation"), ligne("infrastructure")];
    monterProjet(<EtiquettesProjet projetId="p1" modifiable />);
    expect(await screen.findByText("formation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retirer l’étiquette infrastructure" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ajouter une étiquette")).toBeInTheDocument();
  });

  it("ne montre ni retrait ni saisie à un lecteur", async () => {
    base.tables.projet_etiquettes = [ligne("formation")];
    monterProjet(<EtiquettesProjet projetId="p1" modifiable={false} />);
    expect(await screen.findByText("formation")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ajouter une étiquette")).not.toBeInTheDocument();
  });

  it("n'occupe aucune place pour un lecteur quand le projet n'a pas d'étiquette", async () => {
    const { container } = monterProjet(<EtiquettesProjet projetId="p1" modifiable={false} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("normalise la saisie comme la base : minuscules, espaces simplifiés", async () => {
    base.tables.projet_etiquettes = [ligne("formation")];
    monterProjet(<EtiquettesProjet projetId="p1" modifiable />);
    const champ = await screen.findByLabelText("Ajouter une étiquette");
    fireEvent.change(champ, { target: { value: "  Appui   Conseil " } });
    fireEvent.submit(champ.closest("form")!);
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({
      table: "projet_etiquettes",
      operation: "insert",
      valeurs: { project_id: "p1", etiquette: "appui conseil" },
    });
  });

  it("refuse un doublon, une saisie vide et une étiquette trop longue", async () => {
    base.tables.projet_etiquettes = [ligne("formation")];
    monterProjet(<EtiquettesProjet projetId="p1" modifiable />);
    const champ = await screen.findByLabelText("Ajouter une étiquette");
    const form = champ.closest("form")!;

    fireEvent.change(champ, { target: { value: "FORMATION" } });
    fireEvent.submit(form);
    expect(await screen.findByText("L’étiquette « formation » existe déjà.")).toBeInTheDocument();

    fireEvent.change(champ, { target: { value: "   " } });
    fireEvent.submit(form);
    expect(await screen.findByText("Saisissez une étiquette.")).toBeInTheDocument();

    fireEvent.change(champ, { target: { value: "x".repeat(41) } });
    fireEvent.submit(form);
    expect(await screen.findByText("Une étiquette fait 40 caractères au plus.")).toBeInTheDocument();
    expect(base.appels).toHaveLength(0);
  });

  it("retire une étiquette", async () => {
    base.tables.projet_etiquettes = [ligne("formation"), ligne("plaidoyer")];
    monterProjet(<EtiquettesProjet projetId="p1" modifiable />);
    fireEvent.click(await screen.findByRole("button", { name: "Retirer l’étiquette plaidoyer" }));
    await waitFor(() => expect(base.appels).toHaveLength(1));
    expect(base.appels[0]).toEqual({ table: "projet_etiquettes", operation: "delete", valeurs: undefined });
  });

  it("n'offre plus la saisie quand le projet porte déjà dix étiquettes", async () => {
    base.tables.projet_etiquettes = Array.from({ length: 10 }, (_, i) => ligne(`etiquette-${i}`));
    monterProjet(<EtiquettesProjet projetId="p1" modifiable />);
    expect(await screen.findByText("10 étiquettes au maximum.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ajouter une étiquette")).not.toBeInTheDocument();
  });
});
