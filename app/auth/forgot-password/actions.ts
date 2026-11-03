"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { consumeRecoveryAttempt } from "@/lib/auth/recovery-rate-limit";
import { withAuthFlowContext } from "@/lib/auth/auth-flow-context";
import {
  recoveryAcceptedMessage,
  recoveryEmailSchema,
  recoveryUnavailableMessage,
  type RecoveryResult,
} from "@/lib/auth/recovery";

function recoveryRedirect(requestOrigin: string | null) {
  const configured = process.env.APP_SITE_URL;
  const origin = configured ||
    (process.env.NODE_ENV === "development" ? requestOrigin : null);
  if (!origin) throw new Error("Recovery origin is not configured");
  const url = new URL(origin);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username || url.password || url.pathname !== "/" ||
    url.search || url.hash ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    (!configured && !local)
  ) throw new Error("Invalid recovery origin");
  return withAuthFlowContext(
    `${url.origin}/auth/callback`,
    "dinas_recovery",
  );
}

export async function requestPasswordRecovery(input: unknown): Promise<RecoveryResult> {
  const parsed = recoveryEmailSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      field: "email",
      message: parsed.error.issues[0]?.message ?? "Masukkan alamat email yang valid.",
    };

  try {
    const requestHeaders = await headers();
    const client = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      requestHeaders.get("x-real-ip")?.trim() || "unknown";
    const redirectTo = recoveryRedirect(requestHeaders.get("origin"));
    if (!consumeRecoveryAttempt(client))
      return { success: false, message: recoveryUnavailableMessage };

    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo });
    if (error && !["user_not_found", "email_not_found"].includes(error.code ?? ""))
      return { success: false, message: recoveryUnavailableMessage };

    return { success: true, message: recoveryAcceptedMessage };
  } catch {
    return { success: false, message: recoveryUnavailableMessage };
  }
}
