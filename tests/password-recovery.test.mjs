import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(file, mocks = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => name in mocks ? mocks[name] : dependency(name), loaded, loaded.exports,
  );
  return loaded.exports;
}

const schema = load("lib/auth/recovery.ts");
const flowContext = load("lib/auth/auth-flow-context.ts", { "server-only": {} });
const origin = "https://prototype.example";

function recoveryHarness(options = {}) {
  const config = { allowed: true, authError: null, ...options };
  const calls = [];
  const actions = load("app/auth/forgot-password/actions.ts", {
    "next/headers": {
      headers: async () => new Headers({
        origin,
        "x-forwarded-for": "192.0.2.10",
      }),
    },
    "@/lib/auth/recovery": schema,
    "@/lib/auth/recovery-rate-limit": {
      consumeRecoveryAttempt: () => config.allowed,
    },
    "@/lib/auth/auth-flow-context": flowContext,
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: {
          resetPasswordForEmail: async (...args) => {
            calls.push(args);
            if (config.throws) throw new Error("sensitive provider detail");
            return { error: config.authError };
          },
        },
      }),
    },
  });
  return { ...actions, calls };
}

async function withOrigin(value, fn) {
  const old = process.env.APP_SITE_URL;
  const oldSecret = process.env.SUPABASE_SECRET_KEY;
  process.env.APP_SITE_URL = value;
  process.env.SUPABASE_SECRET_KEY = "fictional-auth-flow-signing-secret";
  try { await fn(); }
  finally {
    if (old === undefined) delete process.env.APP_SITE_URL;
    else process.env.APP_SITE_URL = old;
    if (oldSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldSecret;
  }
}

test("recovery validates empty and malformed emails before calling Auth", async () => {
  for (const [input, message] of [
    ["", "Masukkan alamat email Anda."],
    ["  ", "Masukkan alamat email Anda."],
    ["invalid-email", "Masukkan alamat email yang valid."],
  ]) {
    const harness = recoveryHarness();
    const result = await harness.requestPasswordRecovery(input);
    assert.equal(result.success, false);
    assert.equal(result.field, "email");
    assert.equal(result.message, message);
    assert.equal(harness.calls.length, 0);
  }
});

test("registered, unregistered and explicit missing-user responses are indistinguishable", async () => {
  await withOrigin(origin, async () => {
    const results = [];
    for (const [email, authError] of [
      ["registered@dinas.example", null],
      ["unknown@dinas.example", null],
      ["missing@dinas.example", { code: "user_not_found" }],
      ["missing@dinas.example", { code: "email_not_found" }],
    ]) {
      const harness = recoveryHarness({ authError });
      results.push(await harness.requestPasswordRecovery(email));
      assert.equal(harness.calls.length, 1);
      assert.equal(harness.calls[0][0], email);
      const redirect = new URL(harness.calls[0][1].redirectTo);
      assert.equal(redirect.origin + redirect.pathname, `${origin}/auth/callback`);
      assert.equal(
        flowContext.readAuthFlowContext(redirect.searchParams.get("auth_context")),
        "dinas_recovery",
      );
    }
    for (const result of results)
      assert.deepEqual(result, { success: true, message: schema.recoveryAcceptedMessage });
  });
});

test("SMTP, network and abuse-limit failures give safe generic errors", async () => {
  await withOrigin(origin, async () => {
    for (const options of [
      { authError: { code: "unexpected_failure", message: "smtp-key-sensitive" } },
      { authError: { code: "over_email_send_rate_limit" } },
      { throws: true },
      { allowed: false },
    ]) {
      const harness = recoveryHarness(options);
      assert.deepEqual(await harness.requestPasswordRecovery("test@dinas.example"), {
        success: false, message: schema.recoveryUnavailableMessage,
      });
      if (options.allowed === false) assert.equal(harness.calls.length, 0);
    }
  });
});

test("production recovery rejects missing or unsafe configured origins before sending", async () => {
  for (const site of ["", "http://untrusted.example", "https://user:secret@host.example", "https://host.example/path", "https://host.example?next=bad"]) {
    await withOrigin(site, async () => {
      const harness = recoveryHarness();
      assert.equal((await harness.requestPasswordRecovery("test@dinas.example")).success, false);
      assert.equal(harness.calls.length, 0);
    });
  }
});

test("installed Supabase SSR persists a PKCE verifier cookie before sending recovery", async () => {
  const { createServerClient } = dependency("@supabase/ssr");
  const cookieJar = new Map();
  const requests = [];
  const client = createServerClient(
    "https://fictional-project.supabase.co",
    "fictional-publishable-key",
    {
      cookies: {
        getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
        setAll: (items) => {
          for (const item of items) cookieJar.set(item.name, item.value);
        },
      },
      global: {
        fetch: async (url, options) => {
          requests.push({ url: String(url), body: JSON.parse(options.body) });
          return new Response("{}", {
            status: 200, headers: { "content-type": "application/json" },
          });
        },
      },
    },
  );
  const result = await client.auth.resetPasswordForEmail("test@dinas.example", {
    redirectTo: `${origin}/auth/callback`,
  });
  assert.equal(result.error, null);
  assert.ok([...cookieJar.keys()].some((name) => name.includes("code-verifier")));
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).pathname, "/auth/v1/recover");
  assert.equal(new URL(requests[0].url).searchParams.get("redirect_to"), `${origin}/auth/callback`);
  assert.equal(requests[0].body.code_challenge_method, "s256");
  assert.ok(requests[0].body.code_challenge.length > 20);
});

test("recovery rate limit allows three requests then resets without retaining raw addresses", () => {
  const { consumeRecoveryAttempt } = load("lib/auth/recovery-rate-limit.ts", { "server-only": {} });
  const key = "fictional-client-recovery-test";
  assert.equal(consumeRecoveryAttempt(key, 100), true);
  assert.equal(consumeRecoveryAttempt(key, 200), true);
  assert.equal(consumeRecoveryAttempt(key, 300), true);
  assert.equal(consumeRecoveryAttempt(key, 400), false);
  assert.equal(consumeRecoveryAttempt(key, 15 * 60 * 1000 + 101), true);
  assert.equal(globalThis.alumniRecoveryAttempts.has(key), false);
});

test("auth flow tokens validate every supported context and reject modification", async () => {
  await withOrigin(origin, async () => {
    for (const context of flowContext.authFlowContexts) {
      const token = flowContext.createAuthFlowToken(context);
      assert.equal(flowContext.readAuthFlowContext(token), context);
      assert.equal(flowContext.readAuthFlowContext(`${token}x`), null);
      const redirect = new URL(
        flowContext.withAuthFlowContext(`${origin}/auth/callback`, context),
      );
      assert.equal(
        flowContext.readAuthFlowContext(
          redirect.searchParams.get("auth_context"),
        ),
        context,
      );
    }
    assert.equal(flowContext.readAuthFlowContext("school_activation"), null);
    assert.equal(flowContext.readAuthFlowContext(null), null);
  });
});

function callbackHarness(options = {}) {
  const config = { error: null, session: {}, userId: "fictional-user", verifiedId: "fictional-user", ...options };
  const calls = [];
  const client = {
    auth: {
      exchangeCodeForSession: async (code) => {
        calls.push(["exchange", code]);
        return { data: { session: config.session, user: { id: config.userId } }, error: config.error };
      },
      verifyOtp: async (input) => {
        calls.push(["verify", input]);
        return { data: { session: config.session, user: { id: config.userId } }, error: config.error };
      },
      getUser: async () => ({ data: { user: { id: config.verifiedId } }, error: null }),
    },
  };
  const mocks = {
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/auth/school-auth-diagnostics": {
      schoolAuthCorrelationId: () => "00000000-0000-4000-8000-000000000099",
      logSchoolAuthFailure: () => {},
    },
    "@/lib/auth/auth-flow-context": flowContext,
    "next/navigation": { redirect: (url) => { throw new Error(`redirect:${url}`); } },
  };
  return {
    callback: load("app/auth/callback/route.ts", mocks),
    confirm: load("app/auth/confirm/route.ts", mocks),
    calls,
  };
}

test("valid PKCE and token-hash callbacks verify the user and ignore arbitrary destinations", async () => {
  await withOrigin(origin, async () => {
    const harness = callbackHarness();
    await assert.rejects(
      harness.callback.GET(new Request(`${origin}/auth/callback?code=fake-test-code&next=https://evil.example`)),
      /^Error: redirect:\/auth\/update-password$/,
    );
    await assert.rejects(
      harness.confirm.GET(new Request(`${origin}/auth/confirm?token_hash=fake-test-hash&type=recovery&next=https://evil.example`)),
      /^Error: redirect:\/auth\/update-password$/,
    );
    await assert.rejects(
      harness.confirm.GET(new Request(`${origin}/auth/confirm?token_hash=fake-invite-hash&type=invite&next=https://evil.example`)),
      /^Error: redirect:\/auth\/update-password$/,
    );
    assert.deepEqual(harness.calls.at(-1), ["verify", {
      token_hash: "fake-invite-hash",
      type: "invite",
    }]);
    assert.equal(harness.calls.length, 3);
  });
});

test("expired, reused, missing, wrong-browser and mismatched-user callbacks reject the link", async () => {
  await withOrigin(origin, async () => {
    for (const options of [
      { error: { code: "otp_expired" } },
      { error: { code: "flow_state_not_found" } },
      { error: { code: "bad_code_verifier" } },
      { session: null },
      { verifiedId: "different-user" },
    ]) {
      const harness = callbackHarness(options);
      await assert.rejects(
        harness.callback.GET(new Request(`${origin}/auth/callback?code=fake-test-code`)),
        /redirect:\/auth\/error\?reason=(invalid_or_expired|session_invalid)#auth-error/,
      );
      await assert.rejects(
        harness.confirm.GET(new Request(`${origin}/auth/confirm?token_hash=fake-test-hash&type=recovery`)),
        /redirect:\/auth\/error\?reason=(invalid_or_expired|session_invalid)#auth-error/,
      );
    }
    const harness = callbackHarness();
    await assert.rejects(harness.callback.GET(new Request(`${origin}/auth/callback`)), /reason=invalid_or_expired#auth-error/);
    await assert.rejects(harness.callback.GET(new Request(`${origin}/auth/callback?code=x&error=access_denied`)), /reason=invalid_or_expired#auth-error/);
    assert.equal(harness.calls.length, 0);
  });
});

test("signed flow context survives failures while tampered and implicit fragments stay neutral", async () => {
  await withOrigin(origin, async () => {
    const schoolActivation = flowContext.createAuthFlowToken("school_activation");
    const schoolRecovery = flowContext.createAuthFlowToken("school_recovery");
    const failed = callbackHarness({ error: { code: "otp_expired" } });
    await assert.rejects(
      failed.confirm.GET(new Request(`${origin}/auth/confirm?auth_context=${schoolActivation}&token_hash=fake&type=invite`)),
      (error) => {
        assert.match(error.message, /reason=invalid_or_expired/);
        assert.match(error.message, /auth_context=/);
        assert.match(error.message, /#auth-error$/);
        assert.doesNotMatch(error.message, /token_hash|fake/);
        return true;
      },
    );

    const implicit = callbackHarness();
    await assert.rejects(
      implicit.confirm.GET(new Request(`${origin}/auth/confirm?auth_context=${schoolActivation}`)),
      /reason=unsupported_redirect.*#auth-error$/,
    );
    assert.equal(implicit.calls.length, 0);

    const recovery = callbackHarness({ error: { code: "flow_state_not_found" } });
    await assert.rejects(
      recovery.callback.GET(new Request(`${origin}/auth/callback?auth_context=${schoolRecovery}&code=fake`)),
      /reason=invalid_or_expired.*auth_context=.*#auth-error$/,
    );

    const tampered = callbackHarness({ error: { code: "otp_expired" } });
    await assert.rejects(
      tampered.confirm.GET(new Request(`${origin}/auth/confirm?auth_context=${schoolActivation}x&token_hash=fake&type=invite`)),
      (error) => {
        assert.match(error.message, /reason=invalid_or_expired#auth-error$/);
        assert.doesNotMatch(error.message, /auth_context/);
        return true;
      },
    );
    assert.equal(tampered.calls.length, 1);

    const tamperedButValidOtp = callbackHarness();
    await assert.rejects(
      tamperedButValidOtp.confirm.GET(new Request(`${origin}/auth/confirm?auth_context=${schoolActivation}x&token_hash=fake&type=invite`)),
      /^Error: redirect:\/auth\/update-password$/,
    );
    assert.equal(tamperedButValidOtp.calls.length, 1);
  });
});
