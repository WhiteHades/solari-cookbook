import { performance } from "node:perf_hooks";

import { publishBundle, type ReproReceipt } from "./evidence.js";
import { createSyntheticPublication, createSyntheticScenario } from "./fixture.js";
import { reducePublication, type ReductionDecision } from "./reducer.js";
import { withRunResources } from "./resources.js";
import { runSolariWitness, type BrowserClientFactory } from "./solari.js";
import { sanitizePublication, type PrivacyReport } from "./sanitize.js";
import type { ReaderTarget, Verdict, WitnessResult } from "./types.js";
import { runWitness } from "./witness.js";

export type PipelineActivityStatus = "pending" | "active" | "complete" | "error";

export interface PipelineActivity {
  readonly id: string;
  readonly label: string;
  readonly status: PipelineActivityStatus;
  readonly detail: string;
}

export const LOCAL_PIPELINE_BLUEPRINT = [
  { id: "inspect", label: "Inspect publication graph" },
  { id: "witness", label: "Witness reported navigation failure" },
  { id: "sanitize", label: "Replace sensitive content" },
  { id: "reduce", label: "Reduce and re-run candidates" },
  { id: "publish", label: "Publish verifiable repro bundle" },
] as const;

export interface DemoPipelineResult {
  readonly runId: string;
  readonly verdict: Verdict;
  readonly sizes: ReproReceipt["sizes"];
  readonly receipt: ReproReceipt;
  readonly privacy: PrivacyReport;
  readonly decisions: readonly ReductionDecision[];
  readonly initialWitness: WitnessResult;
  readonly sanitizedWitness: WitnessResult;
  readonly finalWitness: WitnessResult;
  readonly activity: readonly PipelineActivity[];
}

interface RunDemoInput {
  readonly outputDir: string;
  readonly onActivity?: (activity: PipelineActivity) => void;
}

interface RunSolariDemoInput {
  readonly apiKey: string | undefined;
  readonly outputDir: string;
  readonly dependencies?: {
    readonly fetch?: typeof fetch;
    readonly browserFactory?: BrowserClientFactory;
    readonly sleep?: (milliseconds: number) => Promise<void>;
    readonly idempotencyKey?: () => string;
  };
}

export { verifyBundle } from "./evidence.js";

export async function runDemoPipeline(input: RunDemoInput): Promise<DemoPipelineResult> {
  const startedAt = performance.now();
  const completed = new Map<string, PipelineActivity>();
  const report = (activity: PipelineActivity): void => {
    if (activity.status === "complete") completed.set(activity.id, activity);
    input.onActivity?.(activity);
  };
  const label = (id: (typeof LOCAL_PIPELINE_BLUEPRINT)[number]["id"]): string =>
    LOCAL_PIPELINE_BLUEPRINT.find((step) => step.id === id)?.label ?? id;

  report({ id: "inspect", label: label("inspect"), status: "active", detail: "Reading the EPUB container, package, spine, and navigation graph" });
  const originalArchive = createSyntheticPublication();
  const scenario = createSyntheticScenario();
  const target: ReaderTarget = {
    id: "fixture-reader@legacy-fragment-resolver",
    fragmentResolution: "literal",
  };
  report({
    id: "inspect",
    label: label("inspect"),
    status: "complete",
    detail: `${originalArchive.length.toLocaleString("en-US")} bytes accepted within archive limits`,
  });

  const scoped = await withRunResources(async () => {
    report({ id: "witness", label: label("witness"), status: "active", detail: "Executing the encoded-fragment navigation scenario" });
    const initialWitness = await runWitness({
      archive: originalArchive,
      scenario,
      target,
      mode: "local",
    });
    if (initialWitness.verdict !== "PRESERVED") {
      throw new Error(`demo fixture did not reproduce its baseline failure: ${initialWitness.verdict}`);
    }
    report({
      id: "witness",
      label: label("witness"),
      status: "complete",
      detail: `observed ${initialWitness.observation.observedTargetId}; expected ${scenario.expectedTargetId}`,
    });

    report({ id: "sanitize", label: label("sanitize"), status: "active", detail: "Replacing metadata, prose, artwork, scripts, handlers, and remote references" });
    const sanitized = await sanitizePublication({ archive: originalArchive, scenario });
    report({
      id: "sanitize",
      label: label("sanitize"),
      status: "complete",
      detail: `${sanitized.report.remainingSensitiveValues} inspected values remain`,
    });

    report({ id: "reduce", label: label("reduce"), status: "active", detail: "Evaluating structure-aware candidates against the same oracle" });
    const reduced = await reducePublication({
      archive: sanitized.archive,
      scenario,
      target,
      maxCandidates: 32,
    });
    const accepted = reduced.decisions.filter((decision) => decision.accepted).length;
    report({
      id: "reduce",
      label: label("reduce"),
      status: "complete",
      detail: `${accepted}/${reduced.decisions.length} transformations accepted`,
    });
    return { initialWitness, sanitized, reduced };
  });

  report({ id: "publish", label: label("publish"), status: "active", detail: "Hashing artifacts and writing the shareable evidence bundle" });
  const durationMs = Math.max(0, performance.now() - startedAt);
  const receipt = await publishBundle({
    outputDir: input.outputDir,
    originalArchive,
    sanitizedArchive: scoped.value.sanitized.archive,
    reducedArchive: scoped.value.reduced.archive,
    target,
    scenario,
    witness: scoped.value.reduced.finalWitness,
    decisions: scoped.value.reduced.decisions,
    privacy: scoped.value.sanitized.report,
    cleanup: scoped.cleanup,
    durationMs,
  });
  report({
    id: "publish",
    label: label("publish"),
    status: "complete",
    detail: `${receipt.artifacts.length} hashed artifacts plus receipt`,
  });

  return {
    runId: receipt.runId,
    verdict: receipt.verdict,
    sizes: receipt.sizes,
    receipt,
    privacy: scoped.value.sanitized.report,
    decisions: scoped.value.reduced.decisions,
    initialWitness: scoped.value.initialWitness,
    sanitizedWitness: scoped.value.sanitized.witness,
    finalWitness: scoped.value.reduced.finalWitness,
    activity: LOCAL_PIPELINE_BLUEPRINT.map((step) => completed.get(step.id) ?? { ...step, status: "pending", detail: "Waiting" }),
  };
}

export async function runSolariDemoPipeline(input: RunSolariDemoInput): Promise<DemoPipelineResult> {
  const startedAt = performance.now();
  const originalArchive = createSyntheticPublication();
  const scenario = createSyntheticScenario();
  const target: ReaderTarget = {
    id: "fixture-reader@legacy-fragment-resolver",
    fragmentResolution: "literal",
  };
  const sanitized = await sanitizePublication({ archive: originalArchive, scenario });
  const reduced = await reducePublication({
    archive: sanitized.archive,
    scenario,
    target,
    maxCandidates: 32,
  });
  const live = await runSolariWitness({
    apiKey: input.apiKey,
    archive: reduced.archive,
    scenario,
    target,
    ...(input.dependencies ? { dependencies: input.dependencies } : {}),
  });
  if (live.witness.verdict !== "PRESERVED") {
    throw new Error(`live Solari witness returned ${live.witness.verdict}`);
  }

  const receipt = await publishBundle({
    outputDir: input.outputDir,
    originalArchive,
    sanitizedArchive: sanitized.archive,
    reducedArchive: reduced.archive,
    target,
    scenario,
    witness: live.witness,
    decisions: reduced.decisions,
    privacy: sanitized.report,
    cleanup: live.cleanup,
    durationMs: Math.max(0, performance.now() - startedAt),
    replayReference: "The recorded Solari browser replay is stored at evidence/browser-replay.ndjson.\n",
    extraArtifacts: [
      { path: "evidence/browser-witness.png", data: live.screenshot },
      { path: "evidence/browser-replay.ndjson", data: live.replay },
      { path: "evidence/solari-infrastructure.json", data: `${JSON.stringify(live.infrastructure, null, 2)}\n` },
    ],
  });
  const accepted = reduced.decisions.filter((decision) => decision.accepted).length;
  return {
    runId: receipt.runId,
    verdict: receipt.verdict,
    sizes: receipt.sizes,
    receipt,
    privacy: sanitized.report,
    decisions: reduced.decisions,
    initialWitness: reduced.baselineWitness,
    sanitizedWitness: sanitized.witness,
    finalWitness: live.witness,
    activity: [
      { id: "inspect", label: "Inspect publication graph", status: "complete", detail: `${receipt.sizes.original.toLocaleString("en-US")} bytes accepted within archive limits` },
      { id: "sanitize", label: "Replace sensitive content", status: "complete", detail: `${sanitized.report.remainingSensitiveValues} inspected values remain` },
      { id: "reduce", label: "Reduce and re-run candidates", status: "complete", detail: `${accepted}/${reduced.decisions.length} transformations accepted` },
      { id: "sandbox", label: "Prepare isolated Solari sandbox", status: "complete", detail: `witness host ${live.infrastructure.previewHost}` },
      { id: "browser", label: "Record independent Solari browser", status: "complete", detail: `${live.replay.length.toLocaleString("en-US")} replay bytes captured` },
      { id: "publish", label: "Publish verifiable repro bundle", status: "complete", detail: `${receipt.artifacts.length} hashed artifacts plus receipt` },
    ],
  };
}
