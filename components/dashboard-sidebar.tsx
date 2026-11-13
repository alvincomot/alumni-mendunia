"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DashboardIcon,
  type DashboardIconName,
} from "@/components/dashboard-icon";
import type { ApplicationRole } from "@/lib/auth/roles";

type NavigationItem = {
  href: string;
  label: string;
  icon: DashboardIconName;
};

export function DashboardSidebar({ role }: { role: ApplicationRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const links: NavigationItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/dashboard/alumni", label: "Data Alumni", icon: "alumni" },
    {
      href: "/dashboard/murid-aktif",
      label: "Data Murid Aktif",
      icon: "book",
    },
    ...(role === "admin_dinas"
      ? [
          {
            href: "/dashboard/schools",
            label: "Manajemen Sekolah",
            icon: "building" as const,
          },
          {
            href: "/dashboard/users",
            label: "Manajemen Pengguna",
            icon: "users" as const,
          },
        ]
      : []),
    ...(role !== "petugas_sekolah"
      ? [
          {
            href: "/dashboard/reports",
            label: "Laporan",
            icon: "chart" as const,
          },
        ]
      : []),
    ...(role === "admin_dinas"
      ? [
          {
            href: "/dashboard/monitoring",
            label: "Monitoring Sistem",
            icon: "activity" as const,
          },
        ]
      : []),
  ];

  const navigation = (
    <>
        <Link
          href="/dashboard"
          onClick={() => setOpen(false)}
          aria-label="Buka Dashboard"
          className="mb-6 flex min-h-12 justify-center rounded-lg px-2 pr-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring lg:pr-2"
        >
          <Image
            src="/images/smk-bisa-hebat.webp"
            alt="SMK Bisa Hebat"
            width={400}
            height={262}
            priority
            className="h-auto w-full max-w-[160px]"
          />
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          {links.map(({ href, label, icon }) => {
            const active =
              pathname === href ||
              (href !== "/dashboard" && pathname.startsWith(`${href}/`));
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`flex min-h-12 items-center gap-4 rounded-lg px-4 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  active
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <DashboardIcon name={icon} className="size-5 shrink-0" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <p className="px-4 text-xs leading-5 text-[#6B6D7A]">
          Dinas Pendidikan
          <br />
          Provinsi DKI Jakarta
        </p>
    </>
  );
  return (
    <>
      <aside aria-label="Navigasi utama" className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col overflow-y-auto border-r bg-card px-4 py-6 lg:flex">
        {navigation}
      </aside>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button id="dashboard-menu-trigger" type="button" aria-label="Buka navigasi" className="fixed left-3 top-2.5 z-40 grid size-11 place-items-center rounded-lg text-foreground hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring lg:hidden">
            <DashboardIcon name="menu" className="size-5" />
          </button>
        </DialogTrigger>
        <DialogContent aria-describedby={undefined} className="inset-y-0 left-0 top-0 flex h-dvh max-h-none w-72 max-w-[calc(100vw-2rem)] translate-x-0 translate-y-0 flex-col rounded-none border-0 border-r px-4 py-6 sm:p-4 sm:py-6">
          <DialogTitle className="sr-only">Navigasi utama</DialogTitle>
          {navigation}
        </DialogContent>
      </Dialog>
    </>
  );
}
