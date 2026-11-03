import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const code = ts.transpileModule(
    fs.readFileSync(path.join(process.cwd(), file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => (name in mocks ? mocks[name] : dependency(name)),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}
const schema = load("lib/users/schema.ts", {
  "@/lib/auth/roles": load("lib/auth/roles.ts"),
});
const schoolSchema = load("lib/schools/schema.ts");
const statusReader = load("lib/schools/accounts.ts", {
  "server-only": {},
  "@/lib/auth/school-auth": load("lib/auth/school-auth.ts"),
});
const schoolId = "00000000-0000-4000-8000-000000000011";
const userId = "00000000-0000-4000-8000-000000000021";
const adminId = "00000000-0000-4000-8000-000000000001";
function harness(options = {}) {
  const config = {
    allowed: true,
    role: "admin_dinas",
    stillAdmin: true,
    status: "ACTIVE",
    school: {
      id: schoolId,
      name: "SMK Fiktif",
      npsn: "00000011",
      is_active: true,
    },
    accounts: [
      {
        user_id: userId,
        full_name: "Petugas Fiktif",
        is_active: true,
        must_change_password: false,
      },
    ],
    ...options,
  };
  const calls = { reads: [], rpc: [], users: [], clients: 0, writes: [] };
  const supabase = {
    from(table) {
      const filters = {},
        entry = { table, filters };
      calls.reads.push(entry);
      const chain = {
        select(columns) {
          entry.columns = columns;
          return chain;
        },
        eq(key, value) {
          filters[key] = value;
          return chain;
        },
        async maybeSingle() {
          return {
            data:
              table === "schools"
                ? config.school
                : config.stillAdmin
                  ? { user_id: adminId }
                  : null,
            error: null,
          };
        },
        then(resolve) {
          return Promise.resolve({
            data: config.accounts,
            error: config.profileError ? { message: "private failure" } : null,
          }).then(resolve);
        },
        update(values) {
          calls.writes.push(values);
          return chain;
        },
      };
      return chain;
    },
  };
  const admin = {
    async rpc(name, args) {
      calls.rpc.push([name, args]);
      return {
        data: {
          name: "SMK Fiktif",
          npsn: config.lookupNpsn ?? config.school.npsn,
          status: config.status,
          retry_after: null,
        },
        error: config.rpcError ?? null,
      };
    },
    auth: {
      admin: {
        async getUserById(id) {
          calls.users.push(id);
          return {
            data: {
              user: {
                id: config.returnedUser ?? id,
                email: "petugas@example.test",
                email_confirmed_at: config.unverified ? null : "2026-10-01",
                app_metadata: { private_marker: "do-not-return" },
              },
            },
            error: config.authError ?? null,
          };
        },
      },
    },
  };
  const actions = load("app/dashboard/schools/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/alumni/access": {
      getAlumniAccess: async () => ({
        allowed: config.allowed,
        role: config.role,
        userId: adminId,
        supabase,
      }),
    },
    "@/lib/schools/access": {},
    "@/lib/schools/schema": schoolSchema,
    "@/lib/schools/accounts": statusReader,
    "@/lib/users/schema": schema,
    "@/lib/users/admin": {
      createAdminClient() {
        calls.clients++;
        return admin;
      },
    },
  });
  return { ...actions, calls };
}

for (const status of [
  "UNCLAIMED",
  "PENDING_ACTIVATION",
  "ACTIVE",
  "SUSPENDED",
]) {
  test(`admin details read the authoritative ${status} lifecycle without writes`, async () => {
    const h = harness({
      status,
      ...(status === "UNCLAIMED" || status === "PENDING_ACTIVATION"
        ? { accounts: [] }
        : {}),
    });
    const result = await h.getSchoolAccountDetails(schoolId);
    assert.equal(result.success, true);
    assert.equal(result.details.status, status);
    assert.deepEqual(h.calls.rpc, [
      ["school_auth_lookup", { p_npsn: "00000011" }],
    ]);
    assert.deepEqual(h.calls.writes, []);
    assert.doesNotMatch(
      JSON.stringify(result),
      /private_marker|do-not-return|credentials/,
    );
  });
}
test("registered email is read only for the server-authorized school staff relationship", async () => {
  const h = harness();
  const result = await h.getSchoolAccountDetails(schoolId);
  assert.equal(result.success, true);
  assert.deepEqual(h.calls.users, [userId]);
  assert.equal(result.details.accounts[0].email, "petugas@example.test");
  assert.equal(result.details.accounts[0].emailVerified, true);
  assert.deepEqual(
    h.calls.reads.find((read) => read.columns?.includes("full_name")).filters,
    { school_id: schoolId, role: "petugas_sekolah" },
  );
  const unverified = await harness({
    unverified: true,
  }).getSchoolAccountDetails(schoolId);
  assert.equal(unverified.details.accounts[0].emailVerified, false);
});
test("pending activation without a profile does not enumerate Auth users or invent an email", async () => {
  const h = harness({ status: "PENDING_ACTIVATION", accounts: [] });
  const result = await h.getSchoolAccountDetails(schoolId);
  assert.equal(result.success, true);
  assert.deepEqual(result.details.accounts, []);
  assert.deepEqual(h.calls.users, []);
});
for (const options of [
  { role: "viewer_dinas" },
  { role: "petugas_sekolah" },
  { allowed: false },
  { stillAdmin: false },
  { school: null },
]) {
  test(`school account details reject unauthorized or stale access ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    assert.equal((await h.getSchoolAccountDetails(schoolId)).success, false);
    assert.equal(h.calls.clients, 0);
    assert.deepEqual(h.calls.users, []);
  });
}
test("invalid school identifiers cannot reach any privileged reads", async () => {
  const h = harness();
  for (const id of [null, "bad-id", { schoolId, role: "admin_dinas" }])
    assert.equal((await h.getSchoolAccountDetails(id)).success, false);
  assert.deepEqual(h.calls.reads, []);
  assert.equal(h.calls.clients, 0);
});
for (const options of [
  { status: "UNKNOWN" },
  { lookupNpsn: "99999999" },
  { rpcError: { message: "private failure" } },
  { authError: { message: "private failure" } },
  { returnedUser: adminId },
  { profileError: true },
]) {
  test(`malformed or failed account lookups do not expose misleading details ${JSON.stringify(options)}`, async () => {
    const result = await harness(options).getSchoolAccountDetails(schoolId);
    assert.equal(result.success, false);
    assert.equal("details" in result, false);
    assert.doesNotMatch(result.message, /private failure|petugas@example/);
  });
}
