// Géométrie des courbes : fonctions pures partagées par les sparklines (aujourd'hui) et,
// plus tard, la courbe du hero de la landing et le graphique du rapport PDF.

export type Point = { x: number; y: number };

const arrondir = (n: number) => Math.round(n * 100) / 100;

/** Points d'une courbe d'évolution dans un cadre largeur × hauteur ; une courbe plate est tracée au milieu. */
export function pointsCourbe(valeurs: number[], largeur: number, hauteur: number, marge = 3): Point[] {
  const n = valeurs.length;
  if (n === 0) return [];
  const min = Math.min(...valeurs);
  const ampleur = Math.max(...valeurs) - min;
  const largeurUtile = largeur - 2 * marge;
  const hauteurUtile = hauteur - 2 * marge;
  return valeurs.map((valeur, i) => ({
    x: arrondir(n === 1 ? largeur / 2 : marge + (largeurUtile * i) / (n - 1)),
    y: arrondir(ampleur === 0 ? hauteur / 2 : marge + hauteurUtile * (1 - (valeur - min) / ampleur)),
  }));
}

export function cheminLigne(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
}

/** Chemin fermé sous la courbe, pour un remplissage. */
export function cheminAire(points: Point[], hauteur: number): string {
  if (points.length === 0) return "";
  const premier = points[0]!;
  const dernier = points[points.length - 1]!;
  return `${cheminLigne(points)} L${dernier.x} ${hauteur} L${premier.x} ${hauteur} Z`;
}

// -----------------------------------------------------------------------------
// Graphique d'évolution : courbe des valeurs, ligne de cible, trajectoire attendue.
// Partagé par le rapport PDF (tracé vectoriel avec les primitives SVG de @react-pdf).
// -----------------------------------------------------------------------------

const MS_PAR_JOUR = 86_400_000;

/** Débuts de mois (en numéros de jour depuis 1970) dans ]debut, fin], espacés pour ne pas dépasser une huitaine de repères. */
export function ticksMois(debut: number, fin: number, maximum = 8): number[] {
  const depart = new Date(debut * MS_PAR_JOUR);
  const ticks: number[] = [];
  for (let mois = depart.getUTCMonth() + 1, annee = depart.getUTCFullYear(); ; mois++) {
    const x = Math.round(Date.UTC(annee, mois, 1) / MS_PAR_JOUR);
    if (x > fin) break;
    ticks.push(x);
  }
  const pas = Math.ceil(ticks.length / maximum);
  return pas > 1 ? ticks.filter((_, i) => i % pas === 0) : ticks;
}

/** Valeurs « rondes » (1, 2, 2,5, 5 × 10^k) comprises dans [min, max], environ `nombre` repères. */
export function graduationsNettes(min: number, max: number, nombre = 4): number[] {
  if (!(max > min)) return [min];
  const brut = (max - min) / Math.max(1, nombre);
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const mantisse = brut / puissance;
  const pas = (mantisse <= 1 ? 1 : mantisse <= 2 ? 2 : mantisse <= 2.5 ? 2.5 : mantisse <= 5 ? 5 : 10) * puissance;
  const premier = Math.ceil(min / pas - 1e-9) * pas;
  const valeurs: number[] = [];
  for (let v = premier; v <= max + pas * 1e-9; v += pas) valeurs.push(Math.round(v / pas) * pas + 0); // « + 0 » écarte -0
  return valeurs;
}

export type EntreeGraphique = {
  largeur: number;
  hauteur: number;
  marges: { haut: number; droite: number; bas: number; gauche: number };
  /** Domaine horizontal, en numéros de jour. */
  domaineX: [number, number];
  /** Valeurs saisies, triées par jour. */
  serie: { x: number; valeur: number }[];
  cible: number;
  base: number;
  /** Les deux extrémités de la trajectoire attendue. */
  trajectoire: [{ x: number; valeur: number }, { x: number; valeur: number }];
};

export type GeometrieGraphique = {
  courbe: string;
  points: Point[];
  trajectoire: string;
  /** Ordonnée de la ligne de cible. */
  yCible: number;
  axeX: { x: number; jour: number }[];
  axeY: { y: number; valeur: number }[];
  zone: { gauche: number; droite: number; haut: number; bas: number };
};

/** Calcule tous les tracés du graphique dans un cadre largeur × hauteur (unités du SVG). */
export function geometrieGraphique(e: EntreeGraphique): GeometrieGraphique {
  const { largeur, hauteur, marges, domaineX, serie, cible, base, trajectoire } = e;
  const zone = { gauche: marges.gauche, droite: largeur - marges.droite, haut: marges.haut, bas: hauteur - marges.bas };
  const valeurs = [cible, base, trajectoire[0].valeur, trajectoire[1].valeur, ...serie.map((p) => p.valeur)];
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const marge = (max - min || Math.abs(max) || 1) * 0.08;
  const [yMin, yMax] = [min - marge, max + marge];

  const [x0, x1] = domaineX;
  const posX = (jour: number) =>
    arrondir(zone.gauche + ((jour - x0) / Math.max(1, x1 - x0)) * (zone.droite - zone.gauche));
  const posY = (valeur: number) => arrondir(zone.bas - ((valeur - yMin) / (yMax - yMin)) * (zone.bas - zone.haut));

  const points = serie.map((p) => ({ x: posX(p.x), y: posY(p.valeur) }));
  return {
    courbe: cheminLigne(points),
    points,
    trajectoire: cheminLigne(trajectoire.map((p) => ({ x: posX(p.x), y: posY(p.valeur) }))),
    yCible: posY(cible),
    axeX: ticksMois(x0, x1).map((jour) => ({ x: posX(jour), jour })),
    axeY: graduationsNettes(yMin, yMax).map((valeur) => ({ y: posY(valeur), valeur })),
    zone,
  };
}
