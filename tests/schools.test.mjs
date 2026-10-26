import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const loadDependency = createRequire(import.meta.url);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));

// Load the actual TypeScript modules with isolated Supabase/Next boundaries.
function load(relativePath, mocks = {}) {
  const filename = path.join(testDirectory, "..", relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) => (name in mocks ? mocks[name] : loadDependency(name)),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

const schema = load("lib/schools/schema.ts");
const valid = { npsn: "00123456", name: "SMK Fiktif", city: "Jakarta" };
const schoolId = "00000000-0000-4000-8000-000000000001";

test("school validation preserves leading zeros and enforces database bounds", () => {
  assert.equal(schema.schoolSchema.parse(valid).npsn, "00123456");
  for (const npsn of [
    "1234567",
    "123456789",
    "1234abcd",
    12345678,
    "１２３４５６７８",
  ]) {
    assert.equal(
      schema.schoolSchema.safeParse({ ...valid, npsn }).success,
      false,
    );
  }
  for (const values of [
    { name: " " },
    { name: "a".repeat(201) },
    { city: " " },
    { city: "a".repeat(101) },
  ]) {
    assert.equal(
      schema.schoolSchema.safeParse({ ...valid, ...values }).success,
      false,
    );
  }
  assert.equal(
    schema.schoolSchema.safeParse({
      ...valid,
      name: "a".repeat(200),
      city: "a".repeat(100),
    }).success,
    true,
  );
});

function harness({
  role = "admin_dinas",
  active = true,
  profileMissing = false,
  claimsError = false,
  profileError = false,
  mutationError = null,
  missingRow = false,
} = {}) {
  const mutations = [];
  const filters = [];
  const revalidated = [];
  const supabase = {
    auth: {
      getClaims: async () => ({
        data: claimsError ? null : { claims: { sub: "verified-user-id" } },
        error: claimsError,
      }),
    },
    from(table) {
      const chain = {
        select() {
          return chain;
        },
        eq(key, value) {
          filters.push([table, key, value]);
          return chain;
        },
        insert(values) {
          mutations.push(["insert", values]);
          return chain;
        },
        update(values) {
          mutations.push(["update", values]);
          return chain;
        },
        async maybeSingle() {
          return table === "profiles"
            ? {
                data: profileMissing ? null : { role, is_active: active },
                error: profileError,
              }
            : {
                data: missingRow ? null : { id: schoolId },
                error: mutationError,
              };
        },
      };
      return chain;
    },
  };
  const access = load("lib/schools/access.ts", {
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => supabase },
  });
  const actions = load("app/dashboard/schools/actions.ts", {
    "@/lib/schools/access": access,
    "@/lib/schools/schema": schema,
    "next/cache": { revalidatePath: (value) => revalidated.push(value) },
  });
  return { ...actions, ...access, mutations, filters, revalidated };
}

test("read access allows active Dinas roles and denies staff/inactive/missing/expired profiles", async () => {
  for (const role of ["admin_dinas", "viewer_dinas"]) {
    const h = harness({ role });
    assert.equal((await h.getSchoolAccess()).allowed, true);
    assert.deepEqual(h.filters[0], ["profiles", "user_id", "verified-user-id"]);
  }
  for (const options of [
    { role: "petugas_sekolah" },
    { role: "unknown" },
    { active: false },
    { profileMissing: true },
    { claimsError: true },
    { profileError: true },
  ]) {
    assert.equal((await harness(options).getSchoolAccess()).allowed, false);
  }
});

test("direct mutation calls cannot bypass server authorization or spoof role", async () => {
  for (const options of [
    { role: "viewer_dinas" },
    { role: "petugas_sekolah" },
    { active: false },
    { profileMissing: true },
    { claimsError: true },
    { profileError: true },
  ]) {
    const h = harness(options);
    assert.equal(
      (await h.saveSchool(null, { ...valid, role: "admin_dinas" })).success,
      false,
    );
    assert.equal((await h.saveSchool(schoolId, valid)).success, false);
    assert.equal(
      (await h.changeSchoolStatus({ id: schoolId, isActive: false })).success,
      false,
    );
    assert.equal(h.mutations.length, 0);
  }
});

test("creation defaults active; editing only writes allowed fields", async () => {
  const h = harness();
  assert.equal(
    (await h.saveSchool(null, { ...valid, is_active: false })).success,
    true,
  );
  assert.deepEqual(h.mutations[0], ["insert", { ...valid, is_active: true }]);
  assert.equal(
    (
      await h.saveSchool(schoolId, {
        ...valid,
        role: "admin_dinas",
        is_active: false,
      })
    ).success,
    true,
  );
  assert.deepEqual(h.mutations[1], ["update", valid]);
  assert.deepEqual(h.revalidated, ["/dashboard/schools", "/dashboard/schools"]);
});

test("invalid payloads are rejected by the server before writes", async () => {
  const h = harness();
  assert.equal(
    (await h.saveSchool(null, { ...valid, npsn: "1" })).success,
    false,
  );
  assert.equal((await h.saveSchool("invalid-id", valid)).success, false);
  assert.equal(
    (await h.changeSchoolStatus({ id: schoolId, isActive: "false" })).success,
    false,
  );
  assert.equal(h.mutations.length, 0);
});

test("duplicate NPSN and lost access do not produce false success", async () => {
  const duplicate = harness({ mutationError: { code: "23505" } });
  const result = await duplicate.saveSchool(null, valid);
  assert.equal(result.success, false);
  assert.match(result.message, /NPSN sudah digunakan/);
  assert.equal(duplicate.revalidated.length, 0);
  assert.equal(
    (await harness({ missingRow: true }).saveSchool(schoolId, valid)).success,
    false,
  );
});

test("activation/deactivation write explicit status and guard against stale confirmation", async () => {
  for (const isActive of [true, false]) {
    const h = harness();
    assert.equal(
      (await h.changeSchoolStatus({ id: schoolId, isActive })).success,
      true,
    );
    assert.deepEqual(h.mutations[0], ["update", { is_active: isActive }]);
    assert.ok(
      h.filters.some(
        ([table, key, value]) =>
          table === "schools" && key === "is_active" && value === !isActive,
      ),
    );
  }
  assert.equal(
    (
      await harness({ missingRow: true }).changeSchoolStatus({
        id: schoolId,
        isActive: false,
      })
    ).success,
    false,
  );
});
