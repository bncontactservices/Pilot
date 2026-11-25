import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Layers, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { DialogueProgramme } from "~/components/app/DialogueProgramme";
import { DialogueSuppressionProgramme } from "~/components/app/DialogueSuppressionProgramme";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur, EtatVide } from "~/components/app/Etats";
import { StatutProjet } from "~/components/app/StatutProjet";
import { TauxAvancement } from "~/components/app/TauxAvancement";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { useOrg } from "~/hooks/useContexteOrg";
import i18n from "~/i18n";
import { useAvancements, useAvancementsProgrammes, useProgrammes } from "~/lib/donnees";
import { formaterPeriode } from "~/lib/format";
import { getSupabase } from "~/lib/supabase";

export const meta = () => [{ title: i18n.t("programmes.meta") }];

export default function ProgrammeDetail() {
  const { programmeId = "" } = useParams();
  const { t } = useTranslation();
  const org = useOrg();
  const navigate = useNavigate();
  const [edition, setEdition] = useState(false);
  const [suppression, setSuppression] = useState(false);

  const programmes = useProgrammes(org.organisation.id);
  const consolidations = useAvancementsProgrammes(org.organisation.id);
  const avancements = useAvancements(org.organisation.id);
  const projets = useQuery({
    queryKey: ["projets", org.organisation.id, "programme", programmeId],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("projects")
        .select("id, nom, statut, date_debut, date_fin")
        .eq("programme_id", programmeId)
        .order("nom");
      if (error) throw error;
      return data;
    },
  });

  const retour = (
    <Link
      to="/app/programmes"
      className="lift inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-accent-ink hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {t("programmes.detail.retour")}
    </Link>
  );

  if (programmes.isError) {
    return <EtatErreur erreur={programmes.error} onReessayer={() => void programmes.refetch()} />;
  }
  if (programmes.isPending) {
    return (
      <div className="grid gap-4" aria-busy>
        <Skeleton className="h-10 w-72 rounded-xl" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }
  const programme = programmes.data.find((p) => p.id === programmeId);
  if (!programme) {
    return (
      <EtatVide
        titre={t("programmes.detail.introuvable_titre")}
        description={t("programmes.detail.introuvable_texte")}
        actions={
          <Button asChild>
            <Link to="/app/programmes">{t("programmes.detail.retour")}</Link>
          </Button>
        }
      />
    );
  }

  const consolide = consolidations.data?.get(programme.id);
  const peutSupprimer = org.estAdmin && org.peutEcrire;

  return (
    <>
      <div className="grid gap-5">
        {retour}
        <EntetePage
          titre={programme.nom}
          description={
            <span className="grid gap-1">
              <span className="font-mono text-sm tabular">
                {programme.date_debut && programme.date_fin
                  ? formaterPeriode(programme.date_debut, programme.date_fin)
                  : t("programmes.periode_libre")}
              </span>
              {programme.description && <span className="max-w-3xl text-foreground">{programme.description}</span>}
            </span>
          }
          actions={
            <>
              {org.peutEditer && (
                <Button variante="contour" onClick={() => setEdition(true)}>
                  <Pencil aria-hidden />
                  {t("programmes.modification.titre")}
                </Button>
              )}
              {peutSupprimer && (
                <Button variante="contour" onClick={() => setSuppression(true)}>
                  <Trash2 aria-hidden />
                  {t("commun.supprimer")}
                </Button>
              )}
            </>
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("programmes.detail.consolide")}</CardTitle>
          <CardDescription>{t("programmes.detail.consolide_aide")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {consolidations.isPending ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : (
            <>
              <TauxAvancement
                resultats={consolide?.taux_resultats ?? null}
                physique={consolide?.taux_physique ?? null}
                avecAide
              />
              <p className="text-sm text-muted-foreground">
                {t("programmes.detail.projets_avec_taux", {
                  avec: consolide?.nb_projets_avec_resultats ?? 0,
                  count: consolide?.nb_projets ?? 0,
                })}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="titre-projets-programme" className="grid gap-4">
        <h2 id="titre-projets-programme" className="text-xl font-bold text-navy">
          {t("programmes.detail.projets")}
        </h2>
        {projets.isPending ? (
          <Skeleton className="h-32 rounded-2xl" aria-busy />
        ) : projets.isError ? (
          <EtatErreur erreur={projets.error} onReessayer={() => void projets.refetch()} />
        ) : projets.data.length === 0 ? (
          <EtatVide
            visuel={<Layers className="size-10 text-navy/40" aria-hidden />}
            titre={t("programmes.detail.projets_vide_titre")}
            description={t("programmes.detail.projets_vide_texte")}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3">
            {projets.data.map((projet) => {
              const avancement = avancements.data?.get(projet.id);
              return (
                <li
                  key={projet.id}
                  className="grid gap-3 rounded-2xl bg-card p-4 shadow-card sm:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] sm:items-center"
                >
                  <div className="grid min-w-0 gap-1.5">
                    <div>
                      <StatutProjet statut={projet.statut} />
                    </div>
                    <h3 className="font-bold text-navy">
                      <Link to={`/app/projets/${projet.id}`} className="rounded-md hover:underline">
                        {projet.nom}
                      </Link>
                    </h3>
                    <p className="font-mono text-xs text-muted-foreground tabular">
                      {formaterPeriode(projet.date_debut, projet.date_fin)}
                    </p>
                  </div>
                  {avancements.isPending ? (
                    <Skeleton className="h-12 rounded-xl" />
                  ) : (
                    <TauxAvancement
                      resultats={avancement?.taux_resultats ?? null}
                      physique={avancement?.taux_physique ?? null}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <DialogueProgramme ouvert={edition} onOuvertChange={setEdition} programme={programme} />
      <DialogueSuppressionProgramme
        programme={programme}
        ouvert={suppression}
        onOuvertChange={setSuppression}
        apres={() => void navigate("/app/programmes")}
      />
    </>
  );
}
