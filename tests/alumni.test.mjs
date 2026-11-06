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
const placementId = "00000000-0000-4000-8000-000000000004";
const placementUpdatedAt = "2026-11-05T01:00:00.000Z";
const identity = {
  full_name: "Alumni Fiktif Pengujian",
  graduation_year: 2020,
  major: "Rekayasa Perangkat Lunak",
};
const placement = {
  destination_country: "Jepang",
  placement_secured: false,
  placement_provider_name: "",
  work_sector: "",
  status: "persiapan_berangkat",
  planned_departure: "",
  actual_departure: "",
  employment_start: "",
  contract_end_date: "",
  confirm_existing_condition: false,
};
const placementEdit = {
  placement_id: placementId,
  expected_status: "persiapan_berangkat",
  expected_updated_at: placementUpdatedAt,
  destination_country: "Jepang",
  placement_secured: "true",
  placement_provider_name: "LPK Fiktif",
  work_sector: "Manufaktur",
  planned_departure: "2030-01-01",
  actual_departure: "",
  employment_start: "",
  contract_end_date: "",
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
        placement_secured: status !== "persiapan_berangkat",
        confirm_existing_condition: true,
      }).success,
      true,
    );
    assert.equal(
      schema.placementSchema.safeParse({
        ...placement,
        status,
        placement_secured: status !== "persiapan_berangkat",
      }).success,
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
    placement_secured: true,
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
      placement_secured: true,
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
          placement_secured: status !== "persiapan_berangkat",
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
      placement_secured: true,
      confirm_existing_condition: true,
      contract_end_date: "2020-01-01",
    }).success,
    false,
  );
  for (const values of [
    { destination_country: " " },
    { destination_country: "a".repeat(101) },
    { placement_provider_name: "a".repeat(201) },
    { work_sector: "a".repeat(151) },
  ])
    assert.equal(
      schema.placementSchema.safeParse({
        ...placement,
        placement_secured: true,
        ...values,
      }).success,
      false,
    );
});

test("preparation placement state controls dependent fields without weakening country validation", () => {
  assert.equal(schema.placementSchema.safeParse(placement).success, true);
  assert.equal(
    schema.placementSchema.safeParse({
      ...placement,
      placement_secured: true,
      placement_provider_name: "LPK Fiktif",
      work_sector: "Manufaktur",
      planned_departure: "2030-01-01",
    }).success,
    true,
  );
  for (const values of [
    { placement_provider_name: "LPK stale" },
    { work_sector: "Sektor stale" },
    { planned_departure: "2030-01-01" },
  ])
    assert.equal(
      schema.placementSchema.safeParse({ ...placement, ...values }).success,
      false,
    );
  assert.equal(
    schema.placementSchema.safeParse({
      ...placement,
      destination_country: "",
    }).success,
    false,
  );
});

test("placement detail edits preserve status-specific fields and require an explicit placement state", () => {
  const parsed = schema.placementDetailsEditSchema.parse(placementEdit);
  assert.equal(parsed.placement_secured, true);
  assert.equal(parsed.destination_country, "Jepang");
  for (const values of [
    { placement_secured: "" },
    {
      placement_secured: "false",
      placement_provider_name: "LPK stale",
    },
  ])
    assert.equal(
      schema.placementDetailsEditSchema.safeParse({
        ...placementEdit,
        ...values,
      }).success,
      false,
    );
  assert.equal(
    schema.placementDetailsEditSchema.safeParse({
      ...placementEdit,
      expected_status: "aktif_bekerja",
      actual_departure: "2020-01-01",
    }).success,
    true,
  );
  assert.equal(
    schema.placementDetailsEditSchema.safeParse({
      ...placementEdit,
      expected_status: "aktif_bekerja",
      actual_departure: "",
    }).success,
    false,
  );
});

test("initial registration accepts only the date assigned to its selected status", () => {
  const cases = {
    persiapan_berangkat: {
      allowedField: "planned_departure",
      value: "2030-01-01",
      confirm_existing_condition: false,
    },
    aktif_bekerja: {
      allowedField: "actual_departure",
      value: "2020-01-01",
      confirm_existing_condition: true,
    },
    selesai_kontrak: {
      allowedField: "contract_end_date",
      value: "2021-01-01",
      confirm_existing_condition: true,
    },
    batal_berangkat: {
      allowedField: null,
      value: null,
      confirm_existing_condition: true,
    },
  };
  const dateFields = [
    "planned_departure",
    "actual_departure",
    "employment_start",
    "contract_end_date",
  ];

  for (const [status, current] of Object.entries(cases)) {
    const valid = {
      ...placement,
      status,
      placement_secured:
        status !== "persiapan_berangkat" || Boolean(current.allowedField),
      confirm_existing_condition: current.confirm_existing_condition,
      ...(current.allowedField
        ? { [current.allowedField]: current.value }
        : {}),
    };
    assert.equal(schema.initialPlacementSchema.safeParse(valid).success, true);

    for (const field of dateFields.filter(
      (candidate) => candidate !== current.allowedField,
    )) {
      assert.equal(
        schema.initialPlacementSchema.safeParse({
          ...valid,
          [field]: "2020-01-01",
        }).success,
        false,
      );
    }
  }
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
  assert.equal(
    countryData.searchCountryOptions("korsel")[0].label,
    "Korea Selatan",
  );
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
  assert.equal(schema.destinationCountrySchema.safeParse("").success, false);
  assert.equal(schema.destinationCountrySchema.parse("Japan"), "Jepang");
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
  assert.match(comboboxSource, /if \(wasOpen && !nextOpen\) onBlur\?\.\(\)/);
  assert.doesNotMatch(comboboxSource, /onBlur=\{onBlur\}/);
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
              data:
                config.currentPlacement !== undefined
                  ? config.currentPlacement
                  : config.existingPlacement
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
    "@/lib/alumni/navigation": load("lib/alumni/navigation.ts"),
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
      "@/lib/alumni/navigation": load("lib/alumni/navigation.ts"),
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
      "@/lib/alumni/placement-compat": load("lib/alumni/placement-compat.ts"),
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
      "@/lib/alumni/navigation": load("lib/alumni/navigation.ts"),
      "@/lib/alumni/placement-compat": load("lib/alumni/placement-compat.ts"),
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
      "@/components/alumni/alumni-form": { AlumniEditor: () => null },
      "@/components/alumni/alumni-registration-form": {
        AlumniRegistrationForm: () => null,
      },
      "@/components/alumni/placement-form": { PlacementForm: () => null },
      "@/components/alumni/placement-editor": { PlacementEditor: () => null },
      "@/components/alumni/status-action": { StatusAction: () => null },
      "@/components/alumni/status-history": { StatusHistory: () => null },
      "@/components/dashboard-icon": { DashboardIcon: () => null },
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

test("placement detail editing is staff-only, ownership-bound and uses the guarded RPC", async () => {
  const currentPlacement = {
    id: placementId,
    alumni_id: alumniId,
    status: "persiapan_berangkat",
    is_current: true,
    updated_at: placementUpdatedAt,
  };
  const h = harness({ currentPlacement });
  const result = await h.updatePlacementDetails(placementEdit);
  assert.equal(result.success, true);
  assert.deepEqual(h.rpcs, [
    {
      name: "update_current_placement_details",
      args: {
        p_placement_id: placementId,
        p_expected_status: "persiapan_berangkat",
        p_expected_updated_at: placementUpdatedAt,
        p_destination_country: "Jepang",
        p_placement_secured: true,
        p_placement_provider_name: "LPK Fiktif",
        p_work_sector: "Manufaktur",
        p_planned_departure: "2030-01-01",
        p_actual_departure: null,
        p_employment_start: null,
        p_contract_end_date: null,
      },
    },
  ]);
  assert.equal(h.mutations.length, 0);
  assert.ok(h.revalidated.includes(`/dashboard/alumni/${alumniId}`));

  const activePlacement = {
    ...currentPlacement,
    status: "aktif_bekerja",
    planned_departure: "2030-01-01",
  };
  const active = harness({ currentPlacement: activePlacement });
  const activeResult = await active.updatePlacementDetails({
    ...placementEdit,
    expected_status: "aktif_bekerja",
    placement_provider_name: "LPK Fiktif Diperbarui",
    planned_departure: "2999-12-31",
    actual_departure: "2020-01-01",
    employment_start: "2020-01-02",
  });
  assert.equal(activeResult.success, true);
  assert.equal(active.rpcs[0].args.p_planned_departure, "2030-01-01");
  assert.equal(
    active.rpcs[0].args.p_placement_provider_name,
    "LPK Fiktif Diperbarui",
  );

  for (const options of [
    { role: "admin_dinas", currentPlacement },
    { role: "viewer_dinas", currentPlacement },
    { rowSchool: otherSchoolId, currentPlacement },
    { currentPlacement: { ...currentPlacement, is_current: false } },
  ]) {
    const rejected = harness(options);
    const response = await rejected.updatePlacementDetails(placementEdit);
    assert.equal(response.success, false);
    assert.equal(rejected.rpcs.length, 0);
  }
});

test("placement detail editing rejects stale, invalid and unavailable updates safely", async () => {
  const currentPlacement = {
    id: placementId,
    alumni_id: alumniId,
    status: "persiapan_berangkat",
    is_current: true,
    updated_at: "2026-11-05T02:00:00.000Z",
  };
  const stale = harness({ currentPlacement });
  const staleResult = await stale.updatePlacementDetails(placementEdit);
  assert.equal(staleResult.success, false);
  assert.equal(staleResult.refresh, true);
  assert.equal(stale.rpcs.length, 0);

  const invalid = harness({ currentPlacement });
  assert.equal(
    (
      await invalid.updatePlacementDetails({
        ...placementEdit,
        placement_secured: "false",
      })
    ).success,
    false,
  );
  assert.equal(invalid.rpcs.length, 0);

  const unavailable = harness({
    currentPlacement: { ...currentPlacement, updated_at: placementUpdatedAt },
    rpcError: true,
    rpcCode: "PGRST202",
  });
  const unavailableResult =
    await unavailable.updatePlacementDetails(placementEdit);
  assert.equal(unavailableResult.success, false);
  assert.match(unavailableResult.message, /migration/);
  assert.deepEqual(
    unavailable.rpcs.map((rpc) => rpc.name),
    ["update_current_placement_details"],
  );
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
        p_placement_secured: false,
        p_placement_provider_name: null,
        p_work_sector: null,
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

test("secured preparation sends intermediary, sector and plan through the guarded RPC", async () => {
  const h = harness();
  assert.equal(
    (
      await h.registerInitialPlacement(alumniId, {
        ...placement,
        placement_secured: true,
        placement_provider_name: "LPK Fiktif",
        work_sector: "Manufaktur",
        planned_departure: "2030-01-01",
      })
    ).success,
    true,
  );
  assert.equal(h.rpcs[0].args.p_placement_secured, true);
  assert.equal(h.rpcs[0].args.p_placement_provider_name, "LPK Fiktif");
  assert.equal(h.rpcs[0].args.p_work_sector, "Manufaktur");
  assert.equal(h.rpcs[0].args.p_planned_departure, "2030-01-01");
});

test("initial placement action rejects stale dates before calling the RPC", async () => {
  for (const input of [
    {
      ...placement,
      status: "aktif_bekerja",
      placement_secured: true,
      confirm_existing_condition: true,
      planned_departure: "2020-01-01",
    },
    {
      ...placement,
      status: "selesai_kontrak",
      placement_secured: true,
      confirm_existing_condition: true,
      actual_departure: "2020-01-01",
    },
    {
      ...placement,
      status: "batal_berangkat",
      placement_secured: true,
      confirm_existing_condition: true,
      contract_end_date: "2020-01-01",
    },
  ]) {
    const h = harness();
    assert.equal(
      (await h.registerInitialPlacement(alumniId, input)).success,
      false,
    );
    assert.equal(h.rpcs.length, 0);
    if (input.planned_departure) {
      const direct = harness();
      assert.equal(
        (await direct.registerPlacement(alumniId, null, input)).success,
        false,
      );
      assert.equal(direct.rpcs.length, 0);
    }
  }
});

test("initial placement payload sends only the selected status date", async () => {
  const cases = [
    {
      status: "persiapan_berangkat",
      field: "planned_departure",
      parameter: "p_planned_departure",
      value: "2030-01-01",
      confirm_existing_condition: false,
    },
    {
      status: "aktif_bekerja",
      field: "actual_departure",
      parameter: "p_actual_departure",
      value: "2020-01-01",
      confirm_existing_condition: true,
    },
    {
      status: "selesai_kontrak",
      field: "contract_end_date",
      parameter: "p_contract_end_date",
      value: "2021-01-01",
      confirm_existing_condition: true,
    },
    {
      status: "batal_berangkat",
      field: null,
      parameter: null,
      value: null,
      confirm_existing_condition: true,
    },
  ];
  const dateParameters = [
    "p_planned_departure",
    "p_actual_departure",
    "p_employment_start",
    "p_contract_end_date",
  ];

  for (const current of cases) {
    const h = harness();
    const result = await h.registerInitialPlacement(alumniId, {
      ...placement,
      status: current.status,
      placement_secured:
        current.status !== "persiapan_berangkat" || Boolean(current.field),
      confirm_existing_condition: current.confirm_existing_condition,
      ...(current.field ? { [current.field]: current.value } : {}),
    });
    assert.equal(result.success, true);
    if (current.parameter)
      assert.equal(h.rpcs[0].args[current.parameter], current.value);
    for (const parameter of dateParameters.filter(
      (candidate) => candidate !== current.parameter,
    ))
      assert.equal(h.rpcs[0].args[parameter], null);
  }
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

test("single registration action creates identity and placement from one validated payload", async () => {
  const h = harness();
  const result = await h.registerAlumniWithPlacement(null, {
    identity,
    placement,
  });
  assert.equal(result.success, true);
  assert.equal(result.id, alumniId);
  assert.equal(result.identitySaved, true);
  assert.deepEqual(h.mutations, [
    { table: "alumni", type: "insert", value: identity },
  ]);
  assert.equal(h.rpcs.length, 1);
  assert.equal(h.rpcs[0].name, "create_placement_guarded");
  assert.ok(h.revalidated.includes(`/dashboard/alumni/${alumniId}`));
});

test("combined registration retries placement with the saved identity instead of inserting a duplicate", async () => {
  const h = harness({ rpcError: true });
  const first = await h.registerAlumniWithPlacement(null, {
    identity,
    placement,
  });
  assert.equal(first.success, false);
  assert.equal(first.id, alumniId);
  assert.equal(first.identitySaved, true);
  assert.equal(
    h.mutations.filter((mutation) => mutation.type === "insert").length,
    1,
  );

  h.config.rpcError = false;
  const retry = await h.registerAlumniWithPlacement(first.id, {
    identity,
    placement,
  });
  assert.equal(retry.success, true);
  assert.equal(
    h.mutations.filter((mutation) => mutation.type === "insert").length,
    1,
  );
  assert.equal(
    h.mutations.filter((mutation) => mutation.type === "update").length,
    0,
  );
  assert.equal(h.rpcs.length, 2);
});

test("combined registration applies edited identity once before retrying placement", async () => {
  const h = harness();
  const changedIdentity = { ...identity, major: "Teknik Elektronika" };
  const result = await h.registerAlumniWithPlacement(alumniId, {
    identity: changedIdentity,
    placement,
  });
  assert.equal(result.success, true);
  assert.deepEqual(h.mutations, [
    { table: "alumni", type: "update", value: changedIdentity },
  ]);
  assert.equal(h.rpcs.length, 1);
});

test("combined registration remains staff-only and rejects incomplete placement data", async () => {
  for (const role of ["admin_dinas", "viewer_dinas"]) {
    const h = harness({ role });
    const result = await h.registerAlumniWithPlacement(null, {
      identity,
      placement,
    });
    assert.equal(result.success, false);
    assert.equal(h.mutations.length, 0);
    assert.equal(h.rpcs.length, 0);
  }

  const invalid = harness();
  const result = await invalid.registerAlumniWithPlacement(null, {
    identity,
    placement: { ...placement, destination_country: "Negara Fiktif" },
  });
  assert.equal(result.success, false);
  assert.equal(invalid.mutations.length, 0);
  assert.equal(invalid.rpcs.length, 0);
});

test("registration UI keeps both steps on one route and uses one final save action", () => {
  const source = fs.readFileSync(
    path.join(root, "components/alumni/alumni-registration-form.tsx"),
    "utf8",
  );
  assert.match(source, /Identitas Alumni/);
  assert.match(source, /Penempatan Awal/);
  assert.match(source, /Ringkasan Input/);
  assert.match(source, /name="placement\.destination_country"/);
  assert.match(source, /registerAlumniWithPlacement/);
  assert.match(source, /Simpan Alumni/);
  assert.match(
    source,
    /max-w-\[36\.25rem\] grid-cols-\[max-content_minmax\(0,1fr\)_max-content\]/,
  );
  assert.match(source, /className="flex h-12 items-center"/);
  assert.match(source, /h-\[3px\] w-full rounded-full/);
  assert.match(source, /step === 2 \? "bg-primary\/30" : "bg-slate-200"/);
  assert.doesNotMatch(source, /justify-end gap-3/);
  assert.match(source, /initialPlacementDateFields\[status\]/);
  assert.match(
    source,
    /clearErrors\(\);\s+const parsed = alumniSchema\.safeParse/,
  );
  assert.match(source, /validateDestinationCountry\(\)/);
  assert.match(
    source,
    /field\.onChange\(value\);\s+clearErrors\("placement\.destination_country"\)/,
  );
  assert.equal(source.match(/type="date"/g)?.length, 1);
  assert.doesNotMatch(source, /register\("placement\.employment_start"\)/);
  assert.doesNotMatch(source, /router\.replace\([^)]*new/);
});

test("placement detail editor is scoped to writable School access and keeps status immutable", () => {
  const detailSource = fs.readFileSync(
    path.join(root, "app/dashboard/alumni/[id]/page.tsx"),
    "utf8",
  );
  const editorSource = fs.readFileSync(
    path.join(root, "components/alumni/placement-editor.tsx"),
    "utf8",
  );
  assert.match(
    detailSource,
    /access\.canWrite && \([\s\S]*<PlacementEditor placement=\{placement\}/,
  );
  assert.match(editorSource, /Edit penempatan/);
  assert.match(editorSource, /Status tetap \{statusLabels\[status\]\}/);
  assert.match(editorSource, /updatePlacementDetails\(values\)/);
  assert.doesNotMatch(editorSource, /<select[^>]+expected_status/);
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
      searchParams: Promise.resolve({}),
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
      searchParams: Promise.resolve({}),
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
    await h.page("app/dashboard/alumni/new/page.tsx")({
      searchParams: Promise.resolve({}),
    });
    assert.equal(
      h.calls.some((call) => call.table === "alumni"),
      false,
    );
  }
});
