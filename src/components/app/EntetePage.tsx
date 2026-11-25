import type { ReactNode } from "react";

export function EntetePage({
  titre,
  description,
  actions,
}: {
  titre: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="grid gap-1.5">
        <h1 className="text-3xl font-extrabold text-navy sm:text-4xl">{titre}</h1>
        {description && <div className="text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
