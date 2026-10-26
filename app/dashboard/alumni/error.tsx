"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AlumniError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <h1 className="text-2xl font-semibold text-primary">
        Data alumni belum dapat dimuat
      </h1>
      <p className="my-5 text-sm leading-6" role="alert">
        Periksa koneksi, lalu coba lagi. Jika masalah berlanjut, hubungi Admin
        Dinas.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset} className="min-h-11">
          Coba lagi
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/dashboard">Kembali ke dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
