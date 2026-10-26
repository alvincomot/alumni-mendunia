import { requireAccess } from "@/lib/auth/access";
import {
  administrationMessage,
  createAdminClient,
  invitationRedirect,
  listAuthUsers,
} from "@/lib/users/admin";
import { readAllRows } from "@/lib/data/read-all";
import { applicationRoles, roleDetails } from "@/lib/auth/roles";
import type { UserProfile } from "@/lib/users/schema";
import { UserDialog } from "@/components/users/user-dialog";
import { Filters } from "@/components/data/filters";
import { Pagination } from "@/components/data/pagination";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireAccess(["admin_dinas"]);
  const raw = await searchParams;
  const params = Object.fromEntries(
    ["q", "role", "school", "active"].map((key) => [
      key,
      typeof raw[key] === "string" ? raw[key].slice(0, 150) : "",
    ]),
  );
  const [profiles, schools] = await Promise.all([
    readAllRows<UserProfile>((start, end) =>
      access.supabase
        .from("profiles")
        .select("user_id, full_name, role, school_id, is_active", {
          count: "exact",
        })
        .order("user_id")
        .range(start, end),
    ),
    readAllRows<{ id: string; name: string; is_active: boolean }>(
      (start, end) =>
        access.supabase
          .from("schools")
          .select("id, name, is_active", { count: "exact" })
          .order("id")
          .range(start, end),
    ),
  ]);
  let directoryProblem: string | null = null;
  let invitationProblem: string | null = null;
  let authUsers: { id: string; email?: string }[] = [];
  try {
    authUsers = await listAuthUsers(createAdminClient());
  } catch (error) {
    directoryProblem = administrationMessage(error);
  }
  try {
    invitationRedirect();
  } catch (error) {
    invitationProblem = administrationMessage(error);
  }
  const authAvailable = directoryProblem === null;
  const emails = new Map(
    authUsers.map((user) => [user.id, user.email ?? "Email tidak tersedia"]),
  );
  const names = new Map(schools.map((school) => [school.id, school.name]));
  const activeSchools = schools
    .filter((school) => school.is_active)
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
  const rows = profiles
    .filter((profile) => {
      const term = params.q.toLocaleLowerCase("id");
      return (
        (!term ||
          `${profile.full_name} ${emails.get(profile.user_id) ?? ""}`
            .toLocaleLowerCase("id")
            .includes(term)) &&
        (!params.role || profile.role === params.role) &&
        (!params.school || profile.school_id === params.school) &&
        (!params.active || profile.is_active === (params.active === "active"))
      );
    })
    .sort(
      (a, b) =>
        a.full_name.localeCompare(b.full_name, "id") ||
        a.user_id.localeCompare(b.user_id),
    );
  const requested =
    typeof raw.page === "string" && /^\d{1,6}$/.test(raw.page)
      ? Number(raw.page)
      : 1;
  const page = Math.min(
    Math.max(1, requested),
    Math.max(1, Math.ceil(rows.length / 20)),
  );
  const profileIds = new Set(profiles.map((profile) => profile.user_id));
  const orphans = authUsers.filter((user) => !profileIds.has(user.id));
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary">
            Manajemen Pengguna
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Atur peran, penugasan sekolah, dan akses akun.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <UserDialog
            schools={activeSchools}
            enabled={authAvailable && !invitationProblem}
          />
          <UserDialog
            schools={activeSchools}
            recoveryOnly
            enabled={authAvailable}
          />
        </div>
      </div>
      {(directoryProblem || invitationProblem) && (
        <p
          role="status"
          className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {directoryProblem ?? invitationProblem} Profil tetap dapat diedit.
        </p>
      )}
      {orphans.length > 0 && (
        <details className="mt-5 rounded-md border bg-white p-4">
          <summary className="min-h-11 cursor-pointer text-sm font-medium">
            {orphans.length} akun Auth belum memiliki profil
          </summary>
          <p className="mb-3 text-sm">
            Gunakan Pulihkan profil dengan email berikut. Pemulihan tidak
            menimpa profil yang sudah ada.
          </p>
          <ul className="space-y-2 break-words text-sm">
            {orphans.map((user) => (
              <li key={user.id}>{user.email ?? "Email tidak tersedia"}</li>
            ))}
          </ul>
        </details>
      )}
      <Filters
        path="/dashboard/users"
        values={params}
        fields={[
          { name: "q", label: "Cari nama atau email" },
          {
            name: "role",
            label: "Peran",
            options: applicationRoles.map((value) => ({
              value,
              label: roleDetails[value].label,
            })),
          },
          {
            name: "school",
            label: "Sekolah",
            options: schools.map((s) => ({ value: s.id, label: s.name })),
          },
          {
            name: "active",
            label: "Status profil",
            options: [
              { value: "active", label: "Aktif" },
              { value: "inactive", label: "Nonaktif" },
            ],
          },
        ]}
      />
      {rows.length === 0 ? (
        <p className="rounded-lg border bg-white p-6">
          Tidak ada pengguna sesuai filter.
        </p>
      ) : (
        <div
          role="region"
          aria-label="Daftar pengguna"
          tabIndex={0}
          className="overflow-x-auto rounded-lg border bg-white"
        >
          <table className="w-full min-w-[850px] text-left text-sm">
            <caption className="sr-only">Profil dan penugasan pengguna</caption>
            <thead className="border-b bg-secondary">
              <tr>
                {[
                  "Nama",
                  "Email",
                  "Peran",
                  "Sekolah",
                  "Status",
                  "Tindakan",
                ].map((label) => (
                  <th scope="col" key={label} className="px-4 py-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice((page - 1) * 20, page * 20).map((profile) => (
                <tr key={profile.user_id} className="border-b last:border-0">
                  <th
                    scope="row"
                    className="max-w-56 break-words px-4 py-4 font-medium"
                  >
                    {profile.full_name}
                  </th>
                  <td className="max-w-64 break-words px-4 py-4">
                    {authAvailable
                      ? (emails.get(profile.user_id) ??
                        "Akun Auth tidak ditemukan")
                      : "Email belum dapat dimuat"}
                  </td>
                  <td className="px-4 py-4">
                    {roleDetails[profile.role].label}
                  </td>
                  <td className="max-w-56 break-words px-4 py-4">
                    {profile.school_id
                      ? (names.get(profile.school_id) ??
                        "Sekolah tidak tersedia")
                      : "Tidak ditugaskan"}
                  </td>
                  <td className="px-4 py-4">
                    {profile.is_active ? "Aktif" : "Nonaktif"}
                  </td>
                  <td className="px-4 py-4">
                    <UserDialog profile={profile} schools={activeSchools} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        path="/dashboard/users"
        params={params}
        page={page}
        total={rows.length}
      />
    </>
  );
}
