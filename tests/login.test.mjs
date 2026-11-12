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

const schema = load("lib/auth/login-schema.ts");
const userId = "00000000-0000-4000-8000-000000000001";
const schoolId = "00000000-0000-4000-8000-000000000002";
const otherSchoolId = "00000000-0000-4000-8000-000000000003";
const npsn = "00123456";
const genericError = "Identitas atau kata sandi tidak valid.";

test("login schema preserves NPSN strings and separates school from Dinas identity validation", () => {
  const school = schema.loginSchema.parse({
    mode: "school",
    identity: npsn,
    password: "rahasia-fiktif",
  });
  assert.equal(school.identity, npsn);
  for (const identity of ["1234567", "123456789", "12A45678", ""])
    assert.equal(
      schema.loginSchema.safeParse({
        mode: "school",
        identity,
        password: "rahasia-fiktif",
      }).success,
      false,
    );
  assert.equal(
    schema.loginSchema.safeParse({
      mode: "dinas",
      identity: "admin@dinas.example",
      password: "rahasia-fiktif",
    }).success,
    true,
  );
  assert.equal(
    schema.loginSchema.safeParse({
      mode: "dinas",
      identity: npsn,
      password: "rahasia-fiktif",
    }).success,
    false,
  );
});

function actionHarness(options = {}) {
  const config = {
    allowedByRateLimit: true,
    authError: false,
    claimsUserId: userId,
    profile: {
      role: "petugas_sekolah",
      school_id: schoolId,
      is_active: true,
    },
    school: { id: schoolId, npsn, is_active: true },
    schoolIdentity: {
      email: "petugas@sekolah.example",
      schoolId,
      userId,
    },
    ...options,
  };
  const calls = {
    signIn: [],
    signOut: 0,
    resolve: [],
    cleared: [],
    tables: [],
  };
  const supabase = {
    auth: {
      async signInWithPassword(values) {
        calls.signIn.push(values);
        return { error: config.authError ? { code: "invalid_credentials" } : null };
      },
      async getClaims() {
        return {
          data: config.claimsUserId
            ? { claims: { sub: config.claimsUserId } }
            : null,
          error: config.claimsUserId ? null : { code: "bad_jwt" },
        };
      },
      async signOut() {
        calls.signOut += 1;
        return { error: null };
      },
    },
    from(table) {
      calls.tables.push(table);
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        async maybeSingle() {
          return {
            data: table === "profiles" ? config.profile : config.school,
            error: null,
          };
        },
      };
      return chain;
    },
  };
  const actions = load("app/auth/login/actions.ts", {
    "next/headers": {
      headers: async () => ({
        get: (name) => (name === "x-forwarded-for" ? "203.0.113.10" : null),
      }),
    },
    "@/lib/auth/login-schema": schema,
    "@/lib/auth/password-change": load("lib/auth/password-change.ts"),
    "@/lib/auth/login-rate-limit": {
      consumeLoginAttempt: () => config.allowedByRateLimit,
      clearLoginAttempts: (key) => calls.cleared.push(key),
    },
    "@/lib/auth/school-login": {
      resolveSchoolAuthIdentity: async (value) => {
        calls.resolve.push(value);
        return config.schoolIdentity;
      },
    },
    "@/lib/supabase/server": { createClient: async () => supabase },
  });
  return { ...actions, calls, config };
}

test("school login resolves NPSN server-side and never returns the Auth email", async () => {
  const h = actionHarness();
  const result = await h.loginWithPassword({
    mode: "school",
    identity: npsn,
    password: "rahasia-fiktif",
  });
  assert.deepEqual(result, { success: true, redirectTo: "/dashboard" });
  assert.deepEqual(h.calls.resolve, [npsn]);
  assert.deepEqual(h.calls.signIn, [
    { email: "petugas@sekolah.example", password: "rahasia-fiktif" },
  ]);
  assert.equal(JSON.stringify(result).includes("petugas@sekolah.example"), false);
  assert.equal(h.calls.signOut, 0);
  assert.deepEqual(h.calls.cleared, ["203.0.113.10"]);
});

test("Dinas login preserves email authentication and allows only active Dinas roles", async () => {
  for (const role of ["admin_dinas", "viewer_dinas"]) {
    const h = actionHarness({
      profile: { role, school_id: null, is_active: true },
    });
    const result = await h.loginWithPassword({
      mode: "dinas",
      identity: "admin@dinas.example",
      password: "rahasia-fiktif",
    });
    assert.deepEqual(result, { success: true, redirectTo: "/dashboard" });
    assert.deepEqual(h.calls.resolve, []);
    assert.equal(h.calls.signIn[0].email, "admin@dinas.example");
    assert.equal(h.calls.signOut, 0);
  }
});

test("school login routes temporary credentials to mandatory password change", async () => {
  const h = actionHarness({
    profile: {
      role: "petugas_sekolah",
      school_id: schoolId,
      is_active: true,
      must_change_password: true,
    },
  });
  const result = await h.loginWithPassword({
    mode: "school",
    identity: npsn,
    password: "rahasia-fiktif",
  });
  assert.deepEqual(result, {
    success: true,
    redirectTo: "/auth/update-password",
  });
  assert.deepEqual(h.calls.tables, ["profiles"]);
});

test("role, profile and school mismatches remove the newly created session", async () => {
  const cases = [
    {
      input: { mode: "dinas", identity: "staff@example.com" },
      options: {
        profile: {
          role: "petugas_sekolah",
          school_id: schoolId,
          is_active: true,
        },
      },
    },
    {
      input: { mode: "school", identity: npsn },
      options: {
        profile: { role: "admin_dinas", school_id: null, is_active: true },
      },
    },
    {
      input: { mode: "school", identity: npsn },
      options: {
        profile: {
          role: "petugas_sekolah",
          school_id: schoolId,
          is_active: false,
        },
      },
    },
    {
      input: { mode: "school", identity: npsn },
      options: {
        profile: {
          role: "petugas_sekolah",
          school_id: otherSchoolId,
          is_active: true,
        },
      },
    },
    {
      input: { mode: "school", identity: npsn },
      options: { school: { id: schoolId, npsn, is_active: false } },
    },
    {
      input: { mode: "school", identity: npsn },
      options: { school: { id: schoolId, npsn: "00999999", is_active: true } },
    },
  ];
  for (const current of cases) {
    const h = actionHarness(current.options);
    const result = await h.loginWithPassword({
      ...current.input,
      password: "rahasia-fiktif",
    });
    assert.deepEqual(result, { success: false, message: genericError });
    assert.equal(h.calls.signOut, 1);
  }
});

test("invalid input, missing mappings, bad passwords and rate limits fail generically", async () => {
  for (const options of [
    { schoolIdentity: null },
    { authError: true },
    { allowedByRateLimit: false },
  ]) {
    const h = actionHarness(options);
    const result = await h.loginWithPassword({
      mode: "school",
      identity: npsn,
      password: "rahasia-fiktif",
    });
    assert.deepEqual(result, { success: false, message: genericError });
  }
  const invalid = actionHarness();
  assert.deepEqual(
    await invalid.loginWithPassword({
      mode: "school",
      identity: "123",
      password: "rahasia-fiktif",
    }),
    { success: false, message: genericError },
  );
  assert.equal(invalid.calls.resolve.length, 0);
  assert.equal(invalid.calls.signIn.length, 0);
});

test("school lookup requires one active staff profile and a usable Auth email", async () => {
  async function resolveWith(profiles, account = {}) {
    const filters = [];
    const admin = {
      rpc: async () => ({ data: { status: account.status ?? "ACTIVE" }, error: null }),
      from(table) {
        const chain = {
          select() {
            return chain;
          },
          eq(key, value) {
            filters.push([table, key, value]);
            return chain;
          },
          maybeSingle: async () => ({
            data: account.school === null ? null : { id: schoolId },
            error: account.schoolError ?? null,
          }),
          limit: async () => ({ data: profiles, error: null }),
        };
        return chain;
      },
      auth: {
        admin: {
          getUserById: async () => ({
            data: { user: { email: account.email } },
            error: account.error ?? null,
          }),
        },
      },
    };
    const schoolLogin = load("lib/auth/school-login.ts", {
      "server-only": {},
      "@/lib/users/admin": { createAdminClient: () => admin },
    });
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousSecret = process.env.SUPABASE_SECRET_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.example";
    process.env.SUPABASE_SECRET_KEY = "server-test-secret";
    try {
      return {
        result: await schoolLogin.resolveSchoolAuthIdentity(npsn),
        filters,
      };
    } finally {
      if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
      if (previousSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
      else process.env.SUPABASE_SECRET_KEY = previousSecret;
    }
  }

  const valid = await resolveWith([{ user_id: userId }], {
    email: "petugas@sekolah.example",
  });
  assert.deepEqual(valid.result, {
    email: "petugas@sekolah.example",
    schoolId,
    userId,
  });
  assert.ok(valid.filters.some((entry) => entry.join(":") === "schools:npsn:00123456"));
  assert.ok(valid.filters.some((entry) => entry.join(":") === "schools:is_active:true"));
  assert.ok(valid.filters.some((entry) => entry.join(":") === "profiles:role:petugas_sekolah"));
  assert.equal((await resolveWith([])).result, null);
  assert.equal(
    (await resolveWith([{ user_id: userId }, { user_id: schoolId }])).result,
    null,
  );
  assert.equal((await resolveWith([{ user_id: userId }])).result, null);
  assert.equal(
    (await resolveWith([{ user_id: userId }], { email: "test@example.test", school: null })).result,
    null,
  );
  assert.equal(
    (await resolveWith([{ user_id: userId }], { email: "test@example.test", schoolError: { code: "unexpected" } })).result,
    null,
  );
  for (const status of ["UNCLAIMED", "PENDING_ACTIVATION", "SUSPENDED"])
    assert.equal((await resolveWith([{ user_id: userId }], { email: "test@example.test", status })).result, null);
});

test("login limiter bounds repeated attempts and resets explicitly", () => {
  const limiter = load("lib/auth/login-rate-limit.ts", { "server-only": {} });
  const key = `test-${Date.now()}`;
  for (let attempt = 0; attempt < 10; attempt++)
    assert.equal(limiter.consumeLoginAttempt(key, 1_000), true);
  assert.equal(limiter.consumeLoginAttempt(key, 1_000), false);
  limiter.clearLoginAttempts(key);
  assert.equal(limiter.consumeLoginAttempt(key, 1_000), true);
});

test("login UI defaults to School mode and keeps both modes accessible", () => {
  const source = fs.readFileSync(
    path.join(root, "components/login-form.tsx"),
    "utf8",
  );
  assert.match(source, /initialMode = "school"/);
  assert.match(source, /useState<LoginMode>\(initialMode\)/);
  assert.match(source, /role="radiogroup"/);
  assert.match(source, /aria-checked=\{mode === item\}/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /<SchoolLoginForm/);
  assert.match(source, /href="\/auth\/forgot-password"/);
  assert.match(source, /aria-invalid=\{Boolean\(error\)\}/);
  assert.doesNotMatch(source, /saria-invalid/);
  assert.match(source, /loginWithPassword\(parsed\.data\)/);
  assert.doesNotMatch(source, /createClient/);
  assert.doesNotMatch(source, /signInWithPassword/);
});

test("school login keeps the resolved identity visible across activation and login states", () => {
  const source = fs.readFileSync(
    path.join(root, "components/school-login-form.tsx"),
    "utf8",
  );
  assert.match(source, /id="school-npsn"/);
  assert.match(source, /id="school-password"/);
  assert.match(source, /passwordInput\.current\?\.focus\(\)/);
  assert.match(source, /emailInput\.current\?\.focus\(\)/);
  assert.match(source, /if \(!school \|\| pending\) return/);
  assert.match(source, /loginWithPassword\(parsed\.data\)/);
  assert.match(source, /\{school.name\}/);
  assert.match(source, /\{school.npsn\}/);
  assert.match(source, /import \{ ArrowLeft \} from "lucide-react"/);
  assert.match(source, /variant="ghost"/);
  assert.match(source, /onClick=\{changeNpsn\}/);
  assert.match(source, />\s*<ArrowLeft aria-hidden="true" \/>\s*Kembali\s*<\/Button>/);
  assert.match(source, /requestSchoolActivation/);
  assert.match(source, /requestSchoolRecovery/);
});
