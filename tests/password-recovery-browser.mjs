// Isolated UI fixtures. Set RECOVERY_UI_TEST_DEPS to a temporary installation
// of playwright and esbuild. This runner never contacts Supabase or sends email.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.RECOVERY_UI_TEST_DEPS)
  throw new Error("Set RECOVERY_UI_TEST_DEPS to an isolated playwright/esbuild installation");
const dependency = createRequire(path.join(process.env.RECOVERY_UI_TEST_DEPS, "package.json"));
const projectDependency = createRequire(path.join(root, "package.json"));
const { chromium } = dependency("playwright");
const { build } = dependency("esbuild");
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "alumni-recovery-ui-results-"));

async function assertUnboxedPasswordToggle(button) {
  await button.hover();
  assert.equal(
    await button.evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgba(0, 0, 0, 0)",
  );

  await button.focus();
  const focusStyles = await button.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      boxShadow: styles.boxShadow,
      outlineColor: styles.outlineColor,
      outlineStyle: styles.outlineStyle,
      outlineWidth: styles.outlineWidth,
    };
  });
  assert.equal(focusStyles.boxShadow, "none");
  assert.ok(
    focusStyles.outlineStyle === "none" ||
      focusStyles.outlineWidth === "0px" ||
      focusStyles.outlineColor === "rgba(0, 0, 0, 0)",
    JSON.stringify(focusStyles),
  );
  assert.notEqual(
    await button.locator("..").evaluate((element) => getComputedStyle(element).boxShadow),
    "none",
  );
}

const mocks = {
  "next/navigation": `export function usePathname(){return location.pathname} export function useRouter(){return {replace(url){window.fixture.destination=url},refresh(){}}} export function redirect(url){throw Error('Unexpected fixture redirect: '+url)}`,
  "@/lib/auth/school-activation": `export async function getSchoolActivationContext(){return window.fixture.view==='activation'?{name:'SMK Aktivasi Fiktif',npsn:'00000013',request_id:'00000000-0000-4000-8000-000000000013'}:null}`,
  "@/lib/supabase/server": `export async function createClient(){return {
    auth:{async getClaims(){return {data:{claims:{sub:window.fixture.view==='login'?undefined:'fiktif'}}}},async getUser(){return {data:{user:{id:'fiktif'}}}}},
    from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:['activation','expired-activation'].includes(window.fixture.view)?null:{role:'petugas_sekolah',is_active:true,must_change_password:window.fixture.required},error:null}}}}
  }}`,
  "next/link": `import React from 'react';export default function Link(props){return <a {...props}/>}`,
  "@/lib/auth/auth-flow-context": `
    export function readAuthFlowContext(value){return ['school_activation','school_recovery','dinas_invitation','dinas_recovery'].includes(value)?value:null}
  `,
  "@/app/auth/forgot-password/actions": `
    export async function requestPasswordRecovery(email){
      window.fixture.requests.push(email);
      await new Promise(resolve=>setTimeout(resolve,100));
      return window.fixture.fail
        ? {success:false,message:'Permintaan belum dapat diproses. Silakan coba beberapa saat lagi.'}
        : {success:true};
    }`,
  "@/app/auth/update-password/actions": `
    export async function changePassword(input){
      window.fixture.passwordUpdates++;
      return {success:true,redirectTo:window.fixture.required?'/dashboard':'/auth/login'};
    }`,
  "@/app/auth/login/actions": `export async function loginWithPassword(input){window.fixture.logins.push(input);return window.fixture.loginSuccess?{success:true,redirectTo:'/dashboard'}:{success:false,message:'Identitas atau kata sandi tidak valid.'}}`,
  "@/app/auth/login/school-actions": `
    export async function lookupSchool(npsn){
      window.fixture.lookups.push(npsn);
      if(window.fixture.notFound)return {success:false,message:'Sekolah tidak ditemukan. Periksa NPSN yang Anda masukkan.'};
      return {success:true,school:{name:'SMK Aktivasi Fiktif dengan Nama Sekolah yang Panjang',npsn,status:window.fixture.schoolStatus,retry_after:0}};
    }
    export async function requestSchoolActivation(input){
      window.fixture.activations.push(input);
      if(window.fixture.holdMail)await new Promise(resolve=>{window.fixture.releaseMail=resolve});
      await new Promise(resolve=>setTimeout(resolve,100));
      return window.fixture.schoolMailFail?{success:false,message:'Permintaan email belum dapat diproses.'}:{success:true,message:'Permintaan email diterima oleh layanan Auth.',retryAfter:60};
    }
    export async function requestSchoolRecovery(npsn){window.fixture.schoolRecoveries.push(npsn);return {success:true,message:'Periksa email sekolah yang terverifikasi.',retryAfter:60};}
  `,
  "@/app/dashboard/schools/actions": `
    export async function getSchoolAccountDetails(){return {success:true,details:{
      school:{id:'00000000-0000-4000-8000-000000000011',name:'SMK Fiktif',npsn:'00000011',isActive:true},
      accounts:[],status:"UNCLAIMED"}}}
  `,
  "@/lib/supabase/client": `export function createClient(){return {auth:{async signOut(){window.fixture.signedOut=true;return {error:null}}}}}`,
};
const compiled = await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      import React from 'react';import {createRoot} from 'react-dom/client';
      import {ForgotPasswordForm} from './components/forgot-password-form';
      import LoginPage from './app/auth/login/page';
      import PasswordPage from './app/auth/update-password/page';
      import ErrorPage from './app/auth/error/page';
      import {SchoolAccountDialog} from './components/schools/school-account-dialog';
      import {ToastProvider} from './components/ui/toast';
      const view=new URL(location.href).searchParams.get('view') ||
        (location.pathname==='/auth/login'?'login':'recovery');
      window.fixture={view,requests:[],passwordUpdates:0,fail:false,required:view==='mandatory'||view==='activation',adminChanges:0,logins:[],lookups:[],activations:[],schoolRecoveries:[],schoolStatus:'ACTIVE'};
      async function resolve(element){
        if(!React.isValidElement(element))return element;
        if(element.type?.constructor?.name==='AsyncFunction')return resolve(await element.type(element.props));
        if(element.props.children!==undefined)return React.cloneElement(element,{},...(await Promise.all(React.Children.toArray(element.props.children).map(resolve))));
        return element;
      }
      async function start(){
      const errorContexts={
        'error-school-activation':'school_activation',
        'error-school-recovery':'school_recovery',
        'error-dinas-invitation':'dinas_invitation',
        'error-dinas-recovery':'dinas_recovery',
        'error-unsupported':'school_activation'
      };
      const content=view==='login'?await resolve(LoginPage({searchParams:Promise.resolve(Object.fromEntries(new URL(location.href).searchParams))})):
        ['update','mandatory','activation','expired-activation'].includes(view)?await resolve(PasswordPage()):
        (view==='error-neutral'||errorContexts[view])?await resolve(ErrorPage({searchParams:Promise.resolve({
          auth_context:errorContexts[view]||'tampered',
          reason:view==='error-unsupported'?'unsupported_redirect':'invalid_or_expired'
        })})):
        <main className='flex min-h-svh items-center justify-center bg-background p-6'>
          <div className='w-full max-w-md'>
            {view==='admin-school'?<SchoolAccountDialog school={{id:'00000000-0000-4000-8000-000000000011',name:'SMK Fiktif',npsn:'00000011'}}/>:
             <ForgotPasswordForm/>}
          </div>
        </main>;
        createRoot(document.getElementById('root')).render(<ToastProvider>{content}</ToastProvider>);
      }start();`,
    resolveDir: root, loader: "tsx",
  },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  plugins: [{
    name: "isolated-auth-fixture",
    setup(builder) {
      builder.onResolve({ filter: /^(next\/|@\/)/ }, (args) => {
        if (args.path in mocks) return { path: args.path, namespace: "mock" };
        if (args.path.startsWith("@/")) {
          const file = path.join(root, args.path.slice(2));
          for (const suffix of [".tsx", ".ts", "/index.ts"])
            if (fs.existsSync(file + suffix)) return { path: file + suffix };
        }
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
        contents: mocks[args.path], loader: "tsx", resolveDir: root,
      }));
    },
  }],
});
const css = await projectDependency("postcss")([
  projectDependency("tailwindcss")({
    ...projectDependency("./tailwind.config.ts").default,
    content: [path.join(root, "components/**/*.tsx"), path.join(root, "app/**/*.tsx")],
  }),
]).process(fs.readFileSync(path.join(root, "app/globals.css"), "utf8"), { from: undefined });
const builtCss = fs.readdirSync(path.join(root, ".next/static/chunks"))
  .filter((name) => name.endsWith(".css"))
  .map((name) => fs.readFileSync(path.join(root, ".next/static/chunks", name), "utf8"))
  .join("\n");
const fontFaces = (builtCss.match(/@font-face\{[^}]+\}/g) ?? []).join("\n");
const server = http.createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.url === "/fixture.js") {
    response.setHeader("Content-Type", "application/javascript");
    response.end(compiled.outputFiles[0].text);
  } else if (request.url === "/fixture.css") {
    response.setHeader("Content-Type", "text/css");
    response.end(`${fontFaces}\n:root{--font-inter:Inter,Arial,sans-serif;--font-plus-jakarta:'Plus Jakarta Sans',Arial,sans-serif}\n${css.css}`);
  } else if (/^\/media\/[A-Za-z0-9_.-]+\.woff2$/.test(request.url)) {
    response.setHeader("Content-Type", "font/woff2");
    response.end(fs.readFileSync(path.join(root, ".next/static/media", path.basename(request.url))));
  } else if (request.url === "/email-preview") {
    response.setHeader("Content-Type", "text/html");
    response.end(fs.readFileSync(path.join(root, "docs/email-templates/reset-password.html")));
  } else {
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><html lang='id'><head><meta name='viewport' content='width=device-width,initial-scale=1'/><link rel='stylesheet' href='/fixture.css'/></head><body><div id='root'></div><script src='/fixture.js'></script></body></html>`);
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    if (
      request.resourceType() === "font" &&
      request.failure()?.errorText === "net::ERR_ABORTED"
    )
      return;
    errors.push(`Request failed: ${new URL(request.url()).pathname}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
  });
  await page.route("**/*", (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/?view=login`);
    await page.getByRole("heading", { name: "Masuk ke sistem", exact: true }).waitFor();
    assert.equal(await page.getByText("PORTAL RESMI BIDANG SMK", { exact: true }).isVisible(), width >= 1024);
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    await page.getByText("Masukkan NPSN yang terdiri dari 8 digit.").waitFor();
    await page.getByLabel("NPSN", { exact: true }).fill("00000013");
    await page.evaluate(() => { window.fixture.notFound = true; });
    await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    await page.getByText("Sekolah tidak ditemukan. Periksa NPSN yang Anda masukkan.").waitFor();
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    await page.evaluate(() => { window.fixture.notFound = false; });
    await page.getByRole("button", { name: "Lanjutkan", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "SMK Aktivasi Fiktif dengan Nama Sekolah yang Panjang" }).waitFor();
    await page.getByText("NPSN: 00000013", { exact: true }).waitFor();
    await page.getByText("Masukkan kata sandi akun sekolah untuk melanjutkan.", { exact: true }).waitFor();
    await page.locator('form[aria-busy="false"]').waitFor();
    assert.equal(
      await page
        .getByLabel("Kata sandi", { exact: true })
        .evaluate((element) => element === document.activeElement),
      true,
    );
    const passwordLabelBox = await page.getByText("Kata sandi", { exact: true }).boundingBox();
    const recoveryButtonBox = await page.getByRole("button", { name: "Lupa kata sandi?" }).boundingBox();
    assert.ok(passwordLabelBox && recoveryButtonBox);
    assert.ok(Math.abs((passwordLabelBox.y + passwordLabelBox.height / 2) - (recoveryButtonBox.y + recoveryButtonBox.height / 2)) < 8);
    await assertUnboxedPasswordToggle(
      page.getByRole("button", { name: "Tampilkan kata sandi", exact: true }),
    );
    await page.getByLabel("Kata sandi", { exact: true }).fill("fictional-wrong-password");
    await page.getByRole("button", { name: "Tampilkan kata sandi", exact: true }).click();
    assert.equal(await page.getByLabel("Kata sandi", { exact: true }).getAttribute("type"), "text");
    await page.getByRole("button", { name: "Sembunyikan kata sandi", exact: true }).click();
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(await page.evaluate(() => window.fixture.logins[0].identity), "00000013");
    await page.getByRole("heading", { name: "SMK Aktivasi Fiktif dengan Nama Sekolah yang Panjang" }).waitFor();
    await page.evaluate(() => { window.fixture.loginSuccess = true; });
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixture.destination), "/dashboard");
    await page.getByRole("button", { name: "Lupa kata sandi?" }).click();
    await page.getByText("Periksa email sekolah yang terverifikasi.").waitFor();
    assert.deepEqual(await page.evaluate(() => window.fixture.schoolRecoveries), ["00000013"]);
    assert.equal(await page.locator('input[type="email"]').count(), 0);
    await page.screenshot({ path: path.join(artifacts, `school-active-${width}.png`), fullPage: true });
    for (const status of ["UNCLAIMED", "PENDING_ACTIVATION", "SUSPENDED"]) {
      const backButton = page.getByRole("button", { name: "Kembali", exact: true });
      const backButtonBox = await backButton.boundingBox();
      assert.ok(backButtonBox);
      assert.equal(Math.round(backButtonBox.height), 36);
      assert.ok(backButtonBox.width >= 80 && backButtonBox.width <= 104);
      assert.equal(await backButton.locator("svg").count(), 1);
      await backButton.hover();
      await page.waitForTimeout(200);
      assert.equal(await backButton.evaluate((element) => getComputedStyle(element).color), "rgb(23, 50, 77)");
      await backButton.focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.getByLabel("NPSN", { exact: true }).inputValue(), "00000013");
      assert.equal(await page.getByLabel("NPSN", { exact: true }).evaluate((element) => element === document.activeElement), true);
      assert.equal(await page.locator('input[type="password"]').count(), 0);
      await page.evaluate((value) => { window.fixture.schoolStatus = value; }, status);
      await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
      await page.getByRole("heading", { name: "SMK Aktivasi Fiktif dengan Nama Sekolah yang Panjang" }).waitFor();
      await page.getByText("NPSN: 00000013", { exact: true }).waitFor();
      await page.locator('form[aria-busy="false"]').waitFor();
      await page.screenshot({ path: path.join(artifacts, `school-${status.toLowerCase()}-initial-${width}.png`), fullPage: true, animations: "disabled" });
      if (status === "UNCLAIMED") {
        await page.getByLabel("Email Sekolah", { exact: true }).waitFor();
        assert.equal(
          await page
            .getByLabel("Email Sekolah", { exact: true })
            .evaluate((element) => element === document.activeElement),
          true,
        );
        assert.equal(await page.getByRole("button", { name: "Kirim Tautan Aktivasi", exact: true }).evaluate(el => getComputedStyle(el).backgroundColor), "rgb(23, 50, 77)");
        await page.getByRole("button", { name: "Kirim Tautan Aktivasi", exact: true }).click();
        await page.getByText("Masukkan email sekolah yang valid.").waitFor();
        await page.getByLabel("Email Sekolah", { exact: true }).fill("fiktif@school.example");
        await page.evaluate(() => { window.fixture.schoolMailFail = true; });
        await page.getByRole("button", { name: "Kirim Tautan Aktivasi", exact: true }).click();
        await page.getByText("Permintaan email belum dapat diproses.").waitFor();
        assert.equal(await page.getByLabel("Email Sekolah", { exact: true }).inputValue(), "fiktif@school.example");
        await page.evaluate(() => { window.fixture.schoolMailFail = false; window.fixture.holdMail = true; });
        await page.getByRole("button", { name: "Kirim Tautan Aktivasi", exact: true }).click();
        await page.waitForFunction(() => typeof window.fixture.releaseMail === "function");
        assert.equal(await page.getByRole("button", { name: "Memproses...", exact: true }).isDisabled(), true);
        assert.equal(await page.locator('form[aria-busy="true"]').count(), 1);
        await page.screenshot({ path: path.join(artifacts, `school-activation-loading-${width}.png`), fullPage: true });
        await page.evaluate(() => { window.fixture.holdMail = false; window.fixture.releaseMail(); });
        await page.getByText("Permintaan email diterima oleh layanan Auth.").waitFor();
        assert.equal(await page.getByRole("button", { name: "Kirim Ulang", exact: true }).isDisabled(), true);
      } else if (status === "PENDING_ACTIVATION") {
        await page.getByRole("heading", { name: "Periksa email aktivasi", exact: true }).waitFor();
        assert.equal(await page.locator('input[type="email"]').count(), 0);
        await page.evaluate(() => { window.fixture.schoolMailFail = true; });
        await page.getByRole("button", { name: "Kirim Ulang", exact: true }).click();
        await page.getByText("Permintaan email belum dapat diproses.").waitFor();
        await page.evaluate(() => { window.fixture.schoolMailFail = false; });
        await page.getByRole("button", { name: "Kirim Ulang", exact: true }).click();
        await page.getByText("Permintaan email diterima oleh layanan Auth.").waitFor();
      } else {
        await page.getByRole("heading", { name: "Akses akun dinonaktifkan", exact: true }).waitFor();
        await page.getByText(/Akun sekolah dinonaktifkan/).waitFor();
        assert.equal(await page.getByRole("button", { name: "Masuk", exact: true }).count(), 0);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(artifacts, `school-${status.toLowerCase()}-${width}.png`), fullPage: true });
    }
    await page.getByRole("radio", { name: "Dinas", exact: true }).click();
    await assertUnboxedPasswordToggle(
      page.getByRole("button", { name: "Tampilkan kata sandi", exact: true }),
    );
    assert.equal(await page.getByRole("link", { name: "Lupa kata sandi?" }).getAttribute("href"), "/auth/forgot-password");
    await page.getByRole("link", { name: "Lupa kata sandi?" }).click();
    const send = page.getByRole("button", { name: "Kirim tautan pemulihan" });
    await send.click();
    assert.equal(await page.getByRole("alert").textContent(), "Masukkan alamat email Anda.");
    assert.equal(await page.locator("#email").evaluate((element) => element === document.activeElement), true);
    await page.getByLabel("Email", { exact: true }).fill("invalid");
    await send.click();
    assert.equal(await page.getByRole("alert").textContent(), "Masukkan alamat email yang valid.");
    await page.getByLabel("Email", { exact: true }).fill("fiktif@dinas.example");
    await page.evaluate(() => { window.fixture.fail = true; });
    await send.click();
    await page.getByText("Permintaan belum dapat diproses. Silakan coba beberapa saat lagi.").waitFor();
    assert.equal(await page.getByLabel("Email", { exact: true }).inputValue(), "fiktif@dinas.example");
    await page.evaluate(() => { window.fixture.fail = false; });
    await send.click();
    await page.getByText("Periksa email Anda", { exact: true }).waitFor();
    assert.equal(await page.getByRole("status").textContent(), "Jika email terdaftar, tautan pemulihan akan dikirim. Periksa Kotak Masuk atau Spam.");
    assert.equal(await page.getByRole("link", { name: "Kembali ke login" }).getAttribute("href"), "/auth/login");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(artifacts, `recovery-confirmation-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: "Kembali ke login" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "Masuk ke sistem" }).waitFor();

    await page.goto(`${base}/?view=update`);
    assert.equal(await page.getByRole("button", { name: "Keluar", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Gunakan akun lain" }).count(), 0);
    await page.getByLabel("Kata sandi baru", { exact: true }).fill("abcdefg");
    await page.getByLabel("Ulangi kata sandi baru").fill("abcdefg");
    await page.getByRole("button", { name: "Simpan kata sandi" }).click();
    await page.getByText("Kata sandi harus minimal 8 karakter.").waitFor();
    await page.getByLabel("Kata sandi baru", { exact: true }).fill("abcdefgh");
    await page.getByRole("button", { name: "Tampilkan kata sandi" }).first().focus();
    await page.keyboard.press("Space");
    assert.equal(await page.locator("#password").getAttribute("type"), "text");
    assert.equal(await page.locator("#password").inputValue(), "abcdefgh");
    await page.getByRole("button", { name: "Sembunyikan kata sandi" }).click();
    await page.getByRole("button", { name: "Simpan kata sandi" }).click();
    await page.getByText("Konfirmasi kata sandi tidak cocok.").waitFor();
    await page.getByLabel("Ulangi kata sandi baru").fill("abcdefgh");
    await page.getByRole("button", { name: "Simpan kata sandi" }).click();
    await page.waitForFunction(() => window.fixture.destination === "/auth/login");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(artifacts, `password-update-${width}.png`), fullPage: true });

    await page.goto(`${base}/?view=mandatory`);
    await page.getByRole("button", { name: "Gunakan akun lain" }).click();
    await page.waitForFunction(() => window.fixture.signedOut && window.fixture.destination === "/auth/login");

    await page.goto(`${base}/?view=activation`);
    await page.getByRole("heading", { name: "Buat Kata Sandi" }).waitFor();
    await page.getByText("SMK Aktivasi Fiktif", { exact: true }).waitFor();
    await page.getByLabel("Kata sandi baru", { exact: true }).fill("abcdefgh");
    await page.getByLabel("Ulangi kata sandi baru").fill("abcdefgh");
    await page.screenshot({ path: path.join(artifacts, `school-password-create-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Buat Kata Sandi", exact: true }).click();
    await page.waitForFunction(() => window.fixture.destination === "/dashboard");

    await page.goto(`${base}/?view=expired-activation`);
    await page.getByRole("heading", { name: "Aktivasi belum dapat dilanjutkan" }).waitFor();
    await page.screenshot({ path: path.join(artifacts, `school-activation-expired-${width}.png`), fullPage: true, animations: "disabled" });
    await page.getByRole("button", { name: "Gunakan akun lain" }).click();
    await page.waitForFunction(() => window.fixture.signedOut && window.fixture.destination === "/auth/login");
    await page.goto(`${base}/?view=error-school-activation#access_token=fixture-sensitive&refresh_token=fixture-sensitive`);
    await page.getByRole("heading", { name: "Aktivasi akun Sekolah tidak dapat dilanjutkan" }).waitFor();
    await page.waitForFunction(() => location.hash === "");
    assert.equal(await page.getByRole("link", { name: "Kembali ke Login Sekolah" }).getAttribute("href"), "/auth/login?mode=school");
    assert.equal(await page.getByRole("link", { name: "Minta tautan aktivasi baru" }).getAttribute("href"), "/auth/login?mode=school&flow=activation");
    assert.equal(await page.getByRole("link", { name: "Pulihkan akun Dinas" }).count(), 0);
    await page.screenshot({ path: path.join(artifacts, `auth-error-school-activation-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: "Kembali ke Login Sekolah" }).click();
    await page.getByLabel("NPSN", { exact: true }).waitFor();
    await page.goto(`${base}/?view=error-school-activation`);
    await page.getByRole("link", { name: "Minta tautan aktivasi baru" }).click();
    await page.getByLabel("NPSN", { exact: true }).waitFor();

    await page.goto(`${base}/?view=error-school-recovery`);
    await page.getByRole("heading", { name: "Pemulihan akun Sekolah tidak dapat dilanjutkan" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Pulihkan akun Sekolah" }).getAttribute("href"), "/auth/login?mode=school&flow=recovery");
    assert.equal(await page.getByRole("link", { name: "Pulihkan akun Dinas" }).count(), 0);
    await page.getByRole("link", { name: "Pulihkan akun Sekolah" }).click();
    await page.getByLabel("NPSN", { exact: true }).waitFor();

    await page.goto(`${base}/?view=error-dinas-recovery`);
    await page.getByRole("heading", { name: "Pemulihan akun Dinas tidak dapat dilanjutkan" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Pulihkan akun Dinas" }).getAttribute("href"), "/auth/forgot-password");
    assert.equal(await page.getByRole("link", { name: "Minta tautan aktivasi baru" }).count(), 0);
    await page.getByRole("link", { name: "Pulihkan akun Dinas" }).click();
    await page.getByRole("heading", { name: "Pulihkan kata sandi" }).waitFor();
    await page.goto(`${base}/?view=error-dinas-recovery`);
    await page.getByRole("link", { name: "Kembali ke Login Dinas" }).click();
    await page.getByLabel("Email", { exact: true }).waitFor();
    assert.equal(await page.getByRole("radio", { name: "Dinas", exact: true }).getAttribute("aria-checked"), "true");

    await page.goto(`${base}/?view=error-dinas-invitation`);
    await page.getByRole("heading", { name: "Undangan akun Dinas tidak dapat dilanjutkan" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Kembali ke Login Dinas" }).getAttribute("href"), "/auth/login?mode=dinas");
    assert.equal(await page.getByRole("link", { name: "Pulihkan akun Dinas" }).count(), 0);
    await page.getByRole("link", { name: "Kembali ke Login Dinas" }).click();
    await page.getByLabel("Email", { exact: true }).waitFor();

    await page.goto(`${base}/?view=error-neutral`);
    await page.getByRole("heading", { name: "Tautan autentikasi tidak dapat diproses" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Kembali ke pilihan login" }).getAttribute("href"), "/auth/login");
    assert.equal(await page.getByRole("link", { name: /Pulihkan|aktivasi/ }).count(), 0);
    await page.getByRole("link", { name: "Kembali ke pilihan login" }).click();
    await page.getByLabel("NPSN", { exact: true }).waitFor();

    await page.goto(`${base}/?view=error-unsupported`);
    await page.getByText(/tidak memastikan bahwa tautan telah kedaluwarsa/).waitFor();

    await page.goto(`${base}/?view=admin-school`);
    await page.getByRole("button", { name: "Detail akun" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Belum Aktivasi", { exact: true }).waitFor();
    assert.equal(await dialog.locator('input,select,textarea').count(), 0);
    assert.equal(await page.evaluate(() => window.fixture.adminChanges), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(artifacts, `school-admin-${width}.png`), fullPage: true });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    console.log(`PASS ${width}px: all four School states retain name/NPSN, lookup/back, activation/resend/cooldown, login/recovery, Dinas recovery, password creation, no overflow`);
  }
  assert.deepEqual(errors, []);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/email-preview`);
    await page.getByRole("heading", { name: "Atur Ulang Kata Sandi", exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Atur ulang kata sandi", exact: true }).getAttribute("href"), "{{ .ConfirmationURL }}");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(artifacts, `email-template-${width}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log("PASS no browser console errors or failed requests; all Auth operations were mocked");
  console.log(`Screenshots: ${artifacts}`);
} catch (error) {
  console.error("Fixture browser errors:", errors);
  throw error;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
