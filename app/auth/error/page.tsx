import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Page() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16">
      <h1 className="text-2xl font-semibold text-primary">
        Tautan tidak dapat digunakan
      </h1>
      <p className="my-5 leading-7">
        Tautan mungkin sudah digunakan atau kedaluwarsa. Minta tautan pemulihan
        baru, atau hubungi Admin Dinas untuk undangan akun.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild className="min-h-11">
          <Link href="/auth/forgot-password">Pulihkan kata sandi</Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/auth/login">Kembali ke login</Link>
        </Button>
      </div>
    </main>
  );
}
