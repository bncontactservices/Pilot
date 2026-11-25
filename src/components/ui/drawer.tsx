import { X } from "lucide-react";
import { Dialog as DrawerPrimitive } from "radix-ui";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "~/lib/utils";

export const Drawer = DrawerPrimitive.Root;
export const DrawerClose = DrawerPrimitive.Close;
export const DrawerTitle = DrawerPrimitive.Title;
export const DrawerDescription = DrawerPrimitive.Description;

/** Panneau latéral de formulaire : plein écran sur téléphone, colonne à droite sur grand écran. */
export function DrawerContent({ className, children, ...props }: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  const { t } = useTranslation();
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-navy/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <DrawerPrimitive.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-card shadow-card-hover sm:max-w-lg sm:rounded-l-[1.5rem]",
          "data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right duration-300",
          className,
        )}
        {...props}
      >
        {children}
        <DrawerPrimitive.Close className="absolute top-4 right-4 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground">
          <X className="size-5" aria-hidden />
          <span className="sr-only">{t("commun.fermer")}</span>
        </DrawerPrimitive.Close>
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  );
}

export function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid gap-1.5 border-b border-border px-6 py-5 pr-14", className)} {...props} />;
}

export function DrawerBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex-1 overflow-y-auto px-6 py-5", className)} {...props} />;
}

export function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}
