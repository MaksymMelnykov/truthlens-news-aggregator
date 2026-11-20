import React from "react";
import { ShieldCheck, AlertTriangle, AlertOctagon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TrustBadgeProps {
  score: number;
  verdict: string;
  size?: "sm" | "md" | "lg";
}

export const TrustBadge: React.FC<TrustBadgeProps> = ({
  score,
  verdict,
  size = "md",
}) => {
  const isVerified =
    score >= 80 || verdict.toLowerCase().includes("verified");
  const isCaution =
    (score >= 50 && score < 80) || verdict.toLowerCase().includes("caution");

  const variant = isVerified
    ? "verified"
    : isCaution
    ? "warning"
    : "destructive";

  const label = isVerified
    ? "Перевірено"
    : isCaution
    ? "Потребує уваги"
    : "Високий ризик";

  const Icon = isVerified
    ? ShieldCheck
    : isCaution
    ? AlertTriangle
    : AlertOctagon;

  const sizeClasses = {
    sm: "px-2.5 py-0.5 text-xs gap-1",
    md: "px-3 py-1 text-xs gap-1.5",
    lg: "px-3.5 py-1.5 text-sm gap-2",
  };

  return (
    <Badge
      variant={variant}
      className={cn("tabular-nums", sizeClasses[size])}
      title={`Індекс достовірності: ${score.toFixed(0)}% (${label})`}
      aria-label={`Індекс достовірності: ${label}, ${score.toFixed(0)} відсотків`}
    >
      <Icon className="size-3.5" />
      <span>{label}</span>
      <span className="font-mono font-bold tabular-nums">
        {score.toFixed(0)}%
      </span>
    </Badge>
  );
};
