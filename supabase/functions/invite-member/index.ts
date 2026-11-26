// Edge Function « invite-member » : crée une invitation pour l'organisation de l'appelant.
// Vérifie : appelant admin, organisation en écriture, quota d'utilisateurs (trigger SQL), personne déjà membre de
// l'organisation, et plafond d'envoi (public.invitations_autoriser_envoi : délai par adresse, plafond par adresse et par
// organisation). Un compte existant dans une autre organisation n'est jamais signalé (pas d'énumération de comptes).
// Renvoie toujours le lien, pour le copier ou le partager sur WhatsApp, et tente d'envoyer
// l'invitation par e-mail (Resend) quand APP_URL, RESEND_API_KEY et EMAIL_FROM sont configurés.
// Le statut de l'envoi est renvoyé : « envoye », « non_configure » ou « echec ».
//
// Secrets : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (injectés par Supabase),
// APP_URL, RESEND_API_KEY, EMAIL_FROM (à poser dans Edge Functions > Secrets). CORS : APP_URL et ALLOWED_ORIGINS.
//
// Déployée avec verify_jwt désactivé : la fonction authentifie elle-même l'appelant
// (auth.getUser sur le jeton), ce qui fonctionne avec toutes les clés de signature
// du projet et laisse passer la requête CORS préalable, qui n'a pas d'en-tête Authorization.

import { createClient } from "jsr:@supabase/supabase-js@2.119.2";
import { entetesCors } from "../_shared/cors.ts";

const ROLES = ["admin", "editeur", "lecteur"] as const;
const LIBELLES_ROLES: Record<string, string> = { admin: "administrateur", editeur: "éditeur", lecteur: "lecteur" };
const DUREE_VALIDITE_JOURS = 7;

type StatutEmail = "envoye" | "non_configure" | "echec";

function repondreAvec(statut: number, corps: Record<string, unknown>, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function base64Url(octets: Uint8Array): string {
  return btoa(String.fromCharCode(...octets)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(texte: string): Promise<string> {
  const empreinte = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(empreinte), (o) => o.toString(16).padStart(2, "0")).join("");
}

function echapperHtml(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type ParametresEmail = {
  destinataire: string;
  organisation: string;
  invitant: string;
  role: string;
  lien: string;
  expiration: Date;
};

async function envoyerEmail(p: ParametresEmail): Promise<StatutEmail> {
  const cle = Deno.env.get("RESEND_API_KEY");
  const expediteur = Deno.env.get("EMAIL_FROM");
  if (!cle || !expediteur || !Deno.env.get("APP_URL")) return "non_configure";

  const date = p.expiration.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const role = LIBELLES_ROLES[p.role] ?? p.role;
  const invitant = echapperHtml(p.invitant);
  const organisation = echapperHtml(p.organisation);

  try {
    const reponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: expediteur,
        to: [p.destinataire],
        subject: `${p.invitant} vous invite à rejoindre ${p.organisation} sur Pilot M&E`,
        text: [
          "Bonjour,",
          "",
          `${p.invitant} vous invite à rejoindre « ${p.organisation} » sur Pilot M&E, en tant que ${role}.`,
          "",
          `Créez votre compte avec cette adresse e-mail : ${p.lien}`,
          "",
          `Ce lien est personnel et valable jusqu'au ${date}. Si vous ne connaissez pas cette organisation, ignorez ce message.`,
        ].join("\n"),
        html:
          `<p>Bonjour,</p>` +
          `<p><strong>${invitant}</strong> vous invite à rejoindre <strong>« ${organisation} »</strong> sur Pilot M&amp;E, en tant que ${role}.</p>` +
          `<p><a href="${p.lien}">Créer mon compte</a> avec cette adresse e-mail.</p>` +
          `<p style="color:#55606B">Ce lien est personnel et valable jusqu'au ${date}. Si vous ne connaissez pas cette organisation, ignorez ce message.</p>`,
      }),
    });
    if (!reponse.ok) {
      console.error("invite-member:email", reponse.status, (await reponse.text()).slice(0, 300));
      return "echec";
    }
    return "envoye";
  } catch (erreur) {
    console.error("invite-member:email", String(erreur));
    return "echec";
  }
}

Deno.serve(async (requete) => {
  // Seules les origines de l'application sont admises (ALLOWED_ORIGINS, APP_URL) : voir _shared/cors.ts.
  const cors = entetesCors(requete, (nom) => Deno.env.get(nom));
  const repondre = (statut: number, corps: Record<string, unknown>) => repondreAvec(statut, corps, cors);
  if (requete.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (requete.method !== "POST") return repondre(405, { erreur: "METHODE_NON_AUTORISEE" });

  const jwt = requete.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return repondre(401, { erreur: "NON_AUTHENTIFIE" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: erreurAuth } = await admin.auth.getUser(jwt);
  if (erreurAuth || !auth.user) return repondre(401, { erreur: "NON_AUTHENTIFIE" });

  let corps: { email?: unknown; role?: unknown };
  try {
    corps = await requete.json();
  } catch {
    return repondre(400, { erreur: "REQUETE_INVALIDE" });
  }
  const email = String(corps.email ?? "").trim().toLowerCase();
  const role = String(corps.role ?? "");
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return repondre(400, { erreur: "EMAIL_INVALIDE" });
  if (!(ROLES as readonly string[]).includes(role)) return repondre(400, { erreur: "REQUETE_INVALIDE" });

  // Une panne de base ne doit jamais passer pour un refus de droits : on la journalise et on répond 500.
  const { data: membre, error: erreurMembre } = await admin
    .from("memberships")
    .select("org_id, role, organisation:organisations(nom, plan, essai_fin)")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (erreurMembre) {
    console.error("invite-member:memberships", erreurMembre.code, erreurMembre.message);
    return repondre(500, { erreur: "INVITATION_IMPOSSIBLE" });
  }
  if (!membre || membre.role !== "admin") return repondre(403, { erreur: "ACCES_REFUSE" });
  const organisation = membre.organisation as unknown as { nom: string; plan: string; essai_fin: string };
  if (organisation.plan === "essai" && new Date(organisation.essai_fin) <= new Date()) {
    return repondre(403, { erreur: "ESSAI_EXPIRE" });
  }

  // Comparaison insensible à la casse ; % et _ échappés pour ilike.
  const motifEmail = email.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: profil, error: erreurProfil } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", motifEmail)
    .limit(1)
    .maybeSingle();
  if (erreurProfil) {
    console.error("invite-member:profiles", erreurProfil.code, erreurProfil.message);
    return repondre(500, { erreur: "INVITATION_IMPOSSIBLE" });
  }
  if (profil) {
    const { data: dejaMembre, error: erreurDejaMembre } = await admin
      .from("memberships")
      .select("user_id")
      .eq("user_id", profil.id)
      .eq("org_id", membre.org_id)
      .maybeSingle();
    if (erreurDejaMembre) {
      console.error("invite-member:deja-membre", erreurDejaMembre.code, erreurDejaMembre.message);
      return repondre(500, { erreur: "INVITATION_IMPOSSIBLE" });
    }
    // Un membre de sa propre organisation est déjà visible dans l'équipe : le dire ne révèle rien. Un compte qui existe dans
    // une autre organisation, en revanche, n'est jamais signalé (sinon tout inscrit pourrait tester des adresses) : on poursuit
    // comme pour une adresse inconnue. Cette personne ne pourra pas créer un second compte ; l'invitation expirera.
    if (dejaMembre) return repondre(409, { erreur: "DEJA_MEMBRE" });
  }

  // Plafond d'envoi (journal indépendant des invitations : révoquer puis recréer ne le remet pas à zéro). Avant le
  // remplacement ci-dessous, pour qu'un refus ne supprime pas l'invitation en attente.
  const { data: autorisation, error: erreurPlafond } = await admin.rpc("invitations_autoriser_envoi", {
    p_org: membre.org_id,
    p_email: email,
  });
  if (erreurPlafond) {
    console.error("invite-member:plafond", erreurPlafond.code, erreurPlafond.message);
    return repondre(500, { erreur: "INVITATION_IMPOSSIBLE" });
  }
  if (autorisation !== "ok") {
    return repondre(429, { erreur: autorisation === "delai" ? "INVITATION_RECENTE" : "TROP_D_INVITATIONS" });
  }

  // Une nouvelle invitation remplace celle en attente pour la même adresse (c'est aussi le « renvoi »).
  const { error: erreurRemplacement } = await admin
    .from("invitations")
    .delete()
    .eq("org_id", membre.org_id)
    .eq("email", email)
    .is("accepted_at", null);
  if (erreurRemplacement) {
    console.error("invite-member:remplacement", erreurRemplacement.code, erreurRemplacement.message);
    return repondre(500, { erreur: "INVITATION_IMPOSSIBLE" });
  }

  const jeton = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiration = new Date(Date.now() + DUREE_VALIDITE_JOURS * 24 * 3600 * 1000);
  const { error: erreurInsertion } = await admin.from("invitations").insert({
    org_id: membre.org_id,
    email,
    role,
    token_hash: await sha256Hex(jeton),
    expires_at: expiration.toISOString(),
    invited_by: auth.user.id,
  });
  if (erreurInsertion) {
    if (erreurInsertion.message === "PLAN_LIMIT:users") return repondre(409, { erreur: "PLAN_LIMIT:users" });
    console.error("invite-member", erreurInsertion.code, erreurInsertion.message);
    return repondre(500, { erreur: "INVITATION_IMPOSSIBLE" });
  }

  // L'origine fournie par le navigateur ne sert qu'à construire le lien montré à l'admin.
  // Un e-mail n'est envoyé que si APP_URL est configurée : aucun appelant n'impose le domaine du lien.
  const urlConfiguree = Deno.env.get("APP_URL");
  const urlApp = (urlConfiguree ?? requete.headers.get("origin") ?? "").replace(/\/$/, "");
  const lien = `${urlApp}/inscription?invitation=${jeton}`;

  const { data: profilInvitant } = await admin.from("profiles").select("nom").eq("id", auth.user.id).maybeSingle();
  const emailStatut = await envoyerEmail({
    destinataire: email,
    organisation: organisation.nom,
    invitant: profilInvitant?.nom?.trim() || "Un administrateur",
    role,
    lien,
    expiration,
  });

  return repondre(200, { lien, emailStatut, emailEnvoye: emailStatut === "envoye", expiresAt: expiration.toISOString() });
});
