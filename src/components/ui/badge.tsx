import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "~/lib/utils";

const variantesBadge = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5",
  {
    variants: {
      variante: {
        neutre: "bg-muted text-muted-foreground",
        marque: "bg-navy text-white",
        contour: "border border-border bg-card text-foreground",
        ok: "bg-status-ok/12 text-status-ok-ink",
        vigilance: "bg-status-warn/12 text-status-warn-ink",
        alerte: "bg-status-alert/10 text-status-alert-ink",
        exemple: "border border-dashed border-navy/40 bg-subtle text-navy",
      },
    },
    defaultVariants: { variante: "neutre" },
  },
);

export function Badge({
  className,
  variante,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof variantesBadge>) {
  return <span className={cn(variantesBadge({ variante }), className)} {...props} />;
}
