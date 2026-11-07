import { Card, CardContent } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

interface KpiProps {
  label: string;
  value: string;
  sub?: string;
  diff?: number; // percent vs comparator
  diffLabel?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  icon?: React.ReactNode;
  onClick?: () => void;
}

export function KpiCard({
  label,
  value,
  sub,
  diff,
  diffLabel,
  tone = "default",
  icon,
  onClick,
}: KpiProps) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-destructive"
          : tone === "info"
            ? "text-info"
            : "text-accent";

  const arrow =
    diff === undefined ? null : diff > 0.5 ? (
      <ArrowUp className="h-3 w-3" />
    ) : diff < -0.5 ? (
      <ArrowDown className="h-3 w-3" />
    ) : (
      <Minus className="h-3 w-3" />
    );

  const diffColor =
    diff === undefined
      ? ""
      : diff > 0
        ? "text-success"
        : diff < 0
          ? "text-destructive"
          : "text-muted-foreground";

  return (
    <Card
      onClick={onClick}
      className={`rounded-lg border-0 border-l-[6px] shadow-card bg-cream/30 hover:shadow-teal-glow transition-all duration-200 cursor-pointer overflow-hidden relative ${
        tone === "warning"
          ? "border-l-accent bg-gradient-to-r from-accent/10 to-transparent shadow-accent-glow"
          : tone === "danger"
            ? "border-l-coral bg-gradient-to-r from-coral/10 to-transparent shadow-coral-glow"
            : tone === "success"
              ? "border-l-success"
              : tone === "info"
                ? "border-l-secondary"
                : "border-l-primary-light"
      }`}
    >
      <CardContent className="p-4 relative z-10">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-primary-dark truncate">
              {label}
            </p>
            <p className="text-2xl font-extrabold tracking-wide text-primary-dark mt-2">
              {value}
            </p>
            {sub && (
              <p className="text-xs text-primary-dark/80 font-medium mt-1">
                {sub}
              </p>
            )}
          </div>
          {icon && (
            <div className={`shrink-0 opacity-80 ${toneClass}`}>{icon}</div>
          )}
        </div>
        {diff !== undefined && (
          <div
            className={`flex items-center gap-1 text-xs font-bold mt-3 ${diffColor}`}
          >
            {" "}
            {arrow} <span>{Math.abs(diff).toFixed(1)}%</span>{" "}
            <span className="text-primary-dark/70 font-medium">
              {diffLabel}
            </span>{" "}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
