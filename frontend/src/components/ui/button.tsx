import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "ghost" | "outline" | "destructive" | "secondary";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  default:
    "bg-white text-zinc-900 hover:bg-zinc-100 font-medium shadow-sm",
  ghost:
    "text-zinc-400 hover:text-zinc-100 hover:bg-white/5",
  outline:
    "border border-white/10 text-zinc-300 hover:border-white/20 hover:text-white hover:bg-white/5",
  destructive:
    "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20",
  secondary:
    "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-3 text-xs rounded-md gap-1.5",
  md: "h-9 px-4 text-sm rounded-md gap-2",
  lg: "h-10 px-6 text-sm rounded-md gap-2",
  icon: "h-8 w-8 rounded-md",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled ?? loading}
        className={cn(
          "inline-flex items-center justify-center transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
