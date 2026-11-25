import { env } from "./env";

/** Lien WhatsApp vers l'équipe commerciale, ou null si aucun numéro n'est configuré. */
export function lienWhatsAppEquipe(message: string): string | null {
  if (!env.whatsappNumber) return null;
  return `https://wa.me/${env.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

/** Lien de partage WhatsApp sans destinataire (l'utilisateur choisit le contact). */
export function lienPartageWhatsApp(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function lienEmailEquipe(sujet: string): string | null {
  if (!env.contactEmail) return null;
  return `mailto:${env.contactEmail}?subject=${encodeURIComponent(sujet)}`;
}
