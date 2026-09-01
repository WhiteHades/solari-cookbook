import assert from "node:assert/strict";
import test from "node:test";

import { inspectPublication } from "../src/core/epub.js";
import {
  createSyntheticPublication,
  createSyntheticScenario,
  getSyntheticPrivateProse,
} from "../src/core/fixture.js";
import { reducePublication } from "../src/core/reducer.js";
import { sanitizePublication } from "../src/core/sanitize.js";
import { readZip } from "../src/core/zip.js";

function searchableText(archive: Buffer): string {
  return [...readZip(archive).values()].map((entry) => entry.toString("utf8")).join("\n");
}

test("sanitizes sensitive publication content without losing the failure", async () => {
  const original = createSyntheticPublication();
  const result = await sanitizePublication({
    archive: original,
    scenario: createSyntheticScenario(),
  });
  const text = searchableText(result.archive);

  assert.ok(result.archive.length < original.length);
  assert.equal(inspectPublication(result.archive).metadata.title, "ReproPub Synthetic Fixture");
  assert.doesNotMatch(text, /The Private Atlas/);
  assert.doesNotMatch(text, /Ada Confidential/);
  assert.doesNotMatch(text, /9780000000420/);
  assert.doesNotMatch(text, /private\.example/);
  assert.doesNotMatch(text, new RegExp(getSyntheticPrivateProse().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(result.witness.verdict, "PRESERVED");
  assert.equal(result.report.remainingSensitiveValues, 0);
});

test("reduces publication structure and rejects a change that fixes the bug", async () => {
  const sanitized = await sanitizePublication({
    archive: createSyntheticPublication(),
    scenario: createSyntheticScenario(),
  });
  const result = await reducePublication({
    archive: sanitized.archive,
    scenario: createSyntheticScenario(),
    target: {
      id: "fixture-reader@legacy-fragment-resolver",
      fragmentResolution: "literal",
    },
    maxCandidates: 32,
  });
  const publication = inspectPublication(result.archive);

  assert.equal(result.finalWitness.verdict, "PRESERVED");
  assert.ok(result.archive.length < sanitized.archive.length);
  assert.equal(publication.spine.length, 1);
  assert.equal(publication.navigation.length, 1);
  assert.ok(result.decisions.some((decision) => decision.accepted));
  assert.ok(
    result.decisions.some(
      (decision) => decision.id === "normalize-target-fragment" && !decision.accepted && decision.verdict === "LOST",
    ),
  );
});
