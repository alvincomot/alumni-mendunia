// Local production HTTP/browser checks only. No credential submission or email.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

if (!process.env.RECOVERY_UI_TEST_DEPS) throw new Error("Set RECOVERY_UI_TEST_DEPS to an isolated playwright installation");
const dependency = createRequire(path.join(process.env.RECOVERY_UI_TEST_DEPS, "package.json"));
const { chromium } = dependency("playwright");
const socket = net.createServer();
await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: process.cwd(), windowsHide: true, stdio: "ignore",
});
const base = `http://127.0.0.1:${port}`;
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "alumni-production-auth-"));
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && server.exitCode === null; attempt++) {
    try { ready = (await fetch(`${base}/auth/login`)).ok; } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(ready, true, "Build the application before running this smoke test");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) => errors.push(`Request failed: ${new URL(request.url()).pathname}`));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
  });
  await page.route("**/*", (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/auth/login`);
    await page.getByLabel("NPSN", { exact: true }).waitFor();
    assert.equal(await page.getByText("Alumni Mendunia SMK", { exact: true }).count(), 0);
    const continueButton = page.getByRole("button", { name: "Lanjutkan" });
    assert.equal(await continueButton.evaluate((button) => getComputedStyle(button).backgroundColor), "rgb(23, 50, 77)");
    await continueButton.focus();
    assert.match(await continueButton.evaluate((button) => getComputedStyle(button).boxShadow), /rgb\(8, 126, 139\)/);
    assert.equal(await page.getByLabel("Kata sandi", { exact: true }).count(), 0);
    assert.equal(await page.locator('input[type="email"]').count(), 0);
    await continueButton.click();
    await page.getByText("Masukkan NPSN yang terdiri dari 8 digit.").waitFor();
    await page.getByRole("radio", { name: "Sekolah", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await page.getByLabel("Email", { exact: true }).waitFor();
    await page.keyboard.press("ArrowLeft");
    await page.getByLabel("NPSN", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Kata sandi", { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(artifacts, `login-${width}.png`), fullPage: true });
    await page.goto(`${base}/auth/login?mode=dinas`);
    await page.getByLabel("Email", { exact: true }).waitFor();
    assert.equal(await page.getByRole("radio", { name: "Dinas", exact: true }).getAttribute("aria-checked"), "true");
  }
  for (const route of [
    "/", "/protected", "/auth/sign-up", "/auth/sign-up-success", "/auth/update-password",
    "/dashboard", "/dashboard/alumni", "/dashboard/alumni/new",
    "/dashboard/alumni/00000000-0000-4000-8000-000000000001",
    "/dashboard/schools", "/dashboard/users", "/dashboard/reports",
    "/dashboard/reports/export", "/dashboard/audit-logs", "/dashboard/monitoring",
  ]) {
    const response = await page.goto(`${base}${route}`);
    assert.equal(response.ok(), true, route);
    await page.getByLabel("NPSN", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/auth/login", route);
  }
  for (const route of ["/auth/error", "/auth/forgot-password", "/auth/access-denied", "/auth/confirm", "/auth/callback"]) {
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}${route}`);
      await page.getByRole("heading", { level: 1 }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(artifacts, `${route.split('/').pop()}-${width}.png`), fullPage: true });
    }
  }
  await page.goto(`${base}/auth/error#access_token=fixture-sensitive&refresh_token=fixture-sensitive`);
  await page.getByRole("heading", { name: "Tautan autentikasi tidak dapat diproses" }).waitFor();
  await page.waitForFunction(() => location.hash === "");
  assert.equal(await page.getByRole("link", { name: "Pulihkan akun Dinas" }).count(), 0);
  await page.goto(`${base}/auth/confirm#access_token=fixture-sensitive`);
  await page.getByRole("heading", { name: "Tautan autentikasi tidak dapat diproses" }).waitFor();
  await page.waitForFunction(() => location.hash === "");
  assert.equal(new URL(page.url()).pathname, "/auth/error");
  assert.equal(new URL(page.url()).searchParams.get("reason"), "invalid_or_expired");
  assert.deepEqual(errors, []);
  console.log("PASS actual Next routes: NPSN first step, query-selected Dinas mode, shared primary color, validation, keyboard modes, four viewports, protected/legacy redirects, callback/error pages, and fragment scrubbing; no console errors or failed requests");
  console.log(`Screenshots: ${artifacts}`);
} finally {
  await browser?.close();
  server.kill();
}
