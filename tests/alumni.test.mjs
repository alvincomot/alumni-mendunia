import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const loadDependency = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// Execute the production modules, substituting only framework and network boundaries.
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

const countryData = load("lib/countries.ts");
const schema = load("lib/alumni/schema.ts", {
  "@/lib/countries": countryData,
});
const roles = load("lib/auth/roles.ts");
const alumniId = "00000000-0000-4000-8000-000000000001";
const schoolId = "00000000-0000-4000-8000-000000000002";
const otherSchoolId = "00000000-0000-4000-8000-000000000003";
const identity = {
  full_name: "Alumni Fiktif Pengujian",
  graduation_year: 2020,
  major: "Rekayasa Perangkat Lunak",
};
const placement = {
  destination_country: "Jepang",
  company_name: "Perusahaan Fiktif",
  work_sector: "Teknologi",
  status: "persiapan_berangkat",
  planned_departure: "",
  actual_departure: "",
  employment_start: "",
  contract_end_date: "",
  confirm_existing_condition: false,
};

test("identity validation enforces database limits and strips client-controlled fields", () => {
  for (const values of [
    { full_name: " " },
    { full_name: "a".repeat(151) },
    { major: "" },
    { major: "a".repeat(151) },
    { graduation_year: 1989 },
    { graduation_year: 2101 },
    { graduation_year: 2020.5 },
    { graduation_year: NaN },
    { graduation_year: "2020" },
  ]) {
    assert.equal(
      schema.alumniSchema.safeParse({ ...identity, ...values }).success,
      false,
    );
  }
  assert.deepEqual(
    schema.alumniSchema.parse({
      ...identity,
      full_name: ` ${identity.full_name} `,
      school_id: otherSchoolId,
      role: "admin_dinas",
    }),
    identity,
  );
  for (const graduation_year of [1990, 2100])
    assert.equal(
      schema.alumniSchema.safeParse({ ...identity, graduation_year }).success,
      true,
    );
});

test("all four initial statuses are supported and non-default status requires confirmation", () => {
  for (const status of Object.keys(schema.statusLabels)) {
    assert.equal(
      schema.placementSchema.safeParse({
        ...placement,
        status,
        confirm_existing_condition: true,
      }).success,
      true,
    );
    assert.equal(
      schema.placementSchema.safeParse({ ...placement, status }).success,
      status === "persiapan_berangkat",
    );
  }
  assert.equal(
    schema.placementSchema.safeParse({ ...placement, status: "approved" })
      .success,
    false,
  );
});

test("placement validates real dates, status/date compatibility, chronology and future actual/end dates", () => {
  const historical = {
    ...placement,
    status: "selesai_kontrak",
    confirm_existing_condition: true,
    actual_departure: "2020-01-01",
    employment_start: "2020-01-02",
    contract_end_date: "2021-01-01",
  };
  assert.equal(schema.placementSchema.safeParse(historical).success, true);
  for (const planned_departure of [
    "2023-02-29",
    "2024-02-30",
    "2020-13-01",
    "0000-01-01",
    "bad-date",
  ])
    assert.equal(
      schema.placementSchema.safeParse({ ...placement, planned_departure })
        .success,
      false,
    );
  assert.equal(
    schema.placementSchema.safeParse({
      ...placement,
      planned_departure: "2024-02-29",
    }).success,
    true,
  );
  for (const values of [
    { employment_start: "2019-12-31" },
    { contract_end_date: "2019-12-31" },
    { actual_departure: "2999-01-01" },
    { contract_end_date: "2999-01-01" },
  ])
    assert.equal(
      schema.placementSchema.safeParse({ ...historical, ...values }).success,
      false,
    );
  for (const status of ["persiapan_berangkat", "batal_berangkat"]) {
    for (const field of [
      "actual_departure",
      "employment_start",
      "contract_end_date",
    ])
      assert.equal(
        schema.placementSchema.safeParse({
          ...placement,
          status,
          confirm_existing_condition: true,
          [field]: "2020-01-01",
        }).success,
        false,
      );
  }
  assert.equal(
    schema.placementSchema.safeParse({
      ...placement,
      status: "aktif_bekerja",
      confirm_existing_condition: true,
      contract_end_date: "2020-01-01",
    }).success,
    false,
  );
  for (const values of [
    { destination_country: " " },
    { destination_country: "a".repeat(101) },
    { company_name: "a".repeat(201) },
    { work_sector: "a".repeat(151) },
  ])
    assert.equal(
      schema.placementSchema.safeParse({ ...placement, ...values }).success,
      false,
    );
});

test("country dataset is complete, searchable and canonicalizes supported aliases", () => {
  assert.equal(countryData.countryOptions.length, 249);
  assert.equal(
    countryData.countryOptions.every(
      (option, index, entries) =>
        index === 0 ||
        entries[index - 1].label.localeCompare(option.label, "id-ID") <= 0,
    ),
    true,
  );
  assert.equal(countryData.searchCountryOptions("Japan")[0].label, "Jepang");
  assert.equal(countryData.searchCountryOptions("korsel")[0].label, "Korea Selatan");
  assert.equal(countryData.searchCountryOptions("aland")[0].code, "AX");
  assert.equal(
    schema.placementSchema.parse({
      ...placement,
      destination_country: "jApAn",
    }).destination_country,
    "Jepang",
  );
  const arbitrary = schema.placementSchema.safeParse({
    ...placement,
    destination_country: "Negara Fiktif",
  });
  assert.equal(arbitrary.success, false);
  assert.equal(
    arbitrary.error.issues[0].message,
    "Pilih negara tujuan yang valid",
  );
});

test("country combobox owns selection and required Indonesian feedback", () => {
  const formSource = fs.readFileSync(
    path.join(root, "components/alumni/placement-form.tsx"),
    "utf8",
  );
  const comboboxSource = fs.readFileSync(
    path.join(root, "components/alumni/country-combobox.tsx"),
    "utf8",
  );
  assert.match(formSource, /name="destination_country"/);
  assert.doesNotMatch(formSource, /register\("destination_country"\)/);
  assert.match(comboboxSource, /Pilih negara tujuan/);
  assert.match(comboboxSource, /Cari negara\.\.\./);
  assert.match(comboboxSource, /Negara tidak ditemukan/);
  assert.match(comboboxSource, /onSelect=\{\(\) => select\(option\.label\)\}/);
});

function harness(options = {}) {
  const config = {
    role: "petugas_sekolah",
    active: true,
    schoolActive: true,
    assignedSchool: schoolId,
    rowSchool: schoolId,
    ...options,
  };
  const calls = [];
  const mutations = [];
  const rpcs = [];
  const revalidated = [];
  const supabase = {
    auth: {
      getClaims: async () => ({
        data: config.noSession ? null : { claims: { sub: "verified-user" } },
        error: config.noSession || null,
      }),
    },
    from(table) {
      const filters = [];
      const call = { table, filters };
      calls.push(call);
      const chain = {
        select(...args) {
          call.select = args;
          return chain;
        },
        eq(key, value) {
          filters.push([key, value]);
          return chain;
        },
        in(key, value) {
          filters.push([key, value]);
          return chain;
        },
        ilike(key, value) {
          filters.push([key, value]);
          return chain;
        },
        order() {
          return chain;
        },
        range(start, end) {
          call.range = [start, end];
          return chain;
        },
        limit() {
          return chain;
        },
        insert(value) {
          mutations.push({ table, type: "insert", value });
          return chain;
        },
        update(value) {
          mutations.push({ table, type: "update", value });
          return chain;
        },
        async maybeSingle() {
          if (table === "profiles")
            return {
              data: config.noProfile
                ? null
                : {
                    role: config.role,
                    is_active: config.active,
                    school_id: config.assignedSchool,
                  },
              error: config.profileError || null,
            };
          if (table === "schools")
            return {
              data: { is_active: config.schoolActive, name: "SMK Fiktif" },
              error: config.schoolError || null,
            };
          if (table === "placements")
            return {
              data: config.existingPlacement
                ? typeof config.existingPlacement === "object"
                  ? config.existingPlacement
                  : { id: "existing-placement" }
                : null,
              error: config.placementReadError || null,
            };
          const excluded = filters.some(
            ([key, value]) => key === "school_id" && value !== config.rowSchool,
          );
          return {
            data:
              excluded || config.missingRow
                ? null
                : { id: alumniId, school_id: config.rowSchool, ...identity },
            error: config.writeError || null,
          };
        },
        then(resolve, reject) {
          const excluded = filters.some(
            ([key, value]) => key === "school_id" && value !== config.rowSchool,
          );
          const data =
            table === "alumni" && !excluded
              ? [
                  {
                    id: alumniId,
                    school_id: config.rowSchool,
                    ...identity,
                    schools: { name: "SMK Fiktif" },
                    placements: [],
                  },
                ]
              : [];
          return Promise.resolve({
            data,
            count: data.length,
            error: null,
          }).then(resolve, reject);
        },
      };
      return chain;
    },
    async rpc(name, args) {
      rpcs.push({ name, args });
      if (config.rpcThrows) throw new Error("private infrastructure detail");
      return {
        data: config.rpcError ? null : "placement-id",
        error: config.rpcError
          ? { message: "private database detail", code: config.rpcCode }
          : null,
      };
    },
  };
  const access = load("lib/alumni/access.ts", {
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/auth/roles": roles,
  });
  const actions = load("app/dashboard/alumni/actions.ts", {
    "@/lib/alumni/access": access,
    "@/lib/alumni/schema": schema,
    "next/cache": { revalidatePath: (value) => revalidated.push(value) },
  });
  function page(filename) {
    const navigation = {
      redirect: (value) => {
        throw new Error(`redirect:${value}`);
      },
    };
    const authAccess = load("lib/auth/access.ts", {
      "server-only": {},
      "@/lib/alumni/access": access,
      "next/navigation": navigation,
    });
    const model = load("lib/monitoring/model.ts", {
      "@/lib/alumni/schema": schema,
      "@/lib/countries": countryData,
    });
    const readAll = load("lib/data/read-all.ts", { "server-only": {} });
    const monitoring = load("lib/monitoring/data.ts", {
      "server-only": {},
      "@/lib/data/read-all": readAll,
      "./model": model,
      "@/lib/countries": countryData,
    });
    return load(filename, {
      "@/lib/auth/access": authAccess,
      "@/lib/monitoring/model": model,
      "@/lib/monitoring/data": monitoring,
      "@/components/monitoring/filters": { MonitoringFilterForm: () => null },
      "@/components/data/pagination": { Pagination: () => null },
      "@/lib/alumni/access": access,
      "@/lib/alumni/schema": schema,
      "@/lib/countries": countryData,
      "next/navigation": {
        redirect: (value) => {
          throw new Error(`redirect:${value}`);
        },
        notFound: () => {
          throw new Error("notFound");
        },
      },
      "next/link": { default: () => null },
      "@/components/alumni/page-frame": {
        AlumniPageFrame: () => null,
        AlumniAccessDenied: () => null,
        PlacementBadge: () => null,
      },
      "@/components/alumni/alumni-form": { AlumniForm: () => null },
      "@/components/alumni/placement-form": { PlacementForm: () => null },
      "@/components/alumni/status-action": { StatusAction: () => null },
      "@/components/alumni/status-history": { StatusHistory: () => null },
      "@/lib/alumni/history": {
        getPlacementHistory: async () => ({ entries: [], error: false }),
      },
      "@/components/ui/button": { Button: () => null },
      "@/components/ui/input": { Input: () => null },
      "@/components/ui/label": { Label: () => null },
    }).default;
  }
  return {
    ...access,
    ...actions,
    calls,
    mutations,
    rpcs,
    revalidated,
    config,
    page,
  };
}

test("reads verify claims, active profile and active school; Dinas roles are read-only", async () => {
  for (const role of ["admin_dinas", "viewer_dinas", "petugas_sekolah"]) {
    const h = harness({ role });
    const access = await h.getAlumniAccess();
    assert.equal(access.allowed, true);
    assert.equal(access.canWrite, role === "petugas_sekolah");
    assert.deepEqual(h.calls[0].filters, [["user_id", "verified-user"]]);
  }
  for (const options of [
    { noSession: true },
    { noProfile: true },
    { active: false },
    { role: "unknown" },
    { assignedSchool: null },
    { schoolActive: false },
  ])
    assert.equal((await harness(options).getAlumniAccess()).allowed, false);
  for (const options of [{ profileError: true }, { schoolError: true }])
    await assert.rejects(harness(options).getAlumniAccess());
});

test("direct actions reject Dinas, invalid profiles and inactive schools regardless of spoofed input", async () => {
  for (const options of [
    { role: "admin_dinas" },
    { role: "viewer_dinas" },
    { noSession: true },
    { noProfile: true },
    { active: false },
    { assignedSchool: null },
    { schoolActive: false },
    { profileError: true },
    { schoolError: true },
  ]) {
    const h = harness(options);
    assert.equal(
      (
        await h.saveAlumni(null, {
          ...identity,
          role: "petugas_sekolah",
          school_id: schoolId,
        })
      ).success,
      false,
    );
    assert.equal((await h.saveAlumni(alumniId, identity)).success, false);
    assert.equal(
      (await h.registerInitialPlacement(alumniId, placement)).success,
      false,
    );
    assert.equal(h.mutations.length, 0);
    assert.equal(h.rpcs.length, 0);
  }
});

test("creation omits school_id; editing uses verified ownership and only identity fields", async () => {
  const h = harness();
  assert.equal(
    (
      await h.saveAlumni(null, {
        ...identity,
        school_id: otherSchoolId,
        status: "aktif_bekerja",
      })
    ).success,
    true,
  );
  assert.deepEqual(h.mutations[0], {
    table: "alumni",
    type: "insert",
    value: identity,
  });
  assert.equal(
    (await h.saveAlumni(alumniId, { ...identity, school_id: otherSchoolId }))
      .success,
    true,
  );
  assert.deepEqual(h.mutations[1], {
    table: "alumni",
    type: "update",
    value: identity,
  });
  assert.deepEqual(
    h.calls.filter((call) => call.table === "alumni")[1].filters,
    [
      ["id", alumniId],
      ["school_id", schoolId],
    ],
  );
  assert.ok(h.revalidated.includes(`/dashboard/alumni/${alumniId}`));
});

test("foreign-school writes and missing alumni cannot reach placement RPC", async () => {
  for (const options of [{ rowSchool: otherSchoolId }, { missingRow: true }]) {
    const h = harness(options);
    assert.equal((await h.saveAlumni(alumniId, identity)).success, false);
    assert.equal(
      (await h.registerInitialPlacement(alumniId, placement)).success,
      false,
    );
    assert.equal(h.rpcs.length, 0);
  }
});

test("server validation rejects malformed IDs and payloads before mutation", async () => {
  const h = harness();
  assert.equal((await h.saveAlumni("invalid", identity)).success, false);
  assert.equal(
    (await h.saveAlumni(null, { ...identity, graduation_year: 0 })).success,
    false,
  );
  assert.equal(
    (await h.registerInitialPlacement("invalid", placement)).success,
    false,
  );
  assert.equal(
    (
      await h.registerInitialPlacement(alumniId, {
        ...placement,
        status: "approved",
      })
    ).success,
    false,
  );
  assert.equal(h.mutations.length, 0);
  assert.equal(h.rpcs.length, 0);
});

test("placement uses exact RPC parameters, nullable optional values, and no direct table writes", async () => {
  const h = harness();
  assert.equal(
    (
      await h.registerInitialPlacement(alumniId, {
        ...placement,
        company_name: "",
        work_sector: "",
        school_id: otherSchoolId,
        is_current: false,
      })
    ).success,
    true,
  );
  assert.deepEqual(h.rpcs, [
    {
      name: "create_placement_guarded",
      args: {
        p_alumni_id: alumniId,
        p_expected_current_id: null,
        p_destination_country: "Jepang",
        p_work_sector: null,
        p_company_name: null,
        p_planned_departure: null,
        p_initial_status: "persiapan_berangkat",
        p_actual_departure: null,
        p_employment_start: null,
        p_contract_end_date: null,
      },
    },
  ]);
  assert.equal(h.mutations.length, 0);
});

test("placement RPC persists a canonical Indonesian country name", async () => {
  const h = harness();
  assert.equal(
    (
      await h.registerInitialPlacement(alumniId, {
        ...placement,
        destination_country: "Japan",
      })
    ).success,
    true,
  );
  assert.equal(h.rpcs[0].args.p_destination_country, "Jepang");
  const rejected = harness();
  assert.equal(
    (
      await rejected.registerInitialPlacement(alumniId, {
        ...placement,
        destination_country: "Negara Fiktif",
      })
    ).success,
    false,
  );
  assert.equal(rejected.rpcs.length, 0);
});

test("existing placements or failed existence checks prevent replacing recorded history", async () => {
  for (const options of [
    { existingPlacement: true },
    { placementReadError: true },
  ]) {
    const h = harness(options);
    assert.equal(
      (await h.registerInitialPlacement(alumniId, placement)).success,
      false,
    );
    assert.equal(h.rpcs.length, 0);
    assert.equal(h.mutations.length, 0);
  }
});

test("partial failure allows placement-only retry without duplicate alumni or leaked errors", async () => {
  for (const options of [{ rpcError: true }, { rpcThrows: true }]) {
    const h = harness(options);
    assert.equal((await h.saveAlumni(null, identity)).success, true);
    const failed = await h.registerInitialPlacement(alumniId, placement);
    assert.equal(failed.success, false);
    assert.match(failed.message, /Data alumni tetap tersedia/);
    assert.doesNotMatch(failed.message, /private/);
    h.config.rpcError = false;
    h.config.rpcThrows = false;
    assert.equal(
      (await h.registerInitialPlacement(alumniId, placement)).success,
      true,
    );
    assert.equal(h.mutations.length, 1);
    assert.equal(h.rpcs.length, 2);
  }
});

test("server-rendered list/detail apply school ownership; Dinas may read all schools", async () => {
  for (const role of ["admin_dinas", "viewer_dinas", "petugas_sekolah"]) {
    const h = harness({ role });
    await h.page("app/dashboard/alumni/page.tsx")({
      searchParams: Promise.resolve({ q: "Fiktif", year: "2020", page: "1" }),
    });
    const list = h.calls.find((call) => call.table === "alumni");
    assert.equal(
      list.filters.some(([key]) => key === "school_id"),
      role === "petugas_sekolah",
    );
    assert.ok(
      list.filters.some(
        ([key, value]) => key === "placements.is_current" && value === true,
      ),
    );
    assert.deepEqual(list.range, [0, 499]);
  }
  const foreign = harness({ rowSchool: otherSchoolId });
  await assert.rejects(
    foreign.page("app/dashboard/alumni/[id]/page.tsx")({
      params: Promise.resolve({ id: alumniId }),
    }),
    /notFound/,
  );
  assert.equal(
    foreign.calls.some((call) => call.table === "placements"),
    false,
  );
  for (const role of ["admin_dinas", "viewer_dinas"]) {
    const h = harness({ role, rowSchool: otherSchoolId });
    await h.page("app/dashboard/alumni/[id]/page.tsx")({
      params: Promise.resolve({ id: alumniId }),
    });
    assert.equal(
      h.calls
        .find((call) => call.table === "alumni")
        .filters.some(([key]) => key === "school_id"),
      false,
    );
  }
});

test("successor registration requires the exact terminal current placement", async () => {
  const previousId = "00000000-0000-4000-8000-000000000010";
  for (const status of ["selesai_kontrak", "batal_berangkat"]) {
    const h = harness({ existingPlacement: { id: previousId, status } });
    assert.equal(
      (await h.registerPlacement(alumniId, previousId, placement)).success,
      true,
    );
    assert.equal(h.rpcs[0].args.p_expected_current_id, previousId);
    assert.equal(h.mutations.length, 0);
  }
  for (const current of [
    { id: previousId, status: "aktif_bekerja" },
    { id: previousId, status: "persiapan_berangkat" },
    { id: otherSchoolId, status: "selesai_kontrak" },
  ]) {
    const h = harness({ existingPlacement: current });
    assert.equal(
      (await h.registerPlacement(alumniId, previousId, placement)).success,
      false,
    );
    assert.equal(h.rpcs.length, 0);
  }
});

test("missing guarded RPC fails closed with setup instructions and no fallback", async () => {
  const h = harness({ rpcError: true, rpcCode: "PGRST202" });
  const result = await h.registerInitialPlacement(alumniId, placement);
  assert.equal(result.success, false);
  assert.match(result.message, /migration/);
  assert.deepEqual(
    h.rpcs.map((rpc) => rpc.name),
    ["create_placement_guarded"],
  );
});

test("all pages redirect missing sessions; Dinas registration route performs no alumni query", async () => {
  for (const file of ["page.tsx", "new/page.tsx", "[id]/page.tsx"]) {
    const h = harness({ noSession: true });
    await assert.rejects(
      h.page(`app/dashboard/alumni/${file}`)({
        params: Promise.resolve({ id: alumniId }),
        searchParams: Promise.resolve({}),
      }),
      /redirect:\/auth\/login/,
    );
  }
  for (const role of ["admin_dinas", "viewer_dinas"]) {
    const h = harness({ role });
    await h.page("app/dashboard/alumni/new/page.tsx")();
    assert.equal(
      h.calls.some((call) => call.table === "alumni"),
      false,
    );
  }
});
