// Validation d'une demande de contact (démo, client pilote, offre Enterprise).
// Fichier sans dépendance : il sert à l'Edge Function `submit-lead` (Deno) et au formulaire de la
// landing, qui appliquent ainsi exactement les mêmes règles ; ses tests sont dans src/lib/lead.test.ts.
// Les bornes sont celles des contraintes de la table `leads`.

export const TYPES_DEMANDE = ["demo", "pilote", "enterprise"] as const;
export type TypeDemande = (typeof TYPES_DEMANDE)[number];

export type ChampLead = "nom" | "organisation" | "email" | "besoin";
export type CodeErreurLead = "requis" | "trop_court" | "trop_long" | "email_invalide";

export type LeadValide = {
  type_demande: TypeDemande;
  nom: string | null;
  organisation: string | null;
  email: string;
  besoin: string | null;
};

export const LIMITES_LEAD = { nom: 120, organisation: 160, email: 254, besoin: 2000 } as const;
const MIN_TEXTE = 2;
// Même motif que la contrainte SQL `leads.email` : une arobase et un point après elle, sans espace.
const MOTIF_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Retire les caractères de contrôle (sauf retour à la ligne) et les espaces superflus. */
function nettoyer(valeur: unknown): string {
  if (typeof valeur !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return valeur.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
}

/** Champs obligatoires selon le type de demande : le formulaire « client pilote » ne demande que l'e-mail et l'organisation. */
export function champsRequis(type: TypeDemande): ChampLead[] {
  return type === "pilote" ? ["organisation", "email"] : ["nom", "organisation", "email"];
}

export type ResultatValidation =
  | { ok: true; valeur: LeadValide }
  | { ok: false; erreurs: Partial<Record<ChampLead | "type_demande", CodeErreurLead | "inconnu">> };

export function validerLead(brut: unknown): ResultatValidation {
  const entree = (typeof brut === "object" && brut !== null ? brut : {}) as Record<string, unknown>;
  const erreurs: Partial<Record<ChampLead | "type_demande", CodeErreurLead | "inconnu">> = {};

  const type = entree.type_demande;
  if (typeof type !== "string" || !(TYPES_DEMANDE as readonly string[]).includes(type)) {
    return { ok: false, erreurs: { type_demande: "inconnu" } };
  }
  const requis = champsRequis(type as TypeDemande);

  const valeurs: Record<ChampLead, string> = {
    nom: nettoyer(entree.nom),
    organisation: nettoyer(entree.organisation),
    email: nettoyer(entree.email).toLowerCase(),
    besoin: nettoyer(entree.besoin),
  };

  for (const champ of ["nom", "organisation", "email", "besoin"] as const) {
    const texte = valeurs[champ];
    if (texte === "") {
      if (requis.includes(champ)) erreurs[champ] = "requis";
    } else if (texte.length > LIMITES_LEAD[champ]) {
      erreurs[champ] = "trop_long";
    } else if (champ === "email") {
      if (!MOTIF_EMAIL.test(texte)) erreurs.email = "email_invalide";
    } else if (champ !== "besoin" && texte.length < MIN_TEXTE) {
      erreurs[champ] = "trop_court";
    }
  }

  if (Object.keys(erreurs).length > 0) return { ok: false, erreurs };
  return {
    ok: true,
    valeur: {
      type_demande: type as TypeDemande,
      nom: valeurs.nom || null,
      organisation: valeurs.organisation || null,
      email: valeurs.email,
      besoin: valeurs.besoin || null,
    },
  };
}
