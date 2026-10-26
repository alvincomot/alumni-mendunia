
import { Suspense } from "react";
import { requireAccess } from "@/lib/auth/access";
import { roleDetails } from "@/lib/auth/roles";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { LogoutButton } from "@/components/logout-button";

async function Shell({ children }: { children: React.ReactNode }) {
  const access = await requireAccess();
  let schoolName: string | null = null;

  if (access.schoolId) {
    const { data, error } = await access.supabase
      .from("schools")
      .select("name")
      .eq("id", access.schoolId)
      .maybeSingle();

    if (error) throw new Error("School context unavailable");
    schoolName = data?.name ?? null;
  }

  return (
    <div className="min-h-svh lg:fixed lg:inset-0 lg:flex lg:h-dvh lg:overflow-hidden">
      <a
        href="#main-content"
        className="sr-only z-50 bg-white p-3 text-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Lewati ke konten
      </a>

      {/* Sidebar */}
      <DashboardSidebar role={access.role} />

      {/* Right content */}
      <div className="min-w-0 flex-1 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden">
        {/* Header */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b bg-white px-5 py-4 sm:px-8">
          <div className="min-w-0 break-words">
            <p className="font-semibold text-primary">
              {access.fullName}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {roleDetails[access.role].label}
              {schoolName
                ? ` · ${schoolName}`
                : " · Dinas Pendidikan DKI Jakarta"}
            </p>
          </div>

          <LogoutButton />
        </header>

        {/* Scrollable main content */}
        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain"
        >
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
