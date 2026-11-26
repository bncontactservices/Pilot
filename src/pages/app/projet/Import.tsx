import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Download, FileDown, TriangleAlert, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { EtatVide, JaugeVide } from "~/components/app/Etats";
import { ApercuTable, lettreColonne } from "~/components/app/import/ApercuTable";
import { ZoneDepot } from "~/components/app/import/ZoneDepot";
import { useGestionErreur } from "~/components/app/LimitePlan";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { NativeSelect } from "~/components/ui/input";
import { useOrg } from "~/hooks/useContexteOrg";
import i18n from "~/i18n";
import { IMPORT_TAILLE_LOT } from "~/lib/constants";
import { cles } from "~/lib/donnees";
import {
  type AnalyseImport,
  analyserTable,
  CHAMPS,
  type Champ,
  type Classeur,
  cleSaisie,
  type Correspondance,
  construireModele,
  construireRapportErreurs,
  decouperEnLots,
  ErreurLecture,
  proposerCorrespondance,
  type Traducteur,
} from "~/lib/import";
import { aujourdhuiIso } from "~/lib/kpi";
import { getSupabase } from "~/lib/supabase";
import { nomFichierSur, telecharger } from "~/lib/telechargement";
import { cn } from "~/lib/utils";
import { useContexteProjet } from "../ProjetLayout";

export const meta = () => [{ title: i18n.t("import.meta") }];

type Etape = "fichier" | "colonnes" | "verification" | "import" | "resultat";
type Mode = "ignorer" | "remplacer";
type Resume = { importees: number; remplacees: number; ignorees: number; rejetees: number; interrompu: boolean };

const ETAPES_AFFICHEES = ["fichier", "colonnes", "verification", "resultat"] as const;
const RANG: Record<Etape, number> = { fichier: 0, colonnes: 1, verification: 2, import: 2, resultat: 3 };
const OBLIGATOIRES: Record<Champ, boolean> = { indicateur: false, date: true, valeur: true, commentaire: false };

export default function Import() {
  const { t } = useTranslation();
  const org = useOrg();
  const { projet, kpis } = useContexteProjet();

  if (!org.peutEcrire) return <Bandeau variante="alerte">{t("import.essai_termine")}</Bandeau>;
  if (!org.peutEditer) return <Bandeau>{t("import.lecture_seule")}</Bandeau>;
  if (kpis.length === 0) {
    return (
      <EtatVide
        visuel={<JaugeVide />}
        titre={t("import.aucun_kpi.titre")}
        description={t("import.aucun_kpi.texte")}
        actions={
          <Button asChild>
            <Link to={`/app/projets/${projet.id}/indicateurs`}>{t("import.aucun_kpi.action")}</Link>
          </Button>
        }
      />
    );
  }
  return <Assistant />;
}

function Assistant() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const gererErreur = useGestionErreur();
  const { projet, kpis, saisies } = useContexteProjet();
  const aujourdhui = aujourdhuiIso();

  const [etape, setEtape] = useState<Etape>("fichier");
  const [lecture, setLecture] = useState(false);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [source, setSource] = useState<{ nom: string; classeur: Classeur } | null>(null);
  const [feuilleIndex, setFeuilleIndex] = useState(0);
  const [correspondance, setCorrespondance] = useState<Correspondance>({
    indicateur: null,
    date: null,
    valeur: null,
    commentaire: null,
  });
  const [kpiDefautId, setKpiDefautId] = useState("");
  const [mode, setMode] = useState<Mode>("ignorer");
  const [progression, setProgression] = useState({ fait: 0, total: 0 });
  const [resume, setResume] = useState<Resume | null>(null);

  const feuille = source?.classeur.feuilles[feuilleIndex] ?? null;
  const decalage = (feuille?.numeroEntete ?? 1) - 1;
  const existantes = useMemo(() => new Set(saisies.map((s) => cleSaisie(s.kpi_id, s.date))), [saisies]);
  const kpisImport = useMemo(() => kpis.map((k) => ({ id: k.id, nom: k.nom })), [kpis]);

  // Analyse de tout le fichier : calculée seulement une fois les colonnes validées.
  const analyse: AnalyseImport | null = useMemo(() => {
    if (!feuille || RANG[etape] < RANG.verification) return null;
    return analyserTable(feuille.table, correspondance, kpisImport, {
      kpiParDefautId: kpiDefautId || null,
      existantes,
      aujourdhui,
    });
  }, [feuille, etape, correspondance, kpisImport, kpiDefautId, existantes, aujourdhui]);

  const choisirFeuille = (index: number, classeur: Classeur) => {
    setFeuilleIndex(index);
    setCorrespondance(proposerCorrespondance(classeur.feuilles[index]?.table[0] ?? []));
  };

  const lireFichier = async (fichier: File) => {
    setLecture(true);
    setErreurLecture(null);
    try {
      const { lireFichierImport } = await import("~/lib/import-client");
      const classeur = await lireFichierImport(fichier);
      setSource({ nom: fichier.name, classeur });
      choisirFeuille(0, classeur);
      setKpiDefautId(kpis.length === 1 ? kpis[0]!.id : "");
      setEtape("colonnes");
    } catch (e) {
      const code = e instanceof ErreurLecture ? e.code : "illisible";
      setErreurLecture(t(`import.erreurs_lecture.${code}`));
    } finally {
      setLecture(false);
    }
  };

  const recommencer = () => {
    setSource(null);
    setResume(null);
    setErreurLecture(null);
    setMode("ignorer");
    setEtape("fichier");
  };

  const importer = async () => {
    if (!analyse) return;
    const lignes = analyse.valides;
    setEtape("import");
    setProgression({ fait: 0, total: lignes.length });
    const cumul = { importees: 0, remplacees: 0, ignorees: 0 };
    let interrompu = false;
    try {
      let fait = 0;
      for (const lot of decouperEnLots(lignes, IMPORT_TAILLE_LOT)) {
        const { data, error } = await getSupabase().rpc("importer_saisies", {
          p_lignes: lot.map((l) => ({ kpi_id: l.kpiId, date: l.date, valeur: l.valeur, commentaire: l.commentaire })),
          p_remplacer: mode === "remplacer",
        });
        if (error) throw error;
        const r = data?.[0];
        cumul.importees += r?.inserees ?? 0;
        cumul.remplacees += r?.remplacees ?? 0;
        cumul.ignorees += r?.ignorees ?? 0;
        fait += lot.length;
        setProgression({ fait, total: lignes.length });
      }
    } catch (e) {
      interrompu = true;
      gererErreur(e);
    } finally {
      void queryClient.invalidateQueries({ queryKey: cles.saisies(projet.id) });
      void queryClient.invalidateQueries({ queryKey: cles.orgSaisies(projet.org_id) });
    }
    setResume({ ...cumul, rejetees: analyse.rejetees.length, interrompu });
    setEtape("resultat");
    if (!interrompu) toast.success(t("import.resultat.toast", { count: cumul.importees + cumul.remplacees }));
  };

  const traduire: Traducteur = (cle, valeurs) => t(cle, { ...valeurs });
  const telechargerRapport = () => {
    if (!analyse) return;
    telecharger(
      `rapport-erreurs_${nomFichierSur(projet.nom)}_${aujourdhui}.csv`,
      construireRapportErreurs(analyse.rejetees, decalage, traduire),
    );
  };
  const telechargerModele = () =>
    telecharger(t("import.modele.fichier"), construireModele(kpisImport, aujourdhui, traduire));

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid gap-1">
        <h2 className="text-xl font-bold text-navy">{t("import.titre")}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("import.description")}</p>
      </div>

      <nav aria-label={t("import.etapes_nav")}>
        <ol className="flex flex-wrap gap-x-6 gap-y-2">
          {ETAPES_AFFICHEES.map((cle, i) => {
            const rang = RANG[etape];
            const courante = i === rang;
            return (
              <li key={cle} aria-current={courante ? "step" : undefined} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-xs font-bold",
                    courante
                      ? "bg-navy text-white"
                      : i < rang
                        ? "bg-status-ok text-white"
                        : "bg-subtle text-muted-foreground",
                  )}
                >
                  {i < rang ? <Check className="size-3.5" aria-hidden /> : i + 1}
                </span>
                <span className={cn("font-semibold", courante ? "text-navy" : "text-muted-foreground")}>
                  {t(`import.etapes.${cle}`)}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      {etape === "fichier" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ZoneDepot onFichier={(f) => void lireFichier(f)} occupe={lecture} erreur={erreurLecture} />
          <Card className="self-start">
            <CardHeader>
              <CardTitle className="text-base">{t("import.attendu.titre")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-muted-foreground">
              <p>{t("import.attendu.indicateur")}</p>
              <p>{t("import.attendu.un_seul")}</p>
              <p>{t("import.attendu.dates")}</p>
              <Button variante="contour" taille="sm" className="w-fit" onClick={telechargerModele}>
                <FileDown aria-hidden />
                {t("import.modele.action")}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {etape === "colonnes" && source && feuille && (
        <Card>
          <CardHeader>
            <CardTitle>{t("import.colonnes.titre")}</CardTitle>
            <CardDescription>
              {t("import.colonnes.description")}{" "}
              <span className="font-mono">{t("import.colonnes.fichier", { nom: source.nom })}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-6">
            {source.classeur.feuilles.length > 1 && (
              <label className="grid max-w-sm gap-1.5 text-sm font-semibold">
                {t("import.colonnes.feuille")}
                <NativeSelect
                  value={feuilleIndex}
                  onChange={(e) => choisirFeuille(Number(e.target.value), source.classeur)}
                >
                  {source.classeur.feuilles.map((f, i) => (
                    <option key={f.nom} value={i}>
                      {f.nom}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {CHAMPS.map((champ) => (
                <label key={champ} className="grid gap-1.5 text-sm font-semibold">
                  <span>
                    {t(`import.champs.${champ}`)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({OBLIGATOIRES[champ] ? t("import.colonnes.obligatoire") : t("import.colonnes.facultatif")})
                    </span>
                  </span>
                  <NativeSelect
                    value={correspondance[champ] ?? ""}
                    onChange={(e) => {
                      const valeur = e.target.value === "" ? null : Number(e.target.value);
                      // Une colonne ne sert qu'à un champ : on libère l'autre.
                      setCorrespondance((c) => {
                        const suivante = { ...c, [champ]: valeur };
                        for (const autre of CHAMPS)
                          if (autre !== champ && valeur !== null && suivante[autre] === valeur) suivante[autre] = null;
                        return suivante;
                      });
                    }}
                    className="font-normal"
                  >
                    <option value="">
                      {champ === "indicateur" ? t("import.colonnes.un_seul") : t("import.colonnes.ignorer")}
                    </option>
                    {feuille.table[0]!.map((entete, i) => (
                      <option key={i} value={i}>
                        {lettreColonne(i)} - {entete || t("import.colonnes.colonne", { n: i + 1 })}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              ))}
            </div>

            {correspondance.indicateur === null && (
              <label className="grid max-w-md gap-1.5 text-sm font-semibold">
                {t("import.colonnes.kpi_defaut")}
                <NativeSelect
                  value={kpiDefautId}
                  onChange={(e) => setKpiDefautId(e.target.value)}
                  className="font-normal"
                >
                  <option value="">{t("import.colonnes.kpi_defaut_choix")}</option>
                  {kpis.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nom}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            )}

            <ApercuTable table={feuille.table} correspondance={correspondance} />
            <p className="text-sm text-muted-foreground">{t("import.colonnes.aide_dates")}</p>

            {(correspondance.date === null || correspondance.valeur === null) && (
              <p role="status" className="text-sm font-medium text-status-warn-ink">
                {t("import.colonnes.manquante")}
              </p>
            )}
            {correspondance.indicateur === null && kpiDefautId === "" && (
              <p role="status" className="text-sm font-medium text-status-warn-ink">
                {t("import.colonnes.kpi_requis")}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variante="contour" onClick={recommencer}>
                <ArrowLeft aria-hidden />
                {t("import.colonnes.changer")}
              </Button>
              <Button
                onClick={() => setEtape("verification")}
                disabled={
                  correspondance.date === null ||
                  correspondance.valeur === null ||
                  (correspondance.indicateur === null && kpiDefautId === "")
                }
              >
                {t("import.colonnes.verifier")}
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {etape === "verification" && analyse && (
        <Verification
          analyse={analyse}
          decalage={decalage}
          mode={mode}
          onMode={setMode}
          onRetour={() => setEtape("colonnes")}
          onImporter={() => void importer()}
          onRapport={telechargerRapport}
        />
      )}

      {etape === "import" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("import.progression.titre")}</CardTitle>
            <CardDescription aria-live="polite">{t("import.progression.texte", progression)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progression.total}
              aria-valuenow={progression.fait}
              aria-label={t("import.progression.titre")}
              className="h-3 overflow-hidden rounded-full bg-subtle"
            >
              <div
                className="h-full rounded-full bg-accent-ink transition-[width] duration-300"
                style={{ width: `${progression.total === 0 ? 0 : (progression.fait / progression.total) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {etape === "resultat" && resume && (
        <Card>
          <CardHeader>
            <CardTitle>
              {resume.interrompu ? t("import.resultat.titre_interrompu") : t("import.resultat.titre")}
            </CardTitle>
            {resume.interrompu && (
              <CardDescription>
                {t("import.resultat.texte_interrompu", { count: resume.importees + resume.remplacees })}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-5">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["importees", resume.importees],
                  ["remplacees", resume.remplacees],
                  ["ignorees", resume.ignorees],
                  ["rejetees", resume.rejetees],
                ] as const
              ).map(([cle, valeur]) => (
                <div key={cle} className="rounded-2xl bg-sand px-4 py-3">
                  <dt className="text-xs text-muted-foreground">{t(`import.resultat.${cle}`)}</dt>
                  <dd className="mt-1 font-mono text-2xl font-semibold text-navy tabular">{valeur}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to={`/app/projets/${projet.id}`}>{t("import.resultat.dashboard")}</Link>
              </Button>
              {resume.rejetees > 0 && (
                <Button variante="contour" onClick={telechargerRapport}>
                  <Download aria-hidden />
                  {t("import.verification.rapport")}
                </Button>
              )}
              <Button variante="contour" onClick={recommencer}>
                <Upload aria-hidden />
                {t("import.resultat.nouveau")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const LIGNES_REJETS_AFFICHEES = 20;

function Verification({
  analyse,
  decalage,
  mode,
  onMode,
  onRetour,
  onImporter,
  onRapport,
}: {
  analyse: AnalyseImport;
  decalage: number;
  mode: Mode;
  onMode: (mode: Mode) => void;
  onRetour: () => void;
  onImporter: () => void;
  onRapport: () => void;
}) {
  const { t } = useTranslation();
  const rejets = analyse.rejetees;
  const problemes = rejets.flatMap((r) => r.problemes.map((p) => ({ ligne: r.ligne, p })));
  const affichees = problemes.slice(0, LIGNES_REJETS_AFFICHEES);
  const restantes = rejets.length - new Set(affichees.map((a) => a.ligne)).size;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("import.verification.titre")}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["lues", analyse.total],
              ["valides", analyse.valides.length],
              ["rejetees", rejets.length],
              ["conflits", analyse.conflits],
            ] as const
          ).map(([cle, valeur]) => (
            <div key={cle} className="rounded-2xl bg-sand px-4 py-3">
              <dt className="text-xs text-muted-foreground">{t(`import.verification.${cle}`)}</dt>
              <dd className="mt-1 font-mono text-2xl font-semibold text-navy tabular">{valeur}</dd>
            </div>
          ))}
        </dl>

        {analyse.valides.length === 0 ? (
          <Bandeau variante="alerte">
            <TriangleAlert aria-hidden />
            {t("import.verification.aucune_valide")}
          </Bandeau>
        ) : (
          rejets.length === 0 && (
            <Bandeau variante="ok">
              <Check aria-hidden />
              {t("import.verification.toutes_valides")}
            </Bandeau>
          )
        )}

        {analyse.conflits > 0 && (
          <fieldset className="grid grid-cols-1 gap-3">
            <legend className="text-sm font-bold text-navy">{t("import.verification.conflit_titre")}</legend>
            <p className="text-sm text-muted-foreground">
              {t("import.verification.conflit_texte", { count: analyse.conflits })}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(["ignorer", "remplacer"] as const).map((valeur) => (
                <label
                  key={valeur}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-ink",
                    mode === valeur ? "border-navy bg-subtle" : "border-border bg-card",
                  )}
                >
                  <input
                    type="radio"
                    name="mode-import"
                    value={valeur}
                    checked={mode === valeur}
                    onChange={() => onMode(valeur)}
                    className="mt-1 size-4 accent-navy"
                  />
                  <span className="grid gap-0.5">
                    <span className="font-semibold text-navy">{t(`import.verification.${valeur}`)}</span>
                    <span className="text-muted-foreground">{t(`import.verification.${valeur}_aide`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {rejets.length > 0 && (
          <section className="grid grid-cols-1 gap-3" aria-labelledby="titre-rejets">
            <div className="grid gap-1">
              <h3 id="titre-rejets" className="text-sm font-bold text-navy">
                {t("import.verification.rejetees_titre")}
              </h3>
              <p className="text-sm text-muted-foreground">{t("import.verification.rejetees_texte")}</p>
            </div>
            <div className="relative -mx-2 overflow-x-auto px-2">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      {t("import.verification.col_ligne")}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      {t("import.verification.col_colonne")}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      {t("import.verification.col_valeur")}
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      {t("import.verification.col_probleme")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {affichees.map(({ ligne, p }, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-4 font-mono text-xs tabular">{ligne + decalage}</td>
                      <td className="py-2 pr-4">{t(`import.champs.${p.champ}`)}</td>
                      <td className="max-w-48 truncate py-2 pr-4 font-mono text-xs">{p.valeurLue}</td>
                      <td className="py-2 text-status-alert-ink">
                        {t(`import.raisons.${p.raison}`, {
                          ligne: p.ligneRef === undefined ? undefined : p.ligneRef + decalage,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {restantes > 0 && (
              <p className="text-sm text-muted-foreground">{t("import.verification.autres", { count: restantes })}</p>
            )}
            <Button variante="contour" taille="sm" className="w-fit" onClick={onRapport}>
              <Download aria-hidden />
              {t("import.verification.rapport")}
            </Button>
          </section>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variante="contour" onClick={onRetour}>
            <ArrowLeft aria-hidden />
            {t("import.verification.retour")}
          </Button>
          <Button onClick={onImporter} disabled={analyse.valides.length === 0}>
            {t("import.verification.importer", { count: analyse.valides.length })}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
