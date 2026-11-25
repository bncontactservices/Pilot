import { useQuery } from "@tanstack/react-query";
import { BarChart3, FileDown, Plus } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { EtatVide, JaugeVide } from "~/components/app/Etats";
import { CarteKpi } from "~/components/app/kpi/CarteKpi";
import { DialogueProchaineEtape, type DepartProchaineEtape } from "~/components/app/suivi/DialogueProchaineEtape";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { NativeSelect } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { SelecteurPeriode } from "~/components/app/SelecteurPeriode";
import { useOrg } from "~/hooks/useContexteOrg";
import { useExportPdf } from "~/hooks/useExportPdf";
import { usePeriode } from "~/hooks/usePeriode";
import i18n from "~/i18n";
import { MAX_KPI_EPINGLES } from "~/lib/constants";
import { type SaisieLigne, useSeuils } from "~/lib/donnees";
import { useProchainesEtapes } from "~/lib/donnees-se";
import { estOuverte } from "~/lib/suivi";
import { formaterDate, formaterValeur } from "~/lib/format";
import { evaluerProjet, serieEvolution } from "~/lib/kpi";
import { getSupabase } from "~/lib/supabase";
import { useContexteProjet } from "../ProjetLayout";

// Recharts n'est téléchargé qu'à l'ouverture du tableau de bord.
const GrapheEvolution = lazy(() => import("~/components/app/kpi/GrapheEvolution"));

export const meta = () => [{ title: i18n.t("dashboard.meta") }];

export default function Dashboard() {
  const { t } = useTranslation();
  const org = useOrg();
  const navigate = useNavigate();
  const { projet, kpis, saisies } = useContexteProjet();

  const etatPeriode = usePeriode();
  const { periode, aujourdhui } = etatPeriode;
  const [kpiGrapheId, setKpiGrapheId] = useState<string | null>(null);
  const { exporter, enCours: exportEnCours } = useExportPdf();

  const projets = useQuery({
    queryKey: ["projets-selecteur", org.organisation.id],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("projects").select("id, nom").order("nom");
      if (error) throw error;
      return data;
    },
  });

  const seuils = useSeuils(org.organisation.id);
  // « Créer une prochaine étape » depuis l'alerte d'un indicateur ; les étapes déjà ouvertes sont comptées par indicateur.
  const prochaines = useProchainesEtapes(projet.id);
  const [departEtape, setDepartEtape] = useState<DepartProchaineEtape | null>(null);
  const ouvertesParKpi = useMemo(() => {
    const comptes = new Map<string, number>();
    for (const e of prochaines.data ?? []) {
      if (e.kpi_id && estOuverte(e.statut)) comptes.set(e.kpi_id, (comptes.get(e.kpi_id) ?? 0) + 1);
    }
    return comptes;
  }, [prochaines.data]);
  const evaluation = useMemo(
    () => evaluerProjet(kpis, saisies, { projet, periode, aujourdhui, seuils }),
    [kpis, saisies, projet, periode, aujourdhui, seuils],
  );
  const parKpi = useMemo(() => {
    const groupes = new Map<string, SaisieLigne[]>();
    for (const s of saisies) groupes.set(s.kpi_id, [...(groupes.get(s.kpi_id) ?? []), s]);
    return groupes;
  }, [saisies]);

  const epingles = kpis.filter((k) => k.epingle).slice(0, MAX_KPI_EPINGLES);
  const affiches = epingles.length > 0 ? epingles : kpis.slice(0, MAX_KPI_EPINGLES);
  const kpiGraphe = kpis.find((k) => k.id === kpiGrapheId) ?? affiches[0] ?? null;
  const dernieres = useMemo(
    () => [...saisies].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 8),
    [saisies],
  );
  const peutAjouterKpi = org.peutEditer && !projet.is_demo;

  if (kpis.length === 0) {
    return (
      <EtatVide
        visuel={<JaugeVide />}
        titre={t("dashboard.vide.titre")}
        description={peutAjouterKpi ? t("dashboard.vide.texte") : t("dashboard.vide.texte_lecture")}
        actions={
          peutAjouterKpi && (
            <Button asChild>
              <Link to={`/app/projets/${projet.id}/indicateurs`}>
                <Plus aria-hidden />
                {t("dashboard.vide.action")}
              </Link>
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card sm:flex-row sm:flex-wrap sm:items-end">
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground sm:min-w-56">
          {t("dashboard.filtres.projet")}
          <NativeSelect
            value={projet.id}
            onChange={(e) => navigate(`/app/projets/${e.target.value}`)}
            className="h-10 text-sm font-normal text-foreground"
          >
            {(projets.data ?? [{ id: projet.id, nom: projet.nom }]).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </NativeSelect>
        </label>
        <SelecteurPeriode etat={etatPeriode} />
        <Button
          variante="contour"
          className="sm:ml-auto"
          chargement={exportEnCours}
          disabled={etatPeriode.persoInvalide}
          onClick={() => void exporter({ projet, kpis, saisies, periode })}
        >
          <FileDown aria-hidden />
          {exportEnCours ? t("rapport.generation") : t("rapport.exporter")}
        </Button>
      </div>

      {saisies.length === 0 && (
        <Bandeau variante="info" className="flex-wrap items-center">
          <BarChart3 aria-hidden />
          <p className="min-w-0 flex-1">{t("dashboard.aucune_saisie")}</p>
          {org.peutEditer && (
            <Button asChild variante="contour" taille="sm">
              <Link to={`/app/projets/${projet.id}/saisie`}>{t("dashboard.premiere_saisie")}</Link>
            </Button>
          )}
        </Bandeau>
      )}

      {epingles.length === 0 && <p className="-mb-2 text-sm text-muted-foreground">{t("dashboard.aucun_epingle")}</p>}
      <h2 className="sr-only">{t("dashboard.cartes_titre")}</h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {affiches.map((kpi) => {
          const e = evaluation.evaluations.find((x) => x.id === kpi.id)!;
          return (
            <li key={kpi.id}>
              <CarteKpi
                kpi={kpi}
                evaluation={e}
                serie={serieEvolution(kpi, parKpi.get(kpi.id) ?? [], projet.date_debut)}
                peutSaisir={org.peutEditer}
                etapesOuvertes={ouvertesParKpi.get(kpi.id) ?? 0}
                onCreerEtape={
                  org.peutEditer && prochaines.isSuccess
                    ? () =>
                        setDepartEtape({
                          libelle: t(`prochaines.suggestion.${e.statut === "alert" ? "alert" : "warn"}`, {
                            nom: kpi.nom,
                          }),
                          kpiId: kpi.id,
                        })
                    : undefined
                }
              />
            </li>
          );
        })}
      </ul>

      {kpiGraphe && (
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid gap-1">
              <CardTitle>{t("dashboard.evolution")}</CardTitle>
              <CardDescription>{t("dashboard.evolution_description")}</CardDescription>
            </div>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground sm:w-72">
              {t("dashboard.indicateur")}
              <NativeSelect
                value={kpiGraphe.id}
                onChange={(e) => setKpiGrapheId(e.target.value)}
                className="h-10 text-sm font-normal text-foreground"
              >
                {kpis.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nom}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </CardHeader>
          <CardContent>
            {(parKpi.get(kpiGraphe.id)?.length ?? 0) === 0 ? (
              <EtatVide
                className="border-0 bg-transparent py-8"
                titre={t("dashboard.graphe_vide_titre")}
                description={t("dashboard.graphe_vide_texte")}
                actions={
                  org.peutEditer && (
                    <Button asChild variante="contour">
                      <Link to={`/app/projets/${projet.id}/saisie?kpi=${kpiGraphe.id}`}>
                        {t("dashboard.premiere_saisie")}
                      </Link>
                    </Button>
                  )
                }
              />
            ) : (
              <Suspense fallback={<Skeleton className="h-72 w-full sm:h-80" />}>
                <GrapheEvolution
                  kpi={kpiGraphe}
                  serie={serieEvolution(kpiGraphe, parKpi.get(kpiGraphe.id) ?? [], projet.date_debut)}
                  projet={projet}
                  periode={periode}
                />
              </Suspense>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.dernieres_saisies")}</CardTitle>
        </CardHeader>
        <CardContent>
          {dernieres.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("dashboard.aucune_saisie_courte")}</p>
          ) : (
            <div className="relative -mx-2 overflow-x-auto px-2">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      {t("saisie.colonnes.date")}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      {t("saisie.colonnes.indicateur")}
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-semibold">
                      {t("saisie.colonnes.valeur")}
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      {t("saisie.colonnes.commentaire")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dernieres.map((s) => {
                    const kpi = kpis.find((k) => k.id === s.kpi_id);
                    return (
                      <tr key={s.id}>
                        <td className="py-2.5 pr-4 font-mono text-xs whitespace-nowrap tabular">
                          {formaterDate(s.date)}
                        </td>
                        <td className="py-2.5 pr-4 font-medium">{kpi?.nom}</td>
                        <td className="py-2.5 pr-4 text-right font-mono whitespace-nowrap tabular">
                          {formaterValeur(s.valeur, kpi?.unite ?? "")}
                        </td>
                        <td className="py-2.5 text-muted-foreground">{s.commentaire}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <DialogueProchaineEtape
        ouvert={departEtape !== null}
        onFermer={() => setDepartEtape(null)}
        projetId={projet.id}
        depart={departEtape}
        kpis={kpis}
        responsablesExistants={(prochaines.data ?? []).map((e) => e.responsable)}
      />
    </div>
  );
}
