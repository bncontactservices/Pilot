// Acceptation des conditions enregistrée par la base, et nettoyage des fichiers d'un projet supprimé (DECISIONS.md §18),
// avec de vraies sessions sur le vrai Supabase. Mêmes comptes de test que parcours.spec.ts (voir e2e/README.md).
//
// Il crée deux projets (« Projet E2E fichiers A » et « B »), dépose un fichier dans chacun, et les supprime à la fin :
// il faut donc de la place pour deux projets dans le quota de l'essai (trois). Sans place, il le dit et s'arrête.
// Les comptes de test doivent être créés avec le script de supabase/e2e/creer_comptes.sql à jour : l'administrateur et
// l'éditeur s'inscrivent avec une version des conditions, le lecteur sans.

import { expect, type APIRequestContext, test } from "@playwright/test";
import { COMPTES, COMPTES_ABSENTS, connecter, PHASE } from "./aide";

const URL_SUPABASE = process.env.VITE_SUPABASE_URL;
const CLE = process.env.VITE_SUPABASE_ANON_KEY;
const NOM_A = "Projet E2E fichiers A";
const NOM_B = "Projet E2E fichiers B";
// Version des conditions déclarée par les comptes de test (voir creer_comptes.sql).
const VERSION = "2026-11-25";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

test.skip(COMPTES_ABSENTS || !URL_SUPABASE || !CLE, "comptes de test ou projet Supabase absents");
test.skip(({ isMobile }) => isMobile || PHASE !== "1");
test.describe.configure({ mode: "serial" });

type Session = Awaited<ReturnType<typeof ouvrirSession>>;

async function ouvrirSession(request: APIRequestContext, role: keyof typeof COMPTES) {
  const reponse = await request.post(`${URL_SUPABASE}/auth/v1/token?grant_type=password`, {
    headers: { apikey: CLE! },
    data: { email: COMPTES[role].email, password: COMPTES[role].mdp },
  });
  expect(reponse.ok(), `connexion ${role}`).toBe(true);
  const { access_token } = (await reponse.json()) as { access_token: string };
  const entetes = {
    apikey: CLE!,
    Authorization: `Bearer ${access_token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const json = async <T>(r: Awaited<ReturnType<APIRequestContext["get"]>>, contexte: string) => {
    expect(r.ok(), `${contexte} : ${r.status()} ${await r.text()}`).toBe(true);
    return (await r.json()) as T;
  };
  return {
    lire: <T>(chemin: string) =>
      request.get(`${URL_SUPABASE}/rest/v1/${chemin}`, { headers: entetes }).then((r) => json<T>(r, chemin)),
    ecrire: (methode: "post" | "patch" | "delete", chemin: string, data?: unknown) =>
      request[methode](`${URL_SUPABASE}/rest/v1/${chemin}`, { headers: entetes, data }),
    rpc: <T>(nom: string, data: unknown = {}) =>
      request.post(`${URL_SUPABASE}/rest/v1/rpc/${nom}`, { headers: entetes, data }).then((r) => json<T>(r, nom)),
    deposer: (chemin: string) =>
      request.post(`${URL_SUPABASE}/storage/v1/object/documents/${chemin}`, {
        headers: {
          apikey: CLE!,
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/pdf",
          "x-upsert": "false",
        },
        data: PDF,
      }),
    // Noms des fichiers présents sous un dossier du bucket privé.
    lister: async (dossier: string) => {
      const r = await request.post(`${URL_SUPABASE}/storage/v1/object/list/documents`, {
        headers: { apikey: CLE!, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        data: { prefix: dossier, limit: 100, offset: 0 },
      });
      expect(r.ok(), `liste ${dossier} : ${await r.text()}`).toBe(true);
      return ((await r.json()) as { name: string }[]).map((o) => o.name);
    },
    retirer: (chemin: string) =>
      request.delete(`${URL_SUPABASE}/storage/v1/object/documents/${chemin}`, {
        headers: { apikey: CLE!, Authorization: `Bearer ${access_token}` },
      }),
  };
}

type Projet = { id: string; nom: string; chemin: string };
let orgId = "";
let quotaPlein = false;
const projets: Record<"A" | "B", Projet> = {} as Record<"A" | "B", Projet>;

async function creerProjetAvecFichier(admin: Session, editeur: Session, nom: string): Promise<Projet> {
  const creation = await admin.ecrire("post", "projects", {
    org_id: orgId,
    nom,
    date_debut: "2026-01-01",
    date_fin: "2026-12-31",
  });
  expect(creation.ok(), await creation.text()).toBe(true);
  const id = ((await creation.json()) as { id: string }[])[0]!.id;
  const chemin = `${orgId}/${id}/${crypto.randomUUID()}-preuve.pdf`;
  const depot = await editeur.deposer(chemin);
  expect(depot.ok(), await depot.text()).toBe(true);
  const ligne = await editeur.ecrire("post", "documents", {
    project_id: id,
    nom: "Preuve E2E",
    categorie: "autre",
    storage_path: chemin,
    mime_type: "application/pdf",
    taille_octets: PDF.length,
  });
  expect(ligne.ok(), await ligne.text()).toBe(true);
  return { id, nom, chemin };
}

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  try {
    const admin = await ouvrirSession(request, "admin");
    const editeur = await ouvrirSession(request, "editeur");
    const existants = await admin.lire<{ id: string }[]>("projects?select=id&is_demo=eq.false");
    if (existants.length + 2 > 3) {
      quotaPlein = true;
      return;
    }
    orgId = (await admin.lire<{ id: string }[]>("organisations?select=id"))[0]!.id;
    projets.A = await creerProjetAvecFichier(admin, editeur, NOM_A);
    projets.B = await creerProjetAvecFichier(admin, editeur, NOM_B);
  } finally {
    await request.dispose();
  }
});

// Quoi qu'il arrive : plus de projet de ce fichier, plus de fichier sous leur dossier.
test.afterAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  try {
    const admin = await ouvrirSession(request, "admin");
    for (const projet of Object.values(projets)) {
      await admin.ecrire("delete", `projects?id=eq.${projet.id}`);
      for (const nom of await admin.lister(`${orgId}/${projet.id}`))
        await admin.retirer(`${orgId}/${projet.id}/${nom}`);
    }
  } finally {
    await request.dispose();
  }
});

test.describe("acceptation des conditions enregistrée par la base", () => {
  test("l'administrateur et l'éditeur ont une acceptation datée par la base, le lecteur aucune", async ({
    request,
  }) => {
    const admin = await ouvrirSession(request, "admin");
    const profils = await admin.lire<
      { email: string; conditions_version: string | null; conditions_acceptees_le: string | null }[]
    >("profiles?select=email,conditions_version,conditions_acceptees_le");
    const parEmail = new Map(profils.map((p) => [p.email, p]));
    for (const role of ["admin", "editeur"] as const) {
      const profil = parEmail.get(COMPTES[role].email!);
      expect(profil?.conditions_version, role).toBe(VERSION);
      const date = Date.parse(profil!.conditions_acceptees_le!);
      expect(date, `${role} : date valide`).toBeGreaterThan(Date.parse("2026-11-25T00:00:00Z"));
      expect(date, `${role} : pas dans le futur`).toBeLessThanOrEqual(Date.now() + 60_000);
    }
    const lecteur = parEmail.get(COMPTES.lecteur.email!);
    expect(lecteur?.conditions_version).toBeNull();
    expect(lecteur?.conditions_acceptees_le).toBeNull();
  });

  test("un membre ne peut ni modifier ni forger son acceptation", async ({ request }) => {
    const admin = await ouvrirSession(request, "admin");
    const avant = (
      await admin.lire<{ id: string; conditions_version: string; conditions_acceptees_le: string }[]>(
        `profiles?select=id,conditions_version,conditions_acceptees_le&email=eq.${encodeURIComponent(COMPTES.admin.email!)}`,
      )
    )[0]!;
    for (const modification of [
      { conditions_version: "2030-01-01" },
      { conditions_acceptees_le: "2020-01-01T00:00:00Z" },
    ]) {
      const reponse = await admin.ecrire("patch", `profiles?id=eq.${avant.id}`, modification);
      expect(reponse.status(), JSON.stringify(modification)).toBe(403);
      expect(await reponse.text()).toContain("42501");
    }
    // Le lecteur, dont l'acceptation est vide, ne peut pas non plus s'en donner une.
    const lecteur = await ouvrirSession(request, "lecteur");
    const profilLecteur = (
      await lecteur.lire<{ id: string }[]>(`profiles?select=id&email=eq.${encodeURIComponent(COMPTES.lecteur.email!)}`)
    )[0]!;
    const forge = await lecteur.ecrire("patch", `profiles?id=eq.${profilLecteur.id}`, { conditions_version: VERSION });
    expect(forge.status()).toBe(403);
    const apres = (
      await admin.lire<{ conditions_version: string; conditions_acceptees_le: string }[]>(
        `profiles?select=conditions_version,conditions_acceptees_le&id=eq.${avant.id}`,
      )
    )[0]!;
    expect(apres).toEqual({
      conditions_version: avant.conditions_version,
      conditions_acceptees_le: avant.conditions_acceptees_le,
    });
    // Son nom reste modifiable : la protection ne vise que ces deux colonnes.
    const nom = await admin.ecrire("patch", `profiles?id=eq.${avant.id}`, { telephone: null });
    expect(nom.ok()).toBe(true);
  });
});

test.describe("fichiers d'un projet supprimé", () => {
  test("le lecteur ne voit rien dans la file et n'y touche pas", async ({ request }) => {
    test.skip(quotaPlein, "quota de projets plein : supprimer les projets de test (e2e/README.md)");
    const lecteur = await ouvrirSession(request, "lecteur");
    expect(await lecteur.rpc<string[]>("fichiers_a_retirer")).toEqual([]);
    expect(await lecteur.rpc<number>("fichiers_retires", { p_chemins: [projets.A.chemin] })).toBe(0);
    // L'anonyme n'a même pas le droit d'appeler la fonction.
    const anonyme = await request.post(`${URL_SUPABASE}/rest/v1/rpc/fichiers_a_retirer`, {
      headers: { apikey: CLE!, "Content-Type": "application/json" },
      data: {},
    });
    expect([401, 403]).toContain(anonyme.status());
  });

  test("supprimer un projet dans l'application retire ses fichiers du stockage", async ({ page, request }) => {
    test.skip(quotaPlein, "quota de projets plein : supprimer les projets de test (e2e/README.md)");
    const admin = await ouvrirSession(request, "admin");
    const dossier = `${orgId}/${projets.A.id}`;
    expect(await admin.lister(dossier), "le fichier est bien déposé avant la suppression").toHaveLength(1);

    await connecter(page, "admin");
    await page.goto("/app");
    await page.getByRole("button", { name: `Actions pour ${NOM_A}` }).click();
    await page.getByRole("menuitem", { name: "Supprimer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer définitivement" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(`Projet « ${NOM_A} » supprimé.`).first()).toBeVisible();

    // Le nettoyage part juste après la suppression : on attend que le dossier se vide et que la file soit vide.
    await expect
      .poll(() => admin.lister(dossier), { timeout: 30_000, message: "le fichier du projet supprimé part du stockage" })
      .toEqual([]);
    await expect
      .poll(() => admin.rpc<string[]>("fichiers_a_retirer"), { timeout: 30_000, message: "la file est vidée" })
      .toEqual([]);
    expect(await admin.lire<unknown[]>(`documents?select=id&project_id=eq.${projets.A.id}`)).toHaveLength(0);
  });

  test("une suppression sans nettoyage est rattrapée au chargement de l'application", async ({ page, request }) => {
    test.skip(quotaPlein, "quota de projets plein : supprimer les projets de test (e2e/README.md)");
    const admin = await ouvrirSession(request, "admin");
    const editeur = await ouvrirSession(request, "editeur");
    const dossier = `${orgId}/${projets.B.id}`;
    const [nom] = await admin.lister(dossier);
    expect(nom, "le fichier est bien déposé avant la suppression").toBeTruthy();

    // Suppression par l'API seule : l'application ne nettoie pas (c'est le cas d'un onglet fermé trop tôt).
    const suppression = await admin.ecrire("delete", `projects?id=eq.${projets.B.id}`);
    expect(suppression.ok(), await suppression.text()).toBe(true);
    expect(await admin.lister(dossier), "le fichier est resté dans le stockage").toEqual([nom]);
    expect(await editeur.rpc<string[]>("fichiers_a_retirer")).toEqual([projets.B.chemin]);
    // Une organisation voisine ou un autre rôle ne verrait rien : le lecteur ne voit toujours rien.
    const lecteur = await ouvrirSession(request, "lecteur");
    expect(await lecteur.rpc<string[]>("fichiers_a_retirer")).toEqual([]);

    // L'éditeur ouvre l'application : le nettoyage s'exécute tout seul.
    await connecter(page, "editeur");
    await expect
      .poll(() => admin.lister(dossier), { timeout: 30_000, message: "le fichier part au chargement" })
      .toEqual([]);
    await expect
      .poll(() => editeur.rpc<string[]>("fichiers_a_retirer"), { timeout: 30_000, message: "la file est vidée" })
      .toEqual([]);
  });
});
