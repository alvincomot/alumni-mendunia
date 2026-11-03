import type { ReactNode } from "react";

type DashboardPanelProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  height?: "auto" | "sm" | "md" | "lg";
};

const panelHeights = {
  auto: "",
  sm: "lg:max-h-64",
  md: "lg:max-h-[19rem]",
  lg: "lg:max-h-[25rem]",
};

export function DashboardPanel({
  title,
  description,
  icon,
  children,
  className = "",
  height = "auto",
}: DashboardPanelProps) {
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card ${panelHeights[height]} ${className}`}
    >
      <div className="z-10 flex shrink-0 items-start justify-between gap-4 bg-white px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <h2 className="type-section-title text-[#191C1E]">
            {title}
          </h2>
          {description && (
            <p className="type-supporting mt-1 text-[#6B6D7A]">
              {description}
            </p>
          )}
        </div>
        {icon && <span className="shrink-0 text-[#6B6D7A]">{icon}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-3 sm:px-6 sm:pb-6">
        {children}
      </div>
    </section>
  );
}
