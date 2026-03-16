import { cn } from "@/client/lib/utils";

type BadgeVariant = "primary" | "secondary" | "success" | "warning" | "info";

const VARIANT_COLORS: Record<BadgeVariant, string> = {
  primary: "bg-primary/20 text-primary",
  secondary: "bg-bg-tertiary text-text-secondary",
  success: "bg-success/20 text-success",
  warning: "bg-warning/20 text-warning",
  info: "bg-info/20 text-info",
};

export function Badge({
  children,
  variant = "secondary",
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded px-2 py-0.5 font-medium text-xs",
        VARIANT_COLORS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
