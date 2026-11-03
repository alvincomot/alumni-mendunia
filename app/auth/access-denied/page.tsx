import { LogoutButton } from "@/components/logout-button";
import Link from "next/link";

export default function Page() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-8 sm:p-8">
      <div className="w-full max-w-md rounded-xl border bg-card p-6">
      <h1 className="type-page-title text-primary">
        Akses tidak diizinkan
      </h1>
      <p className="my-5 leading-7">
        Akun belum memiliki profil aktif, sekolah tidak aktif, atau peran Anda
        tidak dapat membuka halaman ini. Hubungi Admin Dinas untuk memeriksa
        penugasan akun.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          className="inline-flex min-h-11 items-center underline underline-offset-4"
          href="/dashboard"
        >
          Kembali ke dashboard
        </Link>
        <LogoutButton />
      </div>
      </div>
    </main>
  );
}
