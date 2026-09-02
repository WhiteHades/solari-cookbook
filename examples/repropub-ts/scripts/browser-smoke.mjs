import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const PORT = 4174;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUTPUT = path.resolve(".tmp/repropub/browser-smoke");

async function waitForHealth() {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${ORIGIN}/api/health`);
      if (response.ok) return;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError ?? new Error("server did not become healthy");
}

await mkdir(OUTPUT, { recursive: true });
const server = spawn(process.execPath, [".build/src/server.js"], {
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });

let browser;
try {
  await waitForHealth();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Turn an unshareable ebook bug/i }).waitFor();
  await page.screenshot({ path: path.join(OUTPUT, "dashboard-initial.png"), fullPage: true });

  const runButton = page.getByRole("button", { name: "Run verified demo" }).first();
  await runButton.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "The failure survived reduction" }).waitFor({ timeout: 15_000 });
  await page.getByText("PRESERVED", { exact: true }).first().waitFor();
  await page.screenshot({ path: path.join(OUTPUT, "dashboard-result.png"), fullPage: true });

  await page.getByRole("tab", { name: "Decisions" }).click();
  await page.getByRole("heading", { name: "Nothing is removed on faith." }).waitFor();
  const decisionCount = await page.locator(".decision-row").count();
  if (decisionCount < 3) throw new Error(`expected reduction decisions, found ${decisionCount}`);

  await page.getByRole("tab", { name: "Artifacts" }).click();
  await page.getByText("Download machine-readable receipt").waitFor();
  const artifactCount = await page.locator(".artifact").count();
  if (artifactCount < 7) throw new Error(`expected at least 7 artifacts, found ${artifactCount}`);
  const epubHref = await page.locator('.artifact[href*="repro.epub"]').getAttribute("href");
  if (!epubHref) throw new Error("repro.epub artifact link is missing");
  const epubResponse = await page.request.get(new URL(epubHref, ORIGIN).toString());
  if (!epubResponse.ok()) throw new Error(`repro.epub download returned ${epubResponse.status()}`);

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const mobile = await mobileContext.newPage();
  await mobile.goto(ORIGIN, { waitUntil: "networkidle" });
  await mobile.getByRole("heading", { name: /Turn an unshareable ebook bug/i }).waitFor();
  await mobile.screenshot({ path: path.join(OUTPUT, "dashboard-mobile.png"), fullPage: true });
  await mobileContext.close();

  if (consoleErrors.length > 0) throw new Error(`browser console errors:\n${consoleErrors.join("\n")}`);
  const summary = {
    origin: ORIGIN,
    verdict: "PRESERVED",
    decisionCount,
    artifactCount,
    screenshots: ["dashboard-initial.png", "dashboard-result.png", "dashboard-mobile.png"],
    consoleErrors,
  };
  await writeFile(path.join(OUTPUT, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    server.once("exit", () => { clearTimeout(timer); resolve(); });
  });
  await writeFile(path.join(OUTPUT, "server.log"), serverLog);
}
