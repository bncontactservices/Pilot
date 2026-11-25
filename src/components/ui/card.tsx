import type * as React from "react";
import { cn } from "~/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("min-w-0 rounded-2xl bg-card text-card-foreground shadow-card", className)} {...props} />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 px-5 pt-5 sm:px-6 sm:pt-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-lg font-bold text-navy", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-5 py-5 sm:px-6", className)} {...props} />;
}
