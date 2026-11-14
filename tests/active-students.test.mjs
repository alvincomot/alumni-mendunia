import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dependency = createRequire(import.meta.url);

function source(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function load(file, mocks = {}) {
  const compiled = ts.transpileModule(source(file), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => (name in mocks ? mocks[name] : dependency(name)),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

const countries = load("lib/countries.ts");
const schema = load("lib/active-students/schema.ts", {
  "@/lib/countries": countries,
});
const model = load("lib/active-students/model.ts", {
  "./schema": schema,
});

const valid = {
  full_name: "Murid Fiktif",
  skill_concentration: "Teknik Kendaraan Ringan",
  grade: 11,
  kjp_status: "ya",
  parent_consent: true,
  training_status: "aktif_pelatihan",
  provider_name: "LKP Fiktif",
  placement_status: "sudah",
  placement_country: "Jepang",
  placement_date: "2026-11-10",
  data_year: 2026,
};

test("active student validation requires parent consent and exact status values", () => {
  assert.equal(schema.activeStudentFormSchema.safeParse(valid).success, true);
  assert.equal(
    schema.activeStudentFormSchema.safeParse({ ...valid, kjp_status: "" })
      .success,
    false,
  );
  assert.equal(
    schema.activeStudentFormSchema.safeParse({ ...valid, provider_name: "" })
      .success,
    false,
  );
  assert.equal(
    schema.activeStudentFormSchema.safeParse({ ...valid, parent_consent: false })
      .success,
    false,
  );
  for (const training_status of ["pelatihan", "selesai", "aktif_bekerja", ""])
    assert.equal(
      schema.activeStudentFormSchema.safeParse({ ...valid, training_status })
        .success,
      false,
    );
  for (const grade of [9, 14, 11.5])
    assert.equal(
      schema.activeStudentFormSchema.safeParse({ ...valid, grade }).success,
      false,
    );
});

test("placement rules require country and date, then clear both when set to Belum", () => {
  for (const values of [
    { placement_country: "" },
    { placement_date: "" },
    { placement_country: "Negara Buatan" },
  ])
    assert.equal(
      schema.activeStudentFormSchema.safeParse({ ...valid, ...values }).success,
      false,
    );

  const parsed = schema.activeStudentFormSchema.parse({
    ...valid,
    placement_status: "belum",
  });
  assert.equal(parsed.placement_country, null);
  assert.equal(parsed.placement_date, null);
});

test("filters and statistics use the selected year, school and current statuses", () => {
  const rows = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      school_id: "00000000-0000-4000-8000-000000000011",
      full_name: "Ayu Fiktif",
      skill_concentration: "Kuliner",
      grade: 10,
      kjp_status: null,
      parent_consent: true,
      parent_consent_at: "2026-11-10T00:00:00Z",
      parent_consent_by: "00000000-0000-4000-8000-000000000003",
      training_status: "aktif_pelatihan",
      provider_name: null,
      placement_status: "belum",
      placement_country: null,
      placement_date: null,
      data_year: 2026,
      created_at: "2026-11-10T00:00:00Z",
      updated_at: "2026-11-10T00:00:00Z",
      schools: { name: "SMK Fiktif A", npsn: "00000011" },
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      school_id: "00000000-0000-4000-8000-000000000012",
      full_name: "Bima Fiktif",
      skill_concentration: "Teknik",
      grade: 12,
      kjp_status: false,
      parent_consent: true,
      parent_consent_at: "2025-11-10T00:00:00Z",
      parent_consent_by: "00000000-0000-4000-8000-000000000004",
      training_status: "selesai_pelatihan",
      provider_name: "LKP Fiktif",
      placement_status: "sudah",
      placement_country: "Jepang",
      placement_date: "2025-11-10",
      data_year: 2025,
      created_at: "2025-11-10T00:00:00Z",
      updated_at: "2025-11-10T00:00:00Z",
      schools: { name: "SMK Fiktif B", npsn: "00000012" },
    },
  ];
  const filters = model.parseActiveStudentFilters({ year: "2026" });
  const filtered = model.filterActiveStudents(rows, filters);
  assert.deepEqual(filtered.map((row) => row.full_name), ["Ayu Fiktif"]);
  const summary = model.activeStudentSummary(filtered);
  assert.equal(summary.total, 1);
  assert.equal(summary.schools.size, 1);
  assert.equal(summary.training.aktif_pelatihan, 1);
  assert.equal(summary.placed, 0);
});

test("statistics recalculate after add, status edit and permanent removal", () => {
  const base = {
    id: "00000000-0000-4000-8000-000000000001",
    school_id: "00000000-0000-4000-8000-000000000011",
    full_name: "Ayu Fiktif",
    skill_concentration: "Kuliner",
    grade: 10,
    kjp_status: null,
    parent_consent: true,
    parent_consent_at: "2026-11-10T00:00:00Z",
    parent_consent_by: "00000000-0000-4000-8000-000000000003",
    training_status: "belum_pelatihan",
    provider_name: null,
    placement_status: "belum",
    placement_country: null,
    placement_date: null,
    data_year: 2026,
    created_at: "2026-11-10T00:00:00Z",
    updated_at: "2026-11-10T00:00:00Z",
    schools: { name: "SMK Fiktif A", npsn: "00000011" },
  };
  assert.equal(model.activeStudentSummary([]).total, 0);
  assert.equal(model.activeStudentSummary([base]).training.belum_pelatihan, 1);
  const edited = {
    ...base,
    training_status: "selesai_pelatihan",
    placement_status: "sudah",
    placement_country: "Jepang",
    placement_date: "2026-11-10",
  };
  const editedSummary = model.activeStudentSummary([edited]);
  assert.equal(editedSummary.training.selesai_pelatihan, 1);
  assert.equal(editedSummary.placed, 1);
  assert.equal(model.activeStudentSummary([edited].filter(() => false)).total, 0);
});

test("server actions derive authorization from access and use guarded hard delete RPC", () => {
  const actions = source("app/dashboard/murid-aktif/actions.ts");
  assert.match(actions, /!access\.canWrite \|\| !access\.schoolId/u);
  assert.match(actions, /\.eq\("school_id", access\.schoolId\)/u);
  assert.match(actions, /\.eq\("data_year", dataYear\)/u);
  assert.match(actions, /\.eq\("updated_at", expectedUpdatedAt/u);
  assert.match(actions, /\.update\(values, \{ count: "exact" \}\)/u);
  assert.match(actions, /active_student_histories/u);
  assert.match(actions, /"delete_active_student"/u);
  assert.doesNotMatch(actions, /service_role|createAdminClient/u);
});

test("dashboard summary counts only the authenticated petugas school", async () => {
  const schoolA = "00000000-0000-4000-8000-000000000011";
  const schoolB = "00000000-0000-4000-8000-000000000012";
  const rows = [
    {
      school_id: schoolA,
      training_status: "aktif_pelatihan",
      placement_status: "belum",
    },
    {
      school_id: schoolA,
      training_status: "selesai_pelatihan",
      placement_status: "sudah",
    },
    {
      school_id: schoolA,
      training_status: "belum_pelatihan",
      placement_status: "belum",
    },
    {
      school_id: schoolB,
      training_status: "aktif_pelatihan",
      placement_status: "sudah",
    },
  ];
  const calls = [];
  const supabase = {
    from(table) {
      assert.equal(table, "active_students");
      const filters = [];
      const query = {
        select(columns, options) {
          assert.equal(columns, "id");
          assert.deepEqual(options, { count: "exact", head: true });
          return query;
        },
        eq(column, value) {
          filters.push([column, value]);
          return query;
        },
        then(resolve) {
          calls.push(filters);
          const count = rows.filter((row) =>
            filters.every(([column, value]) => row[column] === value),
          ).length;
          return Promise.resolve({ count, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  const data = load("lib/active-students/data.ts", {
    "server-only": {},
    "@/lib/data/read-all": { readAllRows() {} },
    "./model": { activeStudentRowsSchema: { parse: (value) => value } },
  });
  const access = { canWrite: true, schoolId: schoolA, supabase };

  assert.deepEqual(await data.loadActiveStudentDashboardSummary(access), {
    total: 3,
    activeTraining: 1,
    completedTraining: 1,
    placed: 1,
  });
  assert.equal(calls.length, 4);
  assert.equal(
    calls.every((filters) =>
      filters.some(
        ([column, value]) => column === "school_id" && value === schoolA,
      ),
    ),
    true,
  );

  rows.splice(0, 1);
  assert.deepEqual(await data.loadActiveStudentDashboardSummary(access), {
    total: 2,
    activeTraining: 0,
    completedTraining: 1,
    placed: 1,
  });
  await assert.rejects(
    () =>
      data.loadActiveStudentDashboardSummary({
        canWrite: false,
        schoolId: schoolA,
        supabase,
      }),
    /School-scoped active student access unavailable/u,
  );
});

test("edit action accepts one guarded update and rejects a stale update", async () => {
  let count = 1;
  let updateCalls = 0;
  const updateQuery = {
    eq() {
      return this;
    },
    then(resolve) {
      resolve({ data: null, error: null, count });
    },
  };
  const supabase = {
    from(table) {
      assert.equal(table, "active_students");
      return {
        update(values, options) {
          updateCalls++;
          assert.equal(values.full_name, "Murid Fiktif Diperbarui");
          assert.deepEqual(options, { count: "exact" });
          return updateQuery;
        },
      };
    },
  };
  const actions = load("app/dashboard/murid-aktif/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/alumni/access": {
      async getAlumniAccess() {
        return {
          allowed: true,
          canWrite: true,
          schoolId: "00000000-0000-4000-8000-000000000011",
          userId: "00000000-0000-4000-8000-000000000003",
          fullName: "Petugas Fiktif",
          supabase,
        };
      },
    },
    "@/lib/active-students/schema": schema,
  });
  const input = {
    ...valid,
    full_name: "Murid Fiktif Diperbarui",
    expected_updated_at: "2026-11-13T01:32:00.622173+00:00",
  };
  const id = "00000000-0000-4000-8000-000000000101";
  assert.deepEqual(await actions.saveActiveStudent(id, input), {
    success: true,
    id,
    message: "Data murid berhasil diperbarui.",
  });
  count = 0;
  assert.deepEqual(await actions.saveActiveStudent(id, input), {
    success: false,
    refresh: true,
    message:
      "Data sudah berubah atau Tahun Pendataan tidak cocok. Muat ulang sebelum mengedit kembali.",
  });
  assert.equal(updateCalls, 2);
});

test("history action falls back to the RLS table while the broken RPC is unapplied", async () => {
  const historyQuery = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    then(resolve) {
      resolve({
        error: null,
        data: [
          {
            id: "00000000-0000-4000-8000-000000000201",
            student_id: "00000000-0000-4000-8000-000000000101",
            change_type: "training_status",
            old_value: null,
            new_value: "aktif_pelatihan",
            changed_by: "00000000-0000-4000-8000-000000000003",
            changed_at: "2026-11-13T01:32:00.622173+00:00",
          },
        ],
      });
    },
  };
  const supabase = {
    async rpc() {
      return { data: null, error: { code: "42702" } };
    },
    from(table) {
      assert.equal(table, "active_student_histories");
      return historyQuery;
    },
  };
  const actions = load("app/dashboard/murid-aktif/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/alumni/access": {
      async getAlumniAccess() {
        return {
          allowed: true,
          canWrite: true,
          schoolId: "00000000-0000-4000-8000-000000000011",
          userId: "00000000-0000-4000-8000-000000000003",
          fullName: "Petugas Fiktif",
          supabase,
        };
      },
    },
    "@/lib/active-students/schema": schema,
  });
  const result = await actions.getActiveStudentHistory(
    "00000000-0000-4000-8000-000000000101",
  );
  assert.equal(result.success, true);
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].changed_by_name, "Petugas Fiktif");
});

test("read-only Dinas UI has detail access without edit or delete actions", () => {
  const page = source("app/dashboard/murid-aktif/page.tsx");
  const actions = source("components/active-students/student-actions.tsx");
  assert.match(page, /canWrite=\{access\.canWrite\}/u);
  assert.match(actions, /<DetailDialog student=\{student\} \/>/u);
  assert.match(actions, /\{canWrite && \(/u);
  assert.match(actions, /<DeleteDialog student=\{student\} \/>/u);
  assert.match(actions, /Hapus Permanen/u);
});

test("active student creation uses the two-step registration page", () => {
  const page = source("app/dashboard/murid-aktif/page.tsx");
  const newPage = source("app/dashboard/murid-aktif/new/page.tsx");
  const form = source("components/active-students/student-registration-form.tsx");
  assert.match(page, /href="\/dashboard\/murid-aktif\/new"/u);
  assert.doesNotMatch(page, /Tahun Pendataan \$\{filters\.year/u);
  assert.match(newPage, /requireAccess\(\["petugas_sekolah"\]\)/u);
  assert.match(newPage, /<StudentRegistrationForm school=\{school\}/u);
  assert.match(form, /Identitas Murid/u);
  assert.match(form, /Pelatihan dan Penempatan/u);
  assert.match(form, /Ringkasan Input/u);
  assert.match(form, /saveActiveStudent\(null, input\)/u);
});

test("school dashboard replaces the school ranking with an active student summary", () => {
  const dashboard = source("app/dashboard/page.tsx");
  const panel = source("components/active-students/dashboard-summary.tsx");
  const actions = source("app/dashboard/murid-aktif/actions.ts");
  assert.match(dashboard, /access\.role === "petugas_sekolah"/u);
  assert.match(dashboard, /loadActiveStudentDashboardSummary\(access\)/u);
  assert.match(dashboard, /<ActiveStudentDashboardPanel/u);
  assert.match(dashboard, /title="Top SMK Pengirim"/u);
  assert.match(panel, /Ringkasan Murid Aktif/u);
  assert.match(panel, /Murid berminat ke luar negeri/u);
  assert.match(panel, /Aktif pelatihan/u);
  assert.match(panel, /Selesai pelatihan/u);
  assert.match(panel, /Sudah mendapat penempatan/u);
  assert.match(panel, /href="\/dashboard\/murid-aktif"/u);
  assert.match(panel, /Belum ada data murid aktif\./u);
  assert.match(panel, /Ringkasan murid belum dapat ditampilkan\./u);
  assert.match(actions, /revalidatePath\("\/dashboard"\)/u);
});

test("country options render inside the native active-student dialog", () => {
  const popover = source("components/ui/popover.tsx");
  const countryCombobox = source("components/alumni/country-combobox.tsx");
  const studentDialog = source("components/active-students/student-dialog.tsx");
  assert.match(popover, /Portal container=\{portalContainer\}/u);
  assert.match(countryCombobox, /portalContainer=\{portalContainer\}/u);
  assert.match(studentDialog, /portalContainer=\{dialogElement\}/u);
});

test("migration protects school scope, immutable year, history and PII-free deletion audit", () => {
  const migration = source(
    "supabase/migrations/20261112000100_active_students.sql",
  );
  assert.match(migration, /NEW\.school_id := v_school_id/u);
  assert.match(migration, /OLD\.data_year IS DISTINCT FROM NEW\.data_year/u);
  assert.match(migration, /parent_consent IS DISTINCT FROM true/u);
  assert.match(migration, /ON DELETE CASCADE/u);
  assert.match(migration, /active_students_select[\s\S]*can_read_school/u);
  assert.match(migration, /active_students_update[\s\S]*can_write_school/u);
  assert.doesNotMatch(
    migration.slice(
      migration.indexOf("CREATE FUNCTION app_private.record_active_student_audit"),
      migration.indexOf("CREATE TRIGGER active_students_audit"),
    ),
    /full_name|to_jsonb\(v_row\)|snapshot/u,
  );
});

test("forward migration requires KJP and provider and fixes qualified history lookup", () => {
  const migration = source(
    "supabase/migrations/20261113000100_require_active_student_fields_and_fix_history.sql",
  );
  assert.match(migration, /CHECK \(kjp_status IS NOT NULL\) NOT VALID/u);
  assert.match(migration, /provider_name IS NOT NULL/u);
  assert.match(migration, /WHERE student\.id = p_student_id/u);
  assert.match(migration, /WHERE history\.student_id = p_student_id/u);
});

test("navigation, audit filtering and privacy-safe monitoring recognize the new module", () => {
  const sidebar = source("components/dashboard-sidebar.tsx");
  const paths = load("lib/system-monitoring/paths.ts");
  const auditFilters = source("lib/audit/filters.ts");
  const auditPanel = source("components/monitoring/audit-log-panel.tsx");
  assert.match(sidebar, /\/dashboard\/murid-aktif/u);
  assert.equal(
    paths.normalizeMonitoredPath("/dashboard/murid-aktif"),
    "/dashboard/murid-aktif",
  );
  assert.equal(paths.monitoringPathLabels["/dashboard/murid-aktif"], "Data Murid Aktif");
  assert.match(auditFilters, /active_students/u);
  assert.match(auditPanel, /Murid sudah dihapus atau tidak tersedia/u);
});

