import Link from "next/link";
import { requireAccess } from "@/lib/auth/access";
import { StudentRegistrationForm } from "@/components/active-students/student-registration-form";

export default async function NewActiveStudentPage() {
  const access = await requireAccess(["petugas_sekolah"]);
  if (!access.canWrite || !access.schoolId)
    throw new Error("Akses sekolah tidak tersedia");

  const { data: school, error } = await access.supabase
    .from("schools")
    .select("name, npsn")
    .eq("id", access.schoolId)
    .maybeSingle();
  if (error || !school)
    throw new Error("Identitas sekolah tidak tersedia");

  return (
    <div className="mx-auto w-full max-w-[90rem]">
      <Link
        href="/dashboard/murid-aktif"
        className="inline-flex min-h-11 items-center text-sm font-medium text-[#526274] underline-offset-4 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Kembali ke daftar murid
      </Link>
      <div className="mb-6 mt-2">
        <h1 className="type-page-title text-[#172B3A]">Tambah Murid Aktif</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6D7A]">
          Lengkapi identitas, pelatihan, dan penempatan dalam dua langkah.
        </p>
      </div>
      <StudentRegistrationForm school={school} />
    </div>
  );
}
