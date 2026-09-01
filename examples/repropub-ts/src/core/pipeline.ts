import { performance } from "node:perf_hooks";

import { publishBundle, type ReproReceipt } from "./evidence.js";
import { createSyntheticPublication, createSyntheticScenario } from "./fixture.js";
import { reducePublication, type ReductionDecision } from "./reducer.js";
import { withRunResources } from "./resources.js";
import { sanitizePublication, type PrivacyReport } from "./sanitize.js";
import type { ReaderTarget, Verdict, WitnessResult } from "./types.js";
import { runWitness } from "./witness.js";

export interface PipelineActivity {
  readonly id: string;
  readonly label: string;
  readonly status: "complete";
  readonly detail: string;
}

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
}

export { verifyBundle } from "./evidence.js";

export async function runDemoPipeline(input: RunDemoInput): Promise<DemoPipelineResult> {
  const startedAt = performance.now();
  const originalArchive = createSyntheticPublication();
  const scenario = createSyntheticScenario();
  const target: ReaderTarget = {
    id: "fixture-reader@legacy-fragment-resolver",
    fragmentResolution: "literal",
  };

  const scoped = await withRunResources(async () => {
    const initialWitness = await runWitness({
      archive: originalArchive,
      scenario,
      target,
      mode: "local",
    });
    if (initialWitness.verdict !== "PRESERVED") {
      throw new Error(`demo fixture did not reproduce its baseline failure: ${initialWitness.verdict}`);
    }

    const sanitized = await sanitizePublication({ archive: originalArchive, scenario });
    const reduced = await reducePublication({
      archive: sanitized.archive,
      scenario,
      target,
      maxCandidates: 32,
    });
    return { initialWitness, sanitized, reduced };
  });

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

  const accepted = scoped.value.reduced.decisions.filter((decision) => decision.accepted).length;
  const activity: PipelineActivity[] = [
    {
      id: "inspect",
      label: "Inspect publication graph",
      status: "complete",
      detail: `${receipt.sizes.original.toLocaleString("en-US")} bytes accepted within archive limits`,
    },
    {
      id: "witness",
      label: "Witness reported navigation failure",
      status: "complete",
      detail: `observed ${scoped.value.initialWitness.observation.observedTargetId}; expected ${scenario.expectedTargetId}`,
    },
    {
      id: "sanitize",
      label: "Replace sensitive content",
      status: "complete",
      detail: `${scoped.value.sanitized.report.remainingSensitiveValues} inspected values remain`,
    },
    {
      id: "reduce",
      label: "Reduce and re-run candidates",
      status: "complete",
      detail: `${accepted}/${scoped.value.reduced.decisions.length} transformations accepted`,
    },
    {
      id: "publish",
      label: "Publish verifiable repro bundle",
      status: "complete",
      detail: `${receipt.artifacts.length} hashed artifacts plus receipt`,
    },
  ];

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
    activity,
  };
}
