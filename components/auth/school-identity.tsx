import { forwardRef, type ReactNode } from "react";
import { DashboardIcon } from "@/components/dashboard-icon";
import { cn } from "@/lib/utils";

export const SchoolIdentity = forwardRef<HTMLHeadingElement, {
  name: string;
  npsn: string;
  children?: ReactNode;
  className?: string;
}>(({ name, npsn, children, className }, ref) => (
  <div
    className={cn(
      "rounded-xl border border-border bg-secondary/70 p-3.5 sm:p-4",
      className,
    )}
  >
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/10 text-primary">
        <DashboardIcon name="schoolBuilding" className="size-7" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1 py-0.5">
        <h2
          ref={ref}
          tabIndex={-1}
          className="type-card-title break-words text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {name}
        </h2>
        <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
          NPSN: {npsn}
        </p>
      </div>
      {children && <div className="shrink-0 self-center">{children}</div>}
    </div>
  </div>
));
SchoolIdentity.displayName = "SchoolIdentity";
