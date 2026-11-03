"use client";

import { FormSession, useFormActivity } from "@/components/ui/form-session";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { changeSchoolAccountStatus } from "@/app/dashboard/schools/actions";
import type { School } from "@/lib/schools/schema";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingIndicator } from "@/components/ui/loading";
import { useToast } from "@/components/ui/toast";
import { SchoolDialog } from "./school-dialog";
import { SchoolAccountDialog } from "./school-account-dialog";

function SchoolRowActionsContent({
  school,
  accounts,
}: {
  school: School;
  accounts: { isActive: boolean }[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<"details" | "school" | "account" | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const openingDialog = useRef(false);
  const focusLastItem = useRef(false);
  const busy = useRef(false);
  const router = useRouter();
  const active = useFormActivity();
  const { toast } = useToast();
  const account = accounts.length === 1 ? accounts[0] : null;
  const canChangeAccount = account && (account.isActive || school.is_active);
  function select(next: NonNullable<typeof view>) {
    openingDialog.current = true;
    setMenuOpen(false);
    setError(null);
    setView(next);
  }
  function restoreFocus(event?: Event) {
    event?.preventDefault();
    trigger.current?.focus();
  }
  async function confirmAccountStatus() {
    if (!account || busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await changeSchoolAccountStatus({
        school_id: school.id,
        is_active: !account.isActive,
        confirmed: true,
      });
      if (!active.current) return;
      if (result.success) {
        setView(null);
        toast(
          account.isActive
            ? "Akun sekolah berhasil ditangguhkan."
            : "Status profil akun sekolah berhasil diaktifkan.",
        );
        router.refresh();
      } else setError(result.message);
    } catch {
      if (!active.current) return;
      setError("Permintaan gagal. Periksa koneksi dan coba kembali.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <div className="flex items-center gap-2">
      <SchoolDialog school={school} />
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={trigger}
            variant="outline"
            className="size-11 shrink-0 p-0"
            aria-label={`Tindakan untuk ${school.name}`}
            aria-haspopup="menu"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                focusLastItem.current = event.key === "ArrowUp";
                setMenuOpen(true);
              }
            }}
          >
            <MoreHorizontal className="size-5" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          ref={menu}
          role="menu"
          aria-label={`Tindakan sekolah ${school.name}`}
          align="end"
          className="w-64 max-w-[calc(100vw-2rem)] p-1"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const items =
              menu.current?.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]',
              );
            items?.[focusLastItem.current ? items.length - 1 : 0]?.focus();
            focusLastItem.current = false;
          }}
          onCloseAutoFocus={(event) => {
            if (openingDialog.current) {
              event.preventDefault();
              openingDialog.current = false;
            }
          }}
          onKeyDown={(event) => {
            const items = Array.from(
              menu.current?.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]',
              ) ?? [],
            );
            const current = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const offsets: Record<string, number> = {
              ArrowDown: 1,
              ArrowUp: -1,
            };
            if (
              event.key in offsets ||
              event.key === "Home" ||
              event.key === "End"
            ) {
              event.preventDefault();
              const index =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (current + offsets[event.key] + items.length) %
                      items.length;
              items[index]?.focus();
            }
            if (event.key === "Tab") setMenuOpen(false);
          }}
        >
          <Button
            role="menuitem"
            tabIndex={-1}
            variant="ghost"
            className="w-full justify-start"
            onClick={() => select("details")}
          >
            Detail akun
          </Button>
          <Button
            role="menuitem"
            tabIndex={-1}
            variant="ghost"
            className="w-full justify-start"
            onClick={() => select("school")}
          >
            {school.is_active ? "Nonaktifkan sekolah" : "Aktifkan sekolah"}
          </Button>
          {canChangeAccount && (
            <Button
              role="menuitem"
              tabIndex={-1}
              variant="ghost"
              className="w-full justify-start"
              onClick={() => select("account")}
            >
              {account.isActive ? "Tangguhkan akun" : "Aktifkan akun"}
            </Button>
          )}
        </PopoverContent>
      </Popover>
      <SchoolAccountDialog
        school={school}
        open={view === "details"}
        onOpenChange={(open) => {
          if (!open) setView(null);
        }}
        onCloseAutoFocus={restoreFocus}
      />
      {view === "school" && (
        <SchoolDialog
          school={school}
          statusOnly
          initiallyOpen
          onClose={() => {
            setView(null);
            restoreFocus();
          }}
        />
      )}
      <Dialog
        open={view === "account"}
        onOpenChange={(open) => {
          if (!open && !busy.current) setView(null);
        }}
      >
        <DialogContent onCloseAutoFocus={restoreFocus}>
          <DialogHeader>
            <DialogTitle>
              {account?.isActive
                ? "Tangguhkan akun sekolah"
                : "Aktifkan akun sekolah"}
            </DialogTitle>
            <DialogDescription className="break-words">
              {account?.isActive
                ? `Tangguhkan akun petugas ${school.name}? Petugas tidak dapat mengakses aplikasi. Status sekolah dan data alumni tetap tersimpan.`
                : `Aktifkan kembali profil petugas ${school.name}? Akses aplikasi tetap memerlukan aktivasi dan penggantian kata sandi yang telah selesai.`}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="mt-4 text-sm text-red-800">
              {error}
            </p>
          )}
          <DialogFooter className="mt-5" aria-busy={pending}>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setView(null)}
            >
              Batal
            </Button>
            <Button
              variant={account?.isActive ? "destructive" : "default"}
              disabled={pending}
              onClick={confirmAccountStatus}
            >
              {pending && <LoadingIndicator size="sm" />}
              {pending ? "Memproses..." : "Konfirmasi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SchoolRowActions(
  props: React.ComponentProps<typeof SchoolRowActionsContent>,
) {
  return (
    <FormSession key={props.school.id}>
      <SchoolRowActionsContent {...props} />
    </FormSession>
  );
}
