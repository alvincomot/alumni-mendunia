import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  logSchoolAuthFailure,
  schoolAuthCorrelationId,
} from "@/lib/auth/school-auth-diagnostics";
import {
  authContextAcceptsPkce,
  authErrorPath,
  readAuthFlowContext,
  type AuthErrorReason,
} from "@/lib/auth/auth-flow-context";

export async function GET(request: Request) {
  const correlationId = schoolAuthCorrelationId();
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const contextToken = params.get("auth_context");
  const context = readAuthFlowContext(contextToken);
  const contextIsInvalid = Boolean(contextToken && !context);
  const trustedContextToken = context ? contextToken : null;
  const providerRejected = params.has("error") || params.has("error_code");
  if (contextIsInvalid) {
    logSchoolAuthFailure({
      operation: "callback",
      stage: "token_exchange",
      correlationId,
      error: { code: "auth_callback_context_invalid" },
    });
  }
  if (!authContextAcceptsPkce(context)) {
    logSchoolAuthFailure({
      operation: "callback",
      stage: "token_exchange",
      correlationId,
      error: { code: "auth_callback_context_mismatch" },
    });
    redirect(
      authErrorPath(trustedContextToken, "invalid_or_expired"),
    );
  }
  let verified = false;
  let failureReason: AuthErrorReason = "invalid_or_expired";
  if (code && !providerRejected) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
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
  } else {
    logSchoolAuthFailure({
      operation: "callback",
      stage: "token_exchange",
      correlationId,
      error: { code: "auth_callback_invalid" },
    });
  }
  if (verified) redirect("/auth/update-password");
  redirect(
    authErrorPath(
      trustedContextToken,
      !code && context && !providerRejected
        ? "unsupported_redirect"
        : failureReason,
    ),
  );
}
