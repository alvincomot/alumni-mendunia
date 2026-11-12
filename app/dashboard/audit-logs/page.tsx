import { redirect } from "next/navigation";
import { requireAccess } from "@/lib/auth/access";
import type { SearchParams } from "@/lib/monitoring/model";

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAccess(["admin_dinas"]);
  const raw = await searchParams;
  const query = new URLSearchParams();
  query.set("tab", "audit");
  for (const [key, value] of Object.entries(raw)) {
    if (key === "tab" || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else query.set(key, value);
  }
  redirect(`/dashboard/monitoring?${query}`);
}
