import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dependency = createRequire(import.meta.url);
function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const loaded = { exports: {} };
    cache.set(file, loaded.exports);
    const output = ts.transpileModule(
      fs.readFileSync(path.join(root, file), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      },
    ).outputText;
    new Function("require", "module", "exports", output)(
      (name) => {
        if (name in mocks) return mocks[name];
        if (name === "server-only") return {};
        if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
        if (name.startsWith("."))
          return load(path.join(path.dirname(file), name) + ".ts");
        return dependency(name);
      },
      loaded,
      loaded.exports,
    );
    return loaded.exports;
  }
  return load;
}
const load = loader();
const model = load("lib/monitoring/model.ts");
const userSchema = load("lib/users/schema.ts");
const uid = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const schoolId = "00000000-0000-4000-8000-000000000003";
const input = {
  full_name: "Petugas Fiktif",
  role: "petugas_sekolah",
  school_id: schoolId,
  is_active: true,
};
const row = {
  id: uid,
  school_id: schoolId,
  full_name: "Alumni Fiktif",
  graduation_year: 2020,
  major: "Teknik",
  schools: { name: "SMK Fiktif" },
  placements: [
    {
      id: otherId,
      status: "aktif_bekerja",
      destination_country: "Jepang",
      work_sector: "Teknologi",
      company_name: "Perusahaan Fiktif",
      planned_departure: null,
      actual_departure: null,
      employment_start: null,
      contract_end_date: null,
      is_current: true,
    },
  ],
};

test("monitoring accepts one current placement and rejects historical/double-current input", () => {
  assert.equal(model.monitoringRowSchema.safeParse(row).success, true);
  assert.equal(
    model.monitoringRowSchema.safeParse({
      ...row,
      placements: [{ ...row.placements[0], is_current: false }],
    }).success,
    false,
  );
  assert.equal(
    model.monitoringRowSchema.safeParse({
      ...row,
      placements: [...row.placements, ...row.placements],
    }).success,
    false,
  );
  assert.equal(
    model.monitoringRowSchema.safeParse({ ...row, placements: [] }).success,
    true,
  );
});

test("summaries count alumni once, retain terminal current placements and handle zero records", () => {
  const rows = [
    row,
    { ...row, id: otherId, placements: [] },
    {
      ...row,
      id: schoolId,
      placements: [{ ...row.placements[0], status: "selesai_kontrak" }],
    },
  ];
  assert.deepEqual(model.summarize(rows), {
    total: 3,
    unplaced: 1,
    statuses: {
      persiapan_berangkat: 0,
      aktif_bekerja: 1,
      selesai_kontrak: 1,
      batal_berangkat: 0,
    },
  });
  assert.equal(model.summarize([]).total, 0);
  assert.equal(
    model
      .distribution(rows, "country")
      .reduce((sum, group) => sum + group.count, 0),
    3,
  );
  assert.equal(
    model.distribution([{ ...row, school_id: uid }, row], "school").length,
    2,
  );
});

test("every report dimension filters the same data used in exports", () => {
  const filters = {
    q: "fiktif",
    school: schoolId,
    year: "2020",
    country: "Jepang",
    status: "aktif_bekerja",
    sector: "Teknologi",
    sort: "name",
  };
  assert.equal(model.filterRows([row], filters).length, 1);
  for (const key of ["q", "school", "year", "country", "status", "sector"])
    assert.equal(
      model.filterRows([row], { ...filters, [key]: "not-matching" }).length,
      0,
    );
  assert.equal(
    model.filterRows(
      [{ ...row, placements: [] }],
      model.parseFilters({ status: "unplaced" }),
    ).length,
    1,
  );
  const sorted = model.filterRows(
    [row, { ...row, id: otherId, graduation_year: 2024 }],
    model.parseFilters({ sort: "year_desc" }),
  );
  assert.equal(sorted[0].graduation_year, 2024);
  const legacy = {
    ...row,
    placements: [{ ...row.placements[0], destination_country: "jApAn" }],
  };
  assert.equal(
    model.filterRows([legacy], model.parseFilters({ country: "Jepang" }))
      .length,
    1,
  );
  assert.equal(model.reportValues(legacy)[4], "Jepang");
  assert.deepEqual(
    model.distribution([row, legacy], "country"),
    [{ id: "Jepang", name: "Jepang", count: 2 }],
  );
});

test("CSV quotes commas/newlines/quotes, emits UTF-8 BOM and neutralizes formula prefixes", () => {
  for (const value of [
    "=1+1",
    "+cmd",
    "-10",
    "@SUM(A1)",
    "  =SUM(A1)",
    "\t=cmd",
    "\r=cmd",
    "\n=cmd",
    "\uFEFF=1",
  ])
    assert.ok(model.csvCell(value).startsWith("\"'"));
  assert.equal(model.csvCell('Nama, "Fiktif"\nDua'), '"Nama, ""Fiktif""\nDua"');
  const csv = model.exportCsv([row]);
  assert.ok(csv.startsWith('\uFEFF"Nama alumni"'));
  assert.ok(csv.endsWith("\r\n"));
  assert.equal(model.exportCsv([]).split("\r\n").length, 2);
});

test("reader traverses server row limits and rejects truncation/errors instead of wrong totals", async () => {
  const { readAllRows } = load("lib/data/read-all.ts");
  const data = Array.from({ length: 1250 }, (_, id) => ({ id }));
  const calls = [];
  const result = await readAllRows(async (start) => {
    calls.push(start);
    return {
      data: data.slice(start, start + 200),
      count: data.length,
      error: null,
    };
  });
  assert.equal(result.length, 1250);
  assert.deepEqual(calls, [0, 200, 400, 600, 800, 1000, 1200]);
  await assert.rejects(
    readAllRows(async () => ({ data: [], count: 5, error: null })),
    /Incomplete/,
  );
  await assert.rejects(
    readAllRows(async () => ({ data: [], count: 50001, error: null })),
    /too large/,
  );
  await assert.rejects(
    readAllRows(async () => ({ data: [], count: null, error: true })),
    /unavailable/,
  );
});

test("WIB date filters use inclusive local start and exclusive next-day end", () => {
  const { auditFilterSchema, wibBoundary } = load("lib/audit/filters.ts");
  assert.equal(wibBoundary("2026-10-23"), "2026-10-22T17:00:00.000Z");
  assert.equal(wibBoundary("2026-10-23", true), "2026-10-23T17:00:00.000Z");
  const empty = { action: "", actor: "", entity: "", id: "", from: "", to: "" };
  assert.equal(auditFilterSchema.safeParse(empty).success, true);
  for (const values of [
    { id: "invalid" },
    { action: "DROP" },
    { from: "2026-02-30" },
    { from: "2026-10-24", to: "2026-10-23" },
  ])
    assert.equal(
      auditFilterSchema.safeParse({ ...empty, ...values }).success,
      false,
    );
});

test("user input permits only supported roles and matching school assignments", () => {
  assert.equal(userSchema.profileInputSchema.safeParse(input).success, true);
  for (const values of [
    { role: "owner" },
    { school_id: "" },
    { full_name: " " },
    { full_name: "x".repeat(151) },
    { role: "admin_dinas" },
  ])
    assert.equal(
      userSchema.profileInputSchema.safeParse({ ...input, ...values }).success,
      false,
    );
  assert.equal(
    userSchema.profileInputSchema.safeParse({
      ...input,
      role: "viewer_dinas",
      school_id: "",
    }).success,
    true,
  );
});

function userHarness(options = {}) {
  const config = { role: "admin_dinas", allowed: true, ...options };
  const writes = [];
  const privileged = [];
  const invalidated = [];
  let accessChecks = 0;
  const supabase = {
    from(table) {
      const query = { table, values: null };
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        update(values) {
          query.values = values;
          writes.push({ table, type: "update", values });
          return chain;
        },
        insert(values) {
          writes.push({ table, type: "insert", values });
          if (config.profileWriteThrows) throw Error("private database detail");
          return Promise.resolve({ error: config.profileWriteError ?? null });
        },
        async maybeSingle() {
          return {
            data:
              table === "schools"
                ? config.schoolInactive
                  ? null
                  : { id: schoolId }
                : config.profileExists || query.values
                  ? { user_id: otherId }
                  : null,
            error: config.profileReadError ?? null,
          };
        },
      };
      return chain;
    },
  };
  const admin = {
    auth: {
      admin: {
        async inviteUserByEmail(email, options) {
          privileged.push({ email, options });
          return {
            data: { user: { id: otherId } },
            error: config.inviteError ?? null,
          };
        },
      },
    },
  };
  const actions = loader({
    "@/lib/alumni/access": {
      getAlumniAccess: async () => ({
        ...config,
        allowed:
          config.allowed && !(config.revokeBeforeInvite && ++accessChecks > 1),
        userId: uid,
        supabase,
      }),
    },
    "@/lib/users/admin": {
      createAdminClient: () => {
        privileged.push("createClient");
        if (config.noSecret) throw Error("secret unavailable");
        return admin;
      },
      invitationRedirect: () => {
        if (config.noRedirect) throw Error("redirect unavailable");
        return "https://prototype.example/auth/confirm";
      },
      administrationMessage: load("lib/users/admin.ts").administrationMessage,
      listAuthUsers: async () =>
        config.existing ? [{ id: otherId, email: "fiktif@example.test" }] : [],
    },
    "next/cache": { revalidatePath: (...args) => invalidated.push(args) },
  })("app/dashboard/users/actions.ts");
  return { ...actions, config, writes, privileged, invalidated };
}
const invitation = {
  email: "fiktif@example.test",
  profile: input,
  recover: false,
};

test("non-admin and inactive sessions cannot reach privileged APIs or profile writes", async () => {
  for (const options of [
    { role: "viewer_dinas" },
    { role: "petugas_sekolah" },
    { allowed: false },
  ]) {
    const h = userHarness(options);
    assert.equal(
      (await h.inviteUser({ ...invitation, role: "admin_dinas" })).success,
      false,
    );
    assert.equal((await h.saveUserProfile(otherId, input)).success, false);
    assert.deepEqual(h.privileged, []);
    assert.deepEqual(h.writes, []);
  }
});

test("profile edits reject own demotion/deactivation and inactive schools", async () => {
  for (const value of [
    { ...input, role: "viewer_dinas", school_id: "" },
    { ...input, role: "admin_dinas", school_id: "", is_active: false },
  ]) {
    const h = userHarness();
    assert.equal((await h.saveUserProfile(uid, value)).success, false);
    assert.equal(h.writes.length, 0);
  }
  const inactive = userHarness({ schoolInactive: true });
  assert.equal((await inactive.inviteUser(invitation)).success, false);
  assert.equal((await inactive.saveUserProfile(otherId, input)).success, false);
  assert.equal(inactive.privileged.length, 0);
});

test("profile mutation strips unknown fields and never uses service privileges", async () => {
  const h = userHarness();
  assert.equal(
    (
      await h.saveUserProfile(otherId, {
        ...input,
        user_id: uid,
        secret: "not-real",
      })
    ).success,
    true,
  );
  assert.deepEqual(h.writes, [
    { table: "profiles", type: "update", values: input },
  ]);
  assert.equal(h.privileged.length, 0);
});

test("invitation uses verified server flow and profile INSERT without passwords", async () => {
  const h = userHarness();
  assert.equal((await h.inviteUser(invitation)).success, true);
  assert.deepEqual(h.privileged[1], {
    email: invitation.email,
    options: { redirectTo: "https://prototype.example/auth/confirm" },
  });
  assert.deepEqual(h.writes, [
    {
      table: "profiles",
      type: "insert",
      values: { user_id: otherId, ...input },
    },
  ]);
});

test("duplicate accounts never overwrite profiles; orphan recovery requires explicit choice", async () => {
  const existing = userHarness({ existing: true, profileExists: true });
  assert.equal(
    (await existing.inviteUser({ ...invitation, recover: true })).success,
    false,
  );
  assert.equal(existing.writes.length, 0);
  const orphan = userHarness({ existing: true });
  assert.equal((await orphan.inviteUser(invitation)).success, false);
  assert.equal(
    (await orphan.inviteUser({ ...invitation, recover: true })).success,
    true,
  );
  assert.equal(
    orphan.privileged.filter((call) => typeof call === "object").length,
    0,
  );
  assert.equal(orphan.writes.length, 1);
});

test("partial invitation failures remain recoverable and do not leak raw infrastructure errors", async () => {
  const h = userHarness({
    profileWriteError: { message: "secret database detail" },
  });
  const result = await h.inviteUser(invitation);
  assert.equal(result.success, false);
  assert.match(result.message, /pemulihan/);
  assert.doesNotMatch(result.message, /secret/);
  h.config.existing = true;
  h.config.profileWriteError = null;
  assert.equal(
    (await h.inviteUser({ ...invitation, recover: true })).success,
    true,
  );
  for (const options of [{ noSecret: true }, { inviteError: true }]) {
    const blocked = userHarness(options);
    assert.equal((await blocked.inviteUser(invitation)).success, false);
    assert.equal(blocked.writes.length, 0);
  }
});

test("missing redirect fails before privileged calls but orphan recovery needs no email configuration", async () => {
  const missing = userHarness({ noRedirect: true });
  assert.equal((await missing.inviteUser(invitation)).success, false);
  assert.deepEqual(missing.privileged, []);
  const recovery = userHarness({ noRedirect: true, existing: true });
  const result = await recovery.inviteUser({ ...invitation, recover: true });
  assert.equal(result.success, true);
  assert.match(result.message, /Tidak ada undangan/);
  assert.equal(
    recovery.privileged.filter((value) => typeof value === "object").length,
    0,
  );
});

test("revoked administrators cannot send invitations after directory lookup", async () => {
  const h = userHarness({ revokeBeforeInvite: true });
  assert.equal((await h.inviteUser(invitation)).success, false);
  assert.deepEqual(h.privileged, ["createClient"]);
  assert.deepEqual(h.writes, []);
});

test("thrown profile writes preserve recovery diagnostics and invalidate stale user directory", async () => {
  const h = userHarness({ profileWriteThrows: true });
  const result = await h.inviteUser(invitation);
  assert.equal(result.success, false);
  assert.match(result.message, /pemulihan/);
  assert.doesNotMatch(result.message, /private/);
  assert.deepEqual(h.invalidated, [["/dashboard/users"]]);
});

test("mail delivery errors show safe diagnostics and never write a profile", async () => {
  for (const [code, message] of [
    ["over_email_send_rate_limit", /Batas/],
    ["email_address_not_authorized", /SMTP/],
    ["user_already_exists", /pemulihan/],
  ]) {
    const h = userHarness({
      inviteError: { code, message: "private service detail" },
    });
    const result = await h.inviteUser(invitation);
    assert.equal(result.success, false);
    assert.match(result.message, message);
    assert.doesNotMatch(result.message, /private service/);
    assert.deepEqual(h.writes, []);
    assert.deepEqual(h.invalidated, [["/dashboard/users"]]);
  }
});

test("user page denies unauthorized roles before reading the Auth directory", async () => {
  for (const access of [
    { allowed: false, reason: "session" },
    { allowed: false, reason: "denied" },
    { allowed: true, role: "viewer_dinas" },
    { allowed: true, role: "petugas_sekolah" },
  ]) {
    let privileged = 0;
    const page = loader({
      "@/lib/alumni/access": { getAlumniAccess: async () => access },
      "next/navigation": {
        redirect: (path) => {
          throw Error(`redirect:${path}`);
        },
      },
      "@/lib/users/admin": {
        createAdminClient: () => {
          privileged++;
        },
      },
      "@/components/users/user-dialog": { UserDialog: () => null },
      "@/components/data/filters": { Filters: () => null },
      "@/components/data/pagination": { Pagination: () => null },
    })("app/dashboard/users/page.tsx");
    await assert.rejects(
      page.default({ searchParams: Promise.resolve({}) }),
      /redirect:\/auth\//,
    );
    assert.equal(privileged, 0);
  }
});

test("export endpoint denies staff and missing/inactive profiles before loading records", async () => {
  for (const access of [
    { allowed: false, reason: "session" },
    { allowed: false, reason: "denied" },
    { allowed: true, role: "petugas_sekolah" },
  ]) {
    let reads = 0;
    const route = loader({
      "@/lib/alumni/access": { getAlumniAccess: async () => access },
      "@/lib/monitoring/data": {
        loadMonitoring: async () => {
          reads++;
          return [row];
        },
      },
    })("app/dashboard/reports/export/route.ts");
    const result = await route.GET(
      new Request("https://prototype.example/dashboard/reports/export"),
    );
    assert.equal(result.status, access.reason === "session" ? 401 : 403);
    assert.equal(reads, 0);
  }
});

test("Dinas export filters authorized results and disables caching", async () => {
  for (const role of ["admin_dinas", "viewer_dinas"]) {
    const route = loader({
      "@/lib/alumni/access": {
        getAlumniAccess: async () => ({ allowed: true, role }),
      },
      "@/lib/monitoring/data": { loadMonitoring: async () => [row] },
    })("app/dashboard/reports/export/route.ts");
    const result = await route.GET(
      new Request(
        "https://prototype.example/dashboard/reports/export?country=Jepang",
      ),
    );
    assert.equal(result.status, 200);
    assert.match(result.headers.get("cache-control"), /no-store/);
    assert.match(await result.text(), /Alumni Fiktif/);
    const empty = await route.GET(
      new Request(
        "https://prototype.example/dashboard/reports/export?country=not-matching",
      ),
    );
    assert.doesNotMatch(await empty.text(), /Alumni Fiktif/);
  }
});

test("email confirmation ignores external destinations and invalid OTP types", async () => {
  let calls = 0;
  const route = loader({
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: {
          verifyOtp: async () => {
            calls++;
            return { error: null };
          },
        },
      }),
    },
    "next/navigation": {
      redirect: (path) => {
        throw Error(`redirect:${path}`);
      },
    },
  })("app/auth/confirm/route.ts");
  await assert.rejects(
    route.GET(
      new Request(
        "https://prototype.example/auth/confirm?token_hash=fake&type=invite&next=https://evil.example",
      ),
    ),
    /^Error: redirect:\/auth\/update-password$/,
  );
  await assert.rejects(
    route.GET(
      new Request(
        "https://prototype.example/auth/confirm?token_hash=fake&type=email&next=//evil.example",
      ),
    ),
    /^Error: redirect:\/dashboard$/,
  );
  await assert.rejects(
    route.GET(
      new Request(
        "https://prototype.example/auth/confirm?token_hash=fake&type=unknown",
      ),
    ),
    /redirect:\/auth\/error/,
  );
  assert.equal(calls, 2);
});
