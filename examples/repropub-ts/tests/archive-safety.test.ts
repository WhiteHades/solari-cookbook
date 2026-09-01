import assert from "node:assert/strict";
import test from "node:test";

import { ArchiveError, readZip, writeZip } from "../src/core/zip.js";

function replaceEvery(buffer: Buffer, from: string, to: string): Buffer {
  assert.equal(Buffer.byteLength(from), Buffer.byteLength(to));
  const output = Buffer.from(buffer);
  const needle = Buffer.from(from);
  const replacement = Buffer.from(to);
  let offset = 0;
  while ((offset = output.indexOf(needle, offset)) !== -1) {
    replacement.copy(output, offset);
    offset += replacement.length;
  }
  return output;
}

test("rejects archive paths that traverse outside the publication", () => {
  const safe = writeZip([{ path: "safe.txt", data: Buffer.from("safe") }]);
  const hostile = replaceEvery(safe, "safe.txt", "../evilx");

  assert.throws(
    () => readZip(hostile),
    (error: unknown) => error instanceof ArchiveError && error.code === "ZIP_PATH",
  );
});

test("rejects entries and total extraction beyond configured limits", () => {
  const archive = writeZip([
    { path: "one.txt", data: Buffer.alloc(8, 1) },
    { path: "two.txt", data: Buffer.alloc(8, 2) },
  ]);

  assert.throws(
    () =>
      readZip(archive, {
        maxEntries: 10,
        maxCompressedBytes: 1_024,
        maxUncompressedBytes: 12,
        maxEntryBytes: 10,
        maxCompressionRatio: 10,
      }),
    (error: unknown) => error instanceof ArchiveError && error.code === "ZIP_UNCOMPRESSED_LIMIT",
  );

  assert.throws(
    () =>
      readZip(archive, {
        maxEntries: 10,
        maxCompressedBytes: 1_024,
        maxUncompressedBytes: 32,
        maxEntryBytes: 4,
        maxCompressionRatio: 10,
      }),
    (error: unknown) => error instanceof ArchiveError && error.code === "ZIP_ENTRY_SIZE_LIMIT",
  );
});
