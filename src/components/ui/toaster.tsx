import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-2xl !border-border !bg-card !text-foreground !shadow-card-hover !font-sans",
          description: "!text-muted-foreground",
          success: "[&_[data-icon]]:!text-status-ok-ink",
          error: "[&_[data-icon]]:!text-status-alert-ink",
        },
      }}
    />
  );
}
