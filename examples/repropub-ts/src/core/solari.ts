import { randomUUID } from "node:crypto";

import { inspectPublication } from "./epub.js";
import { sha256 } from "./hash.js";
import { judgeNavigationObservation } from "./oracle.js";
import { withRunResources, type CleanupReceipt } from "./resources.js";
import type {
  NavigationObservation,
  NavigationScenario,
  ReaderTarget,
  WitnessEnvironment,
  WitnessResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.getsolari.com";
const DEFAULT_PORT = 3000;
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

export class SolariApiError extends Error {
  public readonly status: number | undefined;
  public readonly code: string | undefined;

  public constructor(status: number | undefined, code: string | undefined, message: string) {
    super(message);
    this.name = "SolariApiError";
    this.status = status;
    this.code = code;
  }
}

export interface BrowserPagePort {
  goto(url: string, options?: { readonly waitUntil?: "load" | "domcontentloaded" | "networkidle" }): Promise<unknown>;
  locator(selector: string): { click(): Promise<void> };
  evaluate<T>(pageFunction: () => T): Promise<T>;
  screenshot(options?: { readonly type?: "png"; readonly fullPage?: boolean }): Promise<Uint8Array>;
}

export interface BrowserSessionPort {
  readonly id: string;
  newPage(): Promise<BrowserPagePort>;
  close(): Promise<void>;
}

export interface BrowserClientPort {
  launch(options: { readonly recording: true; readonly retries: number; readonly probe: true }): Promise<BrowserSessionPort>;
  downloadReplay(id: string): Promise<Uint8Array>;
  close(): Promise<void>;
}

export type BrowserClientFactory = (input: {
  readonly apiKey: string;
  readonly baseUrl: string;
}) => Promise<BrowserClientPort>;

interface SolariDependencies {
  readonly fetch?: typeof fetch;
  readonly browserFactory?: BrowserClientFactory;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly idempotencyKey?: () => string;
}

interface RunSolariWitnessInput {
  readonly apiKey: string | undefined;
  readonly archive: Buffer;
  readonly scenario: NavigationScenario;
  readonly target: ReaderTarget;
  readonly baseUrl?: string;
  readonly dependencies?: SolariDependencies;
}

interface BrowserObservationShape {
  readonly navigationLabel: string | undefined;
  readonly requestedHref: string | undefined;
  readonly requestedFragment: string | undefined;
  readonly lookupFragment: string | undefined;
  readonly targetPath: string | undefined;
  readonly observedTargetId: string | undefined;
  readonly observedHeading: string | undefined;
  readonly availableTargetIds: readonly string[];
}

export interface SolariWitnessResult {
  readonly witness: WitnessResult;
  readonly screenshot: Buffer;
  readonly replay: Buffer;
  readonly cleanup: CleanupReceipt;
  readonly infrastructure: {
    readonly sandboxFingerprint: string;
    readonly browserSessionFingerprint: string;
    readonly previewHost: string;
  };
}

interface CreateSandboxResponse {
  readonly sandboxId: string;
}

interface CommandResponse {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface PreviewResponse {
  readonly url: string;
  readonly token?: string;
}

interface UploadResponse {
  readonly url: string;
}

function redactSecrets(value: string): string {
  return value
    .replace(/slr_(?:live|test)_[\w-]+/gi, "[redacted-solari-key]")
    .replace(/([?&](?:pt_token|token|signature|x-amz-[^=]+)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

function statusOf(error: unknown): number | undefined {
  if (error instanceof SolariApiError) return error.status;
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function codeOf(error: unknown): string | undefined {
  if (error instanceof SolariApiError) return error.code;
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function isTransient(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined) return TRANSIENT_STATUSES.has(status);
  return error instanceof TypeError || codeOf(error) === "ECONNRESET" || codeOf(error) === "ETIMEDOUT";
}

async function retryTransient<T>(
  task: () => Promise<T>,
  options: {
    readonly attempts: number;
    readonly sleep: (milliseconds: number) => Promise<void>;
    readonly backoffMs: number;
  },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === options.attempts) throw error;
      await options.sleep(options.backoffMs * attempt);
    }
  }
  throw lastError;
}

async function readError(response: Response): Promise<SolariApiError> {
  let code: string | undefined;
  let message = `Solari request failed with HTTP ${response.status}`;
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as { code?: unknown; message?: unknown; error?: unknown };
      if (typeof body.code === "string") code = body.code;
      if (typeof body.message === "string") message = body.message;
      else if (typeof body.error === "string") message = body.error;
    } else {
      const body = await response.text();
      if (body.trim()) message = body.trim();
    }
  } catch {
    // Preserve the status-only message when an error body is malformed.
  }
  return new SolariApiError(response.status, code, redactSecrets(message));
}

class SolariSandboxGateway {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #idempotencyKey: () => string;

  public constructor(input: {
    readonly apiKey: string;
    readonly baseUrl: string;
    readonly fetch: typeof fetch;
    readonly sleep: (milliseconds: number) => Promise<void>;
    readonly idempotencyKey: () => string;
  }) {
    this.#apiKey = input.apiKey;
    this.#baseUrl = input.baseUrl.replace(/\/$/, "");
    this.#fetch = input.fetch;
    this.#sleep = input.sleep;
    this.#idempotencyKey = input.idempotencyKey;
  }

  async #request(
    method: string,
    pathname: string,
    options: {
      readonly body?: unknown;
      readonly headers?: Readonly<Record<string, string>>;
      readonly attempts?: number;
      readonly authenticated?: boolean;
    } = {},
  ): Promise<Response> {
    const url = pathname.startsWith("http") ? pathname : `${this.#baseUrl}${pathname}`;
    return retryTransient(
      async () => {
        const headers = new Headers(options.headers);
        if (options.authenticated !== false) headers.set("authorization", `Bearer ${this.#apiKey}`);
        let body: BodyInit | undefined;
        if (options.body !== undefined) {
          if (typeof options.body === "string") {
            body = options.body;
          } else if (options.body instanceof Uint8Array) {
            body = new Uint8Array(options.body).buffer;
          } else {
            headers.set("content-type", "application/json");
            body = JSON.stringify(options.body);
          }
        }
        const requestInit: RequestInit = body === undefined ? { method, headers } : { method, headers, body };
        const response = await this.#fetch(url, requestInit);
        if (!response.ok) throw await readError(response);
        return response;
      },
      { attempts: options.attempts ?? 3, sleep: this.#sleep, backoffMs: 250 },
    );
  }

  public async createSandbox(): Promise<string> {
    const key = this.#idempotencyKey();
    const response = await this.#request("POST", "/sandboxes", {
      headers: { "idempotency-key": key },
      body: {
        kind: "sandbox",
        template: "base",
        cpu: 2,
        memMb: 2048,
        diskGb: 4,
        timeoutMs: 5 * 60_000,
        lifecycle: { onTimeout: "kill", autoResume: false },
        metadata: { project: "repropub", purpose: "recorded-witness" },
      },
    });
    const payload = (await response.json()) as Partial<CreateSandboxResponse>;
    if (!payload.sandboxId) throw new SolariApiError(undefined, "InvalidResponse", "sandbox response has no id");
    return payload.sandboxId;
  }

  public async exec(
    sandboxId: string,
    command: string,
    args: readonly string[],
    timeoutMs = 30_000,
  ): Promise<CommandResponse> {
    const response = await this.#request(
      "POST",
      `/sandboxes/${encodeURIComponent(sandboxId)}/exec`,
      { body: { cmd: command, args, timeoutMs } },
    );
    const payload = (await response.json()) as Partial<CommandResponse>;
    if (typeof payload.exitCode !== "number") {
      throw new SolariApiError(undefined, "InvalidResponse", "sandbox exec response has no exit code");
    }
    return {
      exitCode: payload.exitCode,
      stdout: typeof payload.stdout === "string" ? payload.stdout : "",
      stderr: typeof payload.stderr === "string" ? payload.stderr : "",
    };
  }

  public async upload(sandboxId: string, destination: string, data: Buffer): Promise<void> {
    const minted = await this.#request(
      "GET",
      `/sandboxes/${encodeURIComponent(sandboxId)}/files/upload-url?path=${encodeURIComponent(destination)}`,
    );
    const payload = (await minted.json()) as Partial<UploadResponse>;
    if (!payload.url) throw new SolariApiError(undefined, "InvalidResponse", "upload response has no URL");
    await this.#request("PUT", payload.url, {
      body: data,
      headers: { "content-type": "application/octet-stream" },
      authenticated: false,
    });
  }

  public async previewUrl(sandboxId: string, port: number): Promise<string> {
    const response = await this.#request(
      "GET",
      `/sandboxes/${encodeURIComponent(sandboxId)}/ports/${port}`,
    );
    const payload = (await response.json()) as Partial<PreviewResponse>;
    if (!payload.url) throw new SolariApiError(undefined, "InvalidResponse", "preview response has no URL");
    const preview = new URL(payload.url);
    if (payload.token && !preview.searchParams.has("pt_token")) preview.searchParams.set("pt_token", payload.token);
    return preview.href;
  }

  public async kill(sandboxId: string): Promise<void> {
    await this.#request("DELETE", `/sandboxes/${encodeURIComponent(sandboxId)}`, { attempts: 3 });
  }
}

function dynamicImport(specifier: string): Promise<unknown> {
  const loader = new Function("specifier", "return import(specifier)") as (value: string) => Promise<unknown>;
  return loader(specifier);
}

const productionBrowserFactory: BrowserClientFactory = async ({ apiKey, baseUrl }) => {
  const loaded = (await dynamicImport("@solarisdk/browser")) as {
    Solari?: new (options: {
      readonly apiKey: string;
      readonly baseUrl: string;
      readonly maxAttempts: number;
      readonly backoffMs: number;
      readonly timeoutMs: number;
    }) => {
      launch(options: { readonly recording: true; readonly retries: number; readonly probe: true }): Promise<BrowserSessionPort>;
      sessions: { downloadReplay(id: string): Promise<Uint8Array> };
      close(): Promise<void>;
    };
  };
  if (typeof loaded.Solari !== "function") {
    throw new Error("@solarisdk/browser did not export Solari");
  }
  const client = new loaded.Solari({ apiKey, baseUrl, maxAttempts: 1, backoffMs: 250, timeoutMs: 90_000 });
  return {
    launch: (options) => client.launch(options),
    downloadReplay: (id) => client.sessions.downloadReplay(id),
    close: () => client.close(),
  };
};

export function buildSolariReaderServer(): string {
  return String.raw`#!/usr/bin/env python3
import argparse
import html
import json
import posixpath
import urllib.parse
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from xml.etree import ElementTree as ET


def local_name(tag):
    return tag.rsplit("}", 1)[-1]


def first(root, name):
    return next((item for item in root.iter() if local_name(item.tag) == name), None)


def parse_fixture():
    with open("scenario.json", "r", encoding="utf-8") as handle:
        config = json.load(handle)
    with zipfile.ZipFile("repro.epub") as book:
        container = ET.fromstring(book.read("META-INF/container.xml"))
        rootfile = first(container, "rootfile")
        opf_path = rootfile.attrib["full-path"]
        opf_dir = posixpath.dirname(opf_path)
        package = ET.fromstring(book.read(opf_path))
        manifest = {}
        nav_href = None
        for item in package.iter():
            if local_name(item.tag) != "item":
                continue
            item_id = item.attrib.get("id")
            href = item.attrib.get("href")
            if item_id and href:
                manifest[item_id] = href
            if "nav" in item.attrib.get("properties", "").split():
                nav_href = href
        nav_path = posixpath.normpath(posixpath.join(opf_dir, nav_href))
        nav = ET.fromstring(book.read(nav_path))
        links = []
        for anchor in nav.iter():
            if local_name(anchor.tag) != "a" or "href" not in anchor.attrib:
                continue
            links.append({
                "href": anchor.attrib["href"],
                "label": " ".join("".join(anchor.itertext()).split()),
            })
        selected = next((link for link in links if link["href"] == config.get("navigationHref")), None)
        if selected is None:
            index = int(config.get("navigationIndex", 0))
            selected = links[index]
        requested_href = selected["href"]
        resource, separator, fragment = requested_href.partition("#")
        target_path = posixpath.normpath(posixpath.join(posixpath.dirname(nav_path), urllib.parse.unquote(resource)))
        document = ET.fromstring(book.read(target_path))
        headings = []
        for node in document.iter():
            if local_name(node.tag) not in {"h1", "h2", "h3", "h4", "h5", "h6"}:
                continue
            node_id = node.attrib.get("id")
            if not node_id:
                continue
            headings.append({"id": node_id, "text": " ".join("".join(node.itertext()).split())})
        lookup = fragment if config.get("fragmentResolution") == "literal" else urllib.parse.unquote(fragment)
        observed = next((heading for heading in headings if heading["id"] == lookup), headings[0] if headings else None)
        return {
            "navigationLabel": selected["label"],
            "requestedHref": requested_href,
            "requestedFragment": fragment or None,
            "lookupFragment": lookup or None,
            "targetPath": target_path,
            "observedTargetId": observed["id"] if observed else None,
            "observedHeading": observed["text"] if observed else None,
            "availableTargetIds": [heading["id"] for heading in headings],
            "expectedTargetId": config["expectedTargetId"],
        }


OBSERVATION = parse_fixture()
OBSERVATION_JSON = json.dumps(OBSERVATION).replace("</", "<\\/")


def page():
    observed = html.escape(str(OBSERVATION.get("observedTargetId")))
    expected = html.escape(str(OBSERVATION.get("expectedTargetId")))
    label = html.escape(str(OBSERVATION.get("navigationLabel")))
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ReproPub Solari witness</title>
<style>
body{{font-family:ui-sans-serif,system-ui;background:#07111f;color:#f8fafc;margin:0;min-height:100vh;display:grid;place-items:center}}
main{{width:min(760px,calc(100% - 48px));background:#0f1d2e;border:1px solid #28405d;border-radius:28px;padding:36px;box-shadow:0 28px 80px #0008}}
.eyebrow{{font:600 12px ui-monospace,monospace;letter-spacing:.15em;color:#8ca6c2;text-transform:uppercase}}
h1{{font-size:42px;margin:12px 0 8px}}p{{color:#9fb4cc;line-height:1.6}}
button{{appearance:none;border:0;border-radius:12px;background:#5eead4;color:#062019;font-weight:750;padding:13px 18px;cursor:pointer}}
dl{{display:grid;grid-template-columns:160px 1fr;gap:12px;margin-top:28px;padding:20px;background:#091523;border-radius:18px}}dt{{color:#8ca6c2}}dd{{margin:0;font-family:ui-monospace,monospace}}.bad{{color:#fb7185}}.good{{color:#5eead4}}
</style></head><body><main>
<div class="eyebrow">Independent Solari browser witness</div><h1>Encoded fragment navigation</h1>
<p>The sandbox parsed the reduced EPUB. The browser now performs the same navigation action a reader would.</p>
<button data-repropub-action="navigate">Open {label}</button>
<dl aria-live="polite"><dt>Observed</dt><dd id="observed" class="bad">not run</dd><dt>Expected</dt><dd class="good">{expected}</dd></dl>
<script>
const observation={OBSERVATION_JSON};
window.__REPROPUB_OBSERVATION__=null;
document.querySelector('[data-repropub-action="navigate"]').addEventListener('click',()=>{{
  window.__REPROPUB_OBSERVATION__=observation;
  document.getElementById('observed').textContent=observation.observedTargetId ?? 'none';
}});
</script></main></body></html>"""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/health"):
            body = b"ok"
            self.send_response(200)
            self.send_header("content-type", "text/plain")
        else:
            body = page().encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "text/html; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=3000)
    args = parser.parse_args()
    ThreadingHTTPServer(("0.0.0.0", args.port), Handler).serve_forever()
`;
}

function assertKey(apiKey: string | undefined): string {
  if (!apiKey?.trim()) throw new Error("SOLARI_API_KEY is required for the live witness");
  return apiKey.trim();
}

function ensureCommand(result: CommandResponse, purpose: string): void {
  if (result.exitCode !== 0) {
    throw new SolariApiError(
      undefined,
      "SandboxCommandFailed",
      `${purpose} exited ${result.exitCode}: ${redactSecrets(result.stderr || result.stdout)}`,
    );
  }
}

async function downloadReplay(
  client: BrowserClientPort,
  sessionId: string,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<Buffer> {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      return Buffer.from(await client.downloadReplay(sessionId));
    } catch (error) {
      if (statusOf(error) !== 404 || attempt === 6) throw error;
      await sleep(attempt * 1_000);
    }
  }
  throw new Error("Solari replay did not become available");
}

async function waitForPreview(
  previewUrl: string,
  fetchImpl: typeof fetch,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<void> {
  let lastStatus: number | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      const health = new URL(previewUrl);
      health.pathname = "/health";
      const response = await fetchImpl(health);
      lastStatus = response.status;
      if (response.ok && (await response.text()).trim() === "ok") return;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 20) await sleep(500);
  }

  const detail = lastError instanceof Error
    ? lastError.message
    : lastStatus === undefined
      ? "no response"
      : `HTTP ${lastStatus}`;
  throw new SolariApiError(
    lastStatus,
    "PreviewUnavailable",
    `reader harness did not become healthy: ${redactSecrets(detail)}`,
  );
}

export async function runSolariWitness(input: RunSolariWitnessInput): Promise<SolariWitnessResult> {
  const apiKey = assertKey(input.apiKey);
  inspectPublication(input.archive);
  const baseUrl = input.baseUrl ?? DEFAULT_BASE_URL;
  const fetchImpl = input.dependencies?.fetch ?? globalThis.fetch;
  const sleep = input.dependencies?.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const browserFactory = input.dependencies?.browserFactory ?? productionBrowserFactory;
  const gateway = new SolariSandboxGateway({
    apiKey,
    baseUrl,
    fetch: fetchImpl,
    sleep,
    idempotencyKey: input.dependencies?.idempotencyKey ?? randomUUID,
  });
  const startedAt = performance.now();

  const scoped = await withRunResources(async (scope) => {
    const sandboxId = await gateway.createSandbox();
    scope.register({
      kind: "solari-sandbox",
      id: sha256(sandboxId).slice(0, 16),
      close: () => gateway.kill(sandboxId),
    });

    ensureCommand(await gateway.exec(sandboxId, "mkdir", ["-p", "/tmp/repropub"]), "create workspace");
    await gateway.upload(sandboxId, "/tmp/repropub/repro.epub", input.archive);
    await gateway.upload(
      sandboxId,
      "/tmp/repropub/scenario.json",
      Buffer.from(
        `${JSON.stringify({ ...input.scenario, fragmentResolution: input.target.fragmentResolution }, null, 2)}\n`,
      ),
    );
    await gateway.upload(sandboxId, "/tmp/repropub/server.py", Buffer.from(buildSolariReaderServer()));

    const started = await gateway.exec(
      sandboxId,
      "sh",
      [
        "-c",
        "cd /tmp/repropub && nohup python3 server.py --port 3000 >server.log 2>&1 < /dev/null & echo $!",
      ],
      30_000,
    );
    ensureCommand(started, "start reader harness");
    const serverPid = started.stdout.trim().split(/\s+/)[0];
    if (!serverPid || !/^\d+$/.test(serverPid)) {
      throw new SolariApiError(undefined, "InvalidResponse", "reader harness did not return a process id");
    }
    scope.register({
      kind: "solari-process",
      id: sha256(`${sandboxId}:${serverPid}`).slice(0, 16),
      close: async () => {
        try {
          await gateway.exec(sandboxId, "kill", [serverPid], 10_000);
        } catch (error) {
          if (statusOf(error) !== 404) throw error;
        }
      },
    });

    const previewUrl = await gateway.previewUrl(sandboxId, DEFAULT_PORT);
    await waitForPreview(previewUrl, fetchImpl, sleep);
    const browserClient = await browserFactory({ apiKey, baseUrl });
    scope.register({
      kind: "solari-browser-client",
      id: "browser-client",
      close: () => browserClient.close(),
    });

    const browser = await retryTransient(
      () => browserClient.launch({ recording: true, retries: 2, probe: true }),
      { attempts: 3, sleep, backoffMs: 250 },
    );
    let browserClosed = false;
    const closeBrowser = async (): Promise<void> => {
      if (browserClosed) return;
      await browser.close();
      browserClosed = true;
    };
    scope.register({
      kind: "solari-browser",
      id: sha256(browser.id).slice(0, 16),
      close: closeBrowser,
    });

    const page = await browser.newPage();
    try {
      await retryTransient(
        () => page.goto(previewUrl, { waitUntil: "networkidle" }),
        { attempts: 3, sleep, backoffMs: 500 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SolariApiError(statusOf(error), codeOf(error), redactSecrets(message));
    }
    await page.locator('[data-repropub-action="navigate"]').click();
    const raw = await page.evaluate<BrowserObservationShape>(() => {
      return (globalThis as unknown as { __REPROPUB_OBSERVATION__: BrowserObservationShape })
        .__REPROPUB_OBSERVATION__;
    });
    if (!raw || typeof raw !== "object") {
      throw new SolariApiError(undefined, "InvalidObservation", "browser produced no navigation observation");
    }
    const screenshot = Buffer.from(await page.screenshot({ type: "png", fullPage: true }));

    await closeBrowser();
    const replay = await downloadReplay(browserClient, browser.id, sleep);
    const observation: NavigationObservation = {
      kind: "navigation-target",
      scenarioId: input.scenario.id,
      targetReaderId: input.target.id,
      navigationLabel: raw.navigationLabel,
      requestedHref: raw.requestedHref,
      requestedFragment: raw.requestedFragment,
      lookupFragment: raw.lookupFragment,
      targetPath: raw.targetPath,
      expectedTargetId: input.scenario.expectedTargetId,
      reportedObservedTargetId: input.scenario.reportedObservedTargetId,
      observedTargetId: raw.observedTargetId,
      observedHeading: raw.observedHeading,
      availableTargetIds: raw.availableTargetIds,
      blockedReason: undefined,
    };
    const environment: WitnessEnvironment = {
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
      timezone: "UTC",
    };
    const witness: WitnessResult = {
      mode: "solari",
      verdict: judgeNavigationObservation(observation),
      observation,
      durationMs: Math.max(0, performance.now() - startedAt),
      environment,
    };
    return {
      witness,
      screenshot,
      replay,
      infrastructure: {
        sandboxFingerprint: sha256(sandboxId).slice(0, 16),
        browserSessionFingerprint: sha256(browser.id).slice(0, 16),
        previewHost: new URL(previewUrl).hostname,
      },
    };
  });

  return { ...scoped.value, cleanup: scoped.cleanup };
}
