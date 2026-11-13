import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("every dashboard route shape has a context-specific loading boundary", () => {
  const expected = {
    "app/dashboard/loading.tsx": "DashboardSkeleton",
    "app/dashboard/alumni/loading.tsx": "TableSkeleton",
    "app/dashboard/alumni/new/loading.tsx": "FormSkeleton",
    "app/dashboard/alumni/[id]/loading.tsx": "DetailSkeleton",
    "app/dashboard/schools/loading.tsx": "TableSkeleton",
    "app/dashboard/users/loading.tsx": "TableSkeleton",
    "app/dashboard/reports/loading.tsx": "PageSkeleton",
    "app/dashboard/audit-logs/loading.tsx": "TableSkeleton",
    "app/dashboard/monitoring/loading.tsx": "PageSkeleton",
    "app/dashboard/murid-aktif/loading.tsx": "PageSkeleton",
  };

  for (const [file, component] of Object.entries(expected)) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} missing`);
    const source = read(file);
    assert.match(source, new RegExp(component));
    assert.match(source, /@\/components\/ui\/loading/);
  }
});

test("shared skeleton primitives expose accessible status and reduced motion", () => {
  const skeleton = read("components/ui/loading/skeleton.tsx");
  const indicator = read("components/ui/loading/loading-indicator.tsx");
  assert.match(skeleton, /aria-busy="true"/);
  assert.match(skeleton, /role="status"/);
  assert.match(skeleton, /aria-hidden="true"/);
  assert.match(skeleton, /motion-reduce:animate-none/);
  assert.match(indicator, /motion-reduce:animate-none/);
});

test("top-level loading states mirror compact pages without report filters", () => {
  for (const file of [
    "app/dashboard/alumni/loading.tsx",
    "app/dashboard/schools/loading.tsx",
    "app/dashboard/users/loading.tsx",
    "app/dashboard/reports/loading.tsx",
  ])
    assert.match(read(file), /showHeader=\{false\}/);

  assert.doesNotMatch(
    read("app/dashboard/monitoring/loading.tsx"),
    /showHeader=\{false\}/,
  );

  assert.doesNotMatch(
    read("app/dashboard/reports/loading.tsx"),
    /FilterSkeleton/,
  );
  assert.doesNotMatch(
    read("components/ui/loading/dashboard-skeleton.tsx"),
    /className="mb-5 flex items-start gap-3"/,
  );
});

test("role-specific loading boundaries authorize before rendering placeholders", () => {
  const expectations = [
    ["app/dashboard/alumni/new/loading.tsx", "petugas_sekolah"],
    ["app/dashboard/schools/loading.tsx", "viewer_dinas"],
    ["app/dashboard/users/loading.tsx", "admin_dinas"],
    ["app/dashboard/reports/loading.tsx", "viewer_dinas"],
    ["app/dashboard/audit-logs/loading.tsx", "admin_dinas"],
    ["app/dashboard/monitoring/loading.tsx", "admin_dinas"],
  ];
  for (const [file, role] of expectations) {
    const source = read(file);
    assert.match(source, /requireAccess/);
    assert.match(source, new RegExp(role));
  }
});

test("dashboard access is request-memoized and supplies school context once", () => {
  const access = read("lib/alumni/access.ts");
  const layout = read("app/dashboard/layout.tsx");
  const registration = read("app/dashboard/alumni/new/page.tsx");
  assert.match(access, /cache\(async function getAlumniAccess/);
  assert.match(access, /select\("is_active, name"\)/);
  assert.doesNotMatch(layout, /from\("schools"\)/);
  assert.doesNotMatch(registration, /from\("schools"\)/);
});
