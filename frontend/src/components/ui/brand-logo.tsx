import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function BrandLogo({ size = "md", className }: BrandLogoProps) {
  const containerSize =
    size === "sm" ? "size-8 rounded-lg" : size === "lg" ? "size-11 rounded-2xl" : "size-9 rounded-xl";
  const iconSize =
    size === "sm" ? "size-4" : size === "lg" ? "size-6" : "size-5";

  return (
    <div
      className={cn(
        "relative flex items-center justify-center border border-primary/35 bg-secondary text-primary shadow-sm transition-transform duration-200 group-hover:scale-[1.03]",
        containerSize,
        className
      )}
      aria-hidden="true"
    >
      <ShieldCheck className={iconSize} />
      <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent ring-2 ring-background" />
    </div>
  );
}

