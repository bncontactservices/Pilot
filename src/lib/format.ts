import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

export function formaterDate(iso: string, motif = "d MMM yyyy"): string {
  return format(parseISO(iso), motif, { locale: fr });
}

export function formaterPeriode(debut: string, fin: string): string {
  return `${formaterDate(debut, "MMM yyyy")} – ${formaterDate(fin, "MMM yyyy")}`;
}

/** Jours restants avant une échéance (0 le jour même, négatif une fois passée). */
export function joursRestants(iso: string, maintenant = new Date()): number {
  return differenceInCalendarDays(parseISO(iso), maintenant);
}

export function formaterMontant(valeur: number, devise: string): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: devise, maximumFractionDigits: 0 }).format(
    valeur,
  );
}

/** Montant avec ses centimes seulement s'il en a : « 12,5 FCFA » mais « 12 000 FCFA ». Pour les dépenses saisies à la main. */
export function formaterMontantExact(valeur: number, devise: string): string {
  const entier = Number.isInteger(valeur);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: devise,
    minimumFractionDigits: entier ? 0 : 2,
    maximumFractionDigits: entier ? 0 : 2,
  }).format(valeur);
}

export function initiales(nom: string | null | undefined, email?: string | null): string {
  const source = (nom || email || "?").trim();
  const mots = source.split(/[\s@._-]+/).filter(Boolean);
  return ((mots[0]?.[0] ?? "?") + (mots[1]?.[0] ?? "")).toUpperCase();
}

const FORMAT_NOMBRE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export function formaterNombre(valeur: number): string {
  return FORMAT_NOMBRE.format(valeur);
}

/** Valeur suivie de son unité, ex. « 1 250 personnes » ou « 74 % ». */
export function formaterValeur(valeur: number, unite: string): string {
  const nombre = formaterNombre(valeur);
  if (!unite) return nombre;
  return unite === "%" ? `${nombre} %` : `${nombre} ${unite}`;
}

export function formaterEcart(valeur: number): string {
  return `${valeur > 0 ? "+" : valeur < 0 ? "−" : ""}${formaterNombre(Math.abs(valeur))}`;
}

const FORMAT_TAILLE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** Taille d'un fichier : « 850 o », « 12,4 Ko », « 3,2 Mo ». */
export function formaterTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${FORMAT_TAILLE.format(octets / 1024)} Ko`;
  return `${FORMAT_TAILLE.format(octets / (1024 * 1024))} Mo`;
}

export function formaterPourcentage(pourcent: number): string {
  return `${Math.round(pourcent)} %`;
}
