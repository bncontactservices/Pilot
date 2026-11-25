import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { type DragEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/** Zone de dépôt d'un fichier : glisser-déposer ou bouton (le champ de fichier natif reste accessible au clavier). */
export function ZoneDepot({
  onFichier,
  occupe,
  erreur,
}: {
  onFichier: (fichier: File) => void;
  occupe: boolean;
  erreur: string | null;
}) {
  const { t } = useTranslation();
  const idErreur = useId();
  const champ = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);

  const deposer = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setSurvol(false);
    const fichier = e.dataTransfer.files[0];
    if (fichier && !occupe) onFichier(fichier);
  };

  return (
    <div className="grid gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={deposer}
        className={cn(
          "flex flex-col items-center gap-4 rounded-[1.5rem] border-2 border-dashed px-6 py-12 text-center transition-colors",
          survol ? "border-accent-ink bg-accent/10" : "border-navy/20 bg-card/60",
        )}
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-subtle text-navy">
          {occupe ? (
            <Loader2 className="size-7 animate-spin" aria-hidden />
          ) : (
            <FileSpreadsheet className="size-7" aria-hidden />
          )}
        </span>
        <div className="grid gap-1">
          <p className="text-lg font-bold text-navy">{occupe ? t("import.depot.lecture") : t("import.depot.titre")}</p>
          <p className="text-sm text-muted-foreground">{t("import.depot.formats")}</p>
        </div>
        <input
          ref={champ}
          type="file"
          accept=".csv,.txt,.tsv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label={t("import.depot.libelle")}
          aria-describedby={erreur ? idErreur : undefined}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const fichier = e.target.files?.[0];
            e.target.value = ""; // permet de rechoisir le même fichier après correction
            if (fichier) onFichier(fichier);
          }}
        />
        <Button onClick={() => champ.current?.click()} disabled={occupe}>
          <Upload aria-hidden />
          {t("import.depot.choisir")}
        </Button>
      </div>
      {erreur && (
        <p id={idErreur} role="alert" className="text-sm font-medium text-destructive">
          {erreur}
        </p>
      )}
    </div>
  );
}
