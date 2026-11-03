import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/users/admin";
import { npsnSchema } from "./school-auth";

const contextSchema = z.object({
  name: z.string().min(1),
  npsn: npsnSchema,
  request_id: z.uuid(),
});

export function schoolActivationTokenTtlSeconds() {
  const configured = process.env.SUPABASE_AUTH_EMAIL_OTP_EXPIRY_SECONDS;
  if (configured === undefined || configured === "")
    throw Object.assign(
      new Error("Missing Supabase Auth email token expiry configuration"),
      { code: "school_activation_ttl_missing" },
    );
  if (!/^\d+$/.test(configured))
    throw Object.assign(
      new Error("Invalid Supabase Auth email token expiry configuration"),
      { code: "school_activation_ttl_invalid" },
    );
  const seconds = Number(configured);
  if (!Number.isSafeInteger(seconds) || seconds < 300 || seconds > 86400)
    throw Object.assign(
      new Error("Invalid Supabase Auth email token expiry configuration"),
      { code: "school_activation_ttl_invalid" },
    );
  return seconds;
}

// Call only after getClaims/getUser verify the session. Never use a browser user ID.
export async function getSchoolActivationContext(userId: string) {
  const { data, error } = await createAdminClient().rpc("school_activation_context", {
    p_user_id: userId,
  });
  if (error) throw new Error("School activation context unavailable");
  return data === null ? null : contextSchema.parse(data);
}
