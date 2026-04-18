"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "rounded-2xl border border-border bg-card text-card-foreground shadow-[0_16px_38px_rgba(17,17,17,0.12)]",
          title: "text-sm font-semibold",
          description: "text-sm text-muted-foreground",
          actionButton: "rounded-xl",
          cancelButton: "rounded-xl",
        },
      }}
    />
  );
}
