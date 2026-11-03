import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const authFlowContexts = [
  "school_activation",
  "school_recovery",
  "dinas_invitation",
  "dinas_recovery",
] as const;

export type AuthFlowContext = (typeof authFlowContexts)[number];
export type AuthErrorReason =
  | "invalid_or_expired"
  | "session_invalid"
  | "unsupported_redirect";

const contextSet = new Set<string>(authFlowContexts);
const tokenVersion = "v1";
const signaturePurpose = "alumni-mendunia:auth-flow-context";

function signingSecret() {
  return process.env.SUPABASE_SECRET_KEY || null;
}

function signature(context: AuthFlowContext, secret: string) {
  return createHmac("sha256", secret)
    .update(`${signaturePurpose}:${tokenVersion}:${context}`)
    .digest("base64url");
}

export function createAuthFlowToken(context: AuthFlowContext) {
  const secret = signingSecret();
  if (!secret) throw new Error("Auth flow context signing is not configured");
  return `${tokenVersion}.${context}.${signature(context, secret)}`;
}

export function readAuthFlowContext(value: string | null | undefined) {
  if (!value) return null;
  const [version, candidate, candidateSignature, extra] = value.split(".");
  if (
    extra !== undefined ||
    version !== tokenVersion ||
    !contextSet.has(candidate) ||
    !candidateSignature ||
    !/^[A-Za-z0-9_-]{43}$/.test(candidateSignature)
  )
    return null;
  const secret = signingSecret();
  if (!secret) return null;
  const expected = signature(candidate as AuthFlowContext, secret);
  const actualBuffer = Buffer.from(candidateSignature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  )
    return null;
  return candidate as AuthFlowContext;
}

export function withAuthFlowContext(
  destination: string,
  context: AuthFlowContext,
) {
  const url = new URL(destination);
  url.searchParams.set("auth_context", createAuthFlowToken(context));
  return url.toString();
}

export function authErrorPath(
  contextToken: string | null | undefined,
  reason: AuthErrorReason,
) {
  const params = new URLSearchParams({ reason });
  if (readAuthFlowContext(contextToken))
    params.set("auth_context", contextToken as string);
  // An explicit harmless fragment prevents browsers from inheriting a
  // Supabase implicit-flow fragment when following this redirect.
  return `/auth/error?${params.toString()}#auth-error`;
}

export function authContextAcceptsOtpType(
  context: AuthFlowContext | null,
  type: string,
) {
  if (!context) return true;
  if (type === "invite")
    return context === "school_activation" || context === "dinas_invitation";
  if (type === "recovery")
    return (
      context === "school_activation" ||
      context === "school_recovery" ||
      context === "dinas_recovery"
    );
  return false;
}

export function authContextAcceptsPkce(context: AuthFlowContext | null) {
  return (
    !context ||
    context === "school_activation" ||
    context === "school_recovery" ||
    context === "dinas_recovery"
  );
}
