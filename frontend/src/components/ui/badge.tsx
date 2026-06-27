import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "muted";

const variants: Record<BadgeVariant, string> = {
  default: "bg-zinc-800 text-zinc-300 border-zinc-700",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  danger: "bg-red-500/10 text-red-400 border-red-500/20",
  muted: "bg-zinc-900 text-zinc-500 border-zinc-800",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

// Threat score badge — green/amber/red based on score
export function ThreatBadge({ score }: { score: number }) {
  const variant =
    score >= 60 ? "danger" : score >= 30 ? "warning" : "success";
  const label =
    score >= 60 ? "High" : score >= 30 ? "Medium" : "Low";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold border tabular-nums",
        variants[variant],
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          score >= 60 ? "bg-red-400" : score >= 30 ? "bg-amber-400" : "bg-emerald-400",
        )}
      />
      {score}
      <span className="text-xs font-normal opacity-70">{label}</span>
    </span>
  );
}
