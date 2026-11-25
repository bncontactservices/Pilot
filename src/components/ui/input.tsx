import type * as React from "react";
import { cn } from "~/lib/utils";

export const classesChamp =
  "w-full min-w-0 rounded-xl border border-input bg-card px-3.5 text-base text-foreground shadow-xs transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/80 focus-visible:border-accent-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-destructive aria-invalid:ring-destructive/15 md:text-sm";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return <input type={type} className={cn(classesChamp, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(classesChamp, "min-h-24 py-2.5", className)} {...props} />;
}

export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        classesChamp,
        "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2216%22%20height=%2216%22%20fill=%22none%22%20stroke=%22%235b6670%22%20stroke-width=%222%22%20viewBox=%220%200%2024%2024%22><path%20d=%22m6%209%206%206%206-6%22/></svg>')] bg-[position:right_0.75rem_center] bg-no-repeat pr-10",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
