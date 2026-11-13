// Real Data Murid Aktif page/components in a browser with fictional server boundaries.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
if (!process.env.RECOVERY_UI_TEST_DEPS)
  throw Error("Set RECOVERY_UI_TEST_DEPS to the isolated Playwright installation");
const dependency = createRequire(
  path.join(process.env.RECOVERY_UI_TEST_DEPS, "package.json"),
);
const project = createRequire(path.join(root, "package.json"));
const { build } = dependency("esbuild");
const { chromium } = dependency("playwright");
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "active-students-ui-"));

const fixture = `
export const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
export const school={id:id(11),name:'SMK Fiktif Nusantara',npsn:'00000011'};
export const students=[
 {id:id(101),school_id:school.id,full_name:'Ayu Fiktif',skill_concentration:'Kuliner',grade:10,kjp_status:true,parent_consent:true,parent_consent_at:'2026-11-10T01:00:00Z',parent_consent_by:id(3),training_status:'aktif_pelatihan',provider_name:'LKP Fiktif',placement_status:'belum',placement_country:null,placement_date:null,data_year:2026,created_at:'2026-11-10T01:00:00Z',updated_at:'2026-11-10T01:00:00Z',schools:{name:school.name,npsn:school.npsn}},
 {id:id(102),school_id:id(12),full_name:'Bima Fiktif',skill_concentration:'Teknik Kendaraan Ringan',grade:12,kjp_status:null,parent_consent:true,parent_consent_at:'2025-11-10T01:00:00Z',parent_consent_by:id(4),training_status:'selesai_pelatihan',provider_name:'P3MI Fiktif',placement_status:'sudah',placement_country:'Jepang',placement_date:'2026-10-20',data_year:2025,created_at:'2025-11-10T01:00:00Z',updated_at:'2026-11-09T01:00:00Z',schools:{name:'SMK Fiktif Kedua',npsn:'00000012'}}
];
const db={from(){let rows=[school];const q={select(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},async maybeSingle(){return {data:rows[0]??null,error:null}}};return q}};
export async function access(){return {allowed:true,canWrite:window.fixture.staff,role:window.fixture.staff?'petugas_sekolah':'admin_dinas',userId:id(3),schoolId:window.fixture.staff?school.id:null,schoolName:window.fixture.staff?school.name:null,fullName:'Pengguna Fiktif',supabase:db}}
`;

const mocks = {
  "fixture:data": fixture,
  "server-only": "",
  "next/link": `import React from 'react';export default function Link(props){return <a {...props}/>} `,
  "next/navigation": `export const useRouter=()=>({push(value){window.fixture.destination=value},replace(value){window.fixture.destination=value},refresh(){window.fixture.refreshes++}});export const usePathname=()=>'/dashboard/murid-aktif';export function redirect(value){throw Error('Unexpected redirect '+value)}`,
  "@/lib/auth/access": `export {access as requireAccess} from 'fixture:data'`,
  "@/lib/active-students/data": `import {students} from 'fixture:data';export async function loadActiveStudents(access){if(window.fixture.empty)return [];return access.canWrite?students.filter(student=>student.school_id===access.schoolId):students}`,
  "@/app/dashboard/murid-aktif/actions": `
    export async function saveActiveStudent(id,input){window.fixture.saves++;window.fixture.lastSave={id,input};await new Promise(resolve=>setTimeout(resolve,80));return {success:true,id:id??'new-id',message:id?'Data murid berhasil diperbarui.':'Data murid berhasil ditambahkan.'}}
    export async function deleteActiveStudent(id){window.fixture.deletes++;await new Promise(resolve=>setTimeout(resolve,500));return {success:true,id,message:'Data murid dihapus permanen.'}}
    export async function getActiveStudentHistory(id){await new Promise(resolve=>setTimeout(resolve,40));return {success:true,history:[{id:'history-1',student_id:id,change_type:'training_status',old_value:null,new_value:'aktif_pelatihan',changed_by:null,changed_by_name:'Petugas Fiktif',changed_at:'2026-11-10T01:00:00Z'}]}}
  `,
};

const compiled = await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      import React from 'react';import {createRoot} from 'react-dom/client';
      import ActiveStudentsPage from './app/dashboard/murid-aktif/page';
      import {StudentRegistrationForm} from './components/active-students/student-registration-form';
      import {school} from 'fixture:data';
      import {ToastProvider} from './components/ui/toast';
      const query=new URL(location.href).searchParams;
      window.fixture={staff:query.has('staff'),empty:query.has('empty'),saves:0,deletes:0,lastSave:null,refreshes:0,destination:null};
      async function start(){const content=query.has('new')?<div className="mx-auto w-full max-w-[90rem]"><h1 className="type-page-title">Tambah Murid Aktif</h1><p className="mt-2 text-sm">Lengkapi identitas, pelatihan, dan penempatan dalam dua langkah.</p><div className="mt-6"><StudentRegistrationForm school={school}/></div></div>:await ActiveStudentsPage({searchParams:Promise.resolve({})});createRoot(document.getElementById('root')).render(<ToastProvider>{content}<p className="sr-only">Fixture browser dengan data fiktif</p></ToastProvider>)}start();
    `,
    loader: "tsx",
    resolveDir: root,
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  plugins: [
    {
      name: "active-students-fixture",
      setup(builder) {
        builder.onResolve(
          { filter: /^(fixture:|server-only|next\/|@\/)/ },
          (args) => {
            if (args.path in mocks) return { path: args.path, namespace: "mock" };
            if (args.path.startsWith("@/")) {
              for (const suffix of [".tsx", ".ts", "/index.ts"])
                if (fs.existsSync(path.join(root, args.path.slice(2) + suffix)))
                  return { path: path.join(root, args.path.slice(2) + suffix) };
            }
          },
        );
        builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
          contents: mocks[args.path],
          loader: "tsx",
          resolveDir: root,
        }));
      },
    },
  ],
});

const css = await project("postcss")([
  project("tailwindcss")({
    ...project("./tailwind.config.ts").default,
    content: [
      path.join(root, "app/dashboard/murid-aktif/**/*.tsx"),
      path.join(root, "components/active-students/**/*.tsx"),
      path.join(root, "components/ui/**/*.tsx"),
      path.join(root, "components/data/**/*.tsx"),
      path.join(root, "components/alumni/country-combobox.tsx"),
    ],
  }),
]).process(fs.readFileSync(path.join(root, "app/globals.css"), "utf8"), {
  from: undefined,
});

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://fixture");
  response.setHeader("Cache-Control", "no-store");
  if (url.pathname === "/fixture.js") {
    response.setHeader("Content-Type", "application/javascript");
    response.end(compiled.outputFiles[0].text);
    return;
  }
  if (url.pathname === "/fixture.css") {
    response.setHeader("Content-Type", "text/css");
    response.end(
      `:root{--font-inter:Inter,Arial,sans-serif;--font-plus-jakarta:'Plus Jakarta Sans',Arial,sans-serif}\n${css.css}`,
    );
    return;
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end("<!doctype html><html lang='id'><meta name='viewport' content='width=device-width,initial-scale=1'><link rel='stylesheet' href='/fixture.css'><body class='bg-background'><main class='p-4 sm:p-6'><div id='root'></div></main><script src='/fixture.js'></script></body></html>");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [390, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/?staff=1`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Data Murid Aktif" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Tambah Murid" }).count(), 1);
    assert.equal(await page.getByText("Bima Fiktif", { exact: true }).count(), 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      `staff page must not overflow at ${width}px`,
    );
    assert.deepEqual(errors, [], `staff browser errors at ${width}px`);
    await page.screenshot({ path: path.join(artifacts, `staff-${width}.png`), fullPage: true });
    await page.close();

    const formPage = await browser.newPage({ viewport: { width, height: 900 } });
    const formErrors = [];
    formPage.on("console", (message) => {
      if (message.type() === "error") formErrors.push(message.text());
    });
    formPage.on("pageerror", (error) => formErrors.push(error.message));
    await formPage.goto(`${base}/?staff=1&new=1`, { waitUntil: "networkidle" });
    await formPage.getByRole("heading", { name: "Tambah Murid Aktif" }).waitFor();
    assert.equal(await formPage.getByRole("heading", { name: "Ringkasan Input" }).count(), 1);
    assert.equal(
      await formPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      `active-student form must not overflow at ${width}px`,
    );
    assert.deepEqual(formErrors, [], `active-student form browser errors at ${width}px`);
    await formPage.screenshot({ path: path.join(artifacts, `form-${width}.png`), fullPage: true });
    await formPage.close();

    const admin = await browser.newPage({ viewport: { width, height: 900 } });
    const adminErrors = [];
    admin.on("console", (message) => {
      if (message.type() === "error") adminErrors.push(message.text());
    });
    admin.on("pageerror", (error) => adminErrors.push(error.message));
    await admin.goto(base, { waitUntil: "networkidle" });
    await admin.getByRole("heading", { name: "Monitoring Murid Aktif" }).waitFor();
    assert.equal(await admin.getByRole("link", { name: "Tambah Murid" }).count(), 0);
    assert.equal(await admin.getByRole("button", { name: /^Edit /u }).count(), 0);
    assert.equal(await admin.getByRole("button", { name: /^Hapus/u }).count(), 0);
    assert.equal(await admin.getByText("Distribusi Status Pelatihan").count(), 1);
    assert.equal(
      await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      `admin page must not overflow at ${width}px`,
    );
    assert.deepEqual(adminErrors, [], `admin browser errors at ${width}px`);
    await admin.screenshot({ path: path.join(artifacts, `admin-${width}.png`), fullPage: true });
    await admin.close();
    console.log(`PASS Data Murid Aktif staff/admin responsive at ${width}px`);
  }

  const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
  await page.goto(`${base}/?staff=1&new=1`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Tambah Murid Aktif" }).waitFor();
  await page.getByRole("button", { name: "Lanjut ke pelatihan" }).click();
  await page.getByText("Nama murid wajib diisi.").waitFor();
  await page.getByLabel("Nama murid (wajib)").fill("Citra Fiktif");
  await page.getByLabel("Konsentrasi keahlian (wajib)").fill("Desain Komunikasi Visual");
  await page.getByRole("button", { name: "Lanjut ke pelatihan" }).click();
  await page.getByRole("heading", { name: "Pelatihan dan Penempatan" }).waitFor();
  await page.getByRole("button", { name: "Simpan Murid", exact: true }).click();
  await page.getByText("Persetujuan orang tua/wali wajib dikonfirmasi.").waitFor();
  await page.getByLabel(/Saya menyatakan/u).check();
  await page.getByLabel("Sudah mendapat penempatan? (wajib)").selectOption("sudah");
  const country = page.getByRole("combobox", { name: "Negara penempatan", exact: true });
  await country.click();
  await page.getByPlaceholder("Cari negara...").fill("Jepang");
  await page.getByRole("option", { name: "Jepang", exact: true }).click();
  await country.getByText("Jepang", { exact: true }).waitFor();
  await page.getByLabel("Tanggal penempatan (wajib)").fill("2026-11-12");
  await page.getByLabel("Sudah mendapat penempatan? (wajib)").selectOption("belum");
  assert.equal(
    await page.getByRole("combobox", { name: "Negara penempatan", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Simpan Murid", exact: true }).click();
  assert.equal(await page.evaluate(() => window.fixture.saves), 1);
  assert.equal(
    await page.evaluate(() => window.fixture.lastSave.input.placement_country),
    "",
  );
  assert.equal(await page.evaluate(() => window.fixture.lastSave.input.placement_date), "");
  await page.waitForFunction(() => window.fixture.destination === "/dashboard/murid-aktif");
  assert.equal(await page.evaluate(() => window.fixture.destination), "/dashboard/murid-aktif");

  await page.goto(`${base}/?staff=1`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Detail Ayu Fiktif" }).click();
  const detail = page.getByRole("dialog", { name: "Ayu Fiktif" });
  await detail.getByRole("heading", { name: "Riwayat perubahan", exact: true }).waitFor();
  await detail.getByText("Petugas Fiktif").waitFor();
  await detail.getByRole("button", { name: "Tutup", exact: true }).click();

  await page.getByRole("button", { name: "Edit Ayu Fiktif" }).click();
  const edit = page.getByRole("dialog", { name: "Edit data murid" });
  assert.equal(await edit.getByLabel("Tahun Pendataan (wajib)").getAttribute("readonly"), "");
  await edit.getByRole("button", { name: "Batal" }).click();

  await page.getByRole("button", { name: "Hapus permanen Ayu Fiktif" }).click();
  const deletion = page.getByRole("dialog", { name: "Hapus data murid permanen?" });
  const confirm = deletion.getByRole("button", { name: "Hapus Permanen" });
  await confirm.click();
  const deleting = deletion.getByRole("button", { name: "Menghapus..." });
  await deleting.waitFor({ timeout: 1_000 });
  assert.equal(await deleting.isDisabled(), true);
  await page.getByText("Data murid dihapus permanen.", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.fixture.deletes), 1);
  console.log("PASS Data Murid Aktif two-step add, conditional fields, detail, immutable year and guarded delete");
  console.log(`Browser artifacts: ${artifacts}`);
  await page.close();
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

