import assert from "node:assert/strict";
import test from "node:test";

import { inspectPublication } from "../src/core/epub.js";
import { createSyntheticPublication, createSyntheticScenario } from "../src/core/fixture.js";
import { runWitness } from "../src/core/witness.js";

const scenario = createSyntheticScenario();

test("witnesses a wrong-target EPUB navigation failure", async () => {
  const archive = createSyntheticPublication();
  const publication = inspectPublication(archive);

  assert.equal(publication.metadata.title, "The Private Atlas");
  assert.equal(publication.spine.length, 4);
  assert.equal(publication.navigation[1]?.href, "chapter-2.xhtml#target%20section");

  const result = await runWitness({
    archive,
    scenario,
    target: {
      id: "fixture-reader@legacy-fragment-resolver",
      fragmentResolution: "literal",
    },
    mode: "local",
  });

  assert.equal(result.verdict, "PRESERVED");
  assert.equal(result.observation.observedTargetId, "chapter-2");
  assert.equal(result.observation.expectedTargetId, "target section");
});

test("reports the failure lost when the target reader decodes the fragment", async () => {
  const result = await runWitness({
    archive: createSyntheticPublication(),
    scenario,
    target: {
      id: "fixture-reader@fixed-fragment-resolver",
      fragmentResolution: "decoded",
    },
    mode: "local",
  });

  assert.equal(result.verdict, "LOST");
  assert.equal(result.observation.observedTargetId, "target section");
});
