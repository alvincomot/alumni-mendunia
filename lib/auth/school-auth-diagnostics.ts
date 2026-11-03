import "server-only";

import { randomUUID } from "node:crypto";

export type SchoolAuthOperation =
  | "lookup"
  | "activation"
  | "recovery"
  | "callback"
  | "password_change";

export type SchoolAuthStage =
  | "configuration"
  | "rate_limit"
  | "lookup_rpc"
  | "reserve_rpc"
  | "auth_invite"
  | "auth_recovery"
  | "bind_rpc"
  | "cancel_rpc"
  | "token_exchange"
  | "session_verification"
  | "password_update"
  | "activation_completion";

type Diagnostic = {
  operation: SchoolAuthOperation;
  stage: SchoolAuthStage;
  correlationId: string;
  error?: unknown;
};

function safeCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error))
    return "unknown_error";
  const code = String(error.code);
  return /^[A-Za-z0-9_.-]{1,64}$/.test(code) ? code : "unknown_error";
}

function safeStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error))
    return undefined;
  const status = Number(error.status);
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : undefined;
}

export function schoolAuthCorrelationId() {
  return randomUUID();
}

export function logSchoolAuthFailure(diagnostic: Diagnostic) {
  console.error("school_auth_failure", {
    operation: diagnostic.operation,
    stage: diagnostic.stage,
    correlation_id: diagnostic.correlationId,
    code: safeCode(diagnostic.error),
    ...(safeStatus(diagnostic.error) === undefined
      ? {}
      : { status: safeStatus(diagnostic.error) }),
  });
}
