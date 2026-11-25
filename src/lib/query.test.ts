import { MutationObserver, onlineManager } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { creerQueryClient } from "./query";

afterEach(() => onlineManager.setOnline(true));

describe("creerQueryClient", () => {
  it("lance une écriture même quand react-query se croit hors ligne (la file hors ligne s'en charge)", async () => {
    const client = creerQueryClient();
    onlineManager.setOnline(false);
    const ecriture = new MutationObserver(client, { mutationFn: async () => "fait" });
    await expect(ecriture.mutate()).resolves.toBe("fait");
  });
});
