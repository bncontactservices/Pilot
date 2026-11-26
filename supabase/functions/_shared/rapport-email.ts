// Le rapport de suivi envoyé par e-mail (Lot 4b) : de quoi composer le message à partir du contenu que renvoie la base
// (public.rapports_contenu). Aucune dépendance et aucun accès à Deno : le texte et le HTML se testent avec Vitest
// (src/lib/rapport-email.test.ts). Les chiffres sont ceux des vues d'avancement, sans aucun recalcul ; les points d'attention
// suivent les mêmes règles que le rapport PDF d'un programme (src/lib/rapport/programme.ts).
//
// Chaque texte venu des données (organisation, projet, programme, nom du membre) est échappé avant d'entrer dans le HTML.

export type StatutResultats = "ok" | "warn" | "alert" | "none";

export type ProgrammeRapport = {
  id: string;
  nom: string;
  nb_projets: number;
  taux_resultats: number | null;
  taux_physique: number | null;
  taux_financier: number | null;
  nb_projets_depassement: number;
};

export type ProjetRapport = {
  id: string;
  nom: string;
  statut: string;
  programme_id: string | null;
  date_fin: string | null;
  statut_resultats: StatutResultats | null;
  taux_resultats: number | null;
  taux_physique: number | null;
  taux_financier: number | null;
  nb_etapes_en_retard: number;
  nb_kpis: number;
  nb_kpis_avec_donnees: number;
};

export type ContenuRapport = {
  organisation: { nom: string; devise: string } | null;
  seuils: { vert: number; ambre: number };
  programmes: ProgrammeRapport[];
  projets: ProjetRapport[];
};

export type Cadence = "hebdomadaire" | "mensuelle" | "exemple";

export type ParametresMessage = {
  contenu: ContenuRapport;
  /** Nom du membre (sert à la formule d'accueil) ; absent, on écrit « Bonjour, ». */
  destinataire: string | null;
  cadence: Cadence;
  /** Adresse de l'application (https, ou http en local), sans barre finale. */
  appUrl: string;
  date: Date;
};

export type Message = { sujet: string; html: string; texte: string };

// Couleurs de la marque ; les teintes de statut sont celles de l'application (encre foncée sur fond clair).
const MARINE = "#0B2545";
const STATUTS: Record<StatutResultats, { libelle: string; encre: string; fond: string }> = {
  ok: { libelle: "Dans la trajectoire", encre: "#0B6B4D", fond: "#DDF3EA" },
  warn: { libelle: "À surveiller", encre: "#7A4B00", fond: "#FDEFD0" },
  alert: { libelle: "En retard", encre: "#A12A1F", fond: "#FBE3E0" },
  none: { libelle: "Pas de donnée", encre: "#4A5560", fond: "#ECEFF2" },
};

export function echapperHtml(valeur: unknown): string {
  return String(valeur ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** « 47,5 % », ou un tiret quand aucun projet n'a de donnée pour ce taux. */
export function formaterTaux(valeur: number | null | undefined): string {
  if (valeur === null || valeur === undefined || Number.isNaN(Number(valeur))) return "-";
  return `${Number(valeur).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

export function formaterDateLongue(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const statutDe = (p: ProjetRapport): StatutResultats => p.statut_resultats ?? "none";
const pluriel = (n: number, un: string, plusieurs: string) => (n === 1 ? un : plusieurs);

/** Les points d'attention : ce que la direction doit voir sans lire tout le tableau. Mêmes règles que le rapport de programme. */
export function pointsAttention(projets: ProjetRapport[]): string[] {
  const points: string[] = [];
  for (const p of [...projets].sort((a, b) => a.nom.localeCompare(b.nom, "fr"))) {
    if (p.statut_resultats === "alert") {
      points.push(`« ${p.nom} » : les résultats sont en retard sur la trajectoire attendue (statut rouge).`);
    }
    if (p.taux_financier !== null && Number(p.taux_financier) > 100) {
      points.push(`« ${p.nom} » : le budget est dépassé (${formaterTaux(p.taux_financier)} du budget prévu).`);
    }
    if (p.nb_etapes_en_retard > 0) {
      points.push(
        `« ${p.nom} » : ${p.nb_etapes_en_retard} ${pluriel(p.nb_etapes_en_retard, "étape en retard", "étapes en retard")}.`,
      );
    }
    if (p.nb_kpis === 0 || p.nb_kpis_avec_donnees === 0) {
      points.push(`« ${p.nom} » : aucune donnée d'indicateur, les résultats ne sont pas évalués.`);
    }
  }
  return points;
}

function sujet(p: ParametresMessage, org: string): string {
  const date = formaterDateLongue(p.date);
  // Jamais de saut de ligne dans un objet : un nom d'organisation ne doit pas pouvoir en introduire.
  const nom = org.replace(/[\r\n\t]+/g, " ").trim();
  if (p.cadence === "exemple") return `Exemple de rapport de suivi - ${nom}`;
  return `Rapport de suivi ${p.cadence === "hebdomadaire" ? "hebdomadaire" : "mensuel"} - ${nom} · ${date}`;
}

function lien(appUrl: string, chemin: string): string {
  return new URL(chemin, `${appUrl}/`).href;
}

const cellule = (contenu: string, extra = "") =>
  `<td style="padding:10px 12px;border-bottom:1px solid #E6E2D9;font-size:14px;color:#1B2733;${extra}">${contenu}</td>`;

function pastille(statut: StatutResultats, texte: string): string {
  const s = STATUTS[statut];
  return `<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:${s.fond};color:${s.encre};font-size:13px;font-weight:600;white-space:nowrap">${echapperHtml(texte)}</span>`;
}

/** Compose le rapport : sujet, HTML (mise en page en tableaux, styles en ligne) et version texte. */
export function composerRapport(p: ParametresMessage): Message {
  const org = p.contenu.organisation?.nom ?? "votre organisation";
  const projets = p.contenu.projets;
  const programmes = p.contenu.programmes;
  const attention = pointsAttention(projets);
  const enAlerte = projets.filter((x) => x.statut_resultats === "alert").length;
  const date = formaterDateLongue(p.date);
  const accueil = p.destinataire?.trim() ? `Bonjour ${p.destinataire.trim()},` : "Bonjour,";
  const ouvrir = lien(p.appUrl, "/app");
  const parametres = lien(p.appUrl, "/app/parametres");
  const intro =
    projets.length === 0
      ? `Aucun projet n'est en cours de suivi dans ${org} au ${date}.`
      : `Voici l'avancement de ${org} au ${date} : ${projets.length} ${pluriel(projets.length, "projet suivi", "projets suivis")}, ${enAlerte} ${pluriel(enAlerte, "en retard sur ses résultats", "en retard sur leurs résultats")}.`;
  const pourquoi =
    p.cadence === "exemple"
      ? "Ceci est un exemple, envoyé à votre demande : il ne change rien à vos envois programmés."
      : `Vous recevez ce rapport ${p.cadence === "hebdomadaire" ? "chaque semaine" : "chaque mois"} parce que vous l'avez demandé dans votre profil.`;

  // --- Texte -------------------------------------------------------------------------------------------------
  const lignes: string[] = [accueil, "", intro, ""];
  if (programmes.length > 0) {
    lignes.push("PROGRAMMES");
    for (const g of programmes) {
      lignes.push(
        `- ${g.nom} (${g.nb_projets} ${pluriel(g.nb_projets, "projet", "projets")}) : résultats ${formaterTaux(g.taux_resultats)}, physique ${formaterTaux(g.taux_physique)}, financier ${formaterTaux(g.taux_financier)}`,
      );
    }
    lignes.push("");
  }
  if (projets.length > 0) {
    lignes.push("PROJETS");
    for (const x of projets) {
      lignes.push(
        `- ${x.nom} : résultats ${formaterTaux(x.taux_resultats)} (${STATUTS[statutDe(x)].libelle.toLowerCase()}), physique ${formaterTaux(x.taux_physique)}, financier ${formaterTaux(x.taux_financier)}`,
      );
    }
    lignes.push("");
  }
  lignes.push("POINTS D'ATTENTION");
  if (attention.length === 0)
    lignes.push(
      "Aucun point d'attention : aucun projet n'est en alerte, en dépassement de budget ou en retard sur ses étapes.",
    );
  else for (const a of attention) lignes.push(`- ${a}`);
  lignes.push(
    "",
    `Ouvrir Pilot M&E : ${ouvrir}`,
    "",
    pourquoi,
    `Pour l'arrêter ou changer la fréquence : ${parametres}`,
  );

  // --- HTML --------------------------------------------------------------------------------------------------
  const blocProgrammes =
    programmes.length === 0
      ? ""
      : `<h2 style="margin:28px 0 8px;font-size:17px;color:${MARINE}">Programmes</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
<tr>${["Programme", "Résultats", "Physique", "Financier"]
          .map(
            (t, i) =>
              `<th align="${i === 0 ? "left" : "right"}" style="padding:8px 12px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#4A5560;border-bottom:2px solid ${MARINE}">${t}</th>`,
          )
          .join("")}</tr>
${programmes
  .map(
    (g) =>
      `<tr>${cellule(`<strong>${echapperHtml(g.nom)}</strong><br><span style="color:#4A5560;font-size:13px">${g.nb_projets} ${pluriel(g.nb_projets, "projet", "projets")}</span>`)}${cellule(formaterTaux(g.taux_resultats), "text-align:right")}${cellule(formaterTaux(g.taux_physique), "text-align:right")}${cellule(formaterTaux(g.taux_financier), "text-align:right")}</tr>`,
  )
  .join("\n")}
</table>`;

  const blocProjets =
    projets.length === 0
      ? ""
      : `<h2 style="margin:28px 0 8px;font-size:17px;color:${MARINE}">Projets</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
<tr>${["Projet", "Résultats", "Physique", "Financier"]
          .map(
            (t, i) =>
              `<th align="${i === 0 ? "left" : "right"}" style="padding:8px 12px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#4A5560;border-bottom:2px solid ${MARINE}">${t}</th>`,
          )
          .join("")}</tr>
${projets
  .map((x) => {
    const statut = statutDe(x);
    return `<tr>${cellule(`<strong>${echapperHtml(x.nom)}</strong>`)}${cellule(`${pastille(statut, formaterTaux(x.taux_resultats))}<br><span style="color:${STATUTS[statut].encre};font-size:12px">${STATUTS[statut].libelle}</span>`, "text-align:right")}${cellule(formaterTaux(x.taux_physique), "text-align:right")}${cellule(formaterTaux(x.taux_financier), "text-align:right")}</tr>`;
  })
  .join("\n")}
</table>`;

  const blocAttention = `<h2 style="margin:28px 0 8px;font-size:17px;color:${MARINE}">Points d'attention</h2>${
    attention.length === 0
      ? `<p style="margin:0;font-size:14px;color:#1B2733">Aucun point d'attention : aucun projet n'est en alerte, en dépassement de budget ou en retard sur ses étapes.</p>`
      : `<ul style="margin:0;padding-left:20px;font-size:14px;color:#1B2733;line-height:1.55">${attention.map((a) => `<li>${echapperHtml(a)}</li>`).join("")}</ul>`
  }`;

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapperHtml(sujet(p, org))}</title></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1B2733">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#FFFFFF;border-radius:16px;overflow:hidden">
<tr><td style="background:${MARINE};padding:20px 24px;color:#FFFFFF;font-size:20px;font-weight:700">Pilot M&amp;E <span style="font-weight:400;font-size:14px;opacity:.8">· Rapport de suivi</span></td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:16px">${echapperHtml(accueil)}</p>
<p style="margin:0;font-size:15px;line-height:1.55">${echapperHtml(intro)}</p>
${blocProgrammes}
${blocProjets}
${blocAttention}
<p style="margin:28px 0 0"><a href="${echapperHtml(ouvrir)}" style="display:inline-block;background:${MARINE};color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px">Ouvrir Pilot M&amp;E</a></p>
</td></tr>
<tr><td style="padding:16px 24px 24px;font-size:12px;line-height:1.6;color:#4A5560;border-top:1px solid #E6E2D9">${echapperHtml(pourquoi)}<br>Pour l'arrêter ou changer la fréquence : <a href="${echapperHtml(parametres)}" style="color:#0B6B4D">paramètres de votre profil</a>.</td></tr>
</table></td></tr></table>
</body></html>`;

  return { sujet: sujet(p, org), html, texte: lignes.join("\n") };
}
