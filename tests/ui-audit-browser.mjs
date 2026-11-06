// Real route/components with fictional data and mocked server boundaries only.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
if (!process.env.RECOVERY_UI_TEST_DEPS)
  throw Error(
    "Set RECOVERY_UI_TEST_DEPS to the existing isolated Playwright/esbuild installation",
  );
const dependency = createRequire(
  path.join(process.env.RECOVERY_UI_TEST_DEPS, "package.json"),
);
const project = createRequire(path.join(root, "package.json"));
const { build } = dependency("esbuild");
const { chromium } = dependency("playwright");
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "alumni-ui-audit-"));
const fixture = `
  export const id=(n)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const activePlacement=new URL(location.href).searchParams.has('active');
  export const schools=[{id:id(1),npsn:'00000001',name:'SMK Fiktif Nusantara dengan Nama Sekolah Panjang',city:'Jakarta',is_active:true},{id:id(2),npsn:'00000002',name:'SMK Fiktif Kedua',city:'Jakarta',is_active:false},{id:id(3),npsn:'00000003',name:'SMK Fiktif Belum Aktivasi',city:'Jakarta',is_active:true},{id:id(4),npsn:'00000004',name:'SMK Fiktif Menunggu Aktivasi',city:'Jakarta',is_active:true},{id:id(5),npsn:'00000005',name:'SMK Fiktif Akun Ditangguhkan',city:'Jakarta',is_active:true}];
  export const profiles=[{user_id:id(10),full_name:'Administrator Fiktif',role:'admin_dinas',school_id:null,is_active:true,must_change_password:false},{user_id:id(11),full_name:'Petugas Sekolah Fiktif',role:'petugas_sekolah',school_id:id(1),is_active:true,must_change_password:false},{user_id:id(12),full_name:'Petugas Fiktif Ditangguhkan',role:'petugas_sekolah',school_id:id(2),is_active:false,must_change_password:false},{user_id:id(13),full_name:'Petugas Fiktif Nonaktif',role:'petugas_sekolah',school_id:id(5),is_active:false,must_change_password:false}];
  export const placements=[{id:id(30),alumni_id:id(20),status:activePlacement?'aktif_bekerja':'persiapan_berangkat',destination_country:'Jepang',placement_secured:true,placement_provider_name:'LPK Fiktif',company_name:'Perusahaan Fiktif',work_sector:'Teknologi',planned_departure:activePlacement?'2030-01-15':null,actual_departure:activePlacement?'2020-01-01':null,employment_start:null,contract_end_date:null,is_current:true,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'}];
  export const alumni=[{id:id(20),school_id:id(1),full_name:'Alumni Fiktif dengan Nama Panjang untuk Pengujian',graduation_year:2025,major:'Teknik Komputer dan Jaringan',schools:{name:schools[0].name},placements}, {id:id(21),school_id:id(1),full_name:'Alumni Fiktif Kedua',graduation_year:2024,major:'Teknik Mesin',schools:{name:schools[0].name},placements:[]}];
  export const history=[{id:id(50),old_status:null,new_status:'persiapan_berangkat',changed_at:'2026-10-01T00:00:00Z',changed_by_name:'Petugas Fiktif',note:'Catatan pengujian fiktif.'}];
  const tables={schools,profiles,alumni,placements,audit_logs:[{id:id(40),actor_id:id(10),action:'UPDATE',entity_type:'schools',entity_id:id(1),occurred_at:'2026-10-01T00:00:00Z'}]};
  export const db={from(table){
    let rows=window.fixture.empty?[]:[...(tables[table]||[])],start=0,end=999;
    const chain={select(){return chain},order(){return chain},or(){return chain},gte(){return chain},lt(){return chain},
      eq(k,v){rows=rows.filter(r=>r[k]===v);return chain},in(k,vs){rows=rows.filter(r=>vs.includes(r[k]));return chain},
      range(s,e){start=s;end=e;return chain},limit(n){end=n-1;return chain},
      async maybeSingle(){return {data:rows[0]||null,error:null}},
      then(resolve){return Promise.resolve({data:rows.slice(start,end+1),count:rows.length,error:null}).then(resolve)}};return chain;
  }};
  export async function access(){return {allowed:true,role:window.fixture.staff?'petugas_sekolah':window.fixture.viewer?'viewer_dinas':'admin_dinas',fullName:'Pengguna Fiktif',userId:id(10),schoolId:id(1),schoolName:schools[0].name,canWrite:window.fixture.staff,canManage:!window.fixture.staff&&!window.fixture.viewer,supabase:db}};
`;
const mocks = {
  "fixture:data": fixture,
  "server-only": "",
  "next/navigation": `export const usePathname=()=>window.fixture.path; export const useRouter=()=>({push(u){window.fixture.destination=u},replace(u){window.fixture.destination=u},refresh(){window.fixture.refreshed=true}}); export function redirect(u){throw Error('Unexpected redirect '+u)} export function notFound(){throw Error('Unexpected not found')}`,
  "next/link": `import React from 'react';export default function Link(p){return <a {...p}/>}`,
  "@/lib/auth/access": `export {access as requireAccess} from 'fixture:data'`,
  "@/lib/schools/access": `export {access as getSchoolAccess} from 'fixture:data'`,
  "@/lib/alumni/access": `export {access as getAlumniAccess} from 'fixture:data'`,
  "@/lib/monitoring/data": `import {alumni,history} from 'fixture:data';export async function loadMonitoring(){return window.fixture.empty?[]:alumni}export async function loadRecentActivity(){return window.fixture.empty?[]:history.map(h=>({...h,placements:{alumni:alumni[0]}}))}`,
  "@/lib/alumni/history": `import {history} from 'fixture:data';export async function getPlacementHistory(){return {available:true,entries:history}}`,
  "@/lib/users/admin": `import {profiles} from 'fixture:data';export function createAdminClient(){window.fixture.adminReads++;return {async rpc(name,{p_npsn}){return {data:{name:'SMK Fiktif',npsn:p_npsn,status:({'00000001':'ACTIVE','00000002':'SUSPENDED','00000003':'UNCLAIMED','00000004':'PENDING_ACTIVATION','00000005':'SUSPENDED'})[p_npsn],retry_after:null},error:window.fixture.statusFail?{}:null}}}} export function invitationRedirect(){return 'http://fixture/auth/confirm'}export function administrationMessage(){return 'Fixture unavailable'}export async function listAuthUsers(){return profiles.map(p=>({id:p.user_id,email:p.role+'@example.test'}))}`,
  "@/lib/supabase/client": `export function createClient(){return {auth:{async signOut(){if(window.fixture.signOutFail)return {error:new Error('Fixture sign-out failure')};window.fixture.signedOut=true;return {error:null}}}}}`,
  "@/app/dashboard/schools/actions": `import {schools,profiles} from 'fixture:data';
    export async function saveSchool(){return {success:true,message:'Sekolah fiktif disimpan.'}}
    export async function changeSchoolStatus(input){window.fixture.schoolChanges.push(input);return {success:true,message:'Status sekolah fiktif diperbarui.'}}
    export async function getSchoolAccountDetails(id){
      await new Promise(resolve=>setTimeout(resolve,150));
      if(window.fixture.detailsFail)return {success:false,message:'Detail akun belum dapat dimuat.'};
      const school=schools.find(s=>s.id===id);
      return {success:true,details:{school:{...school,isActive:school.is_active},status:({'00000001':'ACTIVE','00000002':'SUSPENDED','00000003':'UNCLAIMED','00000004':'PENDING_ACTIVATION','00000005':'SUSPENDED'})[school.npsn],accounts:profiles.filter(p=>p.school_id===id).map(p=>({userId:p.user_id,fullName:p.full_name,isActive:p.is_active,email:'petugas.sekolah.fiktif.dengan.alamat.panjang@example.test',emailVerified:true,mustChangePassword:false}))}};
    }
    export async function changeSchoolAccountStatus(input){window.fixture.accountChanges.push(input);await new Promise(resolve=>setTimeout(resolve,100));return window.fixture.accountFail?{success:false,message:'Perubahan status akun belum dapat diselesaikan.'}:{success:true,message:'Status akun diperbarui.'}}
  `,
  "@/app/dashboard/users/actions": `export async function inviteUser(){return {success:true,message:'Undangan fiktif diproses.'}}export async function saveUserProfile(){return {success:true,message:'Profil fiktif disimpan.'}}`,
  "@/app/dashboard/alumni/actions": `import {id} from 'fixture:data';export async function registerAlumniWithPlacement(){return {success:true,id:id(20),message:'Fixture: data tidak dikirim'}}export async function saveAlumni(){return {success:false,message:'Fixture'}}export async function registerPlacement(){return {success:false,message:'Fixture'}}export async function updatePlacementDetails(input){window.fixture.placementUpdates.push(input);return {success:true,message:'Kondisi penempatan berhasil diperbarui.'}}`,
  "@/app/dashboard/alumni/status-actions": `export async function changePlacementStatus(){return {success:false,message:'Fixture: data tidak dikirim'}}`,
};
const compiled = await build({
  absWorkingDir: root,
  stdin: {
    contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import Layout from './app/dashboard/layout';
    import Dashboard from './app/dashboard/page';
    import Alumni from './app/dashboard/alumni/page';
    import Schools from './app/dashboard/schools/page';
    import Users from './app/dashboard/users/page';
    import Reports from './app/dashboard/reports/page';
    import Audit from './app/dashboard/audit-logs/page';
    import Detail from './app/dashboard/alumni/[id]/page';
    import NewAlumni from './app/dashboard/alumni/new/page';
    import DashboardLoading from './app/dashboard/loading';
    import AlumniLoading from './app/dashboard/alumni/loading';
    import SchoolsLoading from './app/dashboard/schools/loading';
    import UsersLoading from './app/dashboard/users/loading';
    import ReportsLoading from './app/dashboard/reports/loading';
    import AuditLoading from './app/dashboard/audit-logs/loading';
    import DashboardError from './app/dashboard/error';
    import {ToastProvider} from './components/ui/toast';
    import {id} from 'fixture:data';
    const params=new URL(location.href).searchParams,view=params.get('view')||'dashboard';
    const paths={dashboard:'/dashboard',alumni:'/dashboard/alumni',schools:'/dashboard/schools',users:'/dashboard/users',reports:'/dashboard/reports',audit:'/dashboard/audit-logs',detail:'/dashboard/alumni/'+id(20),registration:'/dashboard/alumni/new'};
    window.fixture={view,path:paths[view]||'/dashboard',empty:params.has('empty'),viewer:params.has('viewer'),statusFail:params.has('status-fail'),adminReads:0,schoolChanges:[],accountChanges:[],placementUpdates:[],staff:view==='registration'||(view==='detail'&&!params.has('viewer'))};
    const pages={dashboard:Dashboard,alumni:Alumni,schools:Schools,users:Users,reports:Reports,audit:Audit,detail:Detail,registration:NewAlumni};
    const loadings={dashboard:DashboardLoading,alumni:AlumniLoading,schools:SchoolsLoading,users:UsersLoading,reports:ReportsLoading,audit:AuditLoading};
    async function resolve(el){
      if(!React.isValidElement(el))return el;
      if(el.type?.constructor?.name==='AsyncFunction')return resolve(await el.type(el.props));
      if(el.props.children!==undefined)return React.cloneElement(el,{},...(await Promise.all(React.Children.toArray(el.props.children).map(resolve))));
      return el;
    }
    async function start(){
      const page=params.has('error')?<DashboardError reset={()=>{window.fixture.retried=true}}/>:
        await (params.has('loading')?loadings[view]:pages[view])({searchParams:Promise.resolve({}),params:Promise.resolve({id:id(20)})});
      const content=await resolve(Layout({children:await resolve(page)}));
      createRoot(document.getElementById('root')).render(<ToastProvider>{content}<p className='fixed bottom-1 right-2 z-[110] bg-white px-2 text-xs text-slate-700 pointer-events-none'>Fixture UI: data fiktif</p></ToastProvider>);
    }start();`,
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
      name: "ui-fixture",
      setup(builder) {
        builder.onResolve(
          { filter: /^(fixture:|server-only|next\/|@\/)/ },
          (args) => {
            if (args.path in mocks)
              return { path: args.path, namespace: "mock" };
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
      path.join(root, "app/**/*.tsx"),
      path.join(root, "components/**/*.tsx"),
      path.join(root, "tests/ui-audit-browser.mjs"),
    ],
  }),
]).process(fs.readFileSync(path.join(root, "app/globals.css"), "utf8"), {
  from: undefined,
});
const builtCss = fs
  .readdirSync(path.join(root, ".next/static/chunks"))
  .filter((p) => p.endsWith(".css"))
  .map((p) =>
    fs.readFileSync(path.join(root, ".next/static/chunks", p), "utf8"),
  )
  .join("\n");
const fonts = (builtCss.match(/@font-face\{[^}]+\}/g) || []).join("\n");
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://fixture");
  response.setHeader("Cache-Control", "no-store");
  if (url.pathname === "/fixture.js") {
    response.setHeader("Content-Type", "application/javascript");
    response.end(compiled.outputFiles[0].text);
  } else if (url.pathname === "/fixture.css") {
    response.setHeader("Content-Type", "text/css");
    response.end(
      fonts +
        "\n:root{--font-inter:Inter,Arial,sans-serif;--font-plus-jakarta:'Plus Jakarta Sans',Arial,sans-serif}\n" +
        css.css,
    );
  } else if (/^\/media\/[A-Za-z0-9_.-]+\.woff2$/.test(url.pathname)) {
    response.setHeader("Content-Type", "font/woff2");
    response.end(
      fs.readFileSync(
        path.join(root, ".next/static/media", path.basename(url.pathname)),
      ),
    );
  } else {
    response.setHeader("Content-Type", "text/html");
    response.end(
      "<!doctype html><html lang='id'><meta name='viewport' content='width=device-width,initial-scale=1'><link rel='stylesheet' href='/fixture.css'><body><div id='root'></div><script src='/fixture.js'></script></body></html>",
    );
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    errors.push(`Request failed: ${new URL(request.url()).pathname}`),
  );
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(
        `HTTP ${response.status()}: ${new URL(response.url()).pathname}`,
      );
  });
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === base
      ? route.continue()
      : route.abort(),
  );
  async function check(name) {
    await page.locator("#main-content").waitFor();
    assert.equal(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--primary")
          .trim(),
      ),
      "210 54% 19.61%",
      name + " restored navy token",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      name + " horizontal overflow",
    );
    await page.screenshot({
      path: path.join(artifacts, name + ".png"),
      fullPage: true,
    });
  }
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of [
      "dashboard",
      "alumni",
      "schools",
      "users",
      "reports",
      "audit",
      "detail",
      "registration",
    ]) {
      await page.goto(`${base}/?view=${view}`);
      await page.locator("#main-content h1").waitFor();
      await check(`${view}-${width}`);
      if (view === "dashboard") {
        if (width < 1024) {
          const trigger = page.getByRole("button", { name: "Buka navigasi" });
          await trigger.focus();
          await page.keyboard.press("Enter");
          const menu = page.getByRole("dialog", { name: "Navigasi utama" });
          await menu.waitFor();
          assert.equal(
            await menu
              .locator('a[aria-current="page"]')
              .evaluate((el) => getComputedStyle(el).backgroundColor),
            "rgb(23, 50, 77)",
            "mobile active navigation uses restored navy",
          );
          for (let i = 0; i < 12; i++) {
            await page.keyboard.press("Tab");
            assert.equal(
              await page.evaluate(
                () => !!document.activeElement.closest('[role="dialog"]'),
              ),
              true,
            );
          }
          await page.keyboard.press("Escape");
          await menu.waitFor({ state: "hidden" });
          await page.waitForFunction(
            (el) => el === document.activeElement,
            await trigger.elementHandle(),
          );
          assert.equal(
            await trigger.evaluate((el) => el === document.activeElement),
            true,
          );
        } else {
          assert.equal(
            await page
              .locator('aside a[aria-current="page"]')
              .evaluate((el) => getComputedStyle(el).backgroundColor),
            "rgb(23, 50, 77)",
            "desktop active navigation uses restored navy",
          );
        }
        await page.locator("summary").filter({ hasText: "Filter" }).click();
        const form = page.locator("details form");
        await form.waitFor();
        assert.equal(
          await form.evaluate((el) => {
            const b = el.getBoundingClientRect();
            return b.left >= 0 && b.right <= innerWidth;
          }),
          true,
          "filter panel within viewport",
        );
        await check(`dashboard-filter-${width}`);
      }
      if (view === "schools") {
        await page
          .getByRole("button", { name: "Tambah sekolah", exact: true })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        await dialog
          .getByRole("button", { name: "Simpan", exact: true })
          .click();
        await check(`school-dialog-validation-${width}`);
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await page
          .getByRole("button", { name: "Tambah sekolah", exact: true })
          .click();
        await dialog
          .getByLabel("NPSN (wajib)", { exact: true })
          .fill("00000003");
        await dialog
          .getByLabel("Nama sekolah (wajib)", { exact: true })
          .fill("SMK Fixture Cleanup");
        await dialog
          .getByLabel("Kota (wajib)", { exact: true })
          .fill("Jakarta");
        await dialog
          .getByRole("button", { name: "Simpan", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        await page
          .getByText("Sekolah berhasil ditambahkan.", { exact: true })
          .waitFor();
        assert.equal(await page.evaluate(() => window.fixture.refreshed), true);
        await page
          .getByRole("button", { name: "Tutup notifikasi", exact: true })
          .click();
        await page
          .getByText("Sekolah berhasil ditambahkan.", { exact: true })
          .waitFor({ state: "hidden" });
        for (const label of [
          "Belum Aktivasi",
          "Menunggu Aktivasi",
          "Ditangguhkan",
        ])
          await page.getByText(label, { exact: true }).first().waitFor();
        const trigger = page.getByRole("button", {
          name: "Tindakan untuk SMK Fiktif Nusantara dengan Nama Sekolah Panjang",
          exact: true,
        });
        await trigger.focus();
        await page.keyboard.press("ArrowUp");
        await page.getByRole("menu").waitFor();
        assert.equal(
          await page
            .getByRole("menuitem", { name: "Tangguhkan akun", exact: true })
            .evaluate((el) => el === document.activeElement),
          true,
        );
        await page.keyboard.press("Escape");
        await page.getByRole("menu").waitFor({ state: "hidden" });
        await page.waitForFunction(
          (el) => el === document.activeElement,
          await trigger.elementHandle(),
        );
        assert.equal(
          await trigger.evaluate((el) => el === document.activeElement),
          true,
        );
        await trigger.focus();
        await page.keyboard.press("ArrowDown");
        const menu = page.getByRole("menu");
        await menu.waitFor();
        await check(`school-actions-menu-${width}`);
        assert.equal(
          await page
            .getByRole("menuitem", { name: "Detail akun", exact: true })
            .evaluate((el) => el === document.activeElement),
          true,
        );
        await page.keyboard.press("End");
        assert.equal(
          await page
            .getByRole("menuitem", { name: "Tangguhkan akun", exact: true })
            .evaluate((el) => el === document.activeElement),
          true,
        );
        await page.keyboard.press("Home");
        await page.keyboard.press("Enter");
        await dialog
          .getByRole("heading", { name: "Detail Akun Sekolah" })
          .waitFor();
        await dialog
          .getByText(
            "petugas.sekolah.fiktif.dengan.alamat.panjang@example.test",
            { exact: true },
          )
          .waitFor();
        assert.equal(await dialog.locator("input,select,textarea").count(), 0);
        for (let i = 0; i < 4; i++) {
          await page.keyboard.press("Tab");
          assert.equal(
            await page.evaluate(
              () => !!document.activeElement.closest('[role="dialog"]'),
            ),
            true,
          );
        }
        await check(`school-account-details-${width}`);
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await page.waitForFunction(
          (el) => el === document.activeElement,
          await trigger.elementHandle(),
        );
        assert.equal(
          await trigger.evaluate((el) => el === document.activeElement),
          true,
        );
        await trigger.click();
        await page
          .getByRole("menuitem", { name: "Nonaktifkan sekolah", exact: true })
          .click();
        await dialog
          .getByRole("heading", { name: "Nonaktifkan sekolah", exact: true })
          .waitFor();
        await dialog
          .getByRole("button", { name: "Batal", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        assert.deepEqual(
          await page.evaluate(() => window.fixture.schoolChanges),
          [],
        );
        await trigger.click();
        await page
          .getByRole("menuitem", { name: "Nonaktifkan sekolah", exact: true })
          .click();
        await dialog
          .getByRole("button", { name: "Konfirmasi", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        assert.deepEqual(
          await page.evaluate(() => window.fixture.schoolChanges),
          [{ id: "00000000-0000-4000-8000-000000000001", isActive: false }],
        );
        await page
          .getByRole("button", { name: "Tutup notifikasi", exact: true })
          .click();
        assert.deepEqual(
          await page.evaluate(() => window.fixture.accountChanges),
          [],
        );
        await trigger.click();
        await page
          .getByRole("menuitem", { name: "Tangguhkan akun", exact: true })
          .click();
        await dialog
          .getByRole("button", { name: "Batal", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        assert.deepEqual(
          await page.evaluate(() => window.fixture.accountChanges),
          [],
        );
        await page.evaluate(() => {
          window.fixture.accountFail = true;
        });
        await trigger.click();
        await page
          .getByRole("menuitem", { name: "Tangguhkan akun", exact: true })
          .click();
        await dialog
          .getByRole("button", { name: "Konfirmasi", exact: true })
          .click();
        await dialog.getByRole("alert").waitFor();
        await check(`school-suspension-error-${width}`);
        await page.evaluate(() => {
          window.fixture.accountFail = false;
        });
        await dialog
          .getByRole("button", { name: "Konfirmasi", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        assert.deepEqual(
          await page.evaluate(() => window.fixture.accountChanges),
          Array(2).fill({
            school_id: "00000000-0000-4000-8000-000000000001",
            is_active: false,
            confirmed: true,
          }),
        );
        await page
          .getByRole("button", { name: "Tutup notifikasi", exact: true })
          .click();
        await page.evaluate(() => {
          window.fixture.detailsFail = true;
        });
        await trigger.click();
        await page
          .getByRole("menuitem", { name: "Detail akun", exact: true })
          .click();
        await dialog.getByRole("alert").waitFor();
        await page.evaluate(() => {
          window.fixture.detailsFail = false;
        });
        await dialog
          .getByRole("button", { name: "Coba lagi", exact: true })
          .click();
        await dialog.getByText("Terverifikasi", { exact: true }).waitFor();
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await page
          .getByRole("button", {
            name: "Tindakan untuk SMK Fiktif Menunggu Aktivasi",
            exact: true,
          })
          .click();
        assert.equal(await page.getByRole("menuitem").count(), 2);
        await page
          .getByRole("menuitem", { name: "Detail akun", exact: true })
          .click();
        await dialog.getByText("Menunggu Aktivasi", { exact: true }).waitFor();
        await dialog
          .getByText("Belum ada petugas yang terhubung.", { exact: true })
          .waitFor();
        await check(`school-pending-details-${width}`);
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await page
          .getByRole("button", {
            name: "Tindakan untuk SMK Fiktif Kedua",
            exact: true,
          })
          .click();
        assert.equal(
          await page
            .getByRole("menuitem", { name: "Aktifkan akun", exact: true })
            .count(),
          0,
          "inactive school must be enabled before account reactivation",
        );
        await page
          .getByRole("menuitem", { name: "Aktifkan sekolah", exact: true })
          .click();
        await dialog
          .getByRole("button", { name: "Konfirmasi", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        assert.equal(
          await page.evaluate(() => window.fixture.schoolChanges[1].isActive),
          true,
        );
        await page
          .getByRole("button", { name: "Tutup notifikasi", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: "Tindakan untuk SMK Fiktif Akun Ditangguhkan",
            exact: true,
          })
          .click();
        await page
          .getByRole("menuitem", { name: "Aktifkan akun", exact: true })
          .click();
        await dialog
          .getByRole("button", { name: "Konfirmasi", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        assert.deepEqual(
          await page.evaluate(() => window.fixture.accountChanges[2]),
          {
            school_id: "00000000-0000-4000-8000-000000000005",
            is_active: true,
            confirmed: true,
          },
        );
        await page.goto(`${base}/?view=schools&viewer`);
        await page.locator("#main-content h1").waitFor();
        assert.equal(
          await page
            .getByRole("button", {
              name: /Tindakan untuk|Tambah sekolah|Edit sekolah/,
            })
            .count(),
          0,
        );
        assert.equal(await page.evaluate(() => window.fixture.adminReads), 0);
        await check(`schools-viewer-${width}`);
        await page.goto(`${base}/?view=schools&status-fail`);
        await page
          .getByText("Belum dapat dimuat", { exact: true })
          .first()
          .waitFor();
        assert.equal(
          await page.getByText("Belum Aktivasi", { exact: true }).count(),
          0,
          "lookup errors must not masquerade as unclaimed",
        );
        await check(`schools-status-error-${width}`);
      }
      if (view === "users") {
        await page
          .getByRole("button", { name: "Undang pengguna Dinas", exact: true })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        assert.deepEqual(
          await dialog
            .locator("select")
            .first()
            .locator("option")
            .allTextContents(),
          ["Admin Dinas", "Viewer Dinas"],
        );
        assert.equal(
          await dialog
            .getByText(
              "Pulihkan profil untuk akun Auth yang sudah ada, tanpa mengirim undangan baru.",
            )
            .count(),
          0,
        );
        await check(`user-dialog-${width}`);
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
      }
      if (view === "detail") {
        const placementEditor = page.getByRole("button", {
          name: "Edit penempatan",
          exact: true,
        });
        await placementEditor.click();
        await check(`placement-editor-${width}`);
        await page
          .getByLabel("LPK / Sending Organization / P3MI (Penyalur)", {
            exact: true,
          })
          .fill("LPK Fiktif Diperbarui");
        await page
          .getByRole("button", { name: "Simpan perubahan", exact: true })
          .click();
        await page
          .getByText("Kondisi penempatan berhasil diperbarui.", { exact: true })
          .waitFor();
        assert.equal(
          (await page.evaluate(() => window.fixture.placementUpdates)).length,
          1,
        );
        assert.equal(
          await placementEditor.getAttribute("aria-expanded"),
          "false",
        );
        await page
          .getByRole("button", { name: /^Batalkan Keberangkatan:/ })
          .click();
        await page.getByRole("dialog").waitFor();
        await check(`status-dialog-${width}`);
        await page.keyboard.press("Escape");
      }
      if (view === "registration") {
        async function checkStepper() {
          assert.equal(
            await page
              .getByRole("button", { name: "Buka langkah 2, Penempatan Awal" })
              .evaluate(
                (el) =>
                  el.getBoundingClientRect().right <=
                  el.closest("form").getBoundingClientRect().right,
              ),
            true,
            "stepper stays within form card",
          );
        }
        await checkStepper();
        await page
          .getByLabel("Nama lengkap (wajib)", { exact: true })
          .fill("Alumni Fiktif");
        await page
          .getByLabel("Tahun kelulusan (wajib)", { exact: true })
          .fill("2025");
        await page
          .getByLabel("Jurusan (wajib)", { exact: true })
          .fill("Teknik");
        await page.evaluate(() => {
          window.fixture.submissions = 0;
          document
            .querySelector("#main-content form")
            .addEventListener("submit", () => window.fixture.submissions++);
        });
        await page
          .getByRole("button", { name: "Lanjut ke penempatan", exact: true })
          .click();
        await page
          .getByRole("combobox", { name: "Negara tujuan", exact: true })
          .waitFor();
        assert.equal(
          await page.evaluate(() => window.fixture.submissions),
          0,
          "advancing steps must not submit the form",
        );
        assert.equal(
          await page
            .getByText("Pilih negara tujuan yang valid", { exact: true })
            .count(),
          0,
          "no premature country error",
        );
        await checkStepper();
        await check(`registration-placement-${width}`);
        await page
          .getByRole("button", { name: "Simpan Alumni", exact: true })
          .click();
        await page
          .getByText("Pilih negara tujuan yang valid", { exact: true })
          .waitFor();
        await page
          .getByRole("combobox", { name: "Negara tujuan", exact: true })
          .click();
        await page
          .getByRole("combobox", { name: "Cari negara", exact: true })
          .fill("Japan");
        await page.getByRole("option", { name: "Jepang", exact: true }).click();
        assert.equal(
          await page
            .getByText("Pilih negara tujuan yang valid", { exact: true })
            .count(),
          0,
        );
        await page
          .getByRole("button", { name: "Simpan Alumni", exact: true })
          .click();
        await page.waitForFunction(
          () => window.fixture.destination === "/dashboard/alumni",
        );
      }
      if (["dashboard", "detail"].includes(view)) {
        await page.evaluate(() => {
          window.fixture.signOutFail = true;
        });
        await page.getByRole("button", { name: "Keluar", exact: true }).click();
        await page
          .getByText("Gagal keluar. Silakan coba lagi.", { exact: true })
          .waitFor();
        assert.equal(
          await page.evaluate(() => window.fixture.destination),
          undefined,
        );
        await page.evaluate(() => {
          window.fixture.signOutFail = false;
        });
        await page.getByRole("button", { name: "Keluar", exact: true }).click();
        await page.waitForFunction(
          () =>
            window.fixture.signedOut &&
            window.fixture.destination === "/auth/login" &&
            window.fixture.refreshed,
        );
      }
    }
    await page.goto(`${base}/?view=detail&active`);
    const activeEditor = page.getByRole("button", {
      name: "Edit penempatan",
      exact: true,
    });
    await activeEditor.click();
    await page
      .getByLabel("LPK / Sending Organization / P3MI (Penyalur)", {
        exact: true,
      })
      .fill("LPK Aktif Diperbarui");
    await page.getByLabel("Mulai bekerja", { exact: true }).fill("2020-01-02");
    await page
      .getByRole("button", { name: "Simpan perubahan", exact: true })
      .click();
    await page
      .getByText("Kondisi penempatan berhasil diperbarui.", { exact: true })
      .waitFor();
    const activeUpdate = await page.evaluate(
      () => window.fixture.placementUpdates[0],
    );
    assert.equal(activeUpdate.planned_departure, "2030-01-15");
    assert.equal(activeUpdate.placement_provider_name, "LPK Aktif Diperbarui");
    assert.equal(activeUpdate.employment_start, "2020-01-02");
    await check(`placement-editor-active-${width}`);
    await page.goto(`${base}/?view=detail&viewer`);
    assert.equal(
      await page
        .getByRole("button", { name: "Edit penempatan", exact: true })
        .count(),
      0,
      "Dinas detail must remain read-only",
    );
    await check(`detail-viewer-${width}`);
    for (const view of [
      "dashboard",
      "alumni",
      "schools",
      "users",
      "reports",
      "audit",
    ]) {
      await page.goto(`${base}/?view=${view}&empty`);
      await check(`${view}-empty-${width}`);
      await page.goto(`${base}/?view=${view}&loading`);
      await check(`${view}-loading-${width}`);
    }
    await page.goto(`${base}/?view=dashboard&error`);
    await check(`dashboard-error-${width}`);
    console.log(
      `PASS ${width}px: eight real pages with fictional data, empty/loading/error states, dialogs, authoritative School states, read-only details, distinct school/account actions and retry, Dinas-only invitations, viewer restrictions, school save/toast, logout failure/retry and keyboard focus`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS no external requests or backend writes; screenshots: " + artifacts,
  );
} catch (error) {
  console.error("Browser errors:", errors);
  console.error("Screenshots:", artifacts);
  throw error;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
