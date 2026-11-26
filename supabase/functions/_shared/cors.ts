// En-têtes CORS des Edge Functions appelées depuis le navigateur (invite-member, submit-lead, stripe-checkout, stripe-portal,
// rapports-programmes). Aucune dépendance et aucun accès à Deno : la lecture des variables est passée en paramètre, ce qui
// permet de tout tester (src/lib/cors.test.ts).
//
// Seules les origines de l'application sont admises : ALLOWED_ORIGINS (adresses séparées par des virgules, par exemple pour
// un site de prévisualisation ou un poste de développement) et APP_URL. Sans aucune des deux, aucune origine n'est admise
// (« null ») : le navigateur refuse, ce qui vaut mieux qu'un joker. Le webhook Stripe et le planificateur ne passent pas par
// un navigateur et n'ont besoin d'aucun en-tête CORS.

export type LectureEnv = (nom: string) => string | undefined;

/** Origine (schéma, hôte, port) d'une adresse http(s), ou null si l'adresse n'en est pas une. */
function origineDe(adresse: string): string | null {
  try {
    const url = new URL(adresse.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function originesAutorisees(env: LectureEnv): string[] {
  // APP_URL d'abord : c'est l'origine de référence, celle que reçoit un appelant refusé.
  const brutes = [env("APP_URL") ?? "", ...(env("ALLOWED_ORIGINS") ?? "").split(",")];
  const origines = brutes.map(origineDe).filter((o): o is string => o !== null);
  return [...new Set(origines)];
}

export function entetesCors(requete: Request, env: LectureEnv): Record<string, string> {
  const permises = originesAutorisees(env);
  const origine = requete.headers.get("Origin") ?? "";
  return {
    // Une origine non admise reçoit la première origine admise : le navigateur compare et refuse.
    "Access-Control-Allow-Origin": permises.includes(origine) ? origine : (permises[0] ?? "null"),
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
