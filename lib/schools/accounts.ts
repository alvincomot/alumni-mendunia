import "server-only";
import { schoolLookupSchema } from "@/lib/auth/school-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const accountStatusSchema = schoolLookupSchema.shape.status;
const accountStatusRowsSchema = z.array(
  z.object({
    school_id: z.string().uuid(),
    status: accountStatusSchema.nullable(),
  }),
);

function isMissingBatchStatusRpc(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : null;
  return code === "42883" || code === "PGRST202";
}

// Call only after authorizing the Dinas administrator and reading the school.
export async function readSchoolAccountStatus(
  client: Pick<SupabaseClient, "rpc">,
  npsn: string,
) {
  const { data, error } = await client.rpc("school_auth_lookup", {
    p_npsn: npsn,
  });
  const parsed = schoolLookupSchema.safeParse(data);
  if (error || !parsed.success || parsed.data.npsn !== npsn)
    throw new Error("School activation status unavailable");
  return parsed.data.status;
}

export async function readSchoolAccountStatuses(
  client: Pick<SupabaseClient, "rpc">,
  schools: ReadonlyArray<{ id: string; npsn: string }>,
) {
  const statuses = new Map<
    string,
    z.infer<typeof accountStatusSchema> | null
  >();
  if (schools.length === 0) return statuses;

  const result = await client.rpc("get_school_auth_statuses", {
    p_school_ids: schools.map((school) => school.id),
  });
  if (!result.error) {
    const parsed = accountStatusRowsSchema.safeParse(result.data);
    if (parsed.success) {
      for (const row of parsed.data) statuses.set(row.school_id, row.status);
      for (const school of schools)
        if (!statuses.has(school.id)) statuses.set(school.id, null);
      return statuses;
    }
    for (const school of schools) statuses.set(school.id, null);
    return statuses;
  }
  if (!isMissingBatchStatusRpc(result.error)) {
    for (const school of schools) statuses.set(school.id, null);
    return statuses;
  }

  await Promise.all(
    schools.map(async (school) => {
      try {
        statuses.set(
          school.id,
          await readSchoolAccountStatus(client, school.npsn),
        );
      } catch {
        statuses.set(school.id, null);
      }
    }),
  );
  return statuses;
}
