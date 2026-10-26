import type { ReactNode } from "react";

type DashboardPanelProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  height?: "sm" | "md" | "lg";
};

const panelHeights = {
  sm: "h-[280px]",
  md: "h-[320px]",
  lg: "h-[420px]",
};

export function DashboardPanel({ title, description, children, className = "", height = "md" }: DashboardPanelProps) {
  return (
    <section
      className={`
        flex min-h-0 flex-col overflow-hidden
        rounded-xl border border-slate-200
        bg-white shadow-sm
        ${panelHeights[height]}
        ${className}
      `}>
      {/* Header tetap terlihat */}
      <div className="shrink-0 border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-[#17324D]">{title}</h2>

        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>

      {/* Hanya konten ini yang scroll */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
    </section>
  );
}
