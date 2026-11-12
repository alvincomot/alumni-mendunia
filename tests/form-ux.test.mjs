import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const loadDependency = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function load(relativePath, mocks = {}) {
  const compiled = ts.transpileModule(source(relativePath), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => (name in mocks ? mocks[name] : loadDependency(name)),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

test("user-chosen passwords require only eight characters and matching confirmation", () => {
  const { passwordChangeSchema } = load("lib/auth/password-change.ts");
  for (const password of ["abcdefgh", "12345678", "!!!!!!!!", "kata sandi panjang"])
    assert.equal(
      passwordChangeSchema.safeParse({ password, confirmation: password }).success,
      true,
    );

  const short = passwordChangeSchema.safeParse({
    password: "1234567",
    confirmation: "1234567",
  });
  assert.equal(short.success, false);
  assert.match(short.error.issues[0].message, /minimal 8 karakter/);

  const mismatch = passwordChangeSchema.safeParse({
    password: "abcdefgh",
    confirmation: "abcdefgi",
  });
  assert.equal(mismatch.success, false);
  assert.match(
    mismatch.error.issues.find((issue) => issue.path[0] === "confirmation")
      .message,
    /tidak cocok/,
  );
});

test("password fields share an accessible show and hide control without native length validation", () => {
  const passwordInput = source("components/ui/password-input.tsx");
  const login = source("components/login-form.tsx");
  const schoolLogin = source("components/school-login-form.tsx");
  const update = source("components/update-password-form.tsx");
  const recovery = source("components/forgot-password-form.tsx");

  assert.match(passwordInput, /type=\{visible \? "text" : "password"\}/);
  assert.match(passwordInput, /type="button"/);
  assert.match(passwordInput, /Tampilkan kata sandi/);
  assert.match(passwordInput, /Sembunyikan kata sandi/);
  assert.match(passwordInput, /focus-within:ring-2/);
  assert.match(passwordInput, /focus-visible:ring-0/);
  assert.match(passwordInput, /hover:text-foreground/);
  assert.doesNotMatch(passwordInput, /hover:bg-secondary/);
  assert.doesNotMatch(passwordInput, /focus-visible:ring-inset/);
  assert.match(login, /<PasswordInput/);
  assert.match(schoolLogin, /<PasswordInput/);
  assert.match(update, /<PasswordInput/g);
  assert.match(login, /noValidate/);
  assert.match(update, /noValidate/);
  assert.match(recovery, /recoveryEmailSchema\.safeParse/);
  assert.match(recovery, /noValidate/);
  assert.doesNotMatch(update, /minLength=|pattern=/);
  assert.match(update, /Gunakan minimal 8 karakter\./);
});

test("routine dashboard pages hide redundant headers while monitoring keeps its operational title", () => {
  const pages = [
    "app/dashboard/page.tsx",
    "app/dashboard/alumni/page.tsx",
    "app/dashboard/schools/page.tsx",
    "app/dashboard/users/page.tsx",
    "app/dashboard/reports/page.tsx",
  ].map(source);
  const monitoring = source("app/dashboard/monitoring/page.tsx");
  const users = source("app/dashboard/users/page.tsx");
  const reports = source("app/dashboard/reports/page.tsx");

  for (const page of pages) assert.match(page, /<h1 className="sr-only">/);
  assert.match(monitoring, /<h1 className="type-page-title text-primary">Monitoring Sistem<\/h1>/);
  assert.doesNotMatch(monitoring, /<h1 className="sr-only">Monitoring Sistem<\/h1>/);
  assert.match(users, /<Filters[\s\S]*inlineActions/);
  assert.doesNotMatch(reports, /MonitoringFilterForm|parseFilters|filterRows/);
  assert.match(reports, /href="\/dashboard\/reports\/export"/);
  assert.match(reports, /params=\{\{\}\}/);
});

test("routine dialogs close only after confirmed success and use concise toasts", () => {
  const school = source("components/schools/school-dialog.tsx");
  const user = source("components/users/user-dialog.tsx");

  assert.match(
    school,
    /if \(response\.success\)[\s\S]*Sekolah berhasil ditambahkan\.[\s\S]*dialog\.current\?\.close\(\)/,
  );
  assert.match(school, /else \{\s*setResult\(response\)/);
  assert.match(school, /reset\(\{ npsn: "", name: "", city: "" \}\)/);
  assert.match(
    user,
    /if \(response\.success\)[\s\S]*Profil pengguna berhasil diperbarui\.[\s\S]*dialog\.current\?\.close\(\)/,
  );
  assert.match(user, /else \{\s*setResult\(response\)/);
  assert.match(user, /noValidate/);
});

test("toast provider is global, timed and dismissible; school details contain no issued credentials", () => {
  const layout = source("app/layout.tsx");
  const toast = source("components/ui/toast.tsx");
  const account = source("components/schools/school-account-dialog.tsx");

  assert.match(layout, /<ToastProvider>\{children\}<\/ToastProvider>/);
  assert.match(toast, /duration: options\.duration \?\? 4000/);
  assert.match(toast, /Tutup notifikasi/);
  assert.match(toast, /ToastPrimitive\.Viewport/);
  assert.match(account, /Detail Akun Sekolah/);
  assert.doesNotMatch(account, /temporaryPassword|setCredentials|Saya sudah menyimpan kredensial/);
});

test("alumni saves use toast feedback without a stale success query parameter", () => {
  const registration = source("components/alumni/alumni-registration-form.tsx");
  const edit = source("components/alumni/alumni-form.tsx");
  const detail = source("app/dashboard/alumni/[id]/page.tsx");

  assert.match(registration, /toast\("Alumni berhasil ditambahkan\.",/);
  assert.match(registration, /reset\(createDefaultValues\(\)\)/);
  assert.doesNotMatch(registration, /registered=1/);
  assert.match(edit, /Data alumni berhasil diperbarui\./);
  assert.doesNotMatch(detail, /justRegistered|registered\?:/);
});

test("design guidance documents routine success and security-sensitive exceptions", () => {
  const design = source("DESIGN.md");
  assert.match(design, /Dialog untuk penyimpanan rutin harus menutup otomatis/);
  assert.match(design, /Kata sandi pilihan pengguna minimal 8 karakter/);
  assert.match(design, /Penyerahan kredensial sekali lihat/);
});
