import { Check, FileDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SelecteurPeriode } from "~/components/app/SelecteurPeriode";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { useExportPdf } from "~/hooks/useExportPdf";
import { usePeriode } from "~/hooks/usePeriode";
import i18n from "~/i18n";
import { useContexteProjet } from "../ProjetLayout";

export const meta = () => [{ title: i18n.t("rapport.meta") }];

const CONTENU = ["synthese", "tableau", "graphiques", "commentaires"] as const;

export default function Rapports() {
  const { t } = useTranslation();
  const { projet, kpis, saisies } = useContexteProjet();
  const periode = usePeriode();
  const { exporter, enCours } = useExportPdf();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardHeader>
          <CardTitle>{t("rapport.titre")}</CardTitle>
          <CardDescription>{t("rapport.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <SelecteurPeriode etat={periode} />
          </div>
          {kpis.length === 0 && <Bandeau variante="vigilance">{t("rapport.aucun_kpi")}</Bandeau>}
          <Button
            className="w-fit"
            chargement={enCours}
            disabled={kpis.length === 0 || periode.persoInvalide}
            onClick={() => void exporter({ projet, kpis, saisies, periode: periode.periode })}
          >
            <FileDown aria-hidden />
            {enCours ? t("rapport.generation") : t("rapport.generer")}
          </Button>
          <p className="text-sm text-muted-foreground">{t("rapport.lecture_ok")}</p>
        </CardContent>
      </Card>

      <Card className="self-start">
        <CardHeader>
          <CardTitle className="text-base">{t("rapport.contenu_titre")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 text-sm">
            {CONTENU.map((cle) => (
              <li key={cle} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-status-ok-ink" aria-hidden />
                <span>{t(`rapport.contenu.${cle}`)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
