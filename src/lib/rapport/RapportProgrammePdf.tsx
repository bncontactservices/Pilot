// Mise en page du rapport PDF d'un programme (A4). Tout le contenu vient de preparerRapportProgramme() ; ce fichier ne
// calcule rien. Même identité visuelle que le rapport de projet (polices, couleurs, en-tête, pied de page).

import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { StatutKpi } from "../kpi";
import type { Traducteur } from "../traduction";
import { FAMILLE_MONO, FAMILLE_SANS } from "./polices";
import type { DonneesRapportProgramme, LigneProjetRapport } from "./programme";
import { formaterDate } from "../format";

const NAVY = "#0B2545";
const TEXTE = "#1F2933";
const DISCRET = "#5B6670";
const BORD = "#E4E0D7";
const SABLE = "#F7F5F0";
const ALERTE = "#B02525";
const COULEUR: Record<StatutKpi, string> = { ok: "#2F9E44", warn: "#E8590C", alert: "#C92A2A", none: "#ADB5BD" };

/** Les espaces fines insécables produites par Intl n'existent pas dans toutes les polices : on les remplace. */
const txt = (texte: string) => texte.replaceAll("\u202f", "\xa0");

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
  periode: { fontSize: 10, fontWeight: 600, color: NAVY, marginTop: 8 },
  description: { fontSize: 9.5, marginTop: 8, maxWidth: 440 },
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
  notes: { marginTop: 8 },
  note: { fontSize: 8.5, color: DISCRET, marginTop: 3 },
  titreSection: { fontSize: 13, fontWeight: 800, color: NAVY, marginTop: 24, marginBottom: 8 },
  ligneEntete: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: NAVY, paddingBottom: 4 },
  ligne: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: BORD,
    alignItems: "flex-start",
  },
  th: { fontSize: 8, fontWeight: 700, color: DISCRET, textTransform: "uppercase", letterSpacing: 0.6 },
  colNom: { width: "27%", paddingRight: 8 },
  colStatut: { width: "12%", paddingRight: 8 },
  colPeriode: { width: "15%", paddingRight: 8 },
  colTaux: { width: "12%", paddingRight: 6 },
  colFinancier: { width: "22%" },
  mono: { fontFamily: FAMILLE_MONO, fontWeight: 500 },
  petit: { fontSize: 7.5, color: DISCRET, marginTop: 2 },
  point: { width: 7, height: 7, borderRadius: 4 },
  attention: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: SABLE,
    borderRadius: 6,
  },
  barreAttention: { width: 3, backgroundColor: ALERTE, borderRadius: 2 },
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

function Logo({ donnees }: { donnees: DonneesRapportProgramme }) {
  const { logo, nom } = donnees.organisation;
  if (!logo) return <Text style={s.nomOrganisation}>{txt(nom)}</Text>;
  const echelle = Math.min(130 / logo.largeur, 44 / logo.hauteur, 1);
  return <Image src={logo.src} style={{ width: logo.largeur * echelle, height: logo.hauteur * echelle }} />;
}

function LigneProjet({ p }: { p: LigneProjetRapport }) {
  return (
    <View style={s.ligne} wrap={false}>
      <Text style={[s.colNom, { fontWeight: 600 }]}>{txt(p.nom)}</Text>
      <Text style={s.colStatut}>{txt(p.statut)}</Text>
      <Text style={[s.colPeriode, { fontSize: 8.5 }]}>{txt(p.periode)}</Text>
      <View style={[s.colTaux, { flexDirection: "row", alignItems: "center", gap: 4 }]}>
        <View style={[s.point, { backgroundColor: COULEUR[p.statutResultats] }]} />
        <Text style={s.mono}>{txt(p.resultats)}</Text>
      </View>
      <Text style={[s.colTaux, s.mono]}>{txt(p.physique)}</Text>
      <View style={s.colFinancier}>
        <Text style={[s.mono, p.depassement ? { color: ALERTE, fontWeight: 700 } : {}]}>{txt(p.financier)}</Text>
        {p.budget && <Text style={s.petit}>{txt(p.budget)}</Text>}
      </View>
    </View>
  );
}

export function RapportProgrammePdf({
  donnees,
  t,
  produit,
}: {
  donnees: DonneesRapportProgramme;
  t: Traducteur;
  produit: string;
}) {
  const { programme, synthese, projets, attention } = donnees;
  return (
    <Document title={`${t("rapport.programme.titre")} — ${programme.nom}`} author={produit} creator={produit}>
      <Page size="A4" style={s.page}>
        <View style={s.entete}>
          <Logo donnees={donnees} />
          <View>
            <Text style={s.etiquetteDoc}>{t("rapport.programme.titre")}</Text>
            <Text style={s.dateDoc}>
              {txt(t("rapport.document.genere_le", { date: formaterDate(donnees.genereLe) }))}
            </Text>
          </View>
        </View>

        <Text style={s.titre}>{txt(programme.nom)}</Text>
        {programme.periode && <Text style={s.periode}>{txt(programme.periode)}</Text>}
        {programme.description && <Text style={s.description}>{txt(programme.description)}</Text>}

        <View style={s.synthese} wrap={false}>
          {(
            [
              ["resultats", synthese.resultats],
              ["physique", synthese.physique],
              ["financier", synthese.financier],
            ] as const
          ).map(([cle, valeur]) => (
            <View key={cle} style={s.blocSynthese}>
              <Text style={s.etiquette}>{t(`rapport.programme.${cle}`)}</Text>
              <Text style={s.grandChiffre}>{txt(valeur)}</Text>
            </View>
          ))}
        </View>
        <View style={s.notes}>
          {synthese.notes.map((n) => (
            <Text key={n} style={s.note}>
              {txt(n)}
            </Text>
          ))}
        </View>

        <Text style={s.titreSection}>{t("rapport.programme.projets")}</Text>
        {projets.length === 0 ? (
          <Text style={s.note}>{t("rapport.programme.aucun_projet")}</Text>
        ) : (
          <>
            <View style={s.ligneEntete}>
              <Text style={[s.th, s.colNom]}>{t("rapport.programme.col_projet")}</Text>
              <Text style={[s.th, s.colStatut]}>{t("rapport.programme.col_statut")}</Text>
              <Text style={[s.th, s.colPeriode]}>{t("rapport.programme.col_periode")}</Text>
              <Text style={[s.th, s.colTaux]}>{t("rapport.programme.col_resultats")}</Text>
              <Text style={[s.th, s.colTaux]}>{t("rapport.programme.col_physique")}</Text>
              <Text style={[s.th, s.colFinancier]}>{t("rapport.programme.col_financier")}</Text>
            </View>
            {projets.map((p) => (
              <LigneProjet key={p.id} p={p} />
            ))}
          </>
        )}

        {/* Le titre reste attaché au premier point d'attention : jamais seul en bas de page. */}
        <View wrap={false}>
          <Text style={s.titreSection}>{t("rapport.programme.attention_titre")}</Text>
          {attention.length === 0 ? (
            <Text style={s.note}>{t("rapport.programme.aucune_attention")}</Text>
          ) : (
            <View style={s.attention}>
              <View style={s.barreAttention} />
              <Text style={{ flex: 1 }}>{txt(attention[0]!)}</Text>
            </View>
          )}
        </View>
        {attention.slice(1).map((a) => (
          <View key={a} style={s.attention} wrap={false}>
            <View style={s.barreAttention} />
            <Text style={{ flex: 1 }}>{txt(a)}</Text>
          </View>
        ))}

        <View style={s.pied} fixed>
          <Text>{txt(t("rapport.programme.pied", { produit, programme: programme.nom }))}</Text>
          <Text
            render={({ pageNumber, totalPages }) => t("rapport.document.page", { page: pageNumber, total: totalPages })}
          />
        </View>
      </Page>
    </Document>
  );
}
