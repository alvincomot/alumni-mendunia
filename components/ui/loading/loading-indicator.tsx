import { cn } from "@/lib/utils";

export function LoadingIndicator({
  className,
  size = "md",
  label,
}: {
  className?: string;
  size?: "sm" | "md";
  label?: string;
}) {
  const indicator = (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block shrink-0 rounded-full border-current border-r-transparent motion-safe:animate-spin motion-reduce:animate-none",
        size === "sm" ? "size-4 border-2" : "size-6 border-[3px]",
        className,
      )}
    />
  );

  if (!label) return indicator;
  return (
    <span role="status" className="inline-flex items-center">
      {indicator}
      <span className="sr-only">{label}</span>
    </span>
  );
}
