import path from "node:path";

import { sha256 } from "./hash.js";
import { normalizeArchivePath, readZip } from "./zip.js";
import type {
  ArchiveLimits,
  ManifestItem,
  NavigationEntry,
  Publication,
  PublicationMetadata,
  SpineItem,
} from "./types.js";

export class PublicationError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "PublicationError";
    this.code = code;
  }
}

export function parseXmlAttributes(source: string): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    if (!name) continue;
    attributes[name] = match[2] ?? match[3] ?? "";
  }
  return attributes;
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replace(/&#(\d+);/g, (_match, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([\da-f]+);/gi, (_match, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    );
}

function textContent(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function firstElementText(source: string, localName: string): string | undefined {
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${localName}>`,
    "i",
  );
  const match = source.match(pattern);
  return match?.[1] === undefined ? undefined : textContent(match[1]);
}

function allElementText(source: string, localName: string): string[] {
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${localName}>`,
    "gi",
  );
  return [...source.matchAll(pattern)]
    .map((match) => (match[1] === undefined ? "" : textContent(match[1])))
    .filter(Boolean);
}

function resolveResourcePath(baseDocument: string, href: string): string {
  const [rawPath] = href.split("#", 1);
  if (!rawPath) return normalizeArchivePath(baseDocument);

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    throw new PublicationError("EPUB_HREF", `resource href is not valid percent encoding: ${href}`);
  }
  const baseDirectory = path.posix.dirname(baseDocument);
  return normalizeArchivePath(path.posix.join(baseDirectory, decodedPath));
}

function requiredText(entries: ReadonlyMap<string, Buffer>, entryPath: string): string {
  const data = entries.get(entryPath);
  if (!data) throw new PublicationError("EPUB_MISSING_ENTRY", `required entry is missing: ${entryPath}`);
  return data.toString("utf8");
}

function parseMetadata(opf: string): PublicationMetadata {
  return {
    title: firstElementText(opf, "title") ?? "Untitled publication",
    creators: allElementText(opf, "creator"),
    identifiers: allElementText(opf, "identifier"),
    publisher: firstElementText(opf, "publisher"),
  };
}

function parseManifest(opf: string, opfPath: string): ManifestItem[] {
  const manifest: ManifestItem[] = [];
  for (const match of opf.matchAll(/<item\b([^>]*)\/?\s*>/gi)) {
    const attributes = parseXmlAttributes(match[1] ?? "");
    const id = attributes.id;
    const href = attributes.href;
    const mediaType = attributes["media-type"];
    if (!id || !href || !mediaType) continue;
    manifest.push({
      id,
      href,
      path: resolveResourcePath(opfPath, href),
      mediaType,
      properties: (attributes.properties ?? "").split(/\s+/).filter(Boolean),
    });
  }
  if (manifest.length === 0) {
    throw new PublicationError("EPUB_MANIFEST", "package document has no manifest items");
  }
  return manifest;
}

function parseSpine(opf: string, manifest: readonly ManifestItem[]): SpineItem[] {
  const byId = new Map(manifest.map((item) => [item.id, item]));
  const spine: SpineItem[] = [];
  for (const match of opf.matchAll(/<itemref\b([^>]*)\/?\s*>/gi)) {
    const attributes = parseXmlAttributes(match[1] ?? "");
    const idref = attributes.idref;
    if (!idref) continue;
    const item = byId.get(idref);
    if (!item) throw new PublicationError("EPUB_SPINE", `spine references unknown item ${idref}`);
    spine.push({ idref, path: item.path, linear: attributes.linear !== "no" });
  }
  if (spine.length === 0) {
    throw new PublicationError("EPUB_SPINE", "package document has no spine items");
  }
  return spine;
}

function parseNavigation(
  entries: ReadonlyMap<string, Buffer>,
  manifest: readonly ManifestItem[],
): NavigationEntry[] {
  const navigationItem = manifest.find((item) => item.properties.includes("nav"));
  if (!navigationItem) {
    throw new PublicationError("EPUB_NAV", "manifest does not identify an EPUB navigation document");
  }
  const document = requiredText(entries, navigationItem.path);
  const navigation: NavigationEntry[] = [];
  for (const match of document.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attributes = parseXmlAttributes(match[1] ?? "");
    const href = attributes.href;
    if (!href) continue;
    const splitAt = href.indexOf("#");
    const fragment = splitAt === -1 ? undefined : href.slice(splitAt + 1);
    navigation.push({
      label: textContent(match[2] ?? ""),
      href,
      path: resolveResourcePath(navigationItem.path, href),
      fragment,
    });
  }
  if (navigation.length === 0) {
    throw new PublicationError("EPUB_NAV", "navigation document has no links");
  }
  return navigation;
}

export function inspectPublication(archive: Buffer, limits?: ArchiveLimits): Publication {
  const entries = readZip(archive, limits);
  const mediaType = entries.get("mimetype")?.toString("utf8");
  if (mediaType !== "application/epub+zip") {
    throw new PublicationError("EPUB_MIMETYPE", "mimetype entry is missing or invalid");
  }

  const container = requiredText(entries, "META-INF/container.xml");
  const rootfileMatch = container.match(/<rootfile\b([^>]*)\/?\s*>/i);
  const rootfile = rootfileMatch
    ? parseXmlAttributes(rootfileMatch[1] ?? "")["full-path"]
    : undefined;
  if (!rootfile) throw new PublicationError("EPUB_CONTAINER", "container has no rootfile");

  const opfPath = normalizeArchivePath(rootfile);
  const opf = requiredText(entries, opfPath);
  const manifest = parseManifest(opf, opfPath);
  for (const item of manifest) {
    if (!entries.has(item.path)) {
      throw new PublicationError("EPUB_MANIFEST", `manifest resource is missing: ${item.path}`);
    }
  }

  return {
    archive: Buffer.from(archive),
    entries,
    opfPath,
    metadata: parseMetadata(opf),
    manifest,
    spine: parseSpine(opf, manifest),
    navigation: parseNavigation(entries, manifest),
    sourceHash: sha256(archive),
  };
}
