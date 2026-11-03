import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import {
  logSchoolAuthFailure,
  schoolAuthCorrelationId,
} from "@/lib/auth/school-auth-diagnostics";
import {
  authContextAcceptsOtpType,
  authErrorPath,
  readAuthFlowContext,
  type AuthErrorReason,
} from "@/lib/auth/auth-flow-context";

export async function GET(request: NextRequest) {
  const correlationId = schoolAuthCorrelationId();
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const candidate = searchParams.get("type");
  const contextToken = searchParams.get("auth_context");
  const context = readAuthFlowContext(contextToken);
  const allowedTypes: EmailOtpType[] = [
    "invite",
    "recovery",
    "email",
    "email_change",
    "signup",
  ];
  const type = allowedTypes.find((value) => value === candidate);
  const destination =
    type === "invite" || type === "recovery"
      ? "/auth/update-password"
      : "/dashboard";
  const contextIsInvalid = Boolean(contextToken && !context);
  const trustedContextToken = context ? contextToken : null;

  if (contextIsInvalid) {
    logSchoolAuthFailure({
      operation: "callback",
      stage: "token_exchange",
      correlationId,
      error: { code: "auth_callback_context_invalid" },
    });
  }

  if (!token_hash) {
    logSchoolAuthFailure({
      operation: "callback",
      stage: "token_exchange",
      correlationId,
      error: {
        code: context
          ? "auth_callback_implicit_fragment_unsupported"
          : "auth_callback_invalid",
      },
    });
    redirect(
      authErrorPath(
        trustedContextToken,
        context ? "unsupported_redirect" : "invalid_or_expired",
      ),
    );
  }

  if (!type || !authContextAcceptsOtpType(context, type)) {
    logSchoolAuthFailure({
      operation: "callback",
      stage: "token_exchange",
      correlationId,
      error: { code: "auth_callback_type_invalid" },
    });
    redirect(authErrorPath(trustedContextToken, "invalid_or_expired"));
  }

  let verified = false;
  let failureReason: AuthErrorReason = "invalid_or_expired";
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error && data.session && data.user) {
      const user = await supabase.auth.getUser();
      verified = !user.error && user.data.user?.id === data.user.id;
      if (!verified) {
        failureReason = "session_invalid";
        logSchoolAuthFailure({
          operation: "callback",
          stage: "session_verification",
          correlationId,
          error: user.error ?? { code: "auth_identity_mismatch" },
        });
      }
    } else {
      logSchoolAuthFailure({
        operation: "callback",
        stage: "token_exchange",
        correlationId,
        error: error ?? { code: "auth_session_missing" },
      });
    }
  } catch (error) {
    logSchoolAuthFailure({
      operation: "callback",
      stage: "token_exchange",
      correlationId,
      error,
    });
    verified = false;
  }
  if (verified) redirect(destination);
  redirect(authErrorPath(trustedContextToken, failureReason));
}
