import { useTranslation } from "react-i18next";
import { Input, NativeSelect } from "~/components/ui/input";
import type { usePeriode } from "~/hooks/usePeriode";
import type { ClePeriode } from "~/lib/kpi";

const PERIODES: ClePeriode[] = ["tout", "12m", "6m", "3m", "perso"];

/** Choix de la période, relié à usePeriode(). Rendu en fragment : l'appelant fournit la barre qui le contient. */
export function SelecteurPeriode({ etat }: { etat: ReturnType<typeof usePeriode> }) {
  const { t } = useTranslation();
  const { cle, setCle, perso, setPerso, persoInvalide } = etat;
  return (
    <>
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground sm:min-w-48">
        {t("dashboard.filtres.periode")}
        <NativeSelect
          value={cle}
          onChange={(e) => setCle(e.target.value as ClePeriode)}
          className="h-10 text-sm font-normal text-foreground"
        >
          {PERIODES.map((p) => (
            <option key={p} value={p}>
              {t(`dashboard.periodes.${p}`)}
            </option>
          ))}
        </NativeSelect>
      </label>
      {cle === "perso" && (
        <>
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            {t("dashboard.filtres.du")}
            <Input
              type="date"
              value={perso.debut}
              onChange={(e) => setPerso({ ...perso, debut: e.target.value })}
              className="h-10 text-sm"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            {t("dashboard.filtres.au")}
            <Input
              type="date"
              value={perso.fin}
              onChange={(e) => setPerso({ ...perso, fin: e.target.value })}
              className="h-10 text-sm"
            />
          </label>
        </>
      )}
      {persoInvalide && (
        <p role="alert" className="text-sm font-medium text-destructive sm:basis-full">
          {t("dashboard.filtres.periode_invalide")}
        </p>
      )}
    </>
  );
}
