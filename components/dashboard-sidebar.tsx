"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ApplicationRole } from "@/lib/auth/roles";

export function DashboardSidebar({ role }: { role: ApplicationRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = [
    ["/dashboard", "Dashboard"],
    ["/dashboard/alumni", "Data Alumni"],
    ...(role === "admin_dinas"
      ? [
          ["/dashboard/schools", "Manajemen Sekolah"],
          ["/dashboard/users", "Manajemen Pengguna"],
        ]
      : []),
    ...(role !== "petugas_sekolah" ? [["/dashboard/reports", "Laporan"]] : []),
    ...(role === "admin_dinas" ? [["/dashboard/audit-logs", "Audit Log"]] : []),
  ];
  return (
    <aside className="border-b bg-primary text-white lg:min-h-svh lg:w-60 lg:shrink-0 lg:border-0">
      <div className="flex items-center justify-between gap-3 p-4 lg:p-6">
        <Link
          href="/dashboard"
          className="min-h-11 content-center font-semibold leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          Alumni Mendunia
          <br />
          SMK DKI Jakarta
        </Link>
        <Button
          variant="outline"
          className="min-h-11 bg-white text-primary lg:hidden"
          aria-expanded={open}
          aria-controls="dashboard-menu"
          onClick={() => setOpen(!open)}
        >
          Menu
        </Button>
      </div>
      <nav
        id="dashboard-menu"
        aria-label="Navigasi utama"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            document
              .querySelector<HTMLButtonElement>(
                '[aria-controls="dashboard-menu"]',
              )
              ?.focus();
          }
        }}
        className={`${open ? "block" : "hidden"} space-y-1 px-3 pb-4 lg:block`}
      >
        {links.map(([href, label]) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={`flex min-h-11 items-center rounded-md border-l-4 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${active ? "border-teal-300 bg-white/10 font-semibold" : "border-transparent hover:bg-white/10"}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
