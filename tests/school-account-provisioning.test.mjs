import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const loadDependency = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function load(relativePath, mocks = {}) {
  const source = ts.transpileModule(
    fs.readFileSync(path.join(root, relativePath), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) => (name in mocks ? mocks[name] : loadDependency(name)),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

const userSchema = load("lib/users/schema.ts", {
  "@/lib/auth/roles": load("lib/auth/roles.ts"),
});
const schoolSchema = load("lib/schools/schema.ts");
const adminId = "00000000-0000-4000-8000-000000000001";
const schoolId = "00000000-0000-4000-8000-000000000011";
const authId = "00000000-0000-4000-8000-000000000021";

test("migration preflights duplicates before adding the active-account index", () => {
  const sql = fs.readFileSync(
    path.join(
      root,
      "supabase/migrations/20261026000100_secure_school_account_provisioning.sql",
    ),
    "utf8",
  );
  const preflight = sql.indexOf("DO $preflight$");
  const index = sql.indexOf("CREATE UNIQUE INDEX profiles_one_active_school_staff_idx");
  assert.ok(preflight >= 0 && index > preflight);
  assert.match(sql, /HAVING count\(\*\) > 1/);
  assert.match(sql, /Migration tidak menonaktifkan atau menghapus akun/);
  assert.doesNotMatch(
    sql.slice(preflight, index),
    /\b(?:DELETE|UPDATE)\s+public\.profiles\b/i,
  );
});

test("migration fails closed and does not impersonate the password-changing user", () => {
  const sql = fs.readFileSync(
    path.join(
      root,
      "supabase/migrations/20261026000100_secure_school_account_provisioning.sql",
    ),
    "utf8",
  );
  assert.match(
    sql,
    /app_private\.is_admin\(\) IS DISTINCT FROM TRUE/g,
  );
  assert.match(sql, /auth\.role\(\) IS DISTINCT FROM 'service_role'/g);
  assert.match(
    sql,
    /OLD\.must_change_password IS DISTINCT FROM NEW\.must_change_password[\s\S]*Initial password change flag is server-managed/,
  );
  assert.doesNotMatch(sql, /set_config\('request\.jwt\.claim\.sub'/);
  assert.match(
    sql,
    /public\.provision_school_profile[\s\S]*SECURITY DEFINER/,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION app_private\.provision_school_profile[\s\S]*TO authenticated/,
  );
});

test("legacy password digests remain available after credential issuance is retired", async () => {
  const admin = load("lib/users/admin.ts", { "server-only": {}, "@supabase/supabase-js": { createClient: () => ({}) } });
  assert.equal(admin.generateTemporaryPassword, undefined);
  assert.equal(admin.schoolProvisioningMetadata, undefined);
  const first = await admin.credentialDigest("Fictional-Legacy-Password-1!");
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, await admin.credentialDigest("Fictional-Legacy-Password-2!"));
});

function accountStatusHarness(options = {}) {
  const config = {
    access: { allowed: true, role: "admin_dinas", userId: adminId },
    school: { id: schoolId, is_active: true },
    accounts: [{ user_id: authId, is_active: true }],
    updateError: null,
    ...options,
  };
  const calls = { updates: [], revalidate: [] };
  const supabase = {
    from(table) {
      const filters = new Map();
      let operation = "select";
      let updateValues = null;
      const chain = {
        select() {
          return chain;
        },
        update(values) {
          operation = "update";
          updateValues = values;
          return chain;
        },
        eq(key, value) {
          filters.set(key, value);
          return chain;
        },
        async maybeSingle() {
          if (table === "schools")
            return { data: config.school, error: config.school ? null : {} };
          if (operation === "update") {
            calls.updates.push({ values: updateValues, filters });
            return config.updateError
              ? { data: null, error: config.updateError }
              : { data: { user_id: filters.get("user_id") }, error: null };
          }
          if (filters.get("user_id") === adminId)
            return { data: { user_id: adminId }, error: null };
          return { data: null, error: null };
        },
        then(resolve) {
          resolve({ data: config.accounts, error: null });
        },
      };
      return chain;
    },
  };
  config.access.supabase = supabase;
  const actions = load("app/dashboard/schools/actions.ts", {
    "next/cache": { revalidatePath: (...args) => calls.revalidate.push(args) },
    "@/lib/alumni/access": { getAlumniAccess: async () => config.access },
    "@/lib/schools/access": { getSchoolAccess: async () => ({ allowed: false }) },
    "@/lib/schools/schema": schoolSchema,
    "@/lib/schools/accounts": {},
    "@/lib/users/schema": userSchema,
    "@/lib/users/admin": {},
  });
  return { ...actions, calls };
}

test("school account status changes require confirmation and an unambiguous school relationship", async () => {
  const deactivate = accountStatusHarness();
  const deactivated = await deactivate.changeSchoolAccountStatus({
    school_id: schoolId,
    is_active: false,
    confirmed: true,
  });
  assert.equal(deactivated.success, true);
  assert.deepEqual(deactivate.calls.updates[0].values, { is_active: false });
  assert.equal(deactivate.calls.updates[0].filters.get("user_id"), authId);
  assert.equal(deactivate.calls.updates[0].filters.get("school_id"), schoolId);

  const reactivate = accountStatusHarness({
    accounts: [{ user_id: authId, is_active: false }],
  });
  assert.equal(
    (
      await reactivate.changeSchoolAccountStatus({
        school_id: schoolId,
        is_active: true,
        confirmed: true,
      })
    ).success,
    true,
  );

  for (const harness of [
    accountStatusHarness({
      accounts: [
        { user_id: authId, is_active: false },
        { user_id: adminId, is_active: false },
      ],
    }),
    accountStatusHarness({
      access: { allowed: true, role: "viewer_dinas", userId: adminId },
    }),
  ]) {
    const result = await harness.changeSchoolAccountStatus({
      school_id: schoolId,
      is_active: true,
      confirmed: true,
    });
    assert.equal(result.success, false);
    assert.equal(harness.calls.updates.length, 0);
  }
});

test("school details replace manual provisioning and password reissuance", () => {
  const actions = accountStatusHarness();
  assert.equal(actions.provisionSchoolAccount, undefined);
  assert.equal(actions.reissueSchoolPassword, undefined);
  const dialog = fs.readFileSync(path.join(root, "components/schools/school-account-dialog.tsx"), "utf8");
  assert.match(dialog, /Detail Akun Sekolah/);
  assert.doesNotMatch(dialog, /provisionSchoolAccount|reissueSchoolPassword|temporaryPassword|clipboard|localStorage|sessionStorage/);
});

test("the additive reissue migration keeps private locks and profile flags server-managed", () => {
  const sql = fs.readFileSync(
    path.join(
      root,
      "supabase/migrations/20261027000100_school_password_reissuance.sql",
    ),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE app_private\.school_password_reissues/);
  assert.match(sql, /app_private\.is_admin\(\) IS DISTINCT FROM TRUE/g);
  assert.match(sql, /workflow\.user_id = NEW\.user_id/);
  assert.match(sql, /workflow\.actor_id = auth\.uid\(\)/);
  assert.match(sql, /A password reissue is already in progress/);
  assert.match(sql, /SET must_change_password = true/);
  assert.match(
    sql,
    /REVOKE ALL ON TABLE app_private\.school_password_reissues[\s\S]*authenticated, service_role/,
  );
  assert.doesNotMatch(sql, /temporary_password|password\s+(?:text|varchar)/i);
});

test("native activation retires custom tokens and enforces lifecycle plus password gates", () => {
  const sql = fs.readFileSync(
    path.join(
      root,
      "supabase/migrations/20261028000200_native_school_self_activation.sql",
    ),
    "utf8",
  );
  assert.doesNotMatch(sql, /DROP TRIGGER/);
  assert.match(sql, /DROP FUNCTION public\.school_auth_request/);
  assert.match(sql, /DROP FUNCTION public\.school_auth_complete/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION app_private\.can_read_school/);
  assert.match(sql, /CREATE FUNCTION public\.school_activation_cancel/);
  assert.match(sql, /p_token_ttl_seconds integer DEFAULT 3600/);
  assert.match(sql, /activation_expires_at=now\(\)\+make_interval/);
  assert.match(
    sql,
    /status=CASE WHEN v_new THEN 'UNCLAIMED' ELSE 'PENDING_ACTIVATION' END/,
  );
  assert.match(sql, /status='PENDING_ACTIVATION',user_id=p_user_id/);
  assert.match(sql, /auth\.role\(\) IS DISTINCT FROM 'service_role'/g);
  assert.match(
    sql,
    /public\.school_activation_bind\(uuid,uuid\)[\s\S]*TO service_role/,
  );
  assert.match(sql, /p\.role='petugas_sekolah'/);
  assert.match(sql, /p\.school_id=p_school_id/);
  for (const functionName of [
    "can_read_school",
    "can_write_school",
    "current_school_id",
  ]) {
    const body = sql.match(
      new RegExp(
        `CREATE OR REPLACE FUNCTION app_private\\.${functionName}[\\s\\S]*?\\$\\$;`,
      ),
    )?.[0];
    assert.ok(body, `${functionName} must be defined by the migration`);
    assert.match(body, /p\.must_change_password=false/);
  }
  assert.match(
    sql.match(/CREATE OR REPLACE FUNCTION app_private\.can_read_school[\s\S]*?\$\$;/)?.[0] ?? "",
    /a\.status='ACTIVE'/,
  );
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|UPDATE auth\.users|DELETE FROM auth\.users/i);
  assert.match(sql, /Legacy hashed tokens retained for reconciliation/);
});

test("activation completion requires a password hash change after request binding", () => {
  const sql = fs.readFileSync(
    path.join(
      root,
      "supabase/migrations/20261029000100_harden_school_activation_completion.sql",
    ),
    "utf8",
  );
  assert.match(sql, /ADD COLUMN activation_password_fingerprint text/);
  assert.match(
    sql,
    /pg_catalog\.md5\([\s\S]*encrypted_password[\s\S]*p_request_id::text/,
  );
  assert.match(
    sql,
    /activation_password_fingerprint=v_password_fingerprint/,
  );
  assert.match(
    sql,
    /v_current_password_fingerprint IS NOT DISTINCT FROM v_account\.activation_password_fingerprint/,
  );
  assert.match(sql, /Password update for this activation is required/);
  assert.match(sql, /activation_password_fingerprint=NULL/);
  assert.match(
    sql,
    /complete_school_activation\(uuid,uuid\)[\s\S]*TO service_role/,
  );
  assert.doesNotMatch(
    sql,
    /activation_password_fingerprint\s*=\s*u\.encrypted_password/,
  );
});

function passwordHarness(options = {}) {
  const config = {
    claimsId: authId,
    verifiedUserId: authId,
    profile: { is_active: true, must_change_password: true },
    updateError: null,
    clearData: true,
    clearError: null,
    submittedMatchesTemporary: false,
    signOutError: null,
    ...options,
  };
  const calls = { update: [], clear: [], events: [] };
  let getUserCalls = 0;
  const supabase = {
    auth: {
      async getClaims() {
        calls.events.push("session:claims");
        return {
          data: config.claimsId ? { claims: { sub: config.claimsId } } : null,
          error: config.claimsId ? null : {},
        };
      },
      async updateUser(values) {
        calls.events.push("auth:update-password");
        calls.update.push(values);
        return {
          data: { user: config.updateError ? null : { id: config.claimsId } },
          error: config.updateError,
        };
      },
      async getUser() {
        getUserCalls += 1;
        calls.events.push(`session:get-user:${getUserCalls}`);
        return {
          data: {
            user: {
              id:
                getUserCalls === 1
                  ? config.claimsId
                  : config.verifiedUserId,
              app_metadata: {
                school_provisioning_kind: "school_staff_v1",
                school_temporary_password_digest: "temporary-digest",
              },
            },
          },
          error: null,
        };
      },
      async signOut(options) {
        calls.events.push(`session:sign-out:${options.scope}`);
        return { error: config.signOutError };
      },
    },
    from() {
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        async maybeSingle() {
          return { data: config.profile, error: null };
        },
      };
      return chain;
    },
  };
  const actions = load("app/auth/update-password/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@/lib/auth/password-change": load("lib/auth/password-change.ts"),
    "@/lib/auth/school-activation": { getSchoolActivationContext: async () => config.activation ?? null },
    "@/lib/auth/school-auth-diagnostics": {
      schoolAuthCorrelationId: () => "00000000-0000-4000-8000-000000000099",
      logSchoolAuthFailure: () => {},
    },
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/users/admin": {
      credentialDigest: async () =>
        config.submittedMatchesTemporary
          ? "temporary-digest"
          : "different-digest",
      createAdminClient: () => ({
        auth: {
          admin: {
            updateUserById: async () => ({ error: null }),
          },
        },
        async rpc(name, values) {
          calls.events.push("database:complete-password-change");
          calls.clear.push([name, values]);
          return { data: config.clearData, error: config.clearError };
        },
      }),
    },
  });
  return { ...actions, calls };
}

test("first-login password update is verified before the server clears its gate", async () => {
  const harness = passwordHarness();
  const result = await harness.changePassword({
    password: "Fictional-New-Password-1!",
    confirmation: "Fictional-New-Password-1!",
    user_id: adminId,
  });
  assert.equal(result.success, true);
  assert.equal(harness.calls.update.length, 1);
  assert.deepEqual(harness.calls.clear, [
    ["complete_initial_password_change", { p_user_id: authId }],
  ]);
  assert.ok(
    harness.calls.events.indexOf("auth:update-password") <
      harness.calls.events.indexOf("database:complete-password-change"),
  );
  assert.ok(
    harness.calls.events.indexOf("session:get-user:2") <
      harness.calls.events.indexOf("database:complete-password-change"),
  );
});

test("native activation uses the verified session and trusted request after successful Auth update", async () => {
  const requestId = "00000000-0000-4000-8000-000000000099";
  const harness = passwordHarness({
    profile: null,
    activation: { name: "SMK Fiktif", npsn: "00000011", request_id: requestId },
  });
  const result = await harness.changePassword({
    password: "abcdefgh", confirmation: "abcdefgh", user_id: adminId, request_id: adminId,
  });
  assert.equal(result.redirectTo, "/dashboard");
  assert.deepEqual(harness.calls.clear, [["complete_school_activation", { p_user_id: authId, p_request_id: requestId }]]);
  assert.ok(harness.calls.events.indexOf("auth:update-password") < harness.calls.events.indexOf("database:complete-password-change"));
  for (const options of [{ updateError: { code: "weak_password" } }, { verifiedUserId: adminId }]) {
    const denied = passwordHarness({ ...options, profile: null, activation: { request_id: requestId } });
    assert.equal((await denied.changePassword({ password: "abcdefgh", confirmation: "abcdefgh" })).success, false);
    assert.equal(denied.calls.clear.length, 0);
  }
});

test("native activation can finish after Auth already saved the submitted password", async () => {
  const requestId = "00000000-0000-4000-8000-000000000098";
  const harness = passwordHarness({
    profile: null,
    activation: { name: "SMK Fiktif", npsn: "00000011", request_id: requestId },
    updateError: { code: "same_password" },
  });
  const result = await harness.changePassword({
    password: "abcdefgh", confirmation: "abcdefgh",
  });
  assert.equal(result.success, true);
  assert.equal(result.redirectTo, "/dashboard");
  assert.deepEqual(harness.calls.clear, [["complete_school_activation", {
    p_user_id: authId, p_request_id: requestId,
  }]]);
});

test("password action accepts exactly eight simple characters and rejects seven", async () => {
  const valid = passwordHarness();
  const accepted = await valid.changePassword({
    password: "abcdefgh",
    confirmation: "abcdefgh",
  });
  assert.equal(accepted.success, true);
  assert.deepEqual(valid.calls.update, [{ password: "abcdefgh" }]);

  const short = passwordHarness();
  const rejected = await short.changePassword({
    password: "abcdefg",
    confirmation: "abcdefg",
  });
  assert.equal(rejected.success, false);
  assert.match(rejected.message, /minimal 8 karakter/);
  assert.equal(short.calls.update.length, 0);
  assert.equal(short.calls.clear.length, 0);
});

test("email recovery signs out only after a verified password update and returns to login", async () => {
  const harness = passwordHarness({
    profile: { is_active: true, must_change_password: false },
  });
  const result = await harness.changePassword({
    password: "abcdefgh",
    confirmation: "abcdefgh",
    required: true,
    redirectTo: "https://malicious.example",
  });
  assert.equal(result.success, true);
  assert.equal(result.redirectTo, "/auth/login");
  assert.equal(harness.calls.clear.length, 0);
  assert.ok(
    harness.calls.events.indexOf("session:get-user:2") <
    harness.calls.events.indexOf("session:sign-out:local"),
  );

  const mandatory = passwordHarness();
  const required = await mandatory.changePassword({
    password: "abcdefgh", confirmation: "abcdefgh", required: false,
  });
  assert.equal(required.redirectTo, "/dashboard");
  assert.equal(mandatory.calls.events.includes("session:sign-out:local"), false);
});

test("recovery update and sign-out failures never report a completed recovery", async () => {
  for (const config of [
    { updateError: { code: "weak_password" } },
    { verifiedUserId: adminId },
    { signOutError: { code: "network" } },
  ]) {
    const harness = passwordHarness({
      ...config,
      profile: { is_active: true, must_change_password: false },
    });
    const result = await harness.changePassword({
      password: "abcdefgh", confirmation: "abcdefgh",
    });
    assert.equal(result.success, false);
    assert.equal(result.redirectTo, undefined);
    assert.equal(harness.calls.clear.length, 0);
  }
});

test("a changed verified session cannot clear another user's password gate", async () => {
  const harness = passwordHarness({ verifiedUserId: adminId });
  const result = await harness.changePassword({
    password: "Fictional-New-Password-1!",
    confirmation: "Fictional-New-Password-1!",
  });
  assert.equal(result.success, false);
  assert.equal(harness.calls.update.length, 1);
  assert.equal(harness.calls.clear.length, 0);
});

test("invalid sessions and failed Auth updates cannot clear the password gate", async () => {
  for (const options of [
    { claimsId: null },
    { updateError: { code: "weak_password" } },
  ]) {
    const harness = passwordHarness(options);
    const result = await harness.changePassword({
      password: "Fictional-New-Password-1!",
      confirmation: "Fictional-New-Password-1!",
    });
    assert.equal(result.success, false);
    assert.equal(harness.calls.clear.length, 0);
  }
});

test("first login rejects reusing the temporary password", async () => {
  const harness = passwordHarness({ submittedMatchesTemporary: true });
  const result = await harness.changePassword({
    password: "Temporary-Secret-Only-In-Test-1!",
    confirmation: "Temporary-Secret-Only-In-Test-1!",
  });
  assert.equal(result.success, false);
  assert.match(result.message, /harus berbeda/);
  assert.equal(harness.calls.update.length, 0);
  assert.equal(harness.calls.clear.length, 0);
});

test("failed gate clearing reports a recoverable partial password change", async () => {
  const harness = passwordHarness({ clearData: false });
  const result = await harness.changePassword({
    password: "Fictional-New-Password-1!",
    confirmation: "Fictional-New-Password-1!",
  });
  assert.equal(result.success, false);
  assert.match(result.message, /berhasil diperbarui/);
});

test("direct dashboard authorization redirects password-gated sessions without a loop", async () => {
  const supabase = {
    auth: {
      getClaims: async () => ({
        data: { claims: { sub: authId } },
        error: null,
      }),
    },
    from() {
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        async maybeSingle() {
          return {
            data: {
              full_name: "Petugas Sekolah Fiktif",
              role: "petugas_sekolah",
              school_id: schoolId,
              is_active: true,
              must_change_password: true,
            },
            error: null,
          };
        },
      };
      return chain;
    },
  };
  const alumniAccess = load("lib/alumni/access.ts", {
    "server-only": {},
    react: { cache: (fn) => fn },
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/auth/roles": load("lib/auth/roles.ts"),
    "@/lib/auth/password-change": load("lib/auth/password-change.ts"),
  });
  assert.deepEqual(await alumniAccess.getAlumniAccess(), {
    allowed: false,
    reason: "password_change",
  });

  const authAccess = load("lib/auth/access.ts", {
    "server-only": {},
    "@/lib/alumni/access": alumniAccess,
    "next/navigation": {
      redirect: (destination) => {
        throw new Error(`redirect:${destination}`);
      },
    },
  });
  await assert.rejects(
    authAccess.requireAccess(),
    /redirect:\/auth\/update-password/,
  );
  const updatePage = fs.readFileSync(
    path.join(root, "app/auth/update-password/page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(updatePage, /requireAccess\(/);
});
