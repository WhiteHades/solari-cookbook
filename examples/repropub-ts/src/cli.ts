#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { inspectPublication } from "./core/epub.js";
import { runDemoPipeline, verifyBundle } from "./core/pipeline.js";

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function usage(): string {
  return `ReproPub — verified minimal EPUB reproductions

Usage:
  repropub demo [--output .tmp/repropub/demo-bundle] [--json]
  repropub inspect <publication.epub>
  repropub verify <bundle-directory>
`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(usage());
    return;
  }

  if (command === "demo") {
    const outputDir = option(args, "--output") ?? ".tmp/repropub/demo-bundle";
    const result = await runDemoPipeline({ outputDir });
    if (args.includes("--json")) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    const relative = path.relative(process.cwd(), path.resolve(outputDir));
    const reduction = Math.round((1 - result.sizes.reduced / result.sizes.original) * 100);
    process.stdout.write(
      [
        `ReproPub ${result.verdict}`,
        `run: ${result.runId}`,
        `size: ${result.sizes.original.toLocaleString("en-US")} → ${result.sizes.reduced.toLocaleString("en-US")} bytes (${reduction}% smaller)`,
        `bundle: ${relative}`,
      ].join("\n") + "\n",
    );
    return;
  }

  if (command === "inspect") {
    const inputPath = args[1];
    if (!inputPath) throw new Error("inspect requires an EPUB path");
    const publication = inspectPublication(await readFile(inputPath));
    process.stdout.write(
      `${JSON.stringify(
        {
          title: publication.metadata.title,
          creators: publication.metadata.creators,
          entries: publication.entries.size,
          manifestItems: publication.manifest.length,
          spineItems: publication.spine.length,
          navigationEntries: publication.navigation.length,
          sha256: publication.sourceHash,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (command === "verify") {
    const bundleDir = args[1];
    if (!bundleDir) throw new Error("verify requires a bundle directory");
    const result = await verifyBundle(bundleDir);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.valid) process.exitCode = 1;
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

main().catch((error: unknown) => {
  process.stderr.write(`ReproPub failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
