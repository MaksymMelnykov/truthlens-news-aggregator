"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-xs sm:text-sm leading-none font-semibold text-foreground select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

function Field({
  className,
  invalid,
  ...props
}: React.ComponentProps<"div"> & { invalid?: boolean }) {
  return (
    <div
      data-slot="field"
      data-invalid={invalid ? "true" : undefined}
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={className} {...props} />;
}

function FieldDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-xs text-muted-foreground leading-relaxed", className)}
      {...props}
    />
  );
}

function FieldError({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-error"
      role="alert"
      className={cn("text-xs font-medium text-destructive leading-relaxed", className)}
      {...props}
    />
  );
}

export {
  Label,
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
};

