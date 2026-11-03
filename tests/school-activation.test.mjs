import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const source = ts.transpileModule(
    fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) => (name in mocks ? mocks[name] : dependency(name)),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}
const schema = load("lib/auth/school-auth.ts");
const userId = "00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000002";
const operationId = "00000000-0000-4000-8000-000000000003";

test("activation token TTL must be explicitly aligned with Supabase Auth", () => {
  const activation = load("lib/auth/school-activation.ts", {
    "server-only": {},
    "@/lib/users/admin": { createAdminClient: () => ({}) },
    "./school-auth": schema,
  });
  const previous = process.env.SUPABASE_AUTH_EMAIL_OTP_EXPIRY_SECONDS;
  try {
    delete process.env.SUPABASE_AUTH_EMAIL_OTP_EXPIRY_SECONDS;
    assert.throws(
      () => activation.schoolActivationTokenTtlSeconds(),
      /Missing Supabase Auth email token expiry configuration/,
    );
    for (const seconds of [300, 3600, 7200, 86400]) {
      process.env.SUPABASE_AUTH_EMAIL_OTP_EXPIRY_SECONDS = String(seconds);
      assert.equal(activation.schoolActivationTokenTtlSeconds(), seconds);
    }
    for (const value of ["abc", "299", "86401", "3600.5"]) {
      process.env.SUPABASE_AUTH_EMAIL_OTP_EXPIRY_SECONDS = value;
      assert.throws(() => activation.schoolActivationTokenTtlSeconds());
    }
  } finally {
    if (previous === undefined)
      delete process.env.SUPABASE_AUTH_EMAIL_OTP_EXPIRY_SECONDS;
    else process.env.SUPABASE_AUTH_EMAIL_OTP_EXPIRY_SECONDS = previous;
  }
});

test("school authentication diagnostics omit secrets and raw provider messages", () => {
  const diagnostics = load("lib/auth/school-auth-diagnostics.ts", {
    "server-only": {},
  });
  const entries = [];
  const original = console.error;
  console.error = (...input) => entries.push(input);
  try {
    const correlationId = diagnostics.schoolAuthCorrelationId();
    assert.match(correlationId, /^[0-9a-f-]{36}$/);
    diagnostics.logSchoolAuthFailure({
      operation: "activation",
      stage: "auth_invite",
      correlationId,
      error: {
        code: "smtp_failure",
        status: 502,
        message: "provider rejected private@example.test token=secret",
        url: "https://private.example.test/token",
      },
    });
    const output = JSON.stringify(entries);
    assert.match(output, /smtp_failure/);
    assert.match(output, /auth_invite/);
    assert.doesNotMatch(
      output,
      /private@example|token=secret|private\.example/,
    );
  } finally {
    console.error = original;
  }
});

function harness(config = {}) {
  const calls = {
    rpc: [],
    invite: [],
    recovery: [],
    rateLimit: [],
    rateLimitKeys: [],
    logs: [],
  };
  const admin = {
    async rpc(name, input) {
      calls.rpc.push([name, input]);
      if (config.rpcError && name === "school_activation_request")
        return { data: null, error: config.rpcError };
      if (name === "school_auth_lookup")
        return {
          data: {
            name: "SMK Fiktif",
            npsn: input.p_npsn,
            status: config.statusByNpsn?.[input.p_npsn] ?? config.status ?? "ACTIVE",
            retry_after:
              config.databaseRetryAfterByNpsn?.[input.p_npsn] ??
              config.databaseRetryAfter ??
              (calls.rpc.some(([rpc]) => rpc === "school_activation_bind")
                ? 60
                : 0),
            email: "private@example.test",
            user_id: userId,
            secret: "must-never-leak",
          },
          error: null,
        };
      if (name === "school_activation_request")
        return {
          data: {
            email: "stored@example.test",
            user_id: config.confirmed || config.existingUser ? userId : null,
            confirmed: config.confirmed ?? false,
            request_id: requestId,
            operation_id: operationId,
          },
          error: null,
        };
      if (name === "school_recovery_request")
        return {
          data: config.ineligible ? null : { email: "stored@example.test" },
          error: null,
        };
      if (name === "school_activation_cancel")
        return { data: true, error: config.cancelError ?? null };
      return { data: true, error: config.bindError ?? null };
    },
    auth: {
      admin: {
        async inviteUserByEmail(...input) {
          calls.invite.push(input);
          return {
            data: { user: { id: config.inviteUserId ?? userId } },
            error: config.mailError ?? null,
          };
        },
      },
    },
  };
  const actions = load("app/auth/login/school-actions.ts", {
    "next/headers": { headers: async () => ({ get: () => "203.0.113.99" }) },
    "@/lib/auth/school-auth": schema,
    "@/lib/auth/login-rate-limit": {
      consumeLoginAttempt: () => {
        calls.rateLimit.push("login");
        return config.allowed !== false;
      },
    },
    "@/lib/auth/recovery-rate-limit": {
      consumeRecoveryAttempt: () => {
        calls.rateLimit.push("recovery");
        return config.allowed !== false;
      },
    },
    "@/lib/auth/school-mail-rate-limit": {
      beginSchoolMailAttempt: (key) => {
        calls.rateLimit.push("activation");
        calls.rateLimitKeys.push(key);
        return config.allowed === false
          ? {
              allowed: false,
              retryAfter: config.applicationRetryAfter ?? 713,
              reason: "delivered",
            }
          : { allowed: true, token: "fixture-attempt" };
      },
      finishSchoolMailAttempt: (_key, _token, outcome) => {
        calls.rateLimit.push(`finish:${outcome}`);
        return {
          settled: true,
          retryAfter: config.applicationSuccessRetryAfter ?? 0,
        };
      },
      getSchoolMailClientRetryAfter: () =>
        config.applicationLookupRetryAfter ?? 0,
    },
    "@/lib/auth/school-activation": {
      schoolActivationTokenTtlSeconds: () => {
        if (config.ttlError)
          throw Object.assign(new Error("missing token expiry"), {
            code: "school_activation_ttl_missing",
          });
        return 3600;
      },
    },
    "@/lib/auth/school-auth-diagnostics": {
      schoolAuthCorrelationId: () => "00000000-0000-4000-8000-000000000099",
      logSchoolAuthFailure: (input) => calls.logs.push(input),
    },
    "@/lib/auth/auth-flow-context": {
      withAuthFlowContext: (destination, context) => {
        const url = new URL(destination);
        url.searchParams.set("auth_context", context);
        return url.toString();
      },
    },
    "@/lib/users/admin": {
      createAdminClient: () => admin,
      invitationRedirect: () => {
        if (config.badOrigin) throw Error("bad origin");
        return "https://app.example.test/auth/confirm";
      },
    },
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: {
          async resetPasswordForEmail(...input) {
            calls.recovery.push(input);
            return { error: config.mailError ?? null };
          },
        },
      }),
    },
  });
  return { ...actions, calls };
}

test("public lookup exposes school name and leading-zero NPSN in every state, never account identifiers/email", async () => {
  for (const status of [
    "UNCLAIMED",
    "PENDING_ACTIVATION",
    "ACTIVE",
    "SUSPENDED",
  ]) {
    const h = harness({ status });
    assert.deepEqual(await h.lookupSchool("00000011"), {
      success: true,
      school: { name: "SMK Fiktif", npsn: "00000011", status, retry_after: 0 },
      cooldowns: { school: 0, client: 0 },
    });
    assert.deepEqual(h.calls.rpc[0], [
      "school_auth_lookup",
      { p_npsn: "00000011" },
    ]);
  }
});
test("lookup keeps persistent per-school cooldown separate from the client limit", async () => {
  const pending = harness({
    status: "PENDING_ACTIVATION",
    databaseRetryAfter: 17,
    applicationLookupRetryAfter: 713,
  });
  assert.deepEqual(await pending.lookupSchool("00000011"), {
    success: true,
    school: {
      name: "SMK Fiktif",
      npsn: "00000011",
      status: "PENDING_ACTIVATION",
      retry_after: 17,
    },
    cooldowns: { school: 17, client: 713 },
    retryAfter: 713,
    rateLimit: "application",
  });

  const active = harness({
    status: "ACTIVE",
    applicationLookupRetryAfter: 713,
  });
  assert.deepEqual((await active.lookupSchool("00000011")).cooldowns, {
    school: 0,
    client: 0,
  });
});
test("different normalized NPSNs never share the ordinary school cooldown", async () => {
  const h = harness({
    status: "PENDING_ACTIVATION",
    databaseRetryAfterByNpsn: { "11111111": 60, "00000000": 0 },
  });
  const schoolA = await h.lookupSchool("11111111");
  const schoolB = await h.lookupSchool("00000000");
  assert.equal(schoolA.school.npsn, "11111111");
  assert.equal(schoolA.cooldowns.school, 60);
  assert.equal(schoolB.school.npsn, "00000000");
  assert.equal(schoolB.cooldowns.school, 0);
});
test("invalid lookup and rate-limited requests perform no privileged lookup", async () => {
  for (const input of [12345678, "123", "1234567x", "123456789"]) {
    const h = harness();
    assert.equal((await h.lookupSchool(input)).success, false);
    assert.equal(h.calls.rpc.length, 0);
  }
  const limited = harness({ allowed: false });
  assert.equal((await limited.lookupSchool("00000011")).success, false);
  assert.equal(limited.calls.rpc.length, 0);
});
test("activation sends native invitation only after database reservation and binds its Auth ID", async () => {
  const h = harness();
  const result = await h.requestSchoolActivation({
    npsn: "00000011",
    email: " School@Example.test ",
    user_id: "spoofed",
    role: "admin_dinas",
  });
  assert.equal(result.success, true);
  assert.deepEqual(h.calls.rpc, [
    [
      "school_activation_request",
      {
        p_npsn: "00000011",
        p_email: "school@example.test",
        p_token_ttl_seconds: 3600,
      },
    ],
    [
      "school_activation_bind",
      {
        p_request_id: requestId,
        p_operation_id: operationId,
        p_user_id: userId,
      },
    ],
    ["school_auth_lookup", { p_npsn: "00000011" }],
  ]);
  assert.deepEqual(h.calls.invite, [
    [
      "stored@example.test",
      {
        redirectTo:
          "https://app.example.test/auth/confirm?auth_context=school_activation",
        data: { school_activation: true },
      },
    ],
  ]);
  assert.equal(JSON.stringify(result).includes("@"), false);
  assert.match(result.message, /Permintaan email diterima/);
});
test("verified incomplete activation resumes via native recovery without a duplicate Auth user", async () => {
  const h = harness({ confirmed: true });
  assert.equal(
    (await h.requestSchoolActivation({ npsn: "00000011" })).success,
    true,
  );
  assert.equal(h.calls.invite.length, 0);
  assert.deepEqual(h.calls.recovery, [
    [
      "stored@example.test",
      {
        redirectTo:
          "https://app.example.test/auth/callback?auth_context=school_activation",
      },
    ],
  ]);
  assert.deepEqual(h.calls.rpc.at(-2), [
    "school_activation_bind",
    {
      p_request_id: requestId,
      p_operation_id: operationId,
      p_user_id: userId,
    },
  ]);
});
test("an existing unconfirmed Auth identity is reinvited and bound without replacement", async () => {
  const h = harness({ existingUser: true });
  assert.equal(
    (
      await h.requestSchoolActivation({
        npsn: "00000011",
        email: "fiktif@example.test",
      })
    ).success,
    true,
  );
  assert.equal(h.calls.invite.length, 1);
  assert.deepEqual(h.calls.rpc.at(-2), [
    "school_activation_bind",
    {
      p_request_id: requestId,
      p_operation_id: operationId,
      p_user_id: userId,
    },
  ]);
  assert.equal(
    h.calls.rpc.some(([name]) => name === "school_activation_cancel"),
    false,
  );
});
test("configuration, cooldown and SMTP failures cannot report email success or expose provider details", async () => {
  for (const [config, failureKind] of [
    [{ badOrigin: true }, "configuration"],
    [{ ttlError: true }, "configuration"],
    [{ allowed: false }, "application_rate_limit"],
    [
      { rpcError: { code: "55P03", message: "private@example.test" } },
      "database_cooldown",
    ],
    [
      { mailError: { code: "smtp_failure", message: "secret-provider-detail" } },
      "provider_failure",
    ],
    [{ bindError: { code: "42501" } }, "invalid_account_state"],
  ]) {
    const h = harness(config);
    const result = await h.requestSchoolActivation({
      npsn: "00000011",
      email: "fiktif@example.test",
    });
    assert.equal(result.success, false);
    assert.equal(result.failureKind, failureKind);
    assert.doesNotMatch(
      JSON.stringify(result),
      /private@example|secret-provider/,
    );
    if (config.badOrigin || config.ttlError || config.allowed === false)
      assert.equal(h.calls.rpc.length, 0);
    if (config.badOrigin || config.ttlError)
      assert.equal(h.calls.rateLimit.length, 0);
    if (config.mailError || config.bindError)
      assert.deepEqual(h.calls.rpc.at(-1), [
        "school_activation_cancel",
        {
          p_request_id: requestId,
          p_operation_id: operationId,
        },
      ]);
  }
});
test("activation calls the hosted RPC with its exact three named parameters", async () => {
  const h = harness();
  assert.equal(
    (
      await h.requestSchoolActivation({
        npsn: "00000011",
        email: "fiktif@example.test",
      })
    ).success,
    true,
  );
  const [name, input] = h.calls.rpc[0];
  assert.equal(name, "school_activation_request");
  assert.deepEqual(h.calls.rateLimitKeys, ["activation:ip:203.0.113.99"]);
  assert.deepEqual(Object.keys(input).sort(), [
    "p_email",
    "p_npsn",
    "p_token_ttl_seconds",
  ]);
});
test("provider and cancellation failures are logged by stage without changing the public error", async () => {
  const h = harness({
    mailError: { code: "smtp_failure", message: "private@example.test" },
    cancelError: { code: "cancel_failed", message: "private@example.test" },
  });
  const result = await h.requestSchoolActivation({
    npsn: "00000011",
    email: "fiktif@example.test",
  });
  assert.equal(result.success, false);
  assert.equal(result.retryAfter, undefined);
  assert.equal(result.rateLimit, undefined);
  assert.equal(result.failureKind, "provider_failure");
  assert.deepEqual(
    h.calls.logs.map(({ stage }) => stage),
    ["auth_invite", "cancel_rpc"],
  );
  assert.doesNotMatch(JSON.stringify(result), /private@example|smtp_failure/);
});
test("application and database cooldowns return their authoritative remaining time", async () => {
  const application = harness({
    allowed: false,
    applicationRetryAfter: 713,
  });
  assert.deepEqual(
    await application.requestSchoolActivation({
      npsn: "00000011",
      email: "fiktif@example.test",
    }),
    {
      success: false,
      message:
        "Batas permintaan dari jaringan ini tercapai. Coba lagi dalam 713 detik.",
      retryAfter: 713,
      rateLimit: "application",
      failureKind: "application_rate_limit",
    },
  );

  const database = harness({
    rpcError: { code: "55P03" },
    databaseRetryAfter: 17,
  });
  const result = await database.requestSchoolActivation({
    npsn: "00000011",
    email: "fiktif@example.test",
  });
  assert.equal(result.rateLimit, "database");
  assert.equal(result.failureKind, "database_cooldown");
  assert.equal(result.retryAfter, 17);
  assert.doesNotMatch(result.message, /60 detik/);

  const finalAllowedDelivery = harness({
    applicationSuccessRetryAfter: 780,
  });
  const success = await finalAllowedDelivery.requestSchoolActivation({
    npsn: "00000011",
    email: "fiktif@example.test",
  });
  assert.equal(success.success, true);
  assert.equal(success.retryAfter, 780);
  assert.equal(success.rateLimit, "application");
  assert.deepEqual(success.cooldowns, { school: 60, client: 780 });
});

test("provider limits are identified without inventing a new 60 second cooldown", async () => {
  const h = harness({
    mailError: { status: 429 },
  });
  const result = await h.requestSchoolActivation({
    npsn: "00000011",
    email: "fiktif@example.test",
  });
  assert.equal(result.success, false);
  assert.equal(result.rateLimit, "provider");
  assert.equal(result.failureKind, "auth_rate_limit");
  assert.equal(result.retryAfter, undefined);
  assert.match(result.message, /Waktu tunggu tidak diberikan/);
  assert.equal(h.calls.rateLimit.at(-1), "finish:failed");
});

test("client limiter allows bounded parallel schools and preserves the IP ceiling", () => {
  const limiter = load("lib/auth/school-mail-rate-limit.ts", {
    "server-only": {},
  });
  const client = `fixture-${Date.now()}`;

  const pending = [0, 1, 2].map((now) =>
    limiter.beginSchoolMailAttempt(client, now),
  );
  assert.equal(pending.every((attempt) => attempt.allowed), true);
  assert.deepEqual(limiter.beginSchoolMailAttempt(client, 3), {
    allowed: false,
    retryAfter: 300,
    reason: "capacity",
  });
  assert.equal(limiter.getSchoolMailClientRetryAfter(client, 3), 300);
  for (const attempt of pending)
    assert.equal(
      limiter.finishSchoolMailAttempt(client, attempt.token, "released", 4)
        .settled,
      true,
    );
  assert.equal(limiter.getSchoolMailClientRetryAfter(client, 4), 0);

  let settled;
  for (const now of [10, 60_010, 120_010]) {
    const attempt = limiter.beginSchoolMailAttempt(client, now);
    assert.equal(attempt.allowed, true);
    settled = limiter.finishSchoolMailAttempt(
      client,
      attempt.token,
      "delivered",
      now,
    );
  }
  assert.equal(settled.retryAfter, 780);
  assert.equal(limiter.getSchoolMailClientRetryAfter(client, 180_010), 720);
  assert.deepEqual(limiter.beginSchoolMailAttempt(client, 180_010), {
    allowed: false,
    retryAfter: 720,
    reason: "delivered",
  });
  assert.equal(limiter.beginSchoolMailAttempt(client, 900_011).allowed, true);
});

test("failed delivery initiation has a separate bounded budget and expires without lockout", () => {
  const limiter = load("lib/auth/school-mail-rate-limit.ts", {
    "server-only": {},
  });
  const client = `failed-fixture-${Date.now()}`;
  for (let index = 0; index < 10; index += 1) {
    const attempt = limiter.beginSchoolMailAttempt(client, index * 1000);
    assert.equal(attempt.allowed, true);
    limiter.finishSchoolMailAttempt(
      client,
      attempt.token,
      "failed",
      index * 1000,
    );
  }
  assert.deepEqual(limiter.beginSchoolMailAttempt(client, 10_000), {
    allowed: false,
    retryAfter: 890,
    reason: "failed",
  });
  assert.equal(limiter.beginSchoolMailAttempt(client, 900_001).allowed, true);
});
test("a mismatched Auth identity is rejected and the database reservation is cancelled", async () => {
  const differentUser = "00000000-0000-4000-8000-000000000004";
  const h = harness({ existingUser: true, inviteUserId: differentUser });
  const result = await h.requestSchoolActivation({
    npsn: "00000011",
    email: "fiktif@example.test",
  });
  assert.equal(result.success, false);
  assert.equal(result.failureKind, "invalid_account_state");
  assert.deepEqual(h.calls.rpc.at(-1), [
    "school_activation_cancel",
    {
      p_request_id: requestId,
      p_operation_id: operationId,
    },
  ]);
});
test("school recovery uses only the stored verified address and ineligible requests send nothing", async () => {
  const h = harness();
  assert.equal((await h.requestSchoolRecovery("00000011")).success, true);
  assert.equal(h.calls.recovery[0][0], "stored@example.test");
  assert.equal(
    h.calls.recovery[0][1].redirectTo,
    "https://app.example.test/auth/callback?auth_context=school_recovery",
  );
  const invalid = harness();
  assert.equal(
    (
      await invalid.requestSchoolRecovery({
        npsn: "00000011",
        email: "attacker@example.test",
      })
    ).success,
    false,
  );
  assert.equal(invalid.calls.recovery.length, 0);
  const unavailable = harness({ ineligible: true });
  assert.equal(
    (await unavailable.requestSchoolRecovery("00000011")).success,
    true,
  );
  assert.equal(unavailable.calls.recovery.length, 0);
});
