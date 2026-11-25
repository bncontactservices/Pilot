import { useMemo, useState } from "react";
import { aujourdhuiIso, type ClePeriode, type Periode, periodePredefinie } from "~/lib/kpi";

/** Période choisie (tableau de bord, rapports) : une période prédéfinie ou deux dates libres. */
export function usePeriode() {
  const aujourdhui = aujourdhuiIso();
  const [cle, setCle] = useState<ClePeriode>("tout");
  const [perso, setPerso] = useState({ debut: "", fin: aujourdhui });

  const persoInvalide = cle === "perso" && perso.debut !== "" && perso.fin !== "" && perso.debut > perso.fin;
  const periode: Periode = useMemo(() => {
    if (cle !== "perso") return periodePredefinie(cle, aujourdhui);
    if (persoInvalide) return periodePredefinie("tout", aujourdhui);
    return { debut: perso.debut || null, fin: perso.fin || aujourdhui };
  }, [cle, perso, persoInvalide, aujourdhui]);

  return { cle, setCle, perso, setPerso, persoInvalide, periode, aujourdhui };
}
