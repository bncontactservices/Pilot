// Mise en page du rapport PDF (A4). Tout le contenu vient de preparerRapport() ; ce fichier ne calcule rien.
// Le graphique est tracé en vectoriel avec les primitives SVG de @react-pdf, à partir de chart-geometry.ts.

import { Circle, Document, Image, Line, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { StatutKpi } from "../kpi";
import type { Traducteur } from "../traduction";
import { FAMILLE_MONO, FAMILLE_SANS } from "./polices";
import { type DonneesRapport, HAUTEUR_GRAPHIQUE, type KpiRapport, LARGEUR_GRAPHIQUE } from "./donnees";

const NAVY = "#0B2545";
const TEXTE = "#1F2933";
const DISCRET = "#5B6670";
const BORD = "#E4E0D7";
const SABLE = "#F7F5F0";
const EMERAUDE = "#0B7A57";
const COULEUR: Record<StatutKpi, string> = { ok: "#2F9E44", warn: "#E8590C", alert: "#C92A2A", none: "#ADB5BD" };
const ENCRE: Record<StatutKpi, string> = { ok: "#1E7A32", warn: "#A34A00", alert: "#B02525", none: "#5C636A" };

/**
 * Les espaces fines insécables (U+202F) produites par Intl pour les milliers n'existent pas dans toutes
 * les polices : on les remplace par une espace insécable ordinaire.
 */
const txt = (texte: string) => texte.replaceAll(" ", " ");

const s = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    fontFamily: FAMILLE_SANS,
    fontSize: 9.5,
    color: TEXTE,
    lineHeight: 1.35,
  },
  entete: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 },
  nomOrganisation: { fontSize: 12, fontWeight: 700, color: NAVY },
  etiquetteDoc: {
    fontSize: 8,
    fontWeight: 600,
    color: DISCRET,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "right",
  },
  dateDoc: { fontSize: 8.5, color: DISCRET, textAlign: "right", marginTop: 2 },
  titre: { fontSize: 24, fontWeight: 800, color: NAVY, lineHeight: 1.15 },
  meta: { fontSize: 9, color: DISCRET, marginTop: 5 },
  description: { fontSize: 9.5, marginTop: 8, maxWidth: 440 },
  periode: { fontSize: 10, fontWeight: 600, color: NAVY, marginTop: 10 },
  badgeExemple: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: "#EEF1F6",
    borderRadius: 8,
    fontSize: 8,
    fontWeight: 700,
    color: NAVY,
  },
  mentionExemple: { fontSize: 8.5, color: DISCRET, marginTop: 4 },
  synthese: { flexDirection: "row", gap: 14, marginTop: 20, padding: 14, backgroundColor: SABLE, borderRadius: 10 },
  blocSynthese: { flex: 1 },
  etiquette: { fontSize: 8, fontWeight: 600, color: DISCRET, textTransform: "uppercase", letterSpacing: 0.8 },
  grandChiffre: {
    fontFamily: FAMILLE_MONO,
    fontSize: 26,
    fontWeight: 500,
    color: NAVY,
    marginTop: 4,
    lineHeight: 1.2,
    height: 34,
  },
  petit: { fontSize: 8.5, color: DISCRET, marginTop: 3 },
  jauge: { flexDirection: "row", gap: 3, marginTop: 8 },
  segment: { flex: 1, height: 8, borderRadius: 2 },
  legendeStatut: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  point: { width: 7, height: 7, borderRadius: 4 },
  titreSection: { fontSize: 13, fontWeight: 800, color: NAVY, marginTop: 24, marginBottom: 8 },
  ligneEntete: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: NAVY, paddingBottom: 4 },
  ligne: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: BORD,
    alignItems: "center",
  },
  th: { fontSize: 8, fontWeight: 700, color: DISCRET, textTransform: "uppercase", letterSpacing: 0.6 },
  colNom: { width: "36%", paddingRight: 8 },
  colValeur: { width: "18%", paddingRight: 8 },
  colCible: { width: "18%", paddingRight: 8 },
  colAtteint: { width: "10%", paddingRight: 8 },
  colStatut: { width: "18%" },
  mono: { fontFamily: FAMILLE_MONO, fontWeight: 500 },
  carte: { borderWidth: 0.75, borderColor: BORD, borderRadius: 10, padding: 12, marginBottom: 12 },
  carteEntete: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  carteNom: { flex: 1, fontSize: 11, fontWeight: 700, color: NAVY },
  chiffres: { flexDirection: "row", gap: 18, marginTop: 8 },
  chiffreValeur: { fontFamily: FAMILLE_MONO, fontSize: 13, fontWeight: 500, color: NAVY, marginTop: 1 },
  ecart: { fontSize: 9, marginTop: 8 },
  action: { fontSize: 8.5, marginTop: 6, padding: 6, backgroundColor: SABLE, borderRadius: 6 },
  legendeGraphique: { flexDirection: "row", gap: 14, marginTop: 4 },
  traitLegende: { width: 14, height: 0, borderTopWidth: 2, marginRight: 4 },
  commentaire: { marginTop: 4, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: BORD },
  pied: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: DISCRET,
    borderTopWidth: 0.5,
    borderTopColor: BORD,
    paddingTop: 6,
  },
});

/** Pastille de statut : un point dessiné (le caractère « ● » n'existe pas dans la police) et le libellé en toutes lettres. */
function Statut({ statut, libelle }: { statut: StatutKpi; libelle: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View style={[s.point, { backgroundColor: COULEUR[statut] }]} />
      <Text style={{ fontSize: 8.5, fontWeight: 700, color: ENCRE[statut] }}>{libelle}</Text>
    </View>
  );
}

function Logo({ donnees }: { donnees: DonneesRapport }) {
  const { logo, nom } = donnees.organisation;
  if (!logo) return <Text style={s.nomOrganisation}>{txt(nom)}</Text>;
  const echelle = Math.min(130 / logo.largeur, 44 / logo.hauteur, 1);
  return <Image src={logo.src} style={{ width: logo.largeur * echelle, height: logo.hauteur * echelle }} />;
}

function Graphique({ k }: { k: NonNullable<KpiRapport["graphique"]> }) {
  const { zone } = k;
  return (
    <Svg width={LARGEUR_GRAPHIQUE} height={HAUTEUR_GRAPHIQUE} viewBox={`0 0 ${LARGEUR_GRAPHIQUE} ${HAUTEUR_GRAPHIQUE}`}>
      {k.axeY.map((tick, i) => (
        <Line
          key={`gy${i}`}
          x1={zone.gauche}
          x2={zone.droite}
          y1={tick.y}
          y2={tick.y}
          stroke={BORD}
          strokeWidth={0.6}
          strokeDasharray="2 3"
        />
      ))}
      {k.axeY.map((tick, i) => (
        <Text
          key={`ty${i}`}
          x={zone.gauche - 6}
          y={tick.y + 2.5}
          textAnchor="end"
          style={{ fontFamily: FAMILLE_MONO, fontSize: 7, fill: DISCRET }}
        >
          {txt(k.etiquettesY[i] ?? "")}
        </Text>
      ))}
      {k.axeX.map((tick, i) => (
        <Text
          key={`tx${i}`}
          x={tick.x}
          y={zone.bas + 12}
          textAnchor="middle"
          style={{ fontFamily: FAMILLE_SANS, fontSize: 7, fill: DISCRET }}
        >
          {k.etiquettesX[i] ?? ""}
        </Text>
      ))}
      <Line x1={zone.gauche} x2={zone.droite} y1={zone.bas} y2={zone.bas} stroke={BORD} strokeWidth={0.8} />
      <Line
        x1={zone.gauche}
        x2={zone.droite}
        y1={k.yCible}
        y2={k.yCible}
        stroke={EMERAUDE}
        strokeWidth={1.2}
        strokeDasharray="5 3"
      />
      <Path d={k.trajectoire} stroke="#8A929B" strokeWidth={1} strokeDasharray="1.5 3" fill="none" />
      {k.points.length > 1 && <Path d={k.courbe} stroke={NAVY} strokeWidth={1.8} fill="none" />}
      {k.points.map((p, i) => (
        <Circle key={`p${i}`} cx={p.x} cy={p.y} r={2.2} fill={NAVY} />
      ))}
    </Svg>
  );
}

function CarteIndicateur({ k, t }: { k: KpiRapport; t: Traducteur }) {
  return (
    <View style={s.carte} wrap={false}>
      <View style={s.carteEntete}>
        <Text style={s.carteNom}>{txt(k.nom)}</Text>
        <Statut statut={k.statut} libelle={k.statutLibelle} />
      </View>
      <View style={s.chiffres}>
        <View>
          <Text style={s.etiquette}>{t("rapport.document.col_valeur")}</Text>
          <Text style={s.chiffreValeur}>{txt(k.valeur)}</Text>
        </View>
        <View>
          <Text style={s.etiquette}>{t("rapport.document.col_cible")}</Text>
          <Text style={s.chiffreValeur}>{txt(k.cible)}</Text>
        </View>
        <View>
          <Text style={s.etiquette}>{t("rapport.document.col_atteint")}</Text>
          <Text style={s.chiffreValeur}>{txt(k.atteint)}</Text>
        </View>
      </View>
      {k.ecart && <Text style={s.ecart}>{txt(k.ecart)}</Text>}
      {k.action && <Text style={s.action}>{txt(k.action)}</Text>}
      <View style={{ marginTop: 10 }}>
        {k.graphique ? (
          <>
            <Graphique k={k.graphique} />
            <View style={s.legendeGraphique}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={[s.traitLegende, { borderTopColor: NAVY }]} />
                <Text style={{ fontSize: 7.5, color: DISCRET }}>{t("rapport.document.legende_valeurs")}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={[s.traitLegende, { borderTopColor: EMERAUDE, borderTopStyle: "dashed" }]} />
                <Text style={{ fontSize: 7.5, color: DISCRET }}>{t("rapport.document.legende_cible")}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={[s.traitLegende, { borderTopColor: "#8A929B", borderTopStyle: "dotted" }]} />
                <Text style={{ fontSize: 7.5, color: DISCRET }}>{t("rapport.document.legende_trajectoire")}</Text>
              </View>
            </View>
          </>
        ) : (
          <Text style={s.petit}>{t("rapport.document.sans_graphique")}</Text>
        )}
      </View>
      {k.nbSaisies > 0 && (
        <Text style={s.petit}>
          {k.derniereSaisie && `${t("rapport.document.derniere_saisie", { date: k.derniereSaisie })} · `}
          {t("rapport.document.saisies", { count: k.nbSaisies })}
        </Text>
      )}
      {k.commentaires.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text style={s.etiquette}>{t("rapport.document.commentaires")}</Text>
          {k.commentaires.map((c, i) => (
            <View key={i} style={s.commentaire} wrap={false}>
              <Text style={{ fontSize: 8, color: DISCRET }}>
                {c.date} · {txt(c.valeur)}
              </Text>
              <Text>{txt(c.texte)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function RapportPdf({ donnees, t, produit }: { donnees: DonneesRapport; t: Traducteur; produit: string }) {
  const { projet, progression, kpis } = donnees;
  const titreDocument = `${projet.nom} — ${t("rapport.document.titre")}`;
  return (
    <Document
      title={txt(titreDocument)}
      author={txt(donnees.organisation.nom)}
      creator={produit}
      producer={produit}
      language="fr"
    >
      <Page size="A4" style={s.page}>
        <View style={s.entete}>
          <Logo donnees={donnees} />
          <View>
            <Text style={s.etiquetteDoc}>{t("rapport.document.titre")}</Text>
            <Text style={s.dateDoc}>{t("rapport.document.genere_le", { date: donnees.genereLe })}</Text>
          </View>
        </View>

        <Text style={s.titre}>{txt(projet.nom)}</Text>
        <Text style={s.meta}>{txt(projet.meta)}</Text>
        {projet.estExemple && (
          <>
            <Text style={s.badgeExemple}>{t("rapport.document.projet_exemple")}</Text>
            <Text style={s.mentionExemple}>{t("rapport.document.exemple_mention")}</Text>
          </>
        )}
        {projet.description && <Text style={s.description}>{txt(projet.description)}</Text>}
        <Text style={s.periode}>{donnees.periode}</Text>

        <View style={s.synthese}>
          <View style={s.blocSynthese}>
            <Text style={s.etiquette}>{t("rapport.document.progression")}</Text>
            <Text style={s.grandChiffre}>{progression.texte}</Text>
            {progression.trajectoire && <Text style={s.petit}>{progression.trajectoire}</Text>}
          </View>
          <View style={[s.blocSynthese, { flex: 1.3 }]}>
            <Text style={s.etiquette}>{t("rapport.document.statuts")}</Text>
            {donnees.statuts.length > 0 && (
              <View style={s.jauge}>
                {donnees.statuts.map((statut, i) => (
                  <View key={i} style={[s.segment, { backgroundColor: COULEUR[statut] }]} />
                ))}
              </View>
            )}
            <View style={{ marginTop: 6 }}>
              {donnees.comptes
                .filter((c) => c.nombre > 0)
                .map((c) => (
                  <View key={c.statut} style={s.legendeStatut}>
                    <View style={[s.point, { backgroundColor: COULEUR[c.statut] }]} />
                    <Text>
                      <Text style={[s.mono, { color: ENCRE[c.statut] }]}>{c.nombre}</Text> {c.libelle}
                    </Text>
                  </View>
                ))}
            </View>
          </View>
        </View>

        {kpis.length === 0 ? (
          <Text style={[s.petit, { marginTop: 20 }]}>{t("rapport.document.aucun_indicateur")}</Text>
        ) : (
          <>
            <Text style={s.titreSection}>{t("rapport.document.indicateurs")}</Text>
            <View style={s.ligneEntete}>
              <Text style={[s.th, s.colNom]}>{t("rapport.document.col_indicateur")}</Text>
              <Text style={[s.th, s.colValeur]}>{t("rapport.document.col_valeur")}</Text>
              <Text style={[s.th, s.colCible]}>{t("rapport.document.col_cible")}</Text>
              <Text style={[s.th, s.colAtteint]}>{t("rapport.document.col_atteint")}</Text>
              <Text style={[s.th, s.colStatut]}>{t("rapport.document.col_statut")}</Text>
            </View>
            {kpis.map((k) => (
              <View key={k.id} style={s.ligne} wrap={false}>
                <Text style={[s.colNom, { fontWeight: 600 }]}>{txt(k.nom)}</Text>
                <Text style={[s.colValeur, s.mono]}>{txt(k.valeur)}</Text>
                <Text style={[s.colCible, s.mono]}>{txt(k.cible)}</Text>
                <Text style={[s.colAtteint, s.mono]}>{txt(k.atteint)}</Text>
                <View style={s.colStatut}>
                  <Statut statut={k.statut} libelle={k.statutLibelle} />
                </View>
              </View>
            ))}
          </>
        )}

        {/* Le titre reste attaché à la première carte : jamais seul en bas de page. */}
        {kpis.length > 0 && (
          <View wrap={false}>
            <Text style={s.titreSection}>{t("rapport.document.detail")}</Text>
            <CarteIndicateur k={kpis[0]!} t={t} />
          </View>
        )}
        {kpis.slice(1).map((k) => (
          <CarteIndicateur key={k.id} k={k} t={t} />
        ))}

        <View style={s.pied} fixed>
          <Text>{txt(t("rapport.document.pied", { produit, projet: projet.nom }))}</Text>
          <Text
            render={({ pageNumber, totalPages }) => t("rapport.document.page", { page: pageNumber, total: totalPages })}
          />
        </View>
      </Page>
    </Document>
  );
}
