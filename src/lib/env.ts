// Variables publiques (préfixe VITE_). Aucune clé secrète ici.
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  contactEmail: (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) || undefined,
  whatsappNumber: (import.meta.env.VITE_WHATSAPP_NUMBER as string | undefined)?.replace(/\D/g, "") || undefined,
  demoUrl: (import.meta.env.VITE_DEMO_URL as string | undefined) || undefined,
  /** Nom de l'éditeur du produit (fondateur ou société), affiché dans le pied de page et les mentions légales. */
  editeur: (import.meta.env.VITE_EDITEUR_NOM as string | undefined) || undefined,
  /** Adresse publique du site (https://…), sans barre finale : sitemap, balises Open Graph. */
  siteUrl: ((import.meta.env.VITE_SITE_URL as string | undefined) || undefined)?.replace(/\/+$/, ""),
  plausibleDomain: (import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined) || undefined,
  turnstileSiteKey: (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || undefined,
};

export const supabaseConfigure = Boolean(env.supabaseUrl && env.supabaseAnonKey);
