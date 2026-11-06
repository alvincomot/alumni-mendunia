// Real Next App Router navigation with production components and isolated fictional actions.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const root = process.cwd();
if (!process.env.RECOVERY_UI_TEST_DEPS)
  throw Error(
    "Set RECOVERY_UI_TEST_DEPS to the isolated Playwright installation",
  );
const dependency = createRequire(
  path.join(process.env.RECOVERY_UI_TEST_DEPS, "package.json"),
);
const { chromium } = dependency("playwright");
const baseline = process.env.FORM_NAV_BASELINE === "1";
const baseDir = path.join(root, "node_modules/.cache/form-state");
const fixtureCache = path.join(root, ".next/cache");
fs.mkdirSync(fixtureCache, { recursive: true });
const reuse = process.env.FORM_NAV_FIXTURE;
const fixture = reuse
  ? path.resolve(reuse)
  : fs.mkdtempSync(path.join(fixtureCache, "form-navigation-"));
if (!fixture.startsWith(fixtureCache + path.sep))
  throw Error("Fixture must stay inside the local Next cache");
const artifacts = path.join(fixture, "artifacts");
fs.mkdirSync(artifacts, { recursive: true });
function write(file, content) {
  fs.mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
  fs.writeFileSync(path.join(fixture, file), content);
}
if (!reuse) {
  for (const dir of ["components", "lib"])
    fs.cpSync(path.join(root, dir), path.join(fixture, dir), {
      recursive: true,
    });
  for (const file of [
    "package.json",
    "tsconfig.json",
    "postcss.config.mjs",
    "tailwind.config.ts",
    "app/globals.css",
  ]) {
    if (fs.existsSync(path.join(root, file)))
      write(file, fs.readFileSync(path.join(root, file), "utf8"));
  }
  for (const page of [
    "app/dashboard/alumni/page.tsx",
    "app/dashboard/alumni/new/page.tsx",
    "app/dashboard/alumni/[id]/page.tsx",
    "app/dashboard/schools/page.tsx",
    "app/dashboard/users/page.tsx",
  ])
    write(page, fs.readFileSync(path.join(root, page), "utf8"));
  if (baseline) {
    for (const dir of ["components", "lib"])
      fs.cpSync(path.join(baseDir, "source", dir), path.join(fixture, dir), {
        recursive: true,
      });
    for (const page of [
      "app/dashboard/alumni/page.tsx",
      "app/dashboard/alumni/new/page.tsx",
      "app/dashboard/alumni/[id]/page.tsx",
    ])
      write(page, fs.readFileSync(path.join(baseDir, "source", page), "utf8"));
  }
  write(
    "next.config.mjs",
    `export default {cacheComponents:true,typescript:{ignoreBuildErrors:true},experimental:{externalDir:true}};`,
  );
  write(
    "app/loading.tsx",
    `import {PageSkeleton} from '@/components/ui/loading';export default function Loading(){return <PageSkeleton label="Memuat halaman pengujian"/>}`,
  );
  write(
    "app/layout.tsx",
    `import Link from 'next/link';import {ToastProvider} from '@/components/ui/toast';import './globals.css';
export default function Layout({children}){return <html lang="id"><body><ToastProvider><nav className="flex flex-wrap gap-4 p-4 border-b"><Link href="/dashboard/alumni">Alumni</Link><Link href="/dashboard/schools">Sekolah</Link><Link href="/dashboard/users">Pengguna</Link><Link href="/auth/login">Login</Link><Link href="/auth/forgot-password">Pemulihan</Link><Link href="/auth/update-password">Kata sandi</Link></nav><main id="main-content" className="p-4 sm:p-8">{children}</main><p>Fixture navigasi: data fiktif</p></ToastProvider></body></html>}`,
  );
  write(
    "app/dashboard/layout.tsx",
    `export default function Layout({children}){return children}`,
  );
  write(
    "lib/fixture.ts",
    `import {connection} from 'next/server';
export const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
export function state(){return globalThis.__formFixture??=(function(){const schools=[{id:id(1),name:'SMK Fiktif Satu',npsn:'00000001',city:'Jakarta',is_active:true},{id:id(2),name:'SMK Fiktif Dua',npsn:'00000002',city:'Jakarta',is_active:true}];return {mode:'success',hold:false,release:null,calls:{},next:100,activation:{mode:'success',retryAfter:2,clientRetryUntil:0,inFlight:{},holdNpsn:'00000001',release:null,records:{'00000001':{status:'UNCLAIMED',retryUntil:0},'00000002':{status:'UNCLAIMED',retryUntil:0}}},schools,profiles:[{user_id:id(10),full_name:'Admin Fiktif',role:'admin_dinas',school_id:null,is_active:true},{user_id:id(11),full_name:'Viewer Fiktif',role:'viewer_dinas',school_id:null,is_active:true}],alumni:[{id:id(20),school_id:id(1),full_name:'Alumni Fiktif A',graduation_year:2025,major:'Teknik A'},{id:id(21),school_id:id(1),full_name:'Alumni Fiktif B',graduation_year:2024,major:'Teknik B'}],placements:[]}})()}
export async function operation(name){const s=state();s.calls[name]=(s.calls[name]??0)+1;if(s.hold)await new Promise(resolve=>{s.release=resolve});return s.mode}
export const db={from(table){let rows=[...(state()[table]??[])],start=0,end=999;const query={select(){return query},order(){return query},or(){return query},range(a,b){start=a;end=b;return query},eq(k,v){rows=rows.filter(r=>r[k]===v);return query},in(k,vs){rows=rows.filter(r=>vs.includes(r[k]));return query},async maybeSingle(){return {data:rows[0]??null,error:null}},then(resolve){return Promise.resolve({data:rows.slice(start,end+1),count:rows.length,error:null}).then(resolve)}};return query}};
export async function access(){await connection();return {allowed:true,canWrite:true,canManage:true,role:'admin_dinas',userId:id(10),schoolId:id(1),schoolName:state().schools[0].name,fullName:'Petugas Fiktif',supabase:db}}
export function placement(alumniId,input){return {id:id(state().next++),alumni_id:alumniId,is_current:true,created_at:'2026-11-03T00:00:00Z',placement_secured:null,placement_provider_name:null,company_name:null,work_sector:null,planned_departure:null,actual_departure:null,employment_start:null,contract_end_date:null,...input}}
`,
  );
  write(
    "lib/alumni/access.ts",
    `export {access as getAlumniAccess} from '@/lib/fixture'`,
  );
  write(
    "lib/auth/access.ts",
    `export {access as requireAccess} from '@/lib/fixture'`,
  );
  write(
    "lib/schools/access.ts",
    `export {access as getSchoolAccess} from '@/lib/fixture'`,
  );
  write(
    "lib/alumni/history.ts",
    `export async function getPlacementHistory(){return {available:true,entries:[]}}`,
  );
  write(
    "lib/monitoring/data.ts",
    `import {state} from '@/lib/fixture';export async function loadMonitoring(){const s=state();return s.alumni.map(a=>({...a,schools:{name:s.schools[0].name},placements:s.placements.filter(p=>p.alumni_id===a.id&&p.is_current)}))}`,
  );
  write(
    "lib/users/admin.ts",
    `import {state} from '@/lib/fixture';export function createAdminClient(){return {async rpc(name,{p_npsn}){return {data:{name:'SMK Fiktif',npsn:p_npsn,status:'UNCLAIMED',retry_after:null},error:null}}}} export function invitationRedirect(){return 'http://fixture/auth/confirm'}export function administrationMessage(){return 'Fixture unavailable'}export async function listAuthUsers(){return state().profiles.map(p=>({id:p.user_id,email:p.role+'@example.test'}))}`,
  );
  write(
    "lib/supabase/client.ts",
    `export function createClient(){return {auth:{async signOut(){return {error:null}}}}}`,
  );
  write(
    "app/fixture/route.ts",
    `import {state} from '@/lib/fixture';export async function GET(request){const q=new URL(request.url).searchParams,s=state(),a=s.activation,n=q.get('activationNpsn')??'00000001',r=a.records[n]??=( {status:'UNCLAIMED',retryUntil:0} );if(q.has('mode'))s.mode=q.get('mode');if(q.has('hold'))s.hold=q.get('hold')==='true';if(q.has('release')){s.hold=false;s.release?.();s.release=null}if(q.has('activationMode'))a.mode=q.get('activationMode');if(q.has('activationStatus'))r.status=q.get('activationStatus');if(q.has('activationRetryAfter'))a.retryAfter=Number(q.get('activationRetryAfter'));if(q.has('activationRetryUntil'))r.retryUntil=Number(q.get('activationRetryUntil'));if(q.has('activationClientRetryUntil'))a.clientRetryUntil=Number(q.get('activationClientRetryUntil'));if(q.has('activationHoldNpsn'))a.holdNpsn=q.get('activationHoldNpsn');if(q.has('activationRelease')){a.release?.();a.release=null}return Response.json({calls:s.calls,activation:a,alumni:s.alumni,placements:s.placements,schools:s.schools,profiles:s.profiles})}`,
  );
  write(
    "app/dashboard/alumni/actions.ts",
    `"use server";
import {revalidatePath} from 'next/cache';import {state,id,operation,placement} from '@/lib/fixture';
function refresh(alumniId){revalidatePath('/dashboard/alumni');revalidatePath('/dashboard/alumni/'+alumniId)}
export async function registerAlumniWithPlacement(savedId,input){const mode=await operation('registration');if(mode==='failure')return {success:false,message:'Penyimpanan fiktif gagal.'};const s=state(),alumniId=savedId??id(s.next++);if(!savedId)s.alumni.push({id:alumniId,school_id:id(1),...input.identity});if(mode==='partial')return {success:false,id:alumniId,identitySaved:true,message:'Identitas tersimpan; penempatan fiktif gagal.'};s.placements.push(placement(alumniId,input.placement));refresh(alumniId);return {success:true,id:alumniId,message:'Alumni dan penempatan awal berhasil disimpan.'}}
export async function saveAlumni(alumniId,input){if(await operation('edit')==='failure')return {success:false,message:'Edit fiktif gagal.'};Object.assign(state().alumni.find(a=>a.id===alumniId),input);refresh(alumniId);return {success:true,id:alumniId,message:'Identitas tersimpan.'}}
export async function registerPlacement(alumniId,expected,input){if(await operation('placement')==='failure')return {success:false,message:'Penempatan fiktif gagal.'};state().placements.filter(p=>p.alumni_id===alumniId).forEach(p=>p.is_current=false);state().placements.push(placement(alumniId,input));refresh(alumniId);return {success:true,message:'Penempatan tersimpan.'}}
`,
  );
  write(
    "app/dashboard/alumni/status-actions.ts",
    `"use server";import {state,operation} from '@/lib/fixture';import {revalidatePath} from 'next/cache';export async function changePlacementStatus(input){if(await operation('status')==='failure')return {success:false,message:'Status fiktif gagal.'};const p=state().placements.find(p=>p.id===input.placement_id);p.status=input.new_status;if(input.new_status==='aktif_bekerja'){p.placement_secured=true;p.actual_departure=input.actual_departure}if(input.new_status==='selesai_kontrak')p.contract_end_date=input.contract_end_date;revalidatePath('/dashboard/alumni');revalidatePath('/dashboard/alumni/'+p.alumni_id);return {success:true,message:'Status alumni berhasil diperbarui.'}}`,
  );
  write(
    "app/dashboard/schools/actions.ts",
    `"use server";import {state,id,operation} from '@/lib/fixture';import {revalidatePath} from 'next/cache';export async function saveSchool(schoolId,input){if(await operation('school')==='failure')return {success:false,message:'Sekolah fiktif gagal.'};if(schoolId)Object.assign(state().schools.find(s=>s.id===schoolId),input);else state().schools.push({...input,id:id(state().next++),is_active:true});revalidatePath('/dashboard/schools');return {success:true,message:'Sekolah tersimpan.'}}export async function changeSchoolStatus(){return {success:false,message:'Tidak dipakai fixture.'}}export async function changeSchoolAccountStatus(){return {success:false,message:'Tidak dipakai fixture.'}}export async function getSchoolAccountDetails(schoolId){const s=state().schools.find(s=>s.id===schoolId);return {success:true,details:{school:{...s,isActive:s.is_active},status:'UNCLAIMED',accounts:[]}}}`,
  );
  write(
    "app/dashboard/users/actions.ts",
    `"use server";import {state,id,operation} from '@/lib/fixture';import {revalidatePath} from 'next/cache';export async function saveUserProfile(userId,input){if(await operation('user')==='failure')return {success:false,message:'Profil fiktif gagal.'};Object.assign(state().profiles.find(p=>p.user_id===userId),input);revalidatePath('/dashboard/users');return {success:true,message:'Profil tersimpan.'}}export async function inviteUser(input){if(await operation('invite')==='failure')return {success:false,message:'Undangan fiktif gagal.'};state().profiles.push({...input.profile,user_id:id(state().next++)});revalidatePath('/dashboard/users');return {success:true,message:'Permintaan diterima fixture.'}}`,
  );
  write(
    "app/auth/login/page.tsx",
    `import {LoginForm} from '@/components/login-form';export default function Page(){return <LoginForm/>}`,
  );
  write(
    "app/auth/forgot-password/page.tsx",
    `import {ForgotPasswordForm} from '@/components/forgot-password-form';export default function Page(){return <ForgotPasswordForm/>}`,
  );
  write(
    "app/auth/update-password/page.tsx",
    `import {UpdatePasswordForm} from '@/components/update-password-form';export default function Page(){return <UpdatePasswordForm/>}`,
  );
  write(
    "app/auth/forgot-password/actions.ts",
    `"use server";import {operation} from '@/lib/fixture';export async function requestPasswordRecovery(){return {success:(await operation('recovery'))!=='failure',message:'Permintaan diterima fixture.'}}`,
  );
  write(
    "app/auth/update-password/actions.ts",
    `"use server";import {operation} from '@/lib/fixture';export async function changePassword(){return {success:(await operation('password'))!=='failure',message:'Password fiktif gagal.',redirectTo:'/auth/login'}}`,
  );
  write(
    "app/auth/login/actions.ts",
    `"use server";export async function loginWithPassword(){return {success:false,message:'Login fiktif ditolak.'}}`,
  );
  write(
    "app/auth/login/school-actions.ts",
    `"use server";import {state} from '@/lib/fixture';const remaining=u=>Math.max(0,Math.ceil((u-Date.now())/1000));export async function lookupSchool(npsn){const a=state().activation,r=a.records[npsn]??=( {status:'UNCLAIMED',retryUntil:0} ),school=remaining(r.retryUntil),client=remaining(a.clientRetryUntil);return {success:true,school:{name:'SMK Fiktif',npsn,status:r.status,retry_after:school},cooldowns:{school,client},...(client?{retryAfter:client,rateLimit:'application'}:{})}}export async function requestSchoolActivation({npsn}){const s=state(),a=s.activation,r=a.records[npsn]??=( {status:'UNCLAIMED',retryUntil:0} );s.calls.activation=(s.calls.activation??0)+1;if(a.inFlight[npsn])return {success:false,message:'Permintaan aktivasi sekolah ini masih dalam masa tunggu. Coba lagi dalam 5 detik.',retryAfter:5,rateLimit:'database'};if(Object.keys(a.inFlight).length>=3)return {success:false,message:'Batas permintaan dari jaringan ini tercapai. Coba lagi dalam 5 detik.',retryAfter:5,rateLimit:'application'};a.inFlight[npsn]=true;if(a.mode==='hold'&&npsn===a.holdNpsn)await new Promise(resolve=>{a.release=resolve});try{if(a.mode==='database')return {success:false,message:'Permintaan aktivasi sekolah ini masih dalam masa tunggu. Coba lagi dalam '+a.retryAfter+' detik.',retryAfter:a.retryAfter,rateLimit:'database'};if(a.mode==='provider')return {success:false,message:'Layanan Auth sedang membatasi pengiriman email. Waktu tunggu tidak diberikan oleh layanan; tunggu beberapa saat lalu coba lagi.',rateLimit:'provider'};r.status='PENDING_ACTIVATION';r.retryUntil=Date.now()+a.retryAfter*1000;const school=a.retryAfter,client=remaining(a.clientRetryUntil);return {success:true,message:'Permintaan aktivasi diterima fixture.',retryAfter:Math.max(school,client),rateLimit:client>school?'application':'database',cooldowns:{school,client}}}finally{delete a.inFlight[npsn]}}export async function requestSchoolRecovery(){return {success:true,message:'Permintaan pemulihan diterima fixture.',retryAfter:60}}`,
  );
}

const reserve = net.createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
for (const key of Object.keys(env))
  if (/SUPABASE|BREVO|APP_SITE_URL/.test(key)) delete env[key];
const log = fs.openSync(path.join(artifacts, "next.log"), "a");
const nextBin = path.join(root, "node_modules/next/dist/bin/next");
async function command(args) {
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd: fixture,
    env,
    stdio: ["ignore", log, log],
    windowsHide: true,
  });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  if (code !== 0)
    throw Error(
      `Next fixture ${args[0]} failed (${code}); see ${artifacts}/next.log`,
    );
}
let server, browser, page;
const errors = [];
try {
  if (!reuse) await command(["build", "--webpack"]);
  server = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: fixture, env, stdio: ["ignore", log, log], windowsHide: true },
  );
  const deadline = Date.now() + 60000;
  while (true) {
    try {
      if ((await fetch(base + "/fixture")).ok) break;
    } catch {}
    if (Date.now() > deadline) throw Error("Fixture start timed out");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === base
      ? route.continue()
      : route.abort(),
  );
  const control = async (query = "") =>
    (await page.request.get(base + "/fixture" + query)).json();
  const input = (label) =>
    page.getByLabel(label, { exact: true }).filter({ visible: true });
  const main = page.locator("#main-content");
  async function country(name = "Jepang") {
    await page
      .getByRole("combobox", { name: "Negara tujuan", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Cari negara", exact: true })
      .fill(name);
    await page.getByRole("option", { name, exact: true }).click();
  }
  async function identity(name) {
    await input("Nama lengkap (wajib)").fill(name);
    await input("Tahun kelulusan (wajib)").fill("2025");
    await input("Jurusan (wajib)").fill("Teknik Fiktif");
  }
  async function step2() {
    await page
      .getByRole("button", { name: "Lanjut ke penempatan", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Negara tujuan", exact: true })
      .waitFor();
  }
  async function firstStep() {
    await main
      .getByRole("button", { name: "Buka langkah 1, Identitas Alumni" })
      .filter({ visible: true })
      .waitFor();
    assert.equal(
      await main
        .getByRole("button", { name: "Buka langkah 1, Identitas Alumni" })
        .filter({ visible: true })
        .getAttribute("aria-current"),
      "step",
    );
    assert.equal(await input("Nama lengkap (wajib)").inputValue(), "");
    assert.equal(await input("Jurusan (wajib)").inputValue(), "");
    assert.equal(await input("Tahun kelulusan (wajib)").inputValue(), "");
    assert.equal(
      await main.getByRole("alert").filter({ visible: true }).count(),
      0,
    );
    await main
      .getByText("Belum disimpan", { exact: true })
      .filter({ visible: true })
      .waitFor();
  }
  async function list() {
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Alumni", exact: true })
      .click();
    await page.waitForURL(base + "/dashboard/alumni");
    await main
      .getByRole("heading", { name: "Data Alumni", exact: true })
      .waitFor();
  }
  async function openNew() {
    await page
      .getByRole("link", { name: "Tambah alumni", exact: true })
      .click();
    await main
      .getByRole("heading", { name: "Tambah Alumni", exact: true })
      .waitFor();
  }
  async function dismiss() {
    for (const button of await page
      .getByRole("button", { name: "Tutup notifikasi", exact: true })
      .all())
      await button.click();
  }
  await page.goto(base + "/dashboard/alumni");
  await page.evaluate(() => {
    window.__navigationDocument = "same-document";
  });
  if (baseline) {
    await openNew();
    await identity("Reproduksi Fiktif");
    await step2();
    await country();
    await page
      .getByRole("button", { name: "Simpan Alumni", exact: true })
      .click();
    await page.waitForURL(/\/dashboard\/alumni\/[0-9a-f-]+$/);
    await page
      .getByRole("link", { name: "Tambah alumni lain", exact: true })
      .click();
    await main
      .getByRole("heading", { name: "Tambah Alumni", exact: true })
      .waitFor();
    assert.equal(
      await main
        .getByRole("button", { name: "Buka langkah 2, Penempatan Awal" })
        .filter({ visible: true })
        .getAttribute("aria-current"),
      "step",
    );
    await main
      .getByText("Alumni dan penempatan awal berhasil disimpan.", {
        exact: true,
      })
      .filter({ visible: true })
      .waitFor();
    await page.screenshot({
      path: path.join(artifacts, "baseline-stale-form.png"),
      fullPage: true,
    });
    console.log(
      "REPRODUCED baseline: client revisit retains step 2 and success banner with reset fields",
    );
  } else {
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await list();
      await openNew();
      await firstStep();
      const name = `Alumni Uji ${width}`;
      await identity(name);
      await step2();
      await country();
      const secured = input("Sudah ada penempatan");
      assert.equal(await secured.isChecked(), false);
      assert.equal(
        await input("LPK / Sending Organization / P3MI (Penyalur)").count(),
        0,
      );
      await secured.check();
      await input("LPK / Sending Organization / P3MI (Penyalur)").fill(
        "LPK Fiktif",
      );
      await input("Sektor pekerjaan").fill("Manufaktur Fiktif");
      await input("Rencana keberangkatan").fill("2027-01-15");
      await secured.uncheck();
      assert.equal(
        await input("LPK / Sending Organization / P3MI (Penyalur)").count(),
        0,
      );
      await secured.check();
      assert.equal(
        await input(
          "LPK / Sending Organization / P3MI (Penyalur)",
        ).inputValue(),
        "",
      );
      assert.equal(await input("Sektor pekerjaan").inputValue(), "");
      assert.equal(await input("Rencana keberangkatan").inputValue(), "");
      await input("LPK / Sending Organization / P3MI (Penyalur)").fill(
        "LPK Fiktif",
      );
      await input("Sektor pekerjaan").fill("Manufaktur Fiktif");
      await input("Rencana keberangkatan").fill("2027-01-15");
      await page
        .getByRole("button", { name: "Buka langkah 1, Identitas Alumni" })
        .click();
      assert.equal(await input("Nama lengkap (wajib)").inputValue(), name);
      await step2();
      assert.equal(
        await input(
          "LPK / Sending Organization / P3MI (Penyalur)",
        ).inputValue(),
        "LPK Fiktif",
      );
      await control("?mode=failure");
      await page
        .getByRole("button", { name: "Simpan Alumni", exact: true })
        .click();
      await main
        .getByText("Penyimpanan fiktif gagal.", { exact: true })
        .waitFor();
      assert.equal(
        await input(
          "LPK / Sending Organization / P3MI (Penyalur)",
        ).inputValue(),
        "LPK Fiktif",
      );
      await control("?mode=success&hold=true");
      const before = (await control()).calls.registration;
      await page
        .getByRole("button", { name: "Simpan Alumni", exact: true })
        .evaluate((el) => {
          el.click();
          el.click();
          el.form.requestSubmit();
        });
      await page
        .getByRole("button", { name: /Menyimpan/ })
        .filter({ visible: true })
        .waitFor();
      await page.waitForFunction(
        () => document.querySelector('form[aria-busy="true"]') !== null,
      );
      // The held server request makes duplicate calls observable without a timing race.
      let current;
      for (let i = 0; i < 100; i++) {
        current = await control();
        if (current.calls.registration > before) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(current.calls.registration, before + 1);
      await control("?release");
      await page.waitForURL(base + "/dashboard/alumni");
      await page
        .getByText("Alumni berhasil ditambahkan.", { exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByText("Alumni berhasil ditambahkan.", { exact: true })
          .count(),
        1,
      );
      await main.getByRole("row").filter({ hasText: name }).waitFor();
      await page
        .getByRole("link", { name: "Tambah Alumni Lagi", exact: true })
        .click();
      await firstStep();
      assert.equal(
        await page
          .getByText("Alumni berhasil ditambahkan.", { exact: true })
          .count(),
        0,
      );
      await identity("Baru Fiktif");
      await step2();
      assert.equal(await input("Sudah ada penempatan").isChecked(), false);
      assert.equal(
        await input("LPK / Sending Organization / P3MI (Penyalur)").count(),
        0,
      );
      assert.equal(await input("Sektor pekerjaan").count(), 0);
      assert.equal(await input("Rencana keberangkatan").count(), 0);
      assert.equal(
        await input("Status awal (wajib)").inputValue(),
        "persiapan_berangkat",
      );
      assert.match(
        await page
          .getByRole("combobox", { name: "Negara tujuan", exact: true })
          .textContent(),
        /Pilih negara/,
      );
      await page
        .getByRole("button", { name: "Simpan Alumni", exact: true })
        .click();
      await page
        .getByText("Pilih negara tujuan yang valid", { exact: true })
        .waitFor();
      assert.equal(
        await input("LPK / Sending Organization / P3MI (Penyalur)").count(),
        0,
      );
      await list();
      await page.goBack();
      await firstStep();
      await page.goForward();
      await main
        .getByRole("heading", { name: "Data Alumni", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByText("Alumni berhasil ditambahkan.", { exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page.evaluate(() => window.__navigationDocument),
        "same-document",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      console.log(
        `PASS ${width}px: Next client routing, draft steps, failure preservation, duplicate guard, list refresh, one toast, add again, back/forward reset`,
      );
    }
    await dismiss();
    await list();
    assert.equal(
      await page.getByText("Urutkan", { exact: true }).count(),
      0,
      "alumni list omits the sorting control",
    );
    const searchBounds = await input("Cari nama alumni").boundingBox();
    const applyBounds = await page
      .getByRole("button", { name: "Terapkan", exact: true })
      .boundingBox();
    assert.ok(searchBounds && applyBounds);
    assert.ok(
      Math.abs(
        searchBounds.y +
          searchBounds.height -
          (applyBounds.y + applyBounds.height),
      ) <= 1,
      "filter controls and actions share one desktop row",
    );
    await input("Cari nama alumni").fill("Alumni");
    await main
      .getByRole("combobox", { name: /^Tahun kelulusan/ })
      .selectOption("2025");
    await country();
    await page.getByRole("button", { name: "Terapkan", exact: true }).click();
    await page.waitForURL(
      (url) => url.searchParams.get("country") === "Jepang",
    );
    const filteredPath =
      new URL(page.url()).pathname + new URL(page.url()).search;
    await openNew();
    await identity("Alumni Filter Fiktif");
    await step2();
    await country();
    await page
      .getByRole("button", { name: "Simpan Alumni", exact: true })
      .click();
    await page.waitForURL(base + filteredPath);
    await main
      .getByRole("row")
      .filter({ hasText: "Alumni Filter Fiktif" })
      .waitFor();
    assert.equal(await input("Cari nama alumni").inputValue(), "Alumni");
    await dismiss();
    await page.getByRole("link", { name: "Reset", exact: true }).click();
    await page.waitForURL(base + "/dashboard/alumni");
    assert.equal(await input("Cari nama alumni").inputValue(), "");
    assert.match(
      await page
        .getByRole("combobox", { name: "Negara tujuan", exact: true })
        .textContent(),
      /Pilih negara/,
    );
    await page.goBack();
    await page.waitForURL(base + filteredPath);
    assert.match(
      await page
        .getByRole("combobox", { name: "Negara tujuan", exact: true })
        .textContent(),
      /Jepang/,
    );
    await list();
    await input("Cari nama alumni").fill("Draf filter belum diterapkan");
    await country();
    await page.getByRole("link", { name: "Reset", exact: true }).click();
    assert.equal(await input("Cari nama alumni").inputValue(), "");
    assert.match(
      await page
        .getByRole("combobox", { name: "Negara tujuan", exact: true })
        .textContent(),
      /Pilih negara/,
    );
    await input("Cari nama alumni").fill("Draf filter ditinggalkan");
    await country();
    await openNew();
    await firstStep();
    await page.goBack();
    await page.waitForURL(base + "/dashboard/alumni");
    assert.equal(await input("Cari nama alumni").inputValue(), "");
    assert.match(
      await page
        .getByRole("combobox", { name: "Negara tujuan", exact: true })
        .textContent(),
      /Pilih negara/,
    );
    console.log(
      "PASS filters: preserve applied search/year/country through create; Reset and Back match URL; abandoned drafts reset",
    );

    await openNew();
    await identity("Alumni Parsial Fiktif");
    await step2();
    await country();
    await control("?mode=partial");
    const initialCount = (await control()).alumni.length;
    await page
      .getByRole("button", { name: "Simpan Alumni", exact: true })
      .click();
    await page
      .getByText("Identitas tersimpan; penempatan fiktif gagal.", {
        exact: true,
      })
      .waitFor();
    assert.equal((await control()).alumni.length, initialCount + 1);
    await control("?mode=success");
    await page
      .getByRole("button", { name: "Coba simpan penempatan", exact: true })
      .click();
    await page.waitForURL(base + "/dashboard/alumni");
    assert.equal((await control()).alumni.length, initialCount + 1);
    await dismiss();
    console.log(
      "PASS partial registration: retry uses saved identity and creates no second alumnus",
    );

    async function openDetail(name) {
      await main
        .getByRole("row")
        .filter({ hasText: name })
        .getByRole("link", { name: "Lihat detail " + name, exact: true })
        .click();
      await main.getByRole("heading", { name, exact: true }).waitFor();
    }
    await openDetail("Alumni Fiktif A");
    await page
      .getByText("Edit identitas alumni", { exact: true })
      .filter({ visible: true })
      .click();
    await input("Nama lengkap (wajib)").fill("Alumni A Diperbarui");
    await control("?mode=failure");
    await page
      .getByRole("button", { name: "Simpan perubahan", exact: true })
      .click();
    await page.getByText("Edit fiktif gagal.", { exact: true }).waitFor();
    assert.equal(
      await input("Nama lengkap (wajib)").inputValue(),
      "Alumni A Diperbarui",
    );
    await control("?mode=success");
    await page
      .getByRole("button", { name: "Simpan perubahan", exact: true })
      .click();
    await main
      .getByRole("heading", { name: "Alumni A Diperbarui", exact: true })
      .waitFor();
    assert.equal(await input("Nama lengkap (wajib)").count(), 0);
    await dismiss();
    await page
      .getByText("Edit identitas alumni", { exact: true })
      .filter({ visible: true })
      .click();
    assert.equal(
      await input("Nama lengkap (wajib)").inputValue(),
      "Alumni A Diperbarui",
    );
    await input("Nama lengkap (wajib)").fill("Draf Edit Dibatalkan");
    await page
      .getByText("Edit identitas alumni", { exact: true })
      .filter({ visible: true })
      .click();
    await page
      .getByText("Edit identitas alumni", { exact: true })
      .filter({ visible: true })
      .click();
    assert.equal(
      await input("Nama lengkap (wajib)").inputValue(),
      "Alumni A Diperbarui",
    );
    await list();
    await openDetail("Alumni Fiktif B");
    await page
      .getByText("Edit identitas alumni", { exact: true })
      .filter({ visible: true })
      .click();
    assert.equal(
      await input("Nama lengkap (wajib)").inputValue(),
      "Alumni Fiktif B",
    );
    assert.equal(await input("Jurusan (wajib)").inputValue(), "Teknik B");
    await page
      .getByText("Edit identitas alumni", { exact: true })
      .filter({ visible: true })
      .click();
    console.log(
      "PASS edit: failures retain values, success closes editor and refreshes detail, reopening/switching records uses actual data",
    );

    await country();
    await control("?mode=failure");
    await page
      .getByRole("button", { name: "Simpan penempatan awal", exact: true })
      .click();
    await page.getByText("Penempatan fiktif gagal.", { exact: true }).waitFor();
    assert.match(
      await page
        .getByRole("combobox", { name: "Negara tujuan", exact: true })
        .textContent(),
      /Jepang/,
    );
    await control("?mode=success");
    await page
      .getByRole("button", { name: "Simpan penempatan awal", exact: true })
      .click();
    await page.waitForURL(base + "/dashboard/alumni");
    await page
      .getByText("Penempatan awal berhasil disimpan.", { exact: true })
      .waitFor();
    await dismiss();
    const row = main.getByRole("row").filter({ hasText: "Alumni Fiktif B" });
    await row.getByRole("button", { name: /Konfirmasi Berangkat/ }).click();
    const dialog = page.getByRole("dialog");
    const departure = dialog.getByLabel(
      "Tanggal keberangkatan aktual (wajib)",
      { exact: true },
    );
    await dialog
      .getByLabel("Catatan (opsional, maksimal 500 karakter)")
      .fill("Catatan Fiktif");
    const statusCallsBefore = (await control()).calls.status ?? 0;
    await dialog
      .getByRole("button", { name: "Ya, konfirmasi", exact: true })
      .click();
    await dialog
      .getByText("Tanggal keberangkatan wajib diisi.", { exact: true })
      .waitFor();
    assert.equal((await control()).calls.status ?? 0, statusCallsBefore);
    await departure.fill("2020-01-01");
    await control("?mode=failure");
    await dialog
      .getByRole("button", { name: "Ya, konfirmasi", exact: true })
      .click();
    await dialog.getByText("Status fiktif gagal.", { exact: true }).waitFor();
    assert.equal(
      await dialog
        .getByLabel("Catatan (opsional, maksimal 500 karakter)")
        .inputValue(),
      "Catatan Fiktif",
    );
    assert.equal(await departure.inputValue(), "2020-01-01");
    await control("?mode=success");
    await dialog
      .getByRole("button", { name: "Ya, konfirmasi", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await row.getByText("Aktif bekerja", { exact: true }).waitFor();
    const savedPlacement = (await control()).placements.find(
      (placement) => placement.alumni_id.endsWith("000000000021"),
    );
    assert.equal(savedPlacement.status, "aktif_bekerja");
    assert.equal(savedPlacement.actual_departure, "2020-01-01");
    assert.equal(
      await page
        .getByText("Status alumni berhasil diperbarui.", { exact: true })
        .count(),
      1,
    );
    await dismiss();
    await openDetail("Alumni Fiktif B");
    await page
      .getByRole("button", { name: /Selesaikan Kontrak/ })
      .click();
    const contractEnd = dialog.getByLabel(
      "Tanggal selesai kontrak (wajib)",
      { exact: true },
    );
    const contractCallsBefore = (await control()).calls.status ?? 0;
    await dialog
      .getByRole("button", { name: "Ya, konfirmasi", exact: true })
      .click();
    await dialog
      .getByText("Tanggal selesai kontrak wajib diisi.", { exact: true })
      .waitFor();
    assert.equal((await control()).calls.status ?? 0, contractCallsBefore);
    await contractEnd.fill("2020-01-02");
    await dialog
      .getByRole("button", { name: "Ya, konfirmasi", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await main.getByText("Selesai kontrak", { exact: true }).first().waitFor();
    const completedPlacement = (await control()).placements.find(
      (placement) => placement.alumni_id.endsWith("000000000021"),
    );
    assert.equal(completedPlacement.status, "selesai_kontrak");
    assert.equal(completedPlacement.contract_end_date, "2020-01-02");
    console.log(
      "PASS placements/status: required departure and contract-end dates block empty submits, valid dates persist, failure input is retained, and success closes with one toast",
    );

    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Sekolah", exact: true })
      .click();
    await main
      .getByRole("heading", { name: "Manajemen Sekolah", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Tambah sekolah", exact: true })
      .click();
    await dialog.getByLabel("Nama sekolah (wajib)").fill("Draf Sekolah");
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await dialog.locator('[aria-invalid="true"]').first().waitFor();
    await dialog.getByRole("button", { name: "Batal", exact: true }).click();
    await page
      .getByRole("button", { name: "Tambah sekolah", exact: true })
      .click();
    assert.equal(
      await dialog.getByLabel("Nama sekolah (wajib)").inputValue(),
      "",
    );
    assert.equal(await dialog.locator('[aria-invalid="true"]').count(), 0);
    await dialog.getByLabel("Nama sekolah (wajib)").fill("SMK Fiktif Baru");
    await dialog.getByLabel("NPSN (wajib)").fill("00000003");
    await dialog.getByLabel("Kota (wajib)").fill("Jakarta");
    await control("?mode=failure");
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(
      await dialog.getByLabel("Nama sekolah (wajib)").inputValue(),
      "SMK Fiktif Baru",
    );
    await control("?mode=success");
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await main
      .getByRole("row")
      .filter({ hasText: "SMK Fiktif Baru" })
      .waitFor();
    await dismiss();
    await page
      .getByRole("button", { name: "Tambah sekolah", exact: true })
      .click();
    assert.equal(await dialog.getByLabel("NPSN (wajib)").inputValue(), "");
    await dialog.getByRole("button", { name: "Batal", exact: true }).click();
    for (const name of ["SMK Fiktif Satu", "SMK Fiktif Dua"]) {
      await page
        .getByRole("button", { name: "Edit sekolah: " + name, exact: true })
        .click();
      assert.equal(
        await dialog.getByLabel("Nama sekolah (wajib)").inputValue(),
        name,
      );
      await dialog
        .getByLabel("Nama sekolah (wajib)")
        .fill("Draf Tidak Disimpan");
      await dialog.getByRole("button", { name: "Batal", exact: true }).click();
    }
    console.log(
      "PASS school dialogs: canceled validation/drafts reset, failure preserved, success refreshes list and reopening is clean",
    );

    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Pengguna", exact: true })
      .click();
    await main
      .getByRole("heading", { name: "Manajemen Pengguna", exact: true })
      .waitFor();
    for (const name of ["Admin Fiktif", "Viewer Fiktif"]) {
      await main
        .getByRole("row")
        .filter({ hasText: name })
        .getByRole("button", { name: "Edit profil", exact: true })
        .click();
      assert.equal(
        await dialog.getByLabel("Nama lengkap (wajib)").inputValue(),
        name,
      );
      await dialog.getByLabel("Nama lengkap (wajib)").fill("Draf Profil");
      await dialog.getByRole("button", { name: "Batal", exact: true }).click();
    }
    await page
      .getByRole("button", { name: "Undang pengguna Dinas", exact: true })
      .click();
    await dialog.getByLabel("Email (wajib)").fill("dinas.fiktif@example.test");
    await dialog.getByLabel("Nama lengkap (wajib)").fill("Dinas Fiktif Baru");
    await dialog
      .getByRole("checkbox", { name: /Saya telah memeriksa/ })
      .check();
    await control("?mode=failure");
    await dialog
      .getByRole("button", { name: "Kirim undangan", exact: true })
      .click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(
      await dialog.getByLabel("Email (wajib)").inputValue(),
      "dinas.fiktif@example.test",
    );
    await control("?mode=success");
    await dialog
      .getByRole("button", { name: "Kirim undangan", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await main
      .getByRole("row")
      .filter({ hasText: "Dinas Fiktif Baru" })
      .waitFor();
    await dismiss();
    await page
      .getByRole("button", { name: "Undang pengguna Dinas", exact: true })
      .click();
    assert.equal(await dialog.getByLabel("Email (wajib)").inputValue(), "");
    assert.equal(
      await dialog.getByLabel("Nama lengkap (wajib)").inputValue(),
      "",
    );
    assert.equal(
      await dialog
        .getByRole("checkbox", { name: /Saya telah memeriksa/ })
        .isChecked(),
      false,
    );
    await dialog.getByRole("button", { name: "Batal", exact: true }).click();
    console.log(
      "PASS user dialogs: record isolation, failure retained, invitation closes/refreshes and resets email/confirmation",
    );

    await control(
      "?activationMode=success&activationRetryAfter=6&activationNpsn=00000001&activationRetryUntil=0&activationClientRetryUntil=0",
    );
    await control("?activationNpsn=00000002&activationRetryUntil=0");
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Login", exact: true })
      .click();
    await input("NPSN").fill("00000001");
    await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    await input("Email Sekolah").fill("sekolah.fiktif@example.test");
    await page
      .getByRole("button", { name: "Kirim Tautan Aktivasi", exact: true })
      .click();
    await page
      .getByText("Permintaan aktivasi diterima fixture.", { exact: true })
      .waitFor();
    const resend = page.getByRole("button", {
      name: "Kirim Ulang",
      exact: true,
    });
    await page
      .getByText(/Permintaan aktivasi sekolah ini tersedia dalam [1-6] detik/)
      .waitFor();
    assert.equal(await resend.isDisabled(), true);

    await page.getByRole("button", { name: "Kembali", exact: true }).click();
    await input("NPSN").fill("00000002");
    await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    assert.equal(
      await page.getByText(/Permintaan aktivasi sekolah ini tersedia/).count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Kirim Tautan Aktivasi", exact: true })
        .isEnabled(),
      true,
    );
    await page.getByRole("button", { name: "Kembali", exact: true }).click();
    await input("NPSN").fill("00000001");
    await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    await page
      .getByRole("heading", { name: "Periksa email aktivasi", exact: true })
      .waitFor();
    assert.equal(await resend.isDisabled(), true);

    await page.reload();
    await page.evaluate(() => {
      window.__navigationDocument = "same-document";
    });
    await input("NPSN").fill("00000001");
    await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    await page
      .getByRole("heading", { name: "Periksa email aktivasi", exact: true })
      .waitFor();
    assert.equal(await resend.isDisabled(), true);
    await resend.waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === "Kirim Ulang",
      );
      return button && !button.disabled;
    });

    await control("?activationMode=database&activationRetryAfter=7");
    await resend.click();
    await page
      .getByText(
        "Permintaan aktivasi sekolah ini masih dalam masa tunggu. Coba lagi dalam 7 detik.",
        { exact: true },
      )
      .waitFor();
    await page
      .getByText(
        "Permintaan aktivasi sekolah ini tersedia dalam 7 detik.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await page.getByText(/60 detik/).count(), 0);
    assert.equal(await resend.isDisabled(), true);

    await control(
      `?activationMode=success&activationRetryUntil=${Date.now() + 5000}`,
    );
    await page.goto(base + "/dashboard/alumni");
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Login", exact: true })
      .click();
    await input("NPSN").fill("00000001");
    await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    await page
      .getByText(/Permintaan aktivasi sekolah ini tersedia dalam [45] detik/)
      .waitFor();
    assert.equal(await resend.isDisabled(), true);

    await control(
      `?activationNpsn=00000001&activationRetryUntil=0&activationClientRetryUntil=${Date.now() + 5000}`,
    );
    await page.reload();
    await page.evaluate(() => {
      window.__navigationDocument = "same-document";
    });
    await input("NPSN").fill("00000001");
    await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    await page
      .getByText(/Batas permintaan dari jaringan ini tersedia kembali dalam [45] detik/)
      .waitFor();
    assert.equal(
      await page.getByText(/Permintaan aktivasi sekolah ini tersedia/).count(),
      0,
    );
    assert.equal(await resend.isDisabled(), true);

    await control(
      "?activationMode=provider&activationNpsn=00000001&activationRetryUntil=0&activationClientRetryUntil=0",
    );
    await page.reload();
    await page.evaluate(() => {
      window.__navigationDocument = "same-document";
    });
    await input("NPSN").fill("00000001");
    await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    await resend.click();
    await page.getByText(/Waktu tunggu tidak diberikan oleh layanan/).waitFor();
    assert.equal(
      await page.getByText(/tersedia dalam|tersedia kembali/).count(),
      0,
    );
    assert.equal(await resend.isEnabled(), true);

    await control(
      "?activationMode=hold&activationRetryAfter=2&activationHoldNpsn=00000001",
    );
    const activationCalls = (await control()).calls.activation;
    await resend.evaluate((element) => {
      element.click();
      element.click();
    });
    await page
      .getByRole("button", { name: "Memproses permintaan...", exact: true })
      .waitFor();
    assert.equal((await control()).calls.activation, activationCalls + 1);

    const secondTab = await browser.newPage();
    await secondTab.goto(base + "/auth/login");
    await secondTab.getByLabel("NPSN", { exact: true }).fill("00000002");
    await secondTab
      .getByRole("button", { name: "Lanjutkan", exact: true })
      .click();
    await secondTab
      .getByLabel("Email Sekolah", { exact: true })
      .fill("sekolah.dua.fiktif@example.test");
    await secondTab
      .getByRole("button", { name: "Kirim Tautan Aktivasi", exact: true })
      .click();
    await secondTab
      .getByText("Permintaan aktivasi diterima fixture.", { exact: true })
      .waitFor();
    await secondTab.close();

    const thirdTab = await browser.newPage();
    await thirdTab.goto(base + "/auth/login");
    await thirdTab.getByLabel("NPSN", { exact: true }).fill("00000001");
    await thirdTab
      .getByRole("button", { name: "Lanjutkan", exact: true })
      .click();
    await thirdTab
      .getByRole("button", { name: "Kirim Ulang", exact: true })
      .click();
    await thirdTab
      .getByText(
        "Permintaan aktivasi sekolah ini masih dalam masa tunggu. Coba lagi dalam 5 detik.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await thirdTab
        .getByText(
          "Permintaan aktivasi sekolah ini tersedia dalam 5 detik.",
          { exact: true },
        )
        .count(),
      1,
    );
    assert.equal(
      await thirdTab.getByText(/Batas permintaan dari jaringan/).count(),
      0,
    );
    await control("?activationRelease=1");
    await page
      .getByText("Permintaan aktivasi diterima fixture.", { exact: true })
      .waitFor();
    await thirdTab.close();
    assert.equal((await control()).calls.activation, activationCalls + 3);
    console.log(
      "PASS activation cooldown: NPSNs stay independent, server timing survives refresh/return, IP/provider limits remain distinct, duplicate school requests serialize",
    );

    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Pemulihan", exact: true })
      .click();
    await input("Email").fill("dinas.fiktif@example.test");
    await page
      .getByRole("button", { name: "Kirim tautan pemulihan", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Periksa email Anda", exact: true })
      .waitFor();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Login", exact: true })
      .click();
    assert.equal(await input("NPSN").inputValue(), "");
    assert.equal(
      await page
        .getByText("Permintaan aktivasi diterima fixture.", { exact: true })
        .count(),
      0,
    );
    await page.goBack();
    await page
      .getByRole("heading", { name: "Pulihkan kata sandi", exact: true })
      .waitFor();
    assert.equal(await input("Email").inputValue(), "");
    assert.equal(
      await page.evaluate(() => window.__navigationDocument),
      "same-document",
    );
    console.log(
      "PASS Auth: leaving/revisiting clears lookup, activation message and Dinas recovery success without changing lifecycle",
    );
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Kata sandi", exact: true })
      .click();
    await input("Kata sandi baru").fill("password-fiktif");
    await input("Ulangi kata sandi baru").fill("password-fiktif");
    await control("?mode=failure");
    await page
      .getByRole("button", { name: "Simpan kata sandi", exact: true })
      .click();
    await page.getByText("Password fiktif gagal.", { exact: true }).waitFor();
    assert.equal(
      await input("Kata sandi baru").inputValue(),
      "password-fiktif",
    );
    await control("?mode=success&hold=true");
    const passwordsBefore = (await control()).calls.password;
    await page
      .getByRole("button", { name: "Simpan kata sandi", exact: true })
      .evaluate((el) => {
        el.click();
        el.click();
        el.form.requestSubmit();
      });
    await page
      .getByRole("button", { name: "Menyimpan...", exact: true })
      .waitFor();
    for (let i = 0; i < 100; i++) {
      if ((await control()).calls.password > passwordsBefore) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal((await control()).calls.password, passwordsBefore + 1);
    await control("?release");
    await page.waitForURL(base + "/auth/login");
    await page
      .getByText("Kata sandi berhasil diperbarui.", { exact: true })
      .waitFor();
    assert.equal((await control()).calls.password, passwordsBefore + 1);
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Kata sandi", exact: true })
      .click();
    assert.equal(await input("Kata sandi baru").inputValue(), "");
    assert.equal(await input("Ulangi kata sandi baru").inputValue(), "");
    assert.equal(await main.getByRole("alert").count(), 0);
    await page.goBack();
    await page.waitForURL(base + "/auth/login");
    assert.equal(
      await page
        .getByText("Kata sandi berhasil diperbarui.", { exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page.evaluate(() => window.__navigationDocument),
      "same-document",
    );
    console.log(
      "PASS password: server failure retains inputs, duplicate guard holds, success returns once, new visit clears passwords",
    );
  }
  assert.deepEqual(errors, []);
  console.log("Navigation artifacts: " + artifacts);
} catch (error) {
  console.error(
    "Navigation fixture:",
    artifacts,
    "URL:",
    page?.url(),
    "Browser errors:",
    errors,
  );
  await page?.screenshot({
    path: path.join(artifacts, "failure.png"),
    fullPage: true,
  });
  throw error;
} finally {
  await browser?.close();
  server?.kill();
  fs.closeSync(log);
}
