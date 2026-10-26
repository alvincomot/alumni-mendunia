import Link from "next/link";
import { redirect } from "next/navigation";
import { getSchoolAccess } from "@/lib/schools/access";
import { type School } from "@/lib/schools/schema";
import { SchoolDialog } from "@/components/schools/school-dialog";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    if (access.reason === "error") throw new Error("School access unavailable");
    return (
      <main className="mx-auto max-w-xl px-5 py-12">
        <h1 className="text-2xl font-semibold text-primary">
          Akses tidak diizinkan
        </h1>
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

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary">
            Manajemen Sekolah
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {access.canManage
              ? "Kelola identitas dan status sekolah."
              : "Lihat identitas dan status sekolah. Akses Anda hanya untuk membaca."}
          </p>
        </div>
        {access.canManage && <SchoolDialog />}
      </div>
      <form
        action="/dashboard/schools"
        className="my-6 grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
      >
        <div className="space-y-2">
          <Label htmlFor="school-search">Cari sekolah</Label>
          <Input
            key={search}
            id="school-search"
            name="q"
            defaultValue={search}
            maxLength={200}
            placeholder="NPSN, nama sekolah, atau kota"
            className="min-h-11 bg-white"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="school-status">Status</Label>
          <select
            key={status}
            id="school-status"
            name="status"
            defaultValue={status}
            className="block min-h-11 w-full rounded-md border bg-white px-3 text-sm focus-visible:outline-accent"
          >
            <option value="all">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </div>
        <Button type="submit" className="min-h-11">
          Terapkan
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/dashboard/schools">Reset</Link>
        </Button>
      </form>
      {schools.length === 0 ? (
        <section className="rounded-lg border bg-white p-8">
          <h2 className="text-lg font-semibold">
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
          className="overflow-x-auto rounded-lg border bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <table className="w-full min-w-[680px] text-left text-sm">
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
                  ...(access.canManage ? ["Tindakan"] : []),
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
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <SchoolDialog school={school} />
                        <SchoolDialog school={school} statusOnly />
                      </div>
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
