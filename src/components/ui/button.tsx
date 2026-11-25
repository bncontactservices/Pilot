import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "~/lib/utils";

const variantesBouton = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap select-none",
    "transition-[transform,box-shadow,background-color,color] duration-200 ease-soft",
    "hover:scale-[1.03] active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variante: {
        primaire: "bg-primary text-primary-foreground shadow-sm hover:bg-navy-soft",
        accent: "bg-accent text-accent-foreground shadow-sm hover:shadow-md",
        secondaire: "bg-secondary text-secondary-foreground hover:bg-[#e3ded2]",
        contour: "border border-input bg-card text-foreground hover:bg-subtle",
        fantome: "text-foreground hover:bg-subtle hover:scale-100",
        danger: "bg-destructive text-destructive-foreground shadow-sm hover:bg-[#962020]",
        lien: "text-accent-ink underline-offset-4 hover:underline hover:scale-100 px-0",
      },
      taille: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icone: "size-10",
      },
    },
    defaultVariants: { variante: "primaire", taille: "md" },
  },
);

export type BoutonProps = React.ComponentProps<"button"> &
  VariantProps<typeof variantesBouton> & { asChild?: boolean; chargement?: boolean };

export function Button({
  className,
  variante,
  taille,
  asChild = false,
  chargement = false,
  children,
  disabled,
  ...props
}: BoutonProps) {
  const Composant = asChild ? Slot.Root : "button";
  return (
    <Composant
      className={cn(variantesBouton({ variante, taille }), className)}
      disabled={asChild ? undefined : disabled || chargement}
      aria-busy={chargement || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {chargement && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Composant>
  );
}

export { variantesBouton };
