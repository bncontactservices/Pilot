// Contrôles au niveau de l'API Supabase avec de vraies sessions : la sécurité ne repose pas sur l'interface.
// Mêmes comptes de test que parcours.spec.ts. Complète les tests pgTAP (qui rejouent les règles en SQL) par des appels réels.

import { expect, type APIRequestContext, test } from "@playwright/test";

const URL_SUPABASE = process.env.VITE_SUPABASE_URL;
const CLE = process.env.VITE_SUPABASE_ANON_KEY;
const PHASE = process.env.E2E_PHASE ?? "1";
const COMPTES = {
  admin: { email: process.env.E2E_ADMIN_EMAIL, mdp: process.env.E2E_ADMIN_MDP },
  editeur: { email: process.env.E2E_EDITEUR_EMAIL, mdp: process.env.E2E_EDITEUR_MDP },
  lecteur: { email: process.env.E2E_LECTEUR_EMAIL, mdp: process.env.E2E_LECTEUR_MDP },
};

test.skip(!COMPTES.admin.email || !URL_SUPABASE || !CLE, "comptes de test ou projet Supabase absents");
test.skip(({ isMobile }) => isMobile);

// Plusieurs contrôles ont besoin d'un projet. Le parcours authentifié en laisse un, mais les fichiers s'exécutent par ordre
// alphabétique (api avant parcours) : sans projet, on en crée un pour la durée du fichier, puis on le supprime.
let projetCree: string | null = null;
test.beforeAll(async ({ playwright }) => {
  if (PHASE !== "1" || !COMPTES.admin.email || !URL_SUPABASE || !CLE) return;
  const request = await playwright.request.newContext();
  try {
    const admin = await ouvrirSession(request, "admin");
    const existants = (await (await admin.lire("projects?select=id&limit=1")).json()) as { id: string }[];
    if (existants.length > 0) return;
    const org = ((await (await admin.lire("organisations?select=id")).json()) as { id: string }[])[0]!;
    const creation = await admin.ecrire("post", "projects", {
      org_id: org.id,
      nom: "Projet E2E (API)",
      date_debut: "2026-01-01",
      date_fin: "2026-12-31",
    });
    expect(creation.ok(), await creation.text()).toBe(true);
    projetCree = ((await creation.json()) as { id: string }[])[0]!.id;
    // Un indicateur, pour les contrôles d'écriture de saisies.
    const kpi = await admin.ecrire("post", "kpis", {
      project_id: projetCree,
      nom: "Indicateur API",
      unite: "unités",
      cible: 10,
      valeur_base: 0,
      frequence: "mensuelle",
      sens: "croissant",
      type_agregation: "cumul",
    });
    expect(kpi.ok(), await kpi.text()).toBe(true);
  } finally {
    await request.dispose();
  }
});
test.afterAll(async ({ playwright }) => {
  if (!projetCree) return;
  const request = await playwright.request.newContext();
  try {
    const admin = await ouvrirSession(request, "admin");
    await admin.ecrire("delete", `projects?id=eq.${projetCree}`);
  } finally {
    await request.dispose();
  }
});

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
  return {
    lire: (chemin: string) => request.get(`${URL_SUPABASE}/rest/v1/${chemin}`, { headers: entetes }),
    ecrire: (methode: "post" | "patch" | "delete", chemin: string, data?: unknown) =>
      request[methode](`${URL_SUPABASE}/rest/v1/${chemin}`, { headers: entetes, data }),
    rpc: (nom: string, data: unknown) => request.post(`${URL_SUPABASE}/rest/v1/rpc/${nom}`, { headers: entetes, data }),
    // Stockage de fichiers (bucket privé « documents ») : dépôt et retrait par l'API REST du stockage.
    deposer: (chemin: string, type: string, contenu: Buffer) =>
      request.post(`${URL_SUPABASE}/storage/v1/object/documents/${chemin}`, {
        headers: { apikey: CLE!, Authorization: `Bearer ${access_token}`, "Content-Type": type, "x-upsert": "false" },
        data: contenu,
      }),
    retirer: (chemin: string) =>
      request.delete(`${URL_SUPABASE}/storage/v1/object/documents/${chemin}`, {
        headers: { apikey: CLE!, Authorization: `Bearer ${access_token}` },
      }),
  };
}

test.describe("sécurité côté API (phase 1)", () => {
  test.skip(PHASE !== "1");

  test("un utilisateur ne lit que les données de son organisation", async ({ request }) => {
    const admin = await ouvrirSession(request, "admin");
    const organisations = (await (await admin.lire("organisations?select=id,nom")).json()) as {
      id: string;
      nom: string;
    }[];
    expect(organisations.map((o) => o.nom)).toEqual(["Organisation E2E (test)"]);
    const projets = (await (await admin.lire("projects?select=id,org_id")).json()) as { org_id: string }[];
    expect(projets.length).toBeGreaterThan(0);
    expect(projets.every((p) => p.org_id === organisations[0]!.id)).toBe(true);
    const profils = (await (await admin.lire("profiles?select=email")).json()) as { email: string }[];
    expect(profils.every((p) => p.email.endsWith("@exemple.invalid"))).toBe(true); // aucun profil d'une autre organisation
  });

  test("le lecteur ne peut rien écrire", async ({ request }) => {
    const admin = await ouvrirSession(request, "admin");
    const kpi = ((await (await admin.lire("kpis?select=id&limit=1")).json()) as { id: string }[])[0]!;
    const lecteur = await ouvrirSession(request, "lecteur");
    const ecriture = await lecteur.ecrire("post", "kpi_entries", { kpi_id: kpi.id, date: "2026-01-15", valeur: 1 });
    expect(ecriture.status()).toBe(403);
    expect(JSON.stringify(await ecriture.json())).toMatch(/row-level security|42501/);
    const projet = ((await (await lecteur.lire("projects?select=id&limit=1")).json()) as { id: string }[])[0]!;
    const modif = await lecteur.ecrire("patch", `projects?id=eq.${projet.id}`, { nom: "Piraté" });
    expect(modif.status() === 403 || (await modif.json()).length === 0).toBe(true);
    const verif = (await (await admin.lire(`projects?id=eq.${projet.id}&select=nom`)).json()) as { nom: string }[];
    expect(verif[0]!.nom).not.toBe("Piraté");
  });

  test("un éditeur ne peut pas supprimer un projet ni gérer l'équipe", async ({ request }) => {
    const editeur = await ouvrirSession(request, "editeur");
    const admin = await ouvrirSession(request, "admin");
    const projet = ((await (await editeur.lire("projects?select=id&limit=1")).json()) as { id: string }[])[0]!;
    const suppression = await editeur.ecrire("delete", `projects?id=eq.${projet.id}`);
    expect(suppression.status() === 403 || (await suppression.json()).length === 0).toBe(true);
    expect(((await (await admin.lire(`projects?id=eq.${projet.id}&select=id`)).json()) as unknown[]).length).toBe(1);
    const invitation = await editeur.ecrire("post", "invitations", { email: "intrus@exemple.invalid", role: "admin" });
    expect(invitation.status()).toBe(403);
    const adhesions = await editeur.ecrire("patch", "memberships?role=eq.lecteur", { role: "admin" });
    expect(adhesions.status() === 403 || (await adhesions.json()).length === 0).toBe(true);
  });

  test("les tentatives de contournement sont refusées par la base", async ({ request }) => {
    const admin = await ouvrirSession(request, "admin");
    const org = ((await (await admin.lire("organisations?select=id")).json()) as { id: string }[])[0]!;
    // Un admin ne change ni son plan ni la fin de son essai.
    for (const colonne of [{ plan: "enterprise" }, { essai_fin: "2099-01-01T00:00:00Z" }, { plan_souhaite: "pro" }]) {
      const r = await admin.ecrire("patch", `organisations?id=eq.${org.id}`, colonne);
      expect(r.status(), JSON.stringify(colonne)).toBe(403);
    }
    // Un client ne crée pas de projet exemple, et ne lit pas les demandes de contact.
    const exemple = await admin.ecrire("post", "projects", {
      org_id: org.id,
      nom: "Faux exemple",
      date_debut: "2026-01-01",
      date_fin: "2026-12-31",
      is_demo: true,
    });
    expect(exemple.status()).toBe(403);
    const leads = await admin.lire("leads?select=id");
    expect(leads.status()).toBe(403);
    // Pas d'écriture entre deux organisations : un indicateur inexistant ou étranger est introuvable.
    const etranger = await admin.ecrire("post", "kpi_entries", {
      kpi_id: "00000000-0000-4000-8000-000000000000",
      date: "2026-01-15",
      valeur: 1,
    });
    expect(etranger.ok()).toBe(false);
  });
});

const PDF = Buffer.from("%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");

/** Un projet de l'organisation de test et l'organisation elle-même (lus avec la session donnée). */
async function projetEtOrg(session: Awaited<ReturnType<typeof ouvrirSession>>) {
  const projet = (
    (await (await session.lire("projects?select=id,org_id&order=created_at&limit=1")).json()) as {
      id: string;
      org_id: string;
    }[]
  )[0]!;
  return { projetId: projet.id, orgId: projet.org_id };
}

test.describe("cœur S&E côté API (phase 1)", () => {
  test.skip(PHASE !== "1");

  test("le lecteur ne peut rien écrire dans réalisations, prochaines étapes, états, documents ni étiquettes", async ({
    request,
  }) => {
    const lecteur = await ouvrirSession(request, "lecteur");
    const { projetId, orgId } = await projetEtOrg(lecteur);
    const ecritures: [string, object][] = [
      ["realisations", { project_id: projetId, date: "2026-01-15", titre: "Intrus" }],
      ["prochaines_etapes", { project_id: projetId, libelle: "Intrus" }],
      [
        "etats_avancement",
        { project_id: projetId, titre: "Intrus", periode_debut: "2026-01-01", periode_fin: "2026-01-31" },
      ],
      ["documents", { project_id: projetId, nom: "Intrus", storage_path: `${orgId}/${projetId}/intrus.pdf` }],
      ["projet_etiquettes", { project_id: projetId, etiquette: "intrus" }],
    ];
    for (const [table, ligne] of ecritures) {
      const reponse = await lecteur.ecrire("post", table, ligne);
      expect(reponse.status(), table).toBe(403);
      expect(JSON.stringify(await reponse.json()), table).toMatch(/row-level security|42501/);
    }
    // Il ne dépose pas de fichier non plus, mais il peut lire : la lecture reste ouverte.
    const depot = await lecteur.deposer(`${orgId}/${projetId}/intrus.pdf`, "application/pdf", PDF);
    expect(depot.ok()).toBe(false);
    expect((await lecteur.lire("documents?select=id")).ok()).toBe(true);
  });

  test("l'éditeur écrit dans son projet, mais le stockage et la base refusent les contournements", async ({
    request,
  }) => {
    const editeur = await ouvrirSession(request, "editeur");
    const { projetId, orgId } = await projetEtOrg(editeur);

    // Un fichier HTML ne peut pas être déposé (il pourrait s'afficher comme une page) ; le dossier d'une autre organisation non plus.
    const html = await editeur.deposer(
      `${orgId}/${projetId}/api-e2e.html`,
      "text/html",
      Buffer.from("<script>alert(1)</script>"),
    );
    expect(html.ok()).toBe(false);
    expect(await html.text()).toMatch(/mime type|not supported/i);
    const autre = await editeur.deposer(
      `00000000-0000-4000-8000-000000000000/${projetId}/api-e2e.pdf`,
      "application/pdf",
      PDF,
    );
    expect(autre.ok()).toBe(false);
    expect(await autre.text()).toMatch(/row-level security|unauthorized/i);

    // Un PDF dans son propre dossier passe ; on le retire aussitôt.
    const chemin = `${orgId}/${projetId}/api-e2e-${Date.now()}.pdf`;
    const depot = await editeur.deposer(chemin, "application/pdf", PDF);
    expect(depot.ok(), await depot.text()).toBe(true);
    expect((await editeur.retirer(chemin)).ok()).toBe(true);

    // La ligne d'un document n'accepte qu'un chemin {organisation}/{projet}/… sans remontée de dossier.
    for (const storage_path of [`${orgId}/autre-projet/x.pdf`, `${orgId}/${projetId}/../x.pdf`]) {
      const ligne = await editeur.ecrire("post", "documents", {
        project_id: projetId,
        nom: "Chemin invalide",
        storage_path,
      });
      expect(ligne.status(), storage_path).toBe(400);
      expect(JSON.stringify(await ligne.json())).toContain("DOCUMENT_CHEMIN_INVALIDE");
    }

    // Un état d'avancement : les taux sont figés par la base, le client ne peut ni les fournir ni les modifier.
    const etat = await editeur.ecrire("post", "etats_avancement", {
      project_id: projetId,
      titre: "État API E2E",
      periode_debut: "2026-01-01",
      periode_fin: "2026-01-31",
    });
    expect(etat.ok(), await etat.text()).toBe(true);
    const { id } = ((await etat.json()) as { id: string }[])[0]!;
    const maj = await editeur.ecrire("patch", `etats_avancement?id=eq.${id}`, { taux_resultats: 99 });
    expect(maj.status()).toBe(403);
    expect(JSON.stringify(await maj.json())).toMatch(/permission denied|42501/);
    expect((await editeur.ecrire("delete", `etats_avancement?id=eq.${id}`)).ok()).toBe(true);

    // Une réalisation ne se rattache qu'à un résultat ou une activité du même projet.
    const intrus = await editeur.ecrire("post", "realisations", {
      project_id: projetId,
      date: "2026-01-15",
      titre: "Rattachement invalide",
      noeud_id: "00000000-0000-4000-8000-000000000000",
    });
    expect(intrus.ok()).toBe(false);
  });

  test("un visiteur anonyme ne lit rien du cœur S&E", async ({ request }) => {
    for (const table of [
      "realisations",
      "prochaines_etapes",
      "etats_avancement",
      "documents",
      "projet_etiquettes",
      "cadre_logique_noeuds",
      "pta_activites",
      "v_avancement",
    ]) {
      const reponse = await request.get(`${URL_SUPABASE}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: CLE! },
      });
      expect(reponse.status(), table).toBe(401);
    }
  });
});

test.describe("fin d'essai côté API (phase 2)", () => {
  test.skip(PHASE !== "2");

  test("toute écriture est refusée par la base (ESSAI_EXPIRE), la lecture reste possible", async ({ request }) => {
    const admin = await ouvrirSession(request, "admin");
    const kpi = ((await (await admin.lire("kpis?select=id&limit=1")).json()) as { id: string }[])[0]!;
    expect((await admin.lire("kpi_entries?select=id&limit=1")).ok()).toBe(true);
    const ecriture = await admin.ecrire("post", "kpi_entries", { kpi_id: kpi.id, date: "2026-01-16", valeur: 1 });
    expect(ecriture.ok()).toBe(false);
    expect(JSON.stringify(await ecriture.json())).toContain("ESSAI_EXPIRE");
    const lot = await admin.rpc("importer_saisies", {
      p_lignes: [{ kpi_id: kpi.id, date: "2026-01-17", valeur: 1 }],
      p_remplacer: false,
    });
    expect(lot.ok()).toBe(false);
    expect(JSON.stringify(await lot.json())).toContain("ESSAI_EXPIRE");
    const projet = await admin.ecrire("post", "projects", {
      org_id: ((await (await admin.lire("organisations?select=id")).json()) as { id: string }[])[0]!.id,
      nom: "Après essai",
      date_debut: "2026-01-01",
      date_fin: "2026-12-31",
    });
    expect(JSON.stringify(await projet.json())).toContain("ESSAI_EXPIRE");
  });

  test("le cœur S&E est lui aussi en lecture seule : lignes et fichiers refusés", async ({ request }) => {
    const admin = await ouvrirSession(request, "admin");
    const { projetId, orgId } = await projetEtOrg(admin);
    for (const [table, ligne] of [
      ["realisations", { project_id: projetId, date: "2026-01-15", titre: "Après essai" }],
      ["prochaines_etapes", { project_id: projetId, libelle: "Après essai" }],
      [
        "etats_avancement",
        { project_id: projetId, titre: "Après essai", periode_debut: "2026-01-01", periode_fin: "2026-01-31" },
      ],
      ["projet_etiquettes", { project_id: projetId, etiquette: "apres-essai" }],
    ] as const) {
      const reponse = await admin.ecrire("post", table, ligne);
      expect(reponse.ok(), table).toBe(false);
      expect(JSON.stringify(await reponse.json()), table).toContain("ESSAI_EXPIRE");
    }
    const depot = await admin.deposer(`${orgId}/${projetId}/apres-essai.pdf`, "application/pdf", PDF);
    expect(depot.ok()).toBe(false); // le stockage refuse aussi l'écriture après la fin d'essai
    expect((await admin.lire("realisations?select=id&limit=1")).ok()).toBe(true); // la lecture reste possible
  });
});
