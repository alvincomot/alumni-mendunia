import Link from "next/link";
import { redirect } from "next/navigation";
import { getSchoolAccess } from "@/lib/schools/access";
import { type School } from "@/lib/schools/schema";
import { SchoolDialog } from "@/components/schools/school-dialog";
import { SchoolRowActions } from "@/components/schools/school-row-actions";
import { SchoolAccountStatus } from "@/components/schools/school-account-status";
import { createAdminClient } from "@/lib/users/admin";
import { readSchoolAccountStatus } from "@/lib/schools/accounts";
import type { SchoolLookup } from "@/lib/auth/school-auth";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { Filters } from "@/components/data/filters";

type SearchParams = Record<string, string | string[] | undefined>;
const pageSize = 10;

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const access = await getSchoolAccess();
  if (!access.allowed) {
    if (access.reason === "session") redirect("/auth/login");
    if (access.reason === "password_change") redirect("/auth/update-password");
    if (access.reason === "error") throw new Error("School access unavailable");
    return (
      <main className="mx-auto max-w-xl px-5 py-12">
        <h1 className="type-page-title text-primary">Akses tidak diizinkan</h1>
        <p className="my-5 text-sm leading-6">
          Manajemen sekolah hanya tersedia untuk Admin Dinas dan Viewer Dinas
          dengan profil aktif.
        </p>
        <div className="flex justify-between gap-3">
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/dashboard">Kembali ke dashboard</Link>
          </Button>
          <LogoutButton />
        </div>
      </main>
    );
  }
  const params = await searchParams;
  const search =
    typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const status =
    params.status === "active" || params.status === "inactive"
      ? params.status
      : "all";
  const requestedPage =
    typeof params.page === "string" && /^\d{1,6}$/.test(params.page)
      ? Number(params.page)
      : 1;
  const page = Math.max(1, requestedPage);
  function pageUrl(number: number) {
    return `/dashboard/schools?${new URLSearchParams({ q: search, status, page: String(number) })}`;
  }
  let query = access.supabase
    .from("schools")
    .select("id, npsn, name, city, is_active", { count: "exact" });
  // Strip PostgREST filter syntax before interpolating a text search.
  const term = search.replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim();
  if (term)
    query = query.or(
      `npsn.ilike.%${term}%,name.ilike.%${term}%,city.ilike.%${term}%`,
    );
  if (status !== "all") query = query.eq("is_active", status === "active");
  const { data, count, error } = await query
    .order("name")
    .order("id")
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error?.code === "PGRST103" && page > 1) redirect(pageUrl(1));
  if (error) throw new Error("School list unavailable");
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (page > totalPages) redirect(pageUrl(totalPages));
  const schools = (data ?? []) as School[];
  type AccountRow = {
    user_id: string;
    full_name: string;
    school_id: string;
    is_active: boolean;
  };
  let accounts: AccountRow[] = [];
  if (access.canManage && schools.length > 0) {
    const schoolIds = schools.map((school) => school.id);
    const result = await access.supabase
      .from("profiles")
      .select("user_id, full_name, school_id, is_active")
      .eq("role", "petugas_sekolah")
      .in("school_id", schoolIds);
    if (result.error) throw new Error("School account list unavailable");
    accounts = (result.data ?? []) as AccountRow[];
  }
  const statuses = new Map<string, SchoolLookup["status"] | null>();
  if (access.canManage && schools.length > 0) {
    try {
      const admin = createAdminClient();
      await Promise.all(
        schools.map(async (school) => {
          try {
            statuses.set(
              school.id,
              await readSchoolAccountStatus(admin, school.npsn),
            );
          } catch {
            statuses.set(school.id, null);
          }
        }),
      );
    } catch {
      for (const school of schools) statuses.set(school.id, null);
    }
  }
  const accountsBySchool = new Map<string, AccountRow[]>();
  for (const account of accounts) {
    const current = accountsBySchool.get(account.school_id) ?? [];
    current.push(account);
    accountsBySchool.set(account.school_id, current);
  }
  return (
    <>
      <h1 className="sr-only">Manajemen Sekolah</h1>
      {access.canManage && (
        <div className="flex justify-end">
          <SchoolDialog />
        </div>
      )}
      {access.canManage &&
        [...statuses.values()].some((status) => status === null) && (
          <p
            role="status"
            className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
          >
            Sebagian status aktivasi belum dapat dimuat. Muat ulang halaman
            untuk mencoba kembali. Data sekolah tetap dapat dikelola.
          </p>
        )}
      <Filters
        path="/dashboard/schools"
        values={{ q: search, status: status === "all" ? "" : status }}
        fields={[
          {
            name: "q",
            label: "Cari sekolah",
            placeholder: "NPSN, nama sekolah, atau kota",
            maxLength: 200,
          },
          {
            name: "status",
            label: "Status",
            options: [
              { value: "active", label: "Aktif" },
              { value: "inactive", label: "Nonaktif" },
            ],
          },
        ]}
      />
      {schools.length === 0 ? (
        <section className="rounded-xl border bg-card p-6">
          <h2 className="type-section-title">
            {search || status !== "all"
              ? "Sekolah tidak ditemukan"
              : "Belum ada data sekolah"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {search || status !== "all"
              ? "Ubah kata pencarian atau filter status."
              : access.canManage
                ? "Gunakan Tambah sekolah untuk mendaftarkan sekolah pertama."
                : "Data akan muncul setelah Admin Dinas menambahkan sekolah."}
          </p>
        </section>
      ) : (
        <div
          role="region"
          aria-label="Daftar sekolah, geser untuk melihat seluruh kolom"
          tabIndex={0}
          className="min-w-0 overflow-x-auto rounded-xl border bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <table
            className={`w-full text-left text-sm ${access.canManage ? "min-w-[960px]" : "min-w-[680px]"}`}
          >
            <caption className="sr-only">
              Daftar sekolah beserta NPSN, kota, status, dan tindakan yang
              tersedia
            </caption>
            <thead className="border-b bg-secondary text-primary">
              <tr>
                {[
                  "NPSN",
                  "Nama sekolah",
                  "Kota",
                  "Status",
                  ...(access.canManage
                    ? ["Akun sekolah", "Petugas", "Tindakan"]
                    : []),
                ].map((label) => (
                  <th
                    key={label}
                    scope="col"
                    className="px-4 py-3 font-semibold"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schools.map((school) => (
                <tr key={school.id} className="border-b last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-4 tabular-nums">
                    {school.npsn}
                  </td>
                  <th
                    scope="row"
                    className="max-w-xs break-words px-4 py-4 font-medium"
                  >
                    {school.name}
                  </th>
                  <td className="max-w-xs break-words px-4 py-4">
                    {school.city}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${school.is_active ? "bg-green-50 text-green-800" : "bg-slate-100 text-slate-700"}`}
                    >
                      {school.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  {access.canManage && (
                    <>
                      <td className="px-4 py-4">
                        <SchoolAccountStatus
                          status={statuses.get(school.id) ?? null}
                        />
                      </td>
                      <td className="max-w-56 break-words px-4 py-4">
                        {(accountsBySchool.get(school.id) ?? []).length > 0
                          ? (accountsBySchool.get(school.id) ?? [])
                              .map((account) =>
                                account.is_active
                                  ? account.full_name
                                  : `${account.full_name} (nonaktif)`,
                              )
                              .join(", ")
                          : "Belum ditugaskan"}
                      </td>
                    </>
                  )}
                  {access.canManage && (
                    <td className="px-4 py-4">
                      <SchoolRowActions
                        school={school}
                        accounts={(accountsBySchool.get(school.id) ?? []).map(
                          (account) => ({ isActive: account.is_active }),
                        )}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 text-sm">
        <p>
          {total} sekolah • Halaman {page} dari {totalPages}
        </p>
        <nav aria-label="Halaman daftar sekolah" className="flex gap-2">
          {page > 1 ? (
            <Button asChild variant="outline" className="min-h-11">
              <Link href={pageUrl(page - 1)}>Sebelumnya</Link>
            </Button>
          ) : (
            <Button disabled variant="outline" className="min-h-11">
              Sebelumnya
            </Button>
          )}
          {page < totalPages ? (
            <Button asChild variant="outline" className="min-h-11">
              <Link href={pageUrl(page + 1)}>Berikutnya</Link>
            </Button>
          ) : (
            <Button disabled variant="outline" className="min-h-11">
              Berikutnya
            </Button>
          )}
        </nav>
      </div>
    </>
  );
}
