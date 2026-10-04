import { cn } from "@/lib/utils";

export function PageLoading({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 h-40 text-zinc-600 text-sm",
        className,
      )}
    >
      <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}
