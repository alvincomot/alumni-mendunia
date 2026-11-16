import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ActiveStudentNotFound() {
  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <h1 className="type-page-title text-primary">Murid tidak ditemukan</h1>
      <p className="my-5 text-sm leading-6">
        Data tidak tersedia atau Anda tidak memiliki akses untuk melihatnya.
      </p>
      <Button asChild variant="outline" className="min-h-11">
        <Link href="/dashboard/murid-aktif">Kembali ke daftar murid</Link>
      </Button>
    </main>
  );
}
