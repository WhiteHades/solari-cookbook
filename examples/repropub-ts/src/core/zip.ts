import { inflateRawSync } from "node:zlib";

import { crc32 } from "./crc32.js";
import type { ArchiveLimits, ZipEntry } from "./types.js";

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const UTF8_FLAG = 0x0800;
const ZIP64_U16 = 0xffff;
const ZIP64_U32 = 0xffffffff;
const DOS_DATE_1980_01_01 = 0x0021;

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxEntries: 1_000,
  maxCompressedBytes: 64 * 1024 * 1024,
  maxUncompressedBytes: 256 * 1024 * 1024,
  maxEntryBytes: 64 * 1024 * 1024,
  maxCompressionRatio: 200,
};

export class ArchiveError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "ArchiveError";
    this.code = code;
  }
}

function assertBounds(buffer: Buffer, offset: number, length: number, label: string): void {
  if (offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new ArchiveError("ZIP_BOUNDS", `${label} extends beyond the archive`);
  }
}

export function normalizeArchivePath(input: string): string {
  if (input.length === 0) {
    throw new ArchiveError("ZIP_PATH", "archive entry path is empty");
  }
  if (input.includes("\0")) {
    throw new ArchiveError("ZIP_PATH", "archive entry path contains a NUL byte");
  }
  if (input.includes("\\")) {
    throw new ArchiveError("ZIP_PATH", `archive entry uses a backslash: ${input}`);
  }
  if (input.startsWith("/") || /^[A-Za-z]:/.test(input)) {
    throw new ArchiveError("ZIP_PATH", `archive entry is absolute: ${input}`);
  }

  const segments = input.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new ArchiveError("ZIP_PATH", `archive entry traverses outside the root: ${input}`);
  }

  const normalized = segments.filter((segment) => segment !== "" && segment !== ".").join("/");
  if (normalized.length === 0) {
    throw new ArchiveError("ZIP_PATH", `archive entry has no file name: ${input}`);
  }
  return normalized;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimumOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
      const commentLength = buffer.readUInt16LE(offset + 20);
      if (offset + 22 + commentLength === buffer.length) return offset;
    }
  }
  throw new ArchiveError("ZIP_EOCD", "end-of-central-directory record was not found");
}

function decodeName(value: Buffer): string {
  const name = value.toString("utf8");
  if (name.includes("\uFFFD")) {
    throw new ArchiveError("ZIP_ENCODING", "archive entry path is not valid UTF-8");
  }
  return name;
}

export function readZip(
  archive: Buffer,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): ReadonlyMap<string, Buffer> {
  if (archive.length > limits.maxCompressedBytes) {
    throw new ArchiveError(
      "ZIP_COMPRESSED_LIMIT",
      `archive is ${archive.length} bytes; limit is ${limits.maxCompressedBytes}`,
    );
  }
  if (archive.length < 22) {
    throw new ArchiveError("ZIP_TRUNCATED", "archive is too short to be a ZIP file");
  }

  const eocd = findEndOfCentralDirectory(archive);
  assertBounds(archive, eocd, 22, "end-of-central-directory record");

  const diskNumber = archive.readUInt16LE(eocd + 4);
  const centralDisk = archive.readUInt16LE(eocd + 6);
  const entriesOnDisk = archive.readUInt16LE(eocd + 8);
  const entryCount = archive.readUInt16LE(eocd + 10);
  const centralSize = archive.readUInt32LE(eocd + 12);
  const centralOffset = archive.readUInt32LE(eocd + 16);

  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new ArchiveError("ZIP_MULTIDISK", "multi-disk ZIP archives are not supported");
  }
  if (
    entryCount === ZIP64_U16 ||
    entriesOnDisk === ZIP64_U16 ||
    centralSize === ZIP64_U32 ||
    centralOffset === ZIP64_U32
  ) {
    throw new ArchiveError("ZIP64_UNSUPPORTED", "ZIP64 archives are not supported");
  }
  if (entryCount > limits.maxEntries) {
    throw new ArchiveError(
      "ZIP_ENTRY_LIMIT",
      `archive has ${entryCount} entries; limit is ${limits.maxEntries}`,
    );
  }
  assertBounds(archive, centralOffset, centralSize, "central directory");

  const entries = new Map<string, Buffer>();
  let cursor = centralOffset;
  let totalUncompressed = 0;

  for (let index = 0; index < entryCount; index += 1) {
    assertBounds(archive, cursor, 46, "central-directory entry");
    if (archive.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_HEADER) {
      throw new ArchiveError("ZIP_CENTRAL_HEADER", `entry ${index} has an invalid central header`);
    }

    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const expectedCrc = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const diskStart = archive.readUInt16LE(cursor + 34);
    const externalAttributes = archive.readUInt32LE(cursor + 38);
    const localHeaderOffset = archive.readUInt32LE(cursor + 42);
    const recordLength = 46 + nameLength + extraLength + commentLength;

    if (
      compressedSize === ZIP64_U32 ||
      uncompressedSize === ZIP64_U32 ||
      localHeaderOffset === ZIP64_U32 ||
      diskStart === ZIP64_U16
    ) {
      throw new ArchiveError("ZIP64_UNSUPPORTED", `entry ${index} requires ZIP64`);
    }
    if ((flags & 0x0001) !== 0) {
      throw new ArchiveError("ZIP_ENCRYPTED", `entry ${index} is encrypted`);
    }
    if (method !== 0 && method !== 8) {
      throw new ArchiveError("ZIP_METHOD", `entry ${index} uses unsupported method ${method}`);
    }
    if (diskStart !== 0) {
      throw new ArchiveError("ZIP_MULTIDISK", `entry ${index} starts on another disk`);
    }

    const unixMode = externalAttributes >>> 16;
    if ((unixMode & 0o170000) === 0o120000) {
      throw new ArchiveError("ZIP_SYMLINK", `entry ${index} is a symbolic link`);
    }

    assertBounds(archive, cursor, recordLength, "central-directory entry");
    const rawName = decodeName(archive.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += recordLength;

    if (rawName.endsWith("/")) continue;
    const path = normalizeArchivePath(rawName);
    if (entries.has(path)) {
      throw new ArchiveError("ZIP_DUPLICATE", `archive contains duplicate path ${path}`);
    }
    if (uncompressedSize > limits.maxEntryBytes) {
      throw new ArchiveError(
        "ZIP_ENTRY_SIZE_LIMIT",
        `${path} is ${uncompressedSize} bytes; per-entry limit is ${limits.maxEntryBytes}`,
      );
    }
    const ratio = uncompressedSize / Math.max(1, compressedSize);
    if (ratio > limits.maxCompressionRatio) {
      throw new ArchiveError(
        "ZIP_RATIO_LIMIT",
        `${path} compression ratio ${ratio.toFixed(1)} exceeds ${limits.maxCompressionRatio}`,
      );
    }

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > limits.maxUncompressedBytes) {
      throw new ArchiveError(
        "ZIP_UNCOMPRESSED_LIMIT",
        `archive expands beyond ${limits.maxUncompressedBytes} bytes`,
      );
    }

    assertBounds(archive, localHeaderOffset, 30, `local header for ${path}`);
    if (archive.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_HEADER) {
      throw new ArchiveError("ZIP_LOCAL_HEADER", `${path} has an invalid local header`);
    }
    const localNameLength = archive.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    assertBounds(archive, dataOffset, compressedSize, `compressed data for ${path}`);

    const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
    let data: Buffer;
    try {
      data = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ArchiveError("ZIP_INFLATE", `${path} could not be inflated: ${message}`);
    }

    if (data.length !== uncompressedSize) {
      throw new ArchiveError(
        "ZIP_SIZE_MISMATCH",
        `${path} expanded to ${data.length} bytes; expected ${uncompressedSize}`,
      );
    }
    if (crc32(data) !== expectedCrc) {
      throw new ArchiveError("ZIP_CRC", `${path} failed its CRC-32 check`);
    }

    entries.set(path, data);
  }

  if (cursor > centralOffset + centralSize) {
    throw new ArchiveError("ZIP_CENTRAL_SIZE", "central directory records exceed their declared size");
  }
  return entries;
}

interface PreparedEntry {
  readonly path: string;
  readonly name: Buffer;
  readonly data: Buffer;
  readonly crc: number;
  readonly offset: number;
}

export function writeZip(inputEntries: readonly ZipEntry[]): Buffer {
  const ordered = [...inputEntries].sort((left, right) => {
    if (left.path === "mimetype") return -1;
    if (right.path === "mimetype") return 1;
    return left.path.localeCompare(right.path);
  });
  const seen = new Set<string>();
  const prepared: PreparedEntry[] = [];
  const localParts: Buffer[] = [];
  let offset = 0;

  for (const entry of ordered) {
    const path = normalizeArchivePath(entry.path);
    if (seen.has(path)) throw new ArchiveError("ZIP_DUPLICATE", `duplicate output path ${path}`);
    seen.add(path);

    const name = Buffer.from(path, "utf8");
    const data = Buffer.from(entry.data);
    const checksum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(LOCAL_FILE_HEADER, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(UTF8_FLAG, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(DOS_DATE_1980_01_01, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);

    prepared.push({ path, name, data, crc: checksum, offset });
    localParts.push(header, name, data);
    offset += header.length + name.length + data.length;
  }

  const centralOffset = offset;
  const centralParts: Buffer[] = [];

  for (const entry of prepared) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(CENTRAL_DIRECTORY_HEADER, 0);
    header.writeUInt16LE(0x0314, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(UTF8_FLAG, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(DOS_DATE_1980_01_01, 14);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.data.length, 20);
    header.writeUInt32LE(entry.data.length, 24);
    header.writeUInt16LE(entry.name.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    header.writeUInt32LE(entry.offset, 42);
    centralParts.push(header, entry.name);
    offset += header.length + entry.name.length;
  }

  const centralSize = offset - centralOffset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(prepared.length, 8);
  eocd.writeUInt16LE(prepared.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}
