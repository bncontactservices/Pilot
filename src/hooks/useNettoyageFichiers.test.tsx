import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContexteOrgProvider } from "~/hooks/useContexteOrg";
import { creerContexteOrg } from "~/test/monter-projet";
import { useNettoyageFichiers } from "./useNettoyageFichiers";

const retirerFichiersOrphelins = vi.fn();
vi.mock("~/lib/documents", () => ({ retirerFichiersOrphelins: () => retirerFichiersOrphelins() }));

beforeEach(() => retirerFichiersOrphelins.mockReset());

function monter(role: "admin" | "editeur" | "lecteur", essaiFini = false) {
  const contexte = creerContexteOrg(role, essaiFini);
  const enveloppe = ({ children }: { children: ReactNode }) => (
    <ContexteOrgProvider valeur={contexte}>{children}</ContexteOrgProvider>
  );
  return renderHook(() => useNettoyageFichiers(), { wrapper: enveloppe });
}

describe("nettoyage des fichiers de documents supprimés", () => {
  it("se lance au chargement pour un éditeur", () => {
    monter("editeur");
    expect(retirerFichiersOrphelins).toHaveBeenCalledTimes(1);
  });

  it("se lance au chargement pour un administrateur", () => {
    monter("admin");
    expect(retirerFichiersOrphelins).toHaveBeenCalledTimes(1);
  });

  it("ne se lance pas pour un lecteur, qui ne peut pas supprimer de fichiers", () => {
    monter("lecteur");
    expect(retirerFichiersOrphelins).not.toHaveBeenCalled();
  });

  it("ne se lance pas quand l'essai est terminé : la suppression de fichiers serait refusée", () => {
    monter("admin", true);
    expect(retirerFichiersOrphelins).not.toHaveBeenCalled();
  });
});
