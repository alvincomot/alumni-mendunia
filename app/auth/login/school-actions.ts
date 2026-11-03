"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient, invitationRedirect } from "@/lib/users/admin";
import { createClient } from "@/lib/supabase/server";
import { consumeLoginAttempt } from "@/lib/auth/login-rate-limit";
import { consumeRecoveryAttempt } from "@/lib/auth/recovery-rate-limit";
import {
  beginSchoolMailAttempt,
  finishSchoolMailAttempt,
  getSchoolMailClientRetryAfter,
} from "@/lib/auth/school-mail-rate-limit";
import {
  npsnSchema,
  schoolEmailSchema,
  schoolLookupSchema,
  schoolMailAccepted,
  schoolAuthUnavailable,
  type SchoolAuthResult,
} from "@/lib/auth/school-auth";
import { schoolActivationTokenTtlSeconds } from "@/lib/auth/school-activation";
import {
  logSchoolAuthFailure,
  schoolAuthCorrelationId,
  type SchoolAuthOperation,
  type SchoolAuthStage,
} from "@/lib/auth/school-auth-diagnostics";
import { withAuthFlowContext } from "@/lib/auth/auth-flow-context";

async function clientAddress() {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

function failure(
  error: unknown,
  context: {
    operation: SchoolAuthOperation;
    stage: SchoolAuthStage;
    correlationId: string;
  },
  rateLimit?: {
    source: "application" | "database" | "provider";
    retryAfter?: number;
  },
): SchoolAuthResult {
  logSchoolAuthFailure({ ...context, error });
  const code =
    error && typeof error === "object" && "code" in error ? error.code : null;
  const providerLimited = providerRateLimited(error);
  const source =
    rateLimit?.source ??
    (providerLimited ? "provider" : code === "55P03" ? "database" : undefined);
  const retryAfter = rateLimit?.retryAfter;
  const configuration = context.stage === "configuration";
  const invalidAccountState = [
    "23514",
    "42501",
    "school_activation_identity_mismatch",
    "school_activation_invalid_state",
  ].includes(String(code));
  const providerFailure = ["auth_invite", "auth_recovery"].includes(
    context.stage,
  );
  const failureKind = configuration
    ? "configuration"
    : source === "application"
      ? "application_rate_limit"
      : source === "database"
        ? "database_cooldown"
        : source === "provider"
          ? "auth_rate_limit"
          : invalidAccountState
            ? "invalid_account_state"
            : providerFailure
              ? "provider_failure"
              : "unexpected";
  return {
    success: false,
    message: configuration
      ? "Konfigurasi autentikasi sekolah belum lengkap. Hubungi pengelola aplikasi."
      : source === "application"
        ? `Batas permintaan dari jaringan ini tercapai. Coba lagi dalam ${retryAfter ?? 1} detik.`
        : source === "database"
          ? `Permintaan aktivasi sekolah ini masih dalam masa tunggu. Coba lagi dalam ${retryAfter ?? 1} detik.`
          : source === "provider"
            ? "Layanan Auth sedang membatasi pengiriman email. Waktu tunggu tidak diberikan oleh layanan; tunggu beberapa saat lalu coba lagi."
            : invalidAccountState
              ? "Status akun sekolah tidak mengizinkan permintaan ini. Cari sekolah kembali atau hubungi Dinas jika status belum sesuai."
              : providerFailure
                ? "Layanan pengiriman email belum dapat memulai pengiriman. Coba lagi beberapa saat lagi."
                : schoolAuthUnavailable,
    ...(retryAfter !== undefined
      ? { retryAfter: Math.max(1, Math.ceil(retryAfter)) }
      : {}),
    ...(source ? { rateLimit: source } : {}),
    failureKind,
  };
}

function errorCode(error: unknown) {
  return String(
    error && typeof error === "object" && "code" in error ? error.code : "",
  );
}

function providerRateLimited(error: unknown) {
  const status =
    error && typeof error === "object" && "status" in error
      ? Number(error.status)
      : 0;
  return (
    status === 429 ||
    ["over_email_send_rate_limit", "over_request_rate_limit"].includes(
      errorCode(error),
    )
  );
}

async function schoolRetryAfter(
  admin: ReturnType<typeof createAdminClient>,
  npsn: string,
) {
  const { data, error } = await admin.rpc("school_auth_lookup", {
    p_npsn: npsn,
  });
  if (error) return undefined;
  const parsed = schoolLookupSchema.safeParse(data);
  return parsed.success
    ? Math.max(0, Math.ceil(parsed.data.retry_after))
    : undefined;
}

export async function lookupSchool(input: unknown): Promise<SchoolAuthResult> {
  const parsed = npsnSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, message: parsed.error.issues[0].message };
  const correlationId = schoolAuthCorrelationId();
  let stage: SchoolAuthStage = "configuration";
  try {
    const admin = createAdminClient();
    const address = await clientAddress();
    stage = "rate_limit";
    if (!consumeLoginAttempt(`lookup:${address}`))
      return failure(
        { code: "local_rate_limit" },
        { operation: "lookup", stage, correlationId },
      );
    stage = "lookup_rpc";
    const { data, error } = await admin.rpc("school_auth_lookup", {
      p_npsn: parsed.data,
    });
    if (error)
      return failure(error, { operation: "lookup", stage, correlationId });
    if (!data)
      return {
        success: false,
        message: "Sekolah tidak ditemukan. Periksa NPSN yang Anda masukkan.",
      };
    // Zod strips all fields outside the public school identity/status contract.
    const school = schoolLookupSchema.parse(data);
    const activationEligible = ["UNCLAIMED", "PENDING_ACTIVATION"].includes(
      school.status,
    );
    const clientRetryAfter = activationEligible
      ? getSchoolMailClientRetryAfter(`activation:ip:${address}`)
      : 0;
    return {
      success: true,
      school,
      cooldowns: {
        school: activationEligible ? school.retry_after : 0,
        client: clientRetryAfter,
      },
      ...(clientRetryAfter
        ? { retryAfter: clientRetryAfter, rateLimit: "application" as const }
        : {}),
    };
  } catch (error) {
    return failure(error, { operation: "lookup", stage, correlationId });
  }
}

const activationSchema = z.object({
  npsn: npsnSchema,
  email: schoolEmailSchema.optional(),
});
const requestSchema = z.object({
  request_id: z.uuid(),
  operation_id: z.uuid(),
  email: schoolEmailSchema,
  user_id: z.uuid().nullable(),
  confirmed: z.boolean(),
});

export async function requestSchoolActivation(
  input: unknown,
): Promise<SchoolAuthResult> {
  const parsed = activationSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, message: parsed.error.issues[0].message };
  const correlationId = schoolAuthCorrelationId();
  let stage: SchoolAuthStage = "configuration";
  try {
    const redirectTo = withAuthFlowContext(
      invitationRedirect(),
      "school_activation",
    );
    const recoveryRedirectTo = withAuthFlowContext(
      invitationRedirect().replace(/\/confirm$/, "/callback"),
      "school_activation",
    );
    const admin = createAdminClient();
    const tokenTtlSeconds = schoolActivationTokenTtlSeconds();
    const rateLimitKey = `activation:ip:${await clientAddress()}`;
    stage = "rate_limit";
    const attempt = beginSchoolMailAttempt(rateLimitKey);
    if (!attempt.allowed)
      return failure(
        { code: "local_rate_limit" },
        { operation: "activation", stage, correlationId },
        { source: "application", retryAfter: attempt.retryAfter },
      );
    const applicationToken = attempt.token;

    let applicationOutcome: "delivered" | "failed" | "released" = "failed";
    let applicationFinished = false;
    function finishApplication(outcome: "delivered" | "failed" | "released") {
      if (applicationFinished) return { settled: false, retryAfter: 0 };
      applicationFinished = true;
      return finishSchoolMailAttempt(rateLimitKey, applicationToken, outcome);
    }
    try {
      stage = "reserve_rpc";
      const prepared = await admin.rpc("school_activation_request", {
        p_npsn: parsed.data.npsn,
        p_email: parsed.data.email ?? null,
        p_token_ttl_seconds: tokenTtlSeconds,
      });
      if (prepared.error) {
        const code = errorCode(prepared.error);
        if (code === "55P03") {
          applicationOutcome = "released";
          return failure(
            prepared.error,
            { operation: "activation", stage, correlationId },
            {
              source: "database",
              retryAfter:
                (await schoolRetryAfter(admin, parsed.data.npsn)) ?? 1,
            },
          );
        }
        return failure(prepared.error, {
          operation: "activation",
          stage,
          correlationId,
        });
      }
      const state = requestSchema.parse(prepared.data);
      let delivered = false;
      try {
        let deliveredUserId = state.user_id;
        if (state.confirmed) {
          stage = "auth_recovery";
          if (!deliveredUserId)
            return failure({ code: "school_activation_invalid_state" }, {
              operation: "activation",
              stage,
              correlationId,
            });
          const supabase = await createClient();
          const sent = await supabase.auth.resetPasswordForEmail(state.email, {
            redirectTo: recoveryRedirectTo,
          });
          if (sent.error)
            return failure(sent.error, {
              operation: "activation",
              stage,
              correlationId,
            });
        } else {
          stage = "auth_invite";
          const sent = await admin.auth.admin.inviteUserByEmail(state.email, {
            redirectTo,
            data: { school_activation: true },
          });
          if (sent.error || !sent.data.user)
            return failure(
              sent.error,
              { operation: "activation", stage, correlationId },
              providerRateLimited(sent.error)
                ? { source: "provider" }
                : undefined,
            );
          if (deliveredUserId && deliveredUserId !== sent.data.user.id)
            return failure(
              { code: "school_activation_identity_mismatch" },
              { operation: "activation", stage, correlationId },
            );
          deliveredUserId = sent.data.user.id;
        }
        if (!deliveredUserId)
          return failure({ code: "school_activation_invalid_state" }, {
            operation: "activation",
            stage,
            correlationId,
          });

        applicationOutcome = "delivered";
        stage = "bind_rpc";
        const bound = await admin.rpc("school_activation_bind", {
          p_request_id: state.request_id,
          p_operation_id: state.operation_id,
          p_user_id: deliveredUserId,
        });
        if (bound.error || bound.data !== true)
          return failure(bound.error, {
            operation: "activation",
            stage,
            correlationId,
          });
        delivered = true;
        const applicationRetryAfter = finishApplication("delivered").retryAfter;
        const databaseRetryAfter =
          (await schoolRetryAfter(admin, parsed.data.npsn)) ?? 60;
        return {
          success: true,
          message: schoolMailAccepted,
          retryAfter: Math.max(applicationRetryAfter, databaseRetryAfter),
          cooldowns: {
            school: databaseRetryAfter,
            client: applicationRetryAfter,
          },
          rateLimit:
            applicationRetryAfter > databaseRetryAfter
              ? "application"
              : "database",
        };
      } finally {
        if (!delivered) {
          try {
            const cancelled = await admin.rpc("school_activation_cancel", {
              p_request_id: state.request_id,
              p_operation_id: state.operation_id,
            });
            if (cancelled.error || cancelled.data !== true)
              logSchoolAuthFailure({
                operation: "activation",
                stage: "cancel_rpc",
                correlationId,
                error: cancelled.error,
              });
          } catch (error) {
            logSchoolAuthFailure({
              operation: "activation",
              stage: "cancel_rpc",
              correlationId,
              error,
            });
          }
        }
      }
    } finally {
      if (!applicationFinished) finishApplication(applicationOutcome);
    }
  } catch (error) {
    return failure(error, { operation: "activation", stage, correlationId });
  }
}

export async function requestSchoolRecovery(
  input: unknown,
): Promise<SchoolAuthResult> {
  const parsed = npsnSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, message: parsed.error.issues[0].message };
  const correlationId = schoolAuthCorrelationId();
  let stage: SchoolAuthStage = "configuration";
  try {
    const redirectTo = withAuthFlowContext(
      invitationRedirect().replace(/\/confirm$/, "/callback"),
      "school_recovery",
    );
    const admin = createAdminClient();
    stage = "rate_limit";
    if (!consumeRecoveryAttempt(`school:${await clientAddress()}`))
      return failure(
        { code: "55P03" },
        { operation: "recovery", stage, correlationId },
      );
    stage = "reserve_rpc";
    const resolved = await admin.rpc("school_recovery_request", {
      p_npsn: parsed.data,
    });
    if (resolved.error)
      return failure(resolved.error, {
        operation: "recovery",
        stage,
        correlationId,
      });
    if (resolved.data) {
      const { email } = z
        .object({ email: schoolEmailSchema })
        .parse(resolved.data);
      const supabase = await createClient();
      stage = "auth_recovery";
      const sent = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (sent.error)
        return failure(sent.error, {
          operation: "recovery",
          stage,
          correlationId,
        });
    }
    return {
      success: true,
      message:
        "Jika akun sekolah aktif, permintaan pemulihan dikirim ke email sekolah yang terverifikasi. Periksa Kotak Masuk atau Spam.",
      retryAfter: 60,
    };
  } catch (error) {
    return failure(error, { operation: "recovery", stage, correlationId });
  }
}
