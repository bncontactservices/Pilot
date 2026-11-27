import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { creerFausseBase } from "~/test/fausse-base";
import { monterProjet } from "~/test/monter-projet";
import Parametres from "./Parametres";

const base = creerFausseBase();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => base.client }));
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => vi.fn() }));

const FACTURATION_MANUELLE = /L’activation se fait avec notre équipe, par virement/;
const EN_LIGNE = /Votre plan est géré par l’abonnement en ligne ci-dessous/;

const abonnement = (statut: string) => ({
  org_id: "o1",
  plan: "starter",
  periodicite: "mensuelle",
  statut,
  periode_fin: "2026-12-26T15:51:39Z",
  annule_en_fin_de_periode: false,
});

beforeEach(() => base.reinitialiser());

describe("Paramètres : carte Plan", () => {
  it("rappelle la facturation manuelle quand aucun abonnement en ligne n'existe", async () => {
    monterProjet(<Parametres />, { role: "admin" });
    expect(await screen.findByText(FACTURATION_MANUELLE)).toBeInTheDocument();
    expect(screen.queryByText(EN_LIGNE)).not.toBeInTheDocument();
  });

  it("dit que le plan se gère en ligne quand un abonnement est en cours, sans promettre une activation par l'équipe", async () => {
    base.tables.abonnements = [abonnement("active")];
    monterProjet(<Parametres />, { role: "admin" });
    expect(await screen.findByText(EN_LIGNE)).toBeInTheDocument();
    expect(screen.queryByText(FACTURATION_MANUELLE)).not.toBeInTheDocument();
  });

  it("revient à la facturation manuelle quand l'abonnement est terminé", async () => {
    base.tables.abonnements = [abonnement("canceled")];
    monterProjet(<Parametres />, { role: "admin" });
    await waitFor(() => expect(screen.getByText(FACTURATION_MANUELLE)).toBeInTheDocument());
    expect(screen.queryByText(EN_LIGNE)).not.toBeInTheDocument();
  });

  it("ne lit pas l'abonnement pour un éditeur : la base le lui refuse, la phrase reste celle de la facturation manuelle", async () => {
    base.tables.abonnements = [abonnement("active")];
    monterProjet(<Parametres />, { role: "editeur" });
    expect(await screen.findByText(FACTURATION_MANUELLE)).toBeInTheDocument();
    expect(screen.queryByText(EN_LIGNE)).not.toBeInTheDocument();
  });
});
