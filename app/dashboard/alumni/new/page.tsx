import { alumniReturnPath } from "@/lib/alumni/navigation";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAlumniAccess } from "@/lib/alumni/access";
import {
  AlumniPageFrame,
  AlumniAccessDenied,
} from "@/components/alumni/page-frame";
import { AlumniRegistrationForm } from "@/components/alumni/alumni-registration-form";

export default async function NewAlumniPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const returnTo = alumniReturnPath((await searchParams).returnTo);
  const access = await getAlumniAccess();
  if (!access.allowed) {
    if (access.reason === "session") redirect("/auth/login");
    if (access.reason === "password_change") redirect("/auth/update-password");
    return <AlumniAccessDenied />;
  }
  if (!access.canWrite) return <AlumniAccessDenied />;
  if (!access.schoolName) throw new Error("School context unavailable");

  return (
    <AlumniPageFrame canWrite>
      <div className="mx-auto w-full max-w-[90rem]">
        <Link
          href={returnTo}
          className="inline-flex min-h-11 items-center text-sm font-medium text-[#526274] underline-offset-4 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Kembali ke daftar alumni
        </Link>
        <div className="mb-6 mt-2">
          <h1 className="type-page-title text-[#172B3A]">Tambah Alumni</h1>
          <p className="mt-2 text-sm leading-6 text-[#6B6D7A]">
            Lengkapi identitas dan penempatan awal dalam dua langkah.
          </p>
        </div>
        <AlumniRegistrationForm
          schoolName={access.schoolName}
          returnTo={returnTo}
        />
      </div>
    </AlumniPageFrame>
  );
}
