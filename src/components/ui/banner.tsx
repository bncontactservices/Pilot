import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "~/lib/utils";

const variantesBandeau = cva(
  "flex items-start gap-3 rounded-2xl px-4 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variante: {
        info: "bg-subtle text-navy",
        vigilance: "bg-status-warn/10 text-status-warn-ink",
        alerte: "bg-status-alert/8 text-status-alert-ink",
        ok: "bg-status-ok/10 text-status-ok-ink",
      },
    },
    defaultVariants: { variante: "info" },
  },
);

export function Bandeau({
  className,
  variante,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof variantesBandeau>) {
  return <div role="status" className={cn(variantesBandeau({ variante }), className)} {...props} />;
}
