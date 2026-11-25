import { type Mock, vi } from "vitest";
import type { ClientSaisies, ErreurBase } from "~/lib/hors-ligne/synchro";

export type ClientSaisiesDeTest = { [K in keyof ClientSaisies]: Mock<ClientSaisies[K]> };

/** Base d'envoi factice pour les tests : tout réussit par défaut, chaque méthode se règle par test. */
export function creerClientSaisies(surcharges: Partial<ClientSaisies> = {}): ClientSaisiesDeTest {
  return {
    sessionValide: vi.fn<ClientSaisies["sessionValide"]>(() => Promise.resolve("ok" as const)),
    inserer: vi.fn<ClientSaisies["inserer"]>(() => Promise.resolve(null as ErreurBase)),
    lireParDate: vi.fn<ClientSaisies["lireParDate"]>(() =>
      Promise.resolve({ ligne: null, erreur: null as ErreurBase }),
    ),
    remplacer: vi.fn<ClientSaisies["remplacer"]>(() => Promise.resolve(null as ErreurBase)),
    ...surcharges,
  } as ClientSaisiesDeTest;
}

/** Simule le navigateur : en ligne ou hors ligne, avec l'événement qui prévient l'application. */
export function simulerReseau(enLigne: boolean) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(enLigne);
  window.dispatchEvent(new Event(enLigne ? "online" : "offline"));
}
