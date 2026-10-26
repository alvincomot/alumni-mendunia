import { redirect } from "next/navigation";
import { getAlumniAccess } from "@/lib/alumni/access";
import {
  AlumniPageFrame,
  AlumniAccessDenied,
} from "@/components/alumni/page-frame";
import { AlumniForm } from "@/components/alumni/alumni-form";

export default async function NewAlumniPage() {
  const access = await getAlumniAccess();
  if (!access.allowed) {
    if (access.reason === "session") redirect("/auth/login");
    return <AlumniAccessDenied />;
  }
  if (!access.canWrite) return <AlumniAccessDenied />;
  return (
    <AlumniPageFrame canWrite>
      <h1 className="text-2xl font-semibold text-primary">Tambah alumni</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Simpan identitas terlebih dahulu. Setelah itu, catat penempatan awal
        dari halaman detail. Sekolah ditentukan otomatis dari profil Anda.
      </p>
      <section
        aria-label="Identitas alumni baru"
        className="mt-6 max-w-2xl rounded-lg border bg-white p-5 sm:p-6"
      >
        <AlumniForm />
      </section>
    </AlumniPageFrame>
  );
}
