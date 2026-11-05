import React from "react";
import { ShieldCheck, AlertTriangle, AlertOctagon } from "lucide-react";

interface TrustBadgeProps {
  score: number;
  verdict: string;
  size?: "sm" | "md" | "lg";
}

export const TrustBadge: React.FC<TrustBadgeProps> = ({ score, verdict, size = "md" }) => {
  const isVerified = score >= 80 || verdict.toLowerCase().includes("verified");
  const isCaution = (score >= 50 && score < 80) || verdict.toLowerCase().includes("caution");
  const isHighRisk = score < 50 || verdict.toLowerCase().includes("risk") || verdict.toLowerCase().includes("suspicious");

  const getBadgeConfig = () => {
    if (isVerified) {
      return {
        bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
        icon: <ShieldCheck className={size === "sm" ? "w-3.5 h-3.5" : size === "lg" ? "w-5 h-5" : "w-4 h-4"} />,
        label: "Перевірено",
      };
    }
    if (isCaution) {
      return {
        bg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
        icon: <AlertTriangle className={size === "sm" ? "w-3.5 h-3.5" : size === "lg" ? "w-5 h-5" : "w-4 h-4"} />,
        label: "Потребує уваги",
      };
    }
    return {
      bg: "bg-rose-500/10 text-rose-400 border-rose-500/30",
      icon: <AlertOctagon className={size === "sm" ? "w-3.5 h-3.5" : size === "lg" ? "w-5 h-5" : "w-4 h-4"} />,
      label: "Високий ризик",
    };
  };

  const config = getBadgeConfig();

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5 font-medium",
    lg: "px-3.5 py-1.5 text-sm gap-2 font-semibold",
  };

  return (
    <div
      className={`inline-flex items-center rounded-full border backdrop-blur-sm ${config.bg} ${sizeClasses[size]}`}
      title={`Індекс довіри: ${score.toFixed(0)}% (${verdict})`}
    >
      {config.icon}
      <span>{config.label}</span>
      <span className="font-mono opacity-80 font-bold">{score.toFixed(0)}%</span>
    </div>
  );
};
