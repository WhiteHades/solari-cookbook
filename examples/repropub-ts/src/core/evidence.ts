import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { inspectPublication } from "./epub.js";
import { sha256 } from "./hash.js";
import type { ReductionDecision } from "./reducer.js";
import type { CleanupReceipt } from "./resources.js";
import type { PrivacyReport } from "./sanitize.js";
import type {
  ExecutionMode,
  NavigationScenario,
  ReaderTarget,
  Verdict,
  WitnessResult,
} from "./types.js";

export interface ArtifactReceipt {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ReproReceipt {
  readonly version: 1;
  readonly runId: string;
  readonly createdAt: string;
  readonly mode: ExecutionMode;
  readonly target: ReaderTarget;
  readonly scenario: NavigationScenario;
  readonly environment: WitnessResult["environment"];
  readonly verdict: Verdict;
  readonly hashes: {
    readonly sourcePublication: string;
    readonly sanitizedPublication: string;
    readonly reducedPublication: string;
    readonly scenario: string;
  };
  readonly sizes: {
    readonly original: number;
    readonly sanitized: number;
    readonly reduced: number;
  };
  readonly reduction: {
    readonly attempted: number;
    readonly accepted: number;
    readonly rejected: number;
  };
  readonly privacy: {
    readonly inspectedSensitiveValues: number;
    readonly remainingSensitiveValues: number;
  };
  readonly cleanup: CleanupReceipt;
  readonly durationMs: number;
  readonly artifacts: readonly ArtifactReceipt[];
  readonly limitations: readonly string[];
}

interface PublishBundleInput {
  readonly outputDir: string;
  readonly originalArchive: Buffer;
  readonly sanitizedArchive: Buffer;
  readonly reducedArchive: Buffer;
  readonly target: ReaderTarget;
  readonly scenario: NavigationScenario;
  readonly witness: WitnessResult;
  readonly decisions: readonly ReductionDecision[];
  readonly privacy: PrivacyReport;
  readonly cleanup: CleanupReceipt;
  readonly durationMs: number;
  readonly replayReference?: string;
  readonly extraArtifacts?: readonly { readonly path: string; readonly data: string | Buffer }[];
}

export interface BundleVerification {
  readonly valid: boolean;
  readonly artifactsChecked: number;
  readonly errors: readonly string[];
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeOutputPath(outputDir: string): string {
  const root = path.resolve(process.cwd());
  const output = path.resolve(outputDir);
  if (output === root || !output.startsWith(`${root}${path.sep}`)) {
    throw new Error("bundle output must be a child of the current working directory");
  }
  return output;
}

function safeArtifactPath(bundleDir: string, relativePath: string): string {
  if (relativePath.includes("\\") || path.posix.isAbsolute(relativePath)) {
    throw new Error(`unsafe artifact path: ${relativePath}`);
  }
  const normalized = path.posix.normalize(relativePath);
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`unsafe artifact path: ${relativePath}`);
  }
  const absolute = path.resolve(bundleDir, normalized);
  if (!absolute.startsWith(`${bundleDir}${path.sep}`)) {
    throw new Error(`artifact escapes bundle: ${relativePath}`);
  }
  return absolute;
}

function navigationEvidenceSvg(witness: WitnessResult): string {
  const observed = witness.observation.observedTargetId ?? "none";
  const expected = witness.observation.expectedTargetId;
  const requested = witness.observation.requestedFragment ?? "none";
  const lookup = witness.observation.lookupFragment ?? "none";
  const verdict = witness.verdict;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title description">
  <title id="title">ReproPub navigation witness: ${escapeXml(verdict)}</title>
  <desc id="description">The reader requested ${escapeXml(requested)}, looked up ${escapeXml(lookup)}, observed ${escapeXml(observed)}, and expected ${escapeXml(expected)}.</desc>
  <rect width="1200" height="630" rx="40" fill="#07111f"/>
  <rect x="54" y="54" width="1092" height="522" rx="28" fill="#0f1d2e" stroke="#28405d"/>
  <text x="94" y="128" fill="#9fb4cc" font-family="ui-monospace, monospace" font-size="24">REPROPUB / EXECUTED NAVIGATION WITNESS</text>
  <text x="94" y="210" fill="#f8fafc" font-family="ui-sans-serif, sans-serif" font-weight="700" font-size="54">${escapeXml(verdict)}</text>
  <text x="94" y="280" fill="#9fb4cc" font-family="ui-sans-serif, sans-serif" font-size="24">requested fragment</text>
  <text x="420" y="280" fill="#f8fafc" font-family="ui-monospace, monospace" font-size="24">${escapeXml(requested)}</text>
  <text x="94" y="340" fill="#9fb4cc" font-family="ui-sans-serif, sans-serif" font-size="24">reader lookup</text>
  <text x="420" y="340" fill="#f8fafc" font-family="ui-monospace, monospace" font-size="24">${escapeXml(lookup)}</text>
  <text x="94" y="400" fill="#9fb4cc" font-family="ui-sans-serif, sans-serif" font-size="24">observed target</text>
  <text x="420" y="400" fill="#fb7185" font-family="ui-monospace, monospace" font-size="24">${escapeXml(observed)}</text>
  <text x="94" y="460" fill="#9fb4cc" font-family="ui-sans-serif, sans-serif" font-size="24">expected target</text>
  <text x="420" y="460" fill="#5eead4" font-family="ui-monospace, monospace" font-size="24">${escapeXml(expected)}</text>
  <text x="94" y="530" fill="#6f8baa" font-family="ui-sans-serif, sans-serif" font-size="20">Verdict derived from the recorded observation, not an AI assertion.</text>
</svg>\n`;
}

function reportMarkdown(input: PublishBundleInput, runId: string): string {
  const accepted = input.decisions.filter((decision) => decision.accepted).length;
  const reductionPercent = Math.round((1 - input.reducedArchive.length / input.originalArchive.length) * 100);
  return `# ReproPub reproduction ${runId}

## Result

**${input.witness.verdict}** — the reduced synthetic EPUB still reaches \`${input.witness.observation.observedTargetId ?? "no target"}\` where the scenario expects \`${input.witness.observation.expectedTargetId}\`.

## Reproduce

1. Open \`repro.epub\` in the target reader \`${input.target.id}\`.
2. Select the navigation entry \`${input.witness.observation.navigationLabel ?? "selected entry"}\`.
3. Observe the active target.
4. Expected: \`${input.witness.observation.expectedTargetId}\`.
5. Observed in the witness run: \`${input.witness.observation.observedTargetId ?? "none"}\`.

## Reduction

- Original: ${input.originalArchive.length.toLocaleString("en-US")} bytes
- Sanitized: ${input.sanitizedArchive.length.toLocaleString("en-US")} bytes
- Reduced: ${input.reducedArchive.length.toLocaleString("en-US")} bytes
- Reduction: ${reductionPercent}%
- Accepted transformations: ${accepted}/${input.decisions.length}

## Trust and privacy

- Verdict source: executed navigation observations
- Sensitive values inspected: ${input.privacy.inspectedSensitiveValues}
- Sensitive values remaining after sanitization: ${input.privacy.remainingSensitiveValues}
- Original publication prose is not included in this report.
- This bundle lowers sharing risk; it is not a legal opinion or copyright clearance.

## Evidence

- \`receipt.json\` pins the scenario, target, environment, hashes, verdict, artifacts, and cleanup state.
- \`reduction-log.jsonl\` records every accepted and rejected candidate.
- \`privacy-report.json\` records sanitization actions without copying sensitive values.
- \`observations/navigation.json\` contains the raw oracle input.
- \`evidence/navigation-witness.svg\` is a rendered summary of the observed mismatch.
- \`replay-reference.txt\` states whether a cloud recording exists.
`;
}

async function writeArtifact(bundleDir: string, relativePath: string, data: string | Buffer): Promise<void> {
  const absolute = safeArtifactPath(bundleDir, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, data);
}

async function artifactReceipt(bundleDir: string, relativePath: string): Promise<ArtifactReceipt> {
  const data = await readFile(safeArtifactPath(bundleDir, relativePath));
  return { path: relativePath, bytes: data.length, sha256: sha256(data) };
}

function assertShareableText(value: string): void {
  const forbidden = [
    /slr_(?:live|test)_[\w-]+/i,
    /authorization\s*:\s*bearer\s+\S+/i,
    /[?&](?:token|signature|x-amz-[^=]+)=/i,
    /\/(?:home|Users)\/[\w.-]+\//,
  ];
  const match = forbidden.find((pattern) => pattern.test(value));
  if (match) throw new Error(`shareable evidence matched forbidden pattern ${match}`);
}

export async function publishBundle(input: PublishBundleInput): Promise<ReproReceipt> {
  const bundleDir = safeOutputPath(input.outputDir);
  await rm(bundleDir, { recursive: true, force: true });
  await mkdir(bundleDir, { recursive: true });

  const sourceHash = sha256(input.originalArchive);
  const sanitizedHash = sha256(input.sanitizedArchive);
  const reducedHash = sha256(input.reducedArchive);
  const scenarioHash = sha256(JSON.stringify(input.scenario));
  const runId = sha256(`${input.target.id}:${scenarioHash}:${reducedHash}`).slice(0, 16);

  const reductionLog = input.decisions.map((decision) => JSON.stringify(decision)).join("\n") + "\n";
  const privacyJson = stableJson(input.privacy);
  const observationJson = stableJson(input.witness.observation);
  const evidenceSvg = navigationEvidenceSvg(input.witness);
  const replayReference = input.replayReference ??
    "No browser replay was created: this bundle was produced by the deterministic local witness.\n";
  const readme = reportMarkdown(input, runId);

  assertShareableText([reductionLog, privacyJson, observationJson, evidenceSvg, replayReference, readme].join("\n"));

  await writeArtifact(bundleDir, "repro.epub", input.reducedArchive);
  await writeArtifact(bundleDir, "README.md", readme);
  await writeArtifact(bundleDir, "reduction-log.jsonl", reductionLog);
  await writeArtifact(bundleDir, "privacy-report.json", privacyJson);
  await writeArtifact(bundleDir, "observations/navigation.json", observationJson);
  await writeArtifact(bundleDir, "evidence/navigation-witness.svg", evidenceSvg);
  await writeArtifact(bundleDir, "replay-reference.txt", replayReference);
  for (const artifact of input.extraArtifacts ?? []) {
    await writeArtifact(bundleDir, artifact.path, artifact.data);
  }

  const artifactPaths = [
    "repro.epub",
    "README.md",
    "reduction-log.jsonl",
    "privacy-report.json",
    "observations/navigation.json",
    "evidence/navigation-witness.svg",
    "replay-reference.txt",
    ...(input.extraArtifacts ?? []).map((artifact) => artifact.path),
  ];
  const artifacts = await Promise.all(artifactPaths.map((artifactPath) => artifactReceipt(bundleDir, artifactPath)));

  const receipt: ReproReceipt = {
    version: 1,
    runId,
    createdAt: new Date().toISOString(),
    mode: input.witness.mode,
    target: input.target,
    scenario: input.scenario,
    environment: input.witness.environment,
    verdict: input.witness.verdict,
    hashes: {
      sourcePublication: sourceHash,
      sanitizedPublication: sanitizedHash,
      reducedPublication: reducedHash,
      scenario: scenarioHash,
    },
    sizes: {
      original: input.originalArchive.length,
      sanitized: input.sanitizedArchive.length,
      reduced: input.reducedArchive.length,
    },
    reduction: {
      attempted: input.decisions.length,
      accepted: input.decisions.filter((decision) => decision.accepted).length,
      rejected: input.decisions.filter((decision) => !decision.accepted).length,
    },
    privacy: {
      inspectedSensitiveValues: input.privacy.inspectedSensitiveValues,
      remainingSensitiveValues: input.privacy.remainingSensitiveValues,
    },
    cleanup: input.cleanup,
    durationMs: input.durationMs,
    artifacts,
    limitations: [
      "The local witness models one deterministic encoded-fragment navigation failure.",
      "The bundle lowers sharing risk but is not a legal guarantee.",
      "A Solari replay exists only when the live adapter was executed with authorized credentials.",
    ],
  };

  const receiptJson = stableJson(receipt);
  assertShareableText(receiptJson);
  await writeArtifact(bundleDir, "receipt.json", receiptJson);
  return receipt;
}

export async function verifyBundle(outputDir: string): Promise<BundleVerification> {
  const bundleDir = safeOutputPath(outputDir);
  const errors: string[] = [];
  let receipt: ReproReceipt;
  try {
    receipt = JSON.parse(await readFile(path.join(bundleDir, "receipt.json"), "utf8")) as ReproReceipt;
  } catch (error) {
    return {
      valid: false,
      artifactsChecked: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }

  let artifactsChecked = 0;
  for (const artifact of receipt.artifacts) {
    try {
      const data = await readFile(safeArtifactPath(bundleDir, artifact.path));
      artifactsChecked += 1;
      if (data.length !== artifact.bytes) errors.push(`${artifact.path}: byte count mismatch`);
      if (sha256(data) !== artifact.sha256) errors.push(`${artifact.path}: SHA-256 mismatch`);
    } catch (error) {
      errors.push(`${artifact.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    const publication = inspectPublication(await readFile(path.join(bundleDir, "repro.epub")));
    if (publication.sourceHash !== receipt.hashes.reducedPublication) {
      errors.push("repro.epub: reduced publication hash does not match receipt");
    }
  } catch (error) {
    errors.push(`repro.epub: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (receipt.verdict !== "PRESERVED") errors.push(`receipt verdict is ${receipt.verdict}`);
  return { valid: errors.length === 0, artifactsChecked, errors };
}
