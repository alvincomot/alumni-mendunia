import { Suspense } from "react";
import { requireAccess } from "@/lib/auth/access";
import { roleDetails } from "@/lib/auth/roles";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { DashboardIcon } from "@/components/dashboard-icon";
import { LogoutButton } from "@/components/logout-button";
import { DashboardSessionLoading } from "@/components/ui/loading";
import { PageviewTracker } from "@/components/monitoring/pageview-tracker";

function initials(name: string) {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

async function Shell({ children }: { children: React.ReactNode }) {
  const access = await requireAccess();

  return (
    <div className="min-h-svh bg-[#F7F9FB] text-[#191C1E] lg:fixed lg:inset-0 lg:overflow-hidden">
      <a
        href="#main-content"
        className="sr-only z-[70] rounded-lg bg-white p-3 text-primary shadow-lg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Lewati ke konten
      </a>

      <DashboardSidebar role={access.role} />
      <PageviewTracker />

      <div className="min-w-0 lg:ml-72 lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-card px-4 sm:px-6">
          <div className="w-11 shrink-0 lg:hidden" aria-hidden="true" />

          <form
            action="/dashboard/alumni"
            method="get"
            role="search"
            className="relative mr-auto w-full min-w-0 max-w-sm"
          >
            <label htmlFor="dashboard-search" className="sr-only">
              Cari data alumni
            </label>
            <DashboardIcon
              name="search"
              className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-[#444653]"
            />
            <input
              id="dashboard-search"
              name="q"
              type="search"
              maxLength={150}
              placeholder="Cari data alumni..."
              className="form-control pl-11 pr-3"
            />
          </form>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 border-r border-[#C4C5D5]/60 pr-3 xl:flex">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {initials(access.fullName) || (
                  <DashboardIcon name="user" className="size-4" />
                )}
              </span>
              <span className="min-w-0 max-w-44">
                <span className="block truncate text-sm font-semibold text-[#191C1E]">
                  {access.fullName}
                </span>
                <span className="block truncate text-xs text-[#6B6D7A]">
                  {access.schoolName ?? roleDetails[access.role].label}
                </span>
              </span>
            </div>
            <LogoutButton compact />
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-0 focus:outline-none lg:flex-1 lg:overflow-y-auto lg:overscroll-contain"
        >
          <div className="w-full px-4 py-5 sm:px-6 sm:py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<DashboardSessionLoading />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
