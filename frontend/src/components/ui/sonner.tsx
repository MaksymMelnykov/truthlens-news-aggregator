"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl px-4 py-3 text-sm",
          description: "text-muted-foreground text-xs",
          actionButton:
            "bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold",
          cancelButton:
            "bg-secondary text-secondary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };

