import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { inspectPublication } from "../src/core/epub.js";
import { getSyntheticPrivateProse } from "../src/core/fixture.js";
import { runDemoPipeline, verifyBundle } from "../src/core/pipeline.js";

const testRoot = path.resolve(".tmp/repropub/pipeline-test");

test("publishes and verifies a deterministic repro bundle", async () => {
  await rm(testRoot, { recursive: true, force: true });
  const first = await runDemoPipeline({ outputDir: path.join(testRoot, "first") });
  const second = await runDemoPipeline({ outputDir: path.join(testRoot, "second") });

  assert.equal(first.verdict, "PRESERVED");
  assert.equal(first.receipt.hashes.reducedPublication, second.receipt.hashes.reducedPublication);
  assert.equal(first.receipt.hashes.scenario, second.receipt.hashes.scenario);
  assert.ok(first.sizes.reduced < first.sizes.original);

  const verification = await verifyBundle(path.join(testRoot, "first"));
  assert.equal(verification.valid, true);
  assert.equal(verification.artifactsChecked, first.receipt.artifacts.length);

  const finalArchive = await readFile(path.join(testRoot, "first/repro.epub"));
  const publication = inspectPublication(finalArchive);
  assert.equal(publication.spine.length, 1);
  assert.equal(publication.navigation.length, 1);

  const shareableText = await Promise.all(
    [
      "README.md",
      "receipt.json",
      "reduction-log.jsonl",
      "privacy-report.json",
      "observations/navigation.json",
      "evidence/navigation-witness.svg",
      "replay-reference.txt",
    ].map((file) => readFile(path.join(testRoot, "first", file), "utf8")),
  );
  const combined = shareableText.join("\n");
  assert.doesNotMatch(combined, new RegExp(getSyntheticPrivateProse().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(combined, /slr_(?:live|test)_/i);
  assert.doesNotMatch(combined, /[?&](?:token|signature|x-amz-[^=]+)=/i);
  assert.doesNotMatch(combined, /\/(?:home|Users)\//);
});
