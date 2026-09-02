import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";

import {
  LOCAL_PIPELINE_BLUEPRINT,
  runDemoPipeline,
  runSolariDemoPipeline,
  type DemoPipelineResult,
  type PipelineActivity,
} from "./core/pipeline.js";
import type {
  DashboardActivity,
  DashboardCapabilities,
  DashboardRun,
  DashboardRunMode,
  DashboardRunResult,
} from "./shared/dashboard.js";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 4174);
const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const RUN_ROOT = path.join(ROOT, ".tmp", "repropub", "dashboard-runs");
const MAX_BODY_BYTES = 8 * 1024;

interface MutableRun {
  id: string;
  mode: DashboardRunMode;
  status: DashboardRun["status"];
  startedAt: string;
  completedAt?: string;
  activities: DashboardActivity[];
  error?: string;
  result?: DashboardRunResult;
  outputDir: string;
}

const runs = new Map<string, MutableRun>();
let latestRunId: string | undefined;
let activeRunId: string | undefined;

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".epub": "application/epub+zip",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".ndjson": "application/x-ndjson; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function json(response: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

function publicRun(run: MutableRun): DashboardRun {
  return {
    id: run.id,
    mode: run.mode,
    status: run.status,
    startedAt: run.startedAt,
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    activities: run.activities,
    ...(run.error ? { error: run.error } : {}),
    ...(run.result ? { result: run.result } : {}),
  };
}

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/slr_(?:live|test)_[\w-]+/gi, "[redacted-solari-key]")
    .replace(/([?&](?:pt_token|token|signature|x-amz-[^=]+)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\/(?:home|Users)\/[\w.-]+\//g, "[local-path]/");
}

function pendingActivities(mode: DashboardRunMode): DashboardActivity[] {
  const local = LOCAL_PIPELINE_BLUEPRINT.map((step) => ({
    ...step,
    status: "pending" as const,
    detail: "Waiting",
  }));
  if (mode === "local") return local;
  return [
    ...local.slice(0, 4),
    { id: "sandbox", label: "Prepare isolated Solari sandbox", status: "pending", detail: "Waiting" },
    { id: "browser", label: "Record independent Solari browser", status: "pending", detail: "Waiting" },
    local[4]!,
  ];
}

function updateActivity(run: MutableRun, activity: PipelineActivity): void {
  const index = run.activities.findIndex((item) => item.id === activity.id);
  const next: DashboardActivity = { ...activity };
  if (index === -1) run.activities.push(next);
  else run.activities[index] = next;
}

function serializeResult(runId: string, result: DemoPipelineResult): DashboardRunResult {
  return {
    runId: result.runId,
    verdict: result.verdict,
    mode: result.receipt.mode,
    targetId: result.receipt.target.id,
    scenarioId: result.receipt.scenario.id,
    sizes: result.sizes,
    reduction: result.receipt.reduction,
    privacy: result.receipt.privacy,
    observation: {
      navigationLabel: result.finalWitness.observation.navigationLabel,
      requestedFragment: result.finalWitness.observation.requestedFragment,
      lookupFragment: result.finalWitness.observation.lookupFragment,
      observedTargetId: result.finalWitness.observation.observedTargetId,
      expectedTargetId: result.finalWitness.observation.expectedTargetId,
      observedHeading: result.finalWitness.observation.observedHeading,
    },
    environment: result.receipt.environment,
    cleanup: {
      attempted: result.receipt.cleanup.attempted,
      succeeded: result.receipt.cleanup.succeeded,
      failed: result.receipt.cleanup.failed,
    },
    durationMs: result.receipt.durationMs,
    decisions: result.decisions.map((decision) => ({
      sequence: decision.sequence,
      id: decision.id,
      description: decision.description,
      accepted: decision.accepted,
      beforeBytes: decision.beforeBytes,
      afterBytes: decision.afterBytes,
      verdict: decision.verdict,
      reason: decision.reason,
    })),
    artifacts: result.receipt.artifacts.map((artifact) => ({
      ...artifact,
      url: `/api/runs/${encodeURIComponent(runId)}/artifacts/${artifact.path.split("/").map(encodeURIComponent).join("/")}`,
    })),
    receiptUrl: `/api/runs/${encodeURIComponent(runId)}/artifacts/receipt.json`,
    limitations: result.receipt.limitations,
  };
}

async function executeRun(run: MutableRun): Promise<void> {
  try {
    let result: DemoPipelineResult;
    if (run.mode === "local") {
      result = await runDemoPipeline({
        outputDir: run.outputDir,
        onActivity: (activity) => updateActivity(run, activity),
      });
    } else {
      run.activities[0] = { ...run.activities[0]!, status: "active", detail: "Preparing the publication for the live witness" };
      result = await runSolariDemoPipeline({
        apiKey: process.env.SOLARI_API_KEY,
        outputDir: run.outputDir,
      });
      run.activities = [...result.activity];
    }
    run.result = serializeResult(run.id, result);
    run.activities = [...result.activity];
    run.status = "complete";
  } catch (error) {
    run.status = "error";
    run.error = cleanError(error);
    const active = run.activities.findIndex((item) => item.status === "active");
    if (active !== -1) run.activities[active] = { ...run.activities[active]!, status: "error", detail: run.error };
  } finally {
    run.completedAt = new Date().toISOString();
    if (activeRunId === run.id) activeRunId = undefined;
  }
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += value.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("request body is too large");
    chunks.push(value);
  }
  if (chunks.length === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function safeChild(root: string, requestedPath: string): string {
  const decoded = requestedPath.split("/").map((segment) => decodeURIComponent(segment)).join("/");
  if (decoded.includes("\\") || path.posix.isAbsolute(decoded)) throw new Error("unsafe path");
  const normalized = path.posix.normalize(decoded);
  if (normalized === ".." || normalized.startsWith("../")) throw new Error("unsafe path");
  const absolute = path.resolve(root, normalized);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) throw new Error("unsafe path");
  return absolute;
}

async function serveArtifact(response: ServerResponse, run: MutableRun, artifactPath: string): Promise<void> {
  if (run.status !== "complete" || !run.result) {
    json(response, 409, { error: "run is not complete" });
    return;
  }
  const allowed = new Set(["receipt.json", ...run.result.artifacts.map((artifact) => artifact.path)]);
  if (!allowed.has(artifactPath)) {
    json(response, 404, { error: "artifact not found" });
    return;
  }
  const absolute = safeChild(run.outputDir, artifactPath);
  const info = await stat(absolute);
  const extension = path.extname(absolute).toLowerCase();
  response.writeHead(200, {
    "content-type": MIME_TYPES[extension] ?? "application/octet-stream",
    "content-length": info.size,
    "content-disposition": `${extension === ".svg" || extension === ".png" ? "inline" : "attachment"}; filename="${path.basename(absolute).replaceAll('"', "")}"`,
    "x-content-type-options": "nosniff",
  });
  createReadStream(absolute).pipe(response);
}

async function serveStatic(requestPath: string, response: ServerResponse): Promise<void> {
  const candidate = requestPath === "/" ? "index.html" : requestPath.replace(/^\//, "");
  let absolute: string;
  try {
    absolute = safeChild(DIST, candidate);
    const info = await stat(absolute);
    if (info.isDirectory()) absolute = path.join(absolute, "index.html");
  } catch {
    absolute = path.join(DIST, "index.html");
  }
  try {
    const info = await stat(absolute);
    const extension = path.extname(absolute).toLowerCase();
    response.writeHead(200, {
      "content-type": MIME_TYPES[extension] ?? "application/octet-stream",
      "content-length": info.size,
      "cache-control": extension === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    });
    createReadStream(absolute).pipe(response);
  } catch {
    json(response, 503, { error: "dashboard build is unavailable; run npm run build" });
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${HOST}:${PORT}`}`);
    if (url.pathname === "/api/health" && request.method === "GET") {
      const capabilities: DashboardCapabilities = {
        product: "ReproPub",
        local: true,
        solariConfigured: Boolean(process.env.SOLARI_API_KEY?.trim()),
      };
      json(response, 200, { ok: true, capabilities });
      return;
    }

    if (url.pathname === "/api/runs/latest" && request.method === "GET") {
      json(response, 200, { run: latestRunId ? publicRun(runs.get(latestRunId)!) : null });
      return;
    }

    if (url.pathname === "/api/runs" && request.method === "POST") {
      if (activeRunId) {
        json(response, 409, { error: "a ReproPub run is already active", run: publicRun(runs.get(activeRunId)!) });
        return;
      }
      const body = await readJsonBody(request);
      const mode: DashboardRunMode = body.mode === "solari" ? "solari" : "local";
      if (mode === "solari" && !process.env.SOLARI_API_KEY?.trim()) {
        json(response, 412, { error: "SOLARI_API_KEY is not configured on this server" });
        return;
      }
      const id = randomUUID();
      const run: MutableRun = {
        id,
        mode,
        status: "running",
        startedAt: new Date().toISOString(),
        activities: pendingActivities(mode),
        outputDir: path.join(RUN_ROOT, id, "bundle"),
      };
      runs.set(id, run);
      latestRunId = id;
      activeRunId = id;
      void executeRun(run);
      json(response, 202, { run: publicRun(run) });
      return;
    }

    const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
    if (runMatch && request.method === "GET") {
      const run = runs.get(decodeURIComponent(runMatch[1]!));
      if (!run) json(response, 404, { error: "run not found" });
      else json(response, 200, { run: publicRun(run) });
      return;
    }

    const artifactMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/artifacts\/(.+)$/);
    if (artifactMatch && request.method === "GET") {
      const run = runs.get(decodeURIComponent(artifactMatch[1]!));
      if (!run) json(response, 404, { error: "run not found" });
      else await serveArtifact(response, run, artifactMatch[2]!);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      json(response, 404, { error: "endpoint not found" });
      return;
    }
    await serveStatic(url.pathname, response);
  } catch (error) {
    json(response, 400, { error: cleanError(error) });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`ReproPub dashboard listening on http://${HOST}:${PORT}\n`);
});
