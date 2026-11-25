import { useTranslation } from "react-i18next";
import { IMPORT_LIGNES_APERCU } from "~/lib/constants";
import { type Champ, type Correspondance, type Table } from "~/lib/import";
import { cn } from "~/lib/utils";

/** « A », « B »… « AA » : le nom des colonnes dans un tableur. */
export function lettreColonne(index: number): string {
  let n = index + 1;
  let lettre = "";
  while (n > 0) {
    const reste = (n - 1) % 26;
    lettre = String.fromCharCode(65 + reste) + lettre;
    n = Math.floor((n - 1) / 26);
  }
  return lettre;
}

/** Aperçu des premières lignes ; chaque colonne associée à un champ porte le nom de ce champ. */
export function ApercuTable({ table, correspondance }: { table: Table; correspondance: Correspondance }) {
  const { t } = useTranslation();
  const entetes = table[0] ?? [];
  const lignes = table.slice(1, 1 + IMPORT_LIGNES_APERCU);
  const champDe = new Map<number, Champ>();
  for (const [champ, index] of Object.entries(correspondance) as [Champ, number | null][]) {
    if (index !== null) champDe.set(index, champ);
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold text-navy">{t("import.colonnes.apercu", { count: lignes.length })}</p>
      {lignes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("import.colonnes.apercu_vide")}</p>
      ) : (
        <div className="relative -mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="border-b border-border align-bottom text-xs text-muted-foreground">
                {entetes.map((entete, i) => {
                  const champ = champDe.get(i);
                  return (
                    <th
                      key={i}
                      scope="col"
                      className={cn("px-3 py-2 font-semibold", champ && "bg-accent/10 text-accent-ink")}
                    >
                      <span className="block font-mono text-[0.7rem] font-normal">{lettreColonne(i)}</span>
                      <span className="block max-w-48 truncate text-foreground">
                        {entete || t("import.colonnes.colonne", { n: i + 1 })}
                      </span>
                      {champ && <span className="block text-[0.7rem]">{t(`import.champs.${champ}`)}</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lignes.map((ligne, r) => (
                <tr key={r}>
                  {entetes.map((_, i) => (
                    <td
                      key={i}
                      className={cn("max-w-48 truncate px-3 py-2 font-mono text-xs", champDe.has(i) && "bg-accent/5")}
                    >
                      {ligne[i]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
