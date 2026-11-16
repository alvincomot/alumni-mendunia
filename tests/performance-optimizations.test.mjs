import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dependency = createRequire(import.meta.url);
const firstPlacement = "00000000-0000-4000-8000-000000000001";
const secondPlacement = "00000000-0000-4000-8000-000000000002";

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

const { z } = dependency("zod");
const historyEntrySchema = z.object({
  id: z.string().uuid(),
  placement_id: z.string().uuid(),
  old_status: z.string().nullable(),
  new_status: z.string(),
  changed_by_name: z.string().nullable(),
  note: z.string().nullable(),
  changed_at: z.string(),
});
const histories = load("lib/alumni/history.ts", {
  "server-only": {},
  "./status": { historyEntrySchema },
});
const schoolAuth = load("lib/auth/school-auth.ts");
const schoolAccounts = load("lib/schools/accounts.ts", {
  "server-only": {},
  "@/lib/auth/school-auth": schoolAuth,
});

function historyEntry(id, placementId, changedAt) {
  return {
    id,
    placement_id: placementId,
    old_status: null,
    new_status: "persiapan_berangkat",
    changed_by_name: "Petugas Fiktif",
    note: null,
    changed_at: changedAt,
  };
}

test("placement histories use one batch RPC and group chronologically", async () => {
  const calls = [];
  const result = await histories.getPlacementHistories(
    {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return {
          data: [
            historyEntry(
              "00000000-0000-4000-8000-000000000012",
              firstPlacement,
              "2026-11-02T00:00:00Z",
            ),
            historyEntry(
              "00000000-0000-4000-8000-000000000011",
              firstPlacement,
              "2026-11-01T00:00:00Z",
            ),
            historyEntry(
              "00000000-0000-4000-8000-000000000013",
              secondPlacement,
              "2026-11-03T00:00:00Z",
            ),
          ],
          error: null,
        };
      },
    },
    [firstPlacement, secondPlacement, firstPlacement],
  );
  assert.deepEqual(calls, [
    {
      name: "get_status_histories",
      args: { p_placement_ids: [firstPlacement, secondPlacement] },
    },
  ]);
  assert.equal(result.get(firstPlacement).entries.length, 2);
  assert.equal(
    result.get(firstPlacement).entries[0].changed_at,
    "2026-11-01T00:00:00Z",
  );
  assert.equal(result.get(secondPlacement).error, false);
});

test("placement histories preserve compatibility before the batch migration", async () => {
  const calls = [];
  const result = await histories.getPlacementHistories(
    {
      rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === "get_status_histories")
          return { data: null, error: { code: "PGRST202" } };
        return { data: [], error: null };
      },
    },
    [firstPlacement, secondPlacement],
  );
  assert.equal(calls.filter((call) => call.name === "get_status_history").length, 2);
  assert.equal(result.get(firstPlacement).error, false);
  assert.equal(result.get(secondPlacement).error, false);
});

test("school account statuses use one admin-authorized batch RPC", async () => {
  const schools = [
    {
      id: "00000000-0000-4000-8000-000000000021",
      npsn: "00000021",
    },
    {
      id: "00000000-0000-4000-8000-000000000022",
      npsn: "00000022",
    },
  ];
  const calls = [];
  const result = await schoolAccounts.readSchoolAccountStatuses(
    {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return {
          data: [{ school_id: schools[0].id, status: "ACTIVE" }],
          error: null,
        };
      },
    },
    schools,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "get_school_auth_statuses");
  assert.equal(result.get(schools[0].id), "ACTIVE");
  assert.equal(result.get(schools[1].id), null);
});

test("data loaders paginate visible rows and keep full export isolated", () => {
  const activeStudents = source("lib/active-students/data.ts");
  const monitoring = source("lib/monitoring/data.ts");
  const reportPage = source("app/dashboard/reports/page.tsx");
  const exportRoute = source("app/dashboard/reports/export/route.ts");
  assert.match(activeStudents, /get_active_student_overview/u);
  assert.match(activeStudents, /\.range\(\(page - 1\) \* pageSize/u);
  assert.match(monitoring, /loadMonitoringOverview/u);
  assert.match(monitoring, /loadMonitoringPage/u);
  assert.match(reportPage, /Promise\.all\(\[/u);
  assert.match(reportPage, /pageResult\.rows\.map\(reportValues\)/u);
  assert.match(exportRoute, /loadMonitoring\(access\)/u);
});

test("batch migration keeps authorization and RLS boundaries explicit", () => {
  const migration = source(
    "supabase/migrations/20261116000100_batch_read_performance.sql",
  );
  assert.match(migration, /can_read_placement\(requested\.id\)/u);
  assert.match(migration, /is_admin\(\) IS DISTINCT FROM TRUE/u);
  assert.match(
    migration,
    /get_active_student_overview[\s\S]*SECURITY INVOKER/u,
  );
  assert.match(migration, /cardinality\(p_placement_ids\) > 100/u);
  assert.match(migration, /REVOKE EXECUTE[\s\S]*FROM PUBLIC, anon, authenticated/u);
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO authenticated/u);
});

test("active student overview no longer builds per-school monitoring rows", () => {
  const migration = source(
    "supabase/migrations/20261116000200_remove_active_student_school_monitoring.sql",
  );
  const dataLoader = source("lib/active-students/data.ts");
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_active_student_overview/u);
  assert.match(migration, /SECURITY INVOKER/u);
  assert.doesNotMatch(migration, /school_groups|'by_school'/u);
  assert.doesNotMatch(dataLoader, /by_school|bySchool/u);
});
