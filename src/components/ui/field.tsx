import type * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "~/lib/utils";

type ChampProps = {
  id: string;
  libelle: React.ReactNode;
  erreur?: string;
  aide?: React.ReactNode;
  optionnel?: boolean;
  className?: string;
  children: (attributs: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => React.ReactNode;
};

/** Libellé, aide et message d'erreur reliés au champ (aria-describedby, aria-invalid). */
export function Champ({ id, libelle, erreur, aide, optionnel, className, children }: ChampProps) {
  const { t } = useTranslation();
  const idAide = aide ? `${id}-aide` : undefined;
  const idErreur = erreur ? `${id}-erreur` : undefined;
  const decrit = [idErreur, idAide].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-semibold text-foreground">
        <span>{libelle}</span>
        {optionnel && <span className="text-xs font-normal text-muted-foreground">{t("commun.facultatif")}</span>}
      </label>
      {children({ id, "aria-invalid": erreur ? true : undefined, "aria-describedby": decrit })}
      {erreur && (
        <p id={idErreur} role="alert" className="text-sm font-medium text-destructive">
          {erreur}
        </p>
      )}
      {aide && (
        <p id={idAide} className="text-sm text-muted-foreground">
          {aide}
        </p>
      )}
    </div>
  );
}
