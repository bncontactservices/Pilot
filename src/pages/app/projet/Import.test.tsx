import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContexteOrgProvider, construireContexte } from "~/hooks/useContexteOrg";
import type { Kpi, Projet, SaisieLigne } from "~/lib/donnees";
import Import from "./Import";

const rpc = vi.fn();
vi.mock("~/lib/supabase", () => ({ getSupabase: () => ({ rpc }) }));
const gererErreur = vi.fn();
vi.mock("~/components/app/LimitePlan", () => ({ useGestionErreur: () => gererErreur }));

const projet = {
  id: "p1",
  org_id: "o1",
  nom: "Eau Kolda",
  date_debut: "2026-01-01",
  date_fin: "2026-12-31",
  is_demo: false,
} as unknown as Projet;
const base = {
  project_id: "p1",
  org_id: "o1",
  description: null,
  valeur_base: 0,
  epingle: false,
  noeud_id: null,
  created_at: "",
  updated_at: "",
  frequence: "mensuelle" as const,
  sens: "croissant" as const,
  type_agregation: "cumul" as const,
};
const kpis: Kpi[] = [
  { ...base, id: "k1", nom: "Forages réhabilités", unite: "forages", cible: 40, ordre: 1 },
  { ...base, id: "k2", nom: "Comités formés", unite: "comités", cible: 25, ordre: 2 },
];
const existante: SaisieLigne = {
  id: "s1",
  kpi_id: "k1",
  date: "2026-01-31",
  valeur: 3,
  commentaire: null,
  created_at: "",
  updated_at: "",
};

function monter(role: "admin" | "editeur" | "lecteur" = "editeur", essaiFini = false, liste: Kpi[] = kpis) {
  const organisation = {
    id: "o1",
    nom: "ONG Eau",
    plan: essaiFini ? ("essai" as const) : ("pro" as const),
    plan_souhaite: null,
    essai_fin: essaiFini ? "2020-01-01T00:00:00Z" : "2099-01-01T00:00:00Z",
    devise_defaut: "XOF",
    pays: "SN",
    logo_path: null,
  };
  const contexte = construireContexte(role, organisation, {
    id: "u",
    nom: "A",
    email: "a@exemple.test",
    telephone: null,
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ContexteOrgProvider valeur={contexte}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route element={<Outlet context={{ projet, kpis: liste, saisies: [existante] }} />}>
              <Route index element={<Import />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ContexteOrgProvider>
    </QueryClientProvider>,
  );
}

const CSV = [
  "Indicateur;Date;Valeur;Commentaire",
  "Forages réhabilités;31/01/2026;9;corrigée",
  "Forages réhabilités;28/02/2026;5,5;",
  "Comités formés;31/03/2026;2;",
  "Inconnu;31/03/2026;2;",
].join("\n");

async function deposer(texte: string, nom = "saisies.csv") {
  const champ = screen.getByLabelText("Fichier CSV ou Excel à importer");
  const fichier = new File([texte], nom, { type: "text/csv" });
  // jsdom ne fournit pas toujours Blob.arrayBuffer : on le garantit pour ce fichier.
  fichier.arrayBuffer = async () => new TextEncoder().encode(texte).buffer as ArrayBuffer;
  fireEvent.change(champ, { target: { files: [fichier] } });
  await screen.findByRole("heading", { name: "Associez les colonnes du fichier" });
}

beforeEach(() => {
  rpc.mockReset();
  gererErreur.mockReset();
});

describe("Import : accès", () => {
  it("un lecteur ne peut pas importer", () => {
    monter("lecteur");
    expect(
      screen.getByText("Seuls les administrateurs et les éditeurs peuvent importer des saisies."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Fichier CSV ou Excel à importer")).not.toBeInTheDocument();
  });
  it("l'import est désactivé après la fin d'essai", () => {
    monter("admin", true);
    expect(screen.getByText(/l’import est désactivé/)).toBeInTheDocument();
  });
  it("sans indicateur, invite à en créer", () => {
    monter("editeur", false, []);
    expect(screen.getByText("Créez d’abord des indicateurs")).toBeInTheDocument();
  });
});

describe("Import : parcours complet", () => {
  it("lit le fichier, propose les colonnes, vérifie, remplace les dates déjà saisies et importe", async () => {
    rpc.mockResolvedValue({ data: [{ inserees: 2, remplacees: 1, ignorees: 0 }], error: null });
    monter();
    await deposer(CSV);

    // Étape 2 : correspondance proposée d'après les en-têtes, aperçu visible.
    expect(screen.getByLabelText(/Indicateur \(facultatif\)/)).toHaveValue("0");
    expect(screen.getByLabelText(/Date \(obligatoire\)/)).toHaveValue("1");
    expect(screen.getByLabelText(/Valeur \(obligatoire\)/)).toHaveValue("2");
    expect(screen.getByText("Aperçu des 4 premières lignes de données")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Vérifier le fichier/ }));

    // Étape 3 : 4 lues, 3 valides, 1 rejetée, 1 date déjà saisie.
    const stat = (libelle: string) => within(screen.getByText(libelle).closest("div")!).getByText(/^\d+$/).textContent;
    expect(stat("Lignes lues")).toBe("4");
    expect(stat("Prêtes à importer")).toBe("3");
    expect(stat("Rejetées")).toBe("1");
    expect(stat("Dates déjà saisies")).toBe("1");
    expect(screen.getByText("Cet indicateur n’existe pas dans ce projet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Télécharger le rapport d’erreurs" })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Remplacer les valeurs existantes/));
    fireEvent.click(screen.getByRole("button", { name: "Importer 3 lignes" }));

    // Étape 4 : le lot est envoyé en mode « remplacer », puis le résumé s'affiche.
    await screen.findByRole("heading", { name: "Import terminé" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("importer_saisies", {
      p_lignes: [
        { kpi_id: "k1", date: "2026-01-31", valeur: 9, commentaire: "corrigée" },
        { kpi_id: "k1", date: "2026-02-28", valeur: 5.5, commentaire: null },
        { kpi_id: "k2", date: "2026-03-31", valeur: 2, commentaire: null },
      ],
      p_remplacer: true,
    });
    const resume = (libelle: string) =>
      within(screen.getByText(libelle).closest("div")!).getByText(/^\d+$/).textContent;
    expect(resume("Importées")).toBe("2");
    expect(resume("Remplacées")).toBe("1");
    expect(resume("Rejetées")).toBe("1");
  });

  it("par défaut, les dates déjà saisies sont ignorées", async () => {
    rpc.mockResolvedValue({ data: [{ inserees: 2, remplacees: 0, ignorees: 1 }], error: null });
    monter();
    await deposer(CSV);
    fireEvent.click(screen.getByRole("button", { name: /Vérifier le fichier/ }));
    expect(screen.getByLabelText(/Ignorer ces lignes/)).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Importer 3 lignes" }));
    await screen.findByRole("heading", { name: "Import terminé" });
    expect(rpc.mock.calls[0]![1].p_remplacer).toBe(false);
  });

  it("sans colonne d'indicateur, exige de choisir l'indicateur concerné", async () => {
    rpc.mockResolvedValue({ data: [{ inserees: 2, remplacees: 0, ignorees: 0 }], error: null });
    monter();
    await deposer("Date;Valeur\n28/02/2026;5\n31/03/2026;6");
    expect(screen.getByLabelText(/Indicateur \(facultatif\)/)).toHaveValue("");
    const verifier = screen.getByRole("button", { name: /Vérifier le fichier/ });
    expect(verifier).toBeDisabled();
    expect(screen.getByText("Choisissez l’indicateur concerné.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Indicateur concerné par toutes les lignes"), { target: { value: "k2" } });
    expect(verifier).toBeEnabled();
    fireEvent.click(verifier);
    fireEvent.click(await screen.findByRole("button", { name: "Importer 2 lignes" }));
    await screen.findByRole("heading", { name: "Import terminé" });
    expect(rpc.mock.calls[0]![1].p_lignes.map((l: { kpi_id: string }) => l.kpi_id)).toEqual(["k2", "k2"]);
  });

  it("une colonne ne sert qu'à un seul champ", async () => {
    monter();
    await deposer(CSV);
    fireEvent.change(screen.getByLabelText(/Commentaire \(facultatif\)/), { target: { value: "2" } });
    expect(screen.getByLabelText(/Valeur \(obligatoire\)/)).toHaveValue("");
    expect(screen.getByRole("button", { name: /Vérifier le fichier/ })).toBeDisabled();
  });

  it("signale un fichier sans aucune ligne valide et bloque l'import", async () => {
    monter();
    await deposer("Indicateur;Date;Valeur\nInconnu;31/03/2026;2");
    fireEvent.click(screen.getByRole("button", { name: /Vérifier le fichier/ }));
    expect(screen.getByText(/Aucune ligne n’est valide/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importer 0 ligne" })).toBeDisabled();
  });

  it("refuse un type de fichier inconnu avec un message clair", async () => {
    monter();
    const champ = screen.getByLabelText("Fichier CSV ou Excel à importer");
    const fichier = new File(["x"], "photo.png");
    fichier.arrayBuffer = async () => new TextEncoder().encode("x").buffer as ArrayBuffer;
    fireEvent.change(champ, { target: { files: [fichier] } });
    expect(await screen.findByText(/Ce type de fichier n’est pas pris en charge/)).toBeInTheDocument();
  });

  it("signale l'interruption quand un lot échoue et le dit clairement", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "ESSAI_EXPIRE" } });
    monter();
    await deposer(CSV);
    fireEvent.click(screen.getByRole("button", { name: /Vérifier le fichier/ }));
    fireEvent.click(screen.getByRole("button", { name: "Importer 3 lignes" }));
    await screen.findByRole("heading", { name: "Import interrompu" });
    expect(gererErreur).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText(/s’est arrêté après 0 ligne enregistrée/)).toBeInTheDocument());
  });

  it("découpe un gros fichier en lots de 500 lignes", async () => {
    rpc.mockResolvedValue({ data: [{ inserees: 500, remplacees: 0, ignorees: 0 }], error: null });
    monter();
    const lignes = Array.from({ length: 1200 }, (_, i) => {
      const date = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
      return `Forages réhabilités;${date};1;`;
    });
    await deposer(["Indicateur;Date;Valeur;Commentaire", ...lignes].join("\n"));
    fireEvent.click(screen.getByRole("button", { name: /Vérifier le fichier/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Importer 1200 lignes" }));
    await screen.findByRole("heading", { name: /Import (terminé|interrompu)/ });
    expect(rpc.mock.calls.map((c) => c[1].p_lignes.length)).toEqual([500, 500, 200]);
  });
});
