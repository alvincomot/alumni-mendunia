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
  const source = ts.transpileModule(
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
  const mod = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) => (name in mocks ? mocks[name] : dependency(name)),
    mod,
    mod.exports,
  );
  return mod.exports;
}
const countryData = load("lib/countries.ts");
const schema = load("lib/alumni/schema.ts", {
  "@/lib/countries": countryData,
});
const status = load("lib/alumni/status.ts", { "./schema": schema });
const roles = load("lib/auth/roles.ts");
const historyModule = load("lib/alumni/history.ts", {
  "server-only": {},
  "./status": status,
});
const placementId = "00000000-0000-4000-8000-000000000001";
const alumniId = "00000000-0000-4000-8000-000000000002";
const schoolId = "00000000-0000-4000-8000-000000000003";
const previousId = "00000000-0000-4000-8000-000000000004";
const entryId = "00000000-0000-4000-8000-000000000005";
const valid = {
  placement_id: placementId,
  expected_status: "persiapan_berangkat",
  new_status: "aktif_bekerja",
  note: "",
  actual_departure: "",
  contract_end_date: "",
};
const entry = {
  id: entryId,
  placement_id: placementId,
  old_status: null,
  new_status: "persiapan_berangkat",
  changed_by_name: "Petugas Fiktif",
  note: null,
  changed_at: "2020-01-01T00:00:00+00:00",
};

function harness(options = {}) {
  const config = {
    role: "petugas_sekolah",
    active: true,
    schoolActive: true,
    ownerSchool: schoolId,
    current: true,
    status: "persiapan_berangkat",
    actual: null,
    start: null,
    ...options,
  };
  const calls = [],
    rpcs = [],
    invalidated = [];
  const row = () => ({
    id: placementId,
    alumni_id: alumniId,
    status: config.status,
    is_current: config.current,
    actual_departure: config.actual,
    employment_start: config.start,
    planned_departure: null,
    contract_end_date: null,
    destination_country: "Jepang",
    company_name: "Perusahaan Fiktif",
    work_sector: "Teknologi",
    created_at: "2020-01-01T00:00:00Z",
  });
  const supabase = {
    auth: {
      getClaims: async () => ({
        data: config.noSession ? null : { claims: { sub: "verified-user" } },
        error: null,
      }),
    },
    from(table) {
      const filters = [];
      calls.push({ table, filters });
      const query = {
        select() {
          return query;
        },
        eq(k, v) {
          filters.push([k, v]);
          return query;
        },
        order() {
          return query;
        },
        in() {
          return query;
        },
        range() {
          return query;
        },
        async maybeSingle() {
          if (table === "profiles")
            return {
              data: config.noProfile
                ? null
                : {
                    role: config.role,
                    is_active: config.active,
                    school_id: schoolId,
                  },
              error: config.profileError || null,
            };
          if (table === "schools")
            return {
              data: { is_active: config.schoolActive, name: "SMK Fiktif" },
              error: null,
            };
          if (table === "placements")
            return {
              data: config.missingPlacement ? null : row(),
              error: config.placementError || null,
            };
          const excluded = filters.some(
            ([key, value]) =>
              key === "school_id" && value !== config.ownerSchool,
          );
          return {
            data: excluded
              ? null
              : {
                  id: alumniId,
                  school_id: config.ownerSchool,
                  full_name: "Alumni Fiktif",
                  graduation_year: 2020,
                  major: "Teknologi",
                },
            error: null,
          };
        },
        then(resolve, reject) {
          const data =
            table === "placements"
              ? config.withHistory
                ? [
                    row(),
                    {
                      ...row(),
                      id: previousId,
                      is_current: false,
                      status: "selesai_kontrak",
                    },
                  ]
                : [row()]
              : [];
          return Promise.resolve({
            data,
            error: null,
            count: data.length,
          }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) {
      rpcs.push({ name, args });
      if (name === "get_status_history")
        return {
          data: [{ ...entry, placement_id: args.p_placement_id }],
          error: null,
        };
      if (config.rpcThrows) throw new Error("secret infrastructure details");
      if (config.rpcError) return { data: null, error: config.rpcError };
      if (args.p_expected_status !== config.status)
        return {
          data: null,
          error: {
            code: "P0001",
            message: "Status berubah, muat ulang data terlebih dahulu",
          },
        };
      config.status = args.p_new_status;
      return { data: null, error: null };
    },
  };
  const access = load("lib/alumni/access.ts", {
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/auth/roles": roles,
  });
  const actions = load("app/dashboard/alumni/status-actions.ts", {
    "@/lib/alumni/access": access,
    "@/lib/alumni/status": status,
    "next/cache": { revalidatePath: (value) => invalidated.push(value) },
  });
  function detail() {
    return load("app/dashboard/alumni/[id]/page.tsx", {
      "@/lib/alumni/access": access,
      "@/lib/alumni/schema": schema,
      "@/lib/countries": countryData,
      "@/lib/alumni/history": historyModule,
      "next/navigation": {
        notFound() {
          throw new Error("notFound");
        },
        redirect() {
          throw new Error("redirect");
        },
      },
      "next/link": { default: "a" },
      "@/components/ui/button": { Button: "button" },
      "@/components/alumni/page-frame": {
        AlumniPageFrame: "main",
        AlumniAccessDenied: "denied",
        PlacementBadge: "badge",
      },
      "@/components/alumni/alumni-form": { AlumniForm: "identity-form" },
      "@/components/alumni/placement-form": { PlacementForm: "placement-form" },
      "@/components/alumni/status-action": { StatusAction: "status-action" },
      "@/components/alumni/status-history": { StatusHistory: "status-history" },
    }).default({ params: Promise.resolve({ id: alumniId }) });
  }
  return { ...actions, detail, calls, rpcs, invalidated, config, supabase };
}

test("transition matrix permits exactly three changes and keeps both terminal statuses terminal", () => {
  const allowed = [
    "persiapan_berangkat:aktif_bekerja",
    "persiapan_berangkat:batal_berangkat",
    "aktif_bekerja:selesai_kontrak",
  ];
  for (const from of Object.keys(schema.statusLabels))
    for (const to of Object.keys(schema.statusLabels)) {
      const expected = allowed.includes(`${from}:${to}`);
      assert.equal(status.canTransition(from, to), expected);
      assert.equal(
        status.statusChangeSchema.safeParse({
          ...valid,
          expected_status: from,
          new_status: to,
        }).success,
        expected,
      );
    }
});

test("optional dates, note limit, calendar validity and date/status compatibility are validated", () => {
  assert.equal(status.statusChangeSchema.safeParse(valid).success, true);
  assert.equal(
    status.statusChangeSchema.safeParse({
      ...valid,
      note: "a".repeat(500),
      actual_departure: "2024-02-29",
    }).success,
    true,
  );
  for (const changes of [
    { note: "a".repeat(501) },
    { actual_departure: "2023-02-29" },
    { actual_departure: "2020-02-30" },
    { actual_departure: "2999-01-01" },
    { contract_end_date: "2020-01-01" },
    { placement_id: "bad-id" },
    { new_status: "sudah_berangkat" },
    { new_status: "batal_berangkat", actual_departure: "2020-01-01" },
    {
      expected_status: "aktif_bekerja",
      new_status: "selesai_kontrak",
      contract_end_date: "2999-01-01",
    },
  ])
    assert.equal(
      status.statusChangeSchema.safeParse({ ...valid, ...changes }).success,
      false,
    );
});

test("Dinas, inactive/missing profiles, missing sessions and inactive schools cannot invoke the mutation RPC", async () => {
  for (const options of [
    { role: "admin_dinas" },
    { role: "viewer_dinas" },
    { role: "unknown" },
    { active: false },
    { noProfile: true },
    { noSession: true },
    { schoolActive: false },
    { profileError: true },
  ]) {
    const h = harness(options);
    assert.equal(
      (
        await h.changePlacementStatus({
          ...valid,
          role: "petugas_sekolah",
          school_id: schoolId,
        })
      ).success,
      false,
    );
    assert.equal(h.rpcs.length, 0);
  }
});

test("server checks school ownership and rejects missing or historical placements", async () => {
  for (const options of [
    { ownerSchool: "other-school" },
    { missingPlacement: true },
    { current: false },
    { placementError: true },
  ]) {
    const h = harness(options);
    assert.equal((await h.changePlacementStatus(valid)).success, false);
    assert.equal(h.rpcs.length, 0);
  }
  const h = harness();
  await h.changePlacementStatus(valid);
  assert.deepEqual(h.calls.find((call) => call.table === "profiles").filters, [
    ["user_id", "verified-user"],
  ]);
  assert.deepEqual(h.calls.find((call) => call.table === "alumni").filters, [
    ["id", alumniId],
    ["school_id", schoolId],
  ]);
});

test("all allowed transitions call exact RPC arguments and treat a void response as success", async () => {
  for (const [from, to] of [
    ["persiapan_berangkat", "aktif_bekerja"],
    ["persiapan_berangkat", "batal_berangkat"],
    ["aktif_bekerja", "selesai_kontrak"],
  ]) {
    const h = harness({ status: from });
    const actual = to === "aktif_bekerja" ? "2020-01-01" : "";
    const end = to === "selesai_kontrak" ? "2021-01-01" : "";
    const result = await h.changePlacementStatus({
      ...valid,
      expected_status: from,
      new_status: to,
      note: " Catatan fiktif ",
      actual_departure: actual,
      contract_end_date: end,
    });
    assert.equal(result.success, true);
    assert.deepEqual(h.rpcs, [
      {
        name: "change_placement_status",
        args: {
          p_placement_id: placementId,
          p_expected_status: from,
          p_new_status: to,
          p_note: "Catatan fiktif",
          p_actual_departure: actual || null,
          p_contract_end_date: end || null,
        },
      },
    ]);
    assert.deepEqual(h.invalidated, [
      "/dashboard/alumni",
      "/dashboard",
      "/dashboard/reports",
      `/dashboard/alumni/${alumniId}`,
    ]);
    assert.equal(h.config.current, true);
  }
});

test("server validates dates against stored placement dates, not browser values", async () => {
  for (const options of [
    { actual: "2020-01-03", start: null },
    { actual: null, start: "2020-01-03" },
  ]) {
    const h = harness({ status: "aktif_bekerja", ...options });
    assert.equal(
      (
        await h.changePlacementStatus({
          ...valid,
          expected_status: "aktif_bekerja",
          new_status: "selesai_kontrak",
          contract_end_date: "2020-01-02",
          employment_start: null,
        })
      ).success,
      false,
    );
    assert.equal(h.rpcs.length, 0);
  }
  const h = harness({ start: "2020-01-01" });
  assert.equal(
    (
      await h.changePlacementStatus({
        ...valid,
        actual_departure: "2020-01-02",
      })
    ).success,
    false,
  );
  assert.equal(h.rpcs.length, 0);
});

test("stale dialogs and database race errors request refresh without overwriting", async () => {
  const h = harness({ status: "aktif_bekerja" });
  const stale = await h.changePlacementStatus(valid);
  assert.equal(stale.success, false);
  assert.equal(stale.refresh, true);
  assert.equal(h.rpcs.length, 0);
  for (const message of [
    "Status berubah, muat ulang data terlebih dahulu",
    "Hanya penempatan terkini yang bisa diubah",
  ]) {
    const race = harness({ rpcError: { code: "P0001", message } });
    const result = await race.changePlacementStatus(valid);
    assert.equal(result.success, false);
    assert.equal(result.refresh, true);
    assert.ok(race.invalidated.includes(`/dashboard/alumni/${alumniId}`));
  }
});

test("repeated and simultaneous calls cannot report two successes with the RPC expected-status contract", async () => {
  const h = harness();
  const results = await Promise.all([
    h.changePlacementStatus(valid),
    h.changePlacementStatus(valid),
  ]);
  assert.equal(results.filter((result) => result.success).length, 1);
  assert.equal((await h.changePlacementStatus(valid)).success, false);
});

test("RPC failures are safe and malformed payloads never reach the RPC", async () => {
  for (const options of [
    { rpcThrows: true },
    { rpcError: { code: "42501", message: "private" } },
    { rpcError: { code: "23514", message: "private" } },
    { rpcError: { code: "unknown", message: "private" } },
  ]) {
    const result = await harness(options).changePlacementStatus(valid);
    assert.equal(result.success, false);
    assert.equal(result.refresh, true);
    assert.doesNotMatch(result.message, /private|secret/);
  }
  const h = harness();
  assert.equal(
    (await h.changePlacementStatus({ ...valid, note: "x".repeat(501) }))
      .success,
    false,
  );
  assert.equal(h.rpcs.length, 0);
});

test("history RPC groups by placement, handles initial null status and sorts chronologically", async () => {
  const calls = [];
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        data: [
          {
            ...entry,
            id: previousId,
            changed_at: "2021-01-01T00:00:00Z",
            old_status: "persiapan_berangkat",
            new_status: "aktif_bekerja",
          },
          entry,
        ],
        error: null,
      };
    },
  };
  const result = await historyModule.getPlacementHistory(client, placementId);
  assert.equal(result.error, false);
  assert.equal(result.entries[0].old_status, null);
  assert.deepEqual(calls, [
    { name: "get_status_history", args: { p_placement_id: placementId } },
  ]);
  assert.equal(result.entries[1].new_status, "aktif_bekerja");
});

test("history supports empty, unavailable actors, malformed/cross-placement data and RPC errors safely", async () => {
  assert.deepEqual(
    await historyModule.getPlacementHistory(
      { rpc: async () => ({ data: [], error: null }) },
      placementId,
    ),
    { entries: [], error: false },
  );
  const missingActor = await historyModule.getPlacementHistory(
    {
      rpc: async () => ({
        data: [{ ...entry, changed_by_name: null }],
        error: null,
      }),
    },
    placementId,
  );
  assert.equal(missingActor.error, false);
  for (const response of [
    { data: [entry], error: { message: "private" } },
    { data: [{ ...entry, placement_id: previousId }], error: null },
    { data: null, error: null },
    { data: [{ ...entry, new_status: "unknown" }], error: null },
  ])
    assert.deepEqual(
      await historyModule.getPlacementHistory(
        { rpc: async () => response },
        placementId,
      ),
      { entries: [], error: true },
    );
  assert.deepEqual(
    await historyModule.getPlacementHistory(
      {
        rpc: async () => {
          throw new Error("private");
        },
      },
      placementId,
    ),
    { entries: [], error: true },
  );
});

function elements(tree, type) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((item) => elements(item, type));
  return [
    ...(tree.type === type ? [tree] : []),
    ...elements(tree.props?.children, type),
  ];
}

test("detail fetches separate histories for current/historical placements; only staff get a current-placement action", async () => {
  for (const role of ["petugas_sekolah", "admin_dinas", "viewer_dinas"]) {
    const h = harness({ role, withHistory: true });
    const tree = await h.detail();
    assert.deepEqual(
      h.rpcs.map((call) => call.args.p_placement_id),
      [placementId, previousId],
    );
    const histories = elements(tree, "status-history");
    assert.equal(histories.length, 2);
    assert.equal(histories[0].props.entries[0].placement_id, placementId);
    assert.equal(histories[1].props.entries[0].placement_id, previousId);
    const actions = elements(tree, "status-action");
    assert.equal(actions.length, role === "petugas_sekolah" ? 1 : 0);
    if (actions.length) assert.equal(actions[0].props.placementId, placementId);
  }
  const h = harness({ ownerSchool: "other-school", withHistory: true });
  await assert.rejects(h.detail(), /notFound/);
  assert.equal(h.rpcs.length, 0);
});
