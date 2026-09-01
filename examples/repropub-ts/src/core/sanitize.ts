import { inspectPublication, parseXmlAttributes } from "./epub.js";
import { sha256 } from "./hash.js";
import type { NavigationScenario, WitnessResult, ZipEntry } from "./types.js";
import { runWitness } from "./witness.js";
import { writeZip } from "./zip.js";

export interface PrivacyAction {
  readonly category: "metadata" | "prose" | "remote-url" | "script" | "image" | "event-handler";
  readonly count: number;
  readonly action: string;
}

export interface PrivacyReport {
  readonly version: 1;
  readonly sourceHash: string;
  readonly sanitizedHash: string;
  readonly inspectedSensitiveValues: number;
  readonly remainingSensitiveValues: number;
  readonly actions: readonly PrivacyAction[];
}

export interface SanitizeResult {
  readonly archive: Buffer;
  readonly report: PrivacyReport;
  readonly witness: WitnessResult;
}

interface SanitizeInput {
  readonly archive: Buffer;
  readonly scenario: NavigationScenario;
}

const SYNTHETIC_TITLE = "ReproPub Synthetic Fixture";
const SYNTHETIC_CREATOR = "Synthetic Author";
const SYNTHETIC_IDENTIFIER = "urn:uuid:00000000-0000-4000-8000-000000000000";
const SYNTHETIC_PUBLISHER = "ReproPub";
const SYNTHETIC_DESCRIPTION = "Synthetic content retained only to reproduce reader behavior.";

function replaceElementContent(source: string, localName: string, replacement: string): string {
  const pattern = new RegExp(
    `(<(?:[\\w.-]+:)?${localName}\\b[^>]*>)[\\s\\S]*?(<\\/(?:[\\w.-]+:)?${localName}>)`,
    "gi",
  );
  return source.replace(pattern, `$1${replacement}$2`);
}

function removeManifestItems(source: string, itemIds: ReadonlySet<string>): string {
  return source.replace(/\s*<item\b([^>]*)\/?\s*>/gi, (tag, attributesSource: string) => {
    const attributes = parseXmlAttributes(attributesSource);
    return attributes.id && itemIds.has(attributes.id) ? "" : tag;
  });
}

function removeSpineItems(source: string, itemIds: ReadonlySet<string>): string {
  return source.replace(/\s*<itemref\b([^>]*)\/?\s*>/gi, (tag, attributesSource: string) => {
    const attributes = parseXmlAttributes(attributesSource);
    return attributes.idref && itemIds.has(attributes.idref) ? "" : tag;
  });
}

function stripEventHandlers(source: string): { readonly value: string; readonly count: number } {
  let count = 0;
  const value = source.replace(
    /\s+on[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*')/gi,
    () => {
      count += 1;
      return "";
    },
  );
  return { value, count };
}

function neutralizeRemoteAttributes(source: string): { readonly value: string; readonly count: number } {
  let count = 0;
  const value = source.replace(
    /(\s(?:href|src|poster)\s*=\s*)(["'])https?:\/\/[^"']*\2/gi,
    (_match, prefix: string, quote: string) => {
      count += 1;
      return `${prefix}${quote}#${quote}`;
    },
  );
  return { value, count };
}

function neutralizeCssUrls(source: string): { readonly value: string; readonly count: number } {
  let count = 0;
  let value = source.replace(/@import\s+(?:url\()?\s*["']?https?:\/\/[^;\s)'\"]+["']?\s*\)?\s*;/gi, () => {
    count += 1;
    return "";
  });
  value = value.replace(/url\(\s*["']?https?:\/\/[^)'\"]+["']?\s*\)/gi, () => {
    count += 1;
    return "url(\"\")";
  });
  return { value, count };
}

function replaceHumanText(source: string): { readonly value: string; readonly count: number } {
  const tokens = source.split(/(<[^>]+>)/g);
  const protectedTags: string[] = [];
  let textIndex = 0;
  let count = 0;

  const value = tokens
    .map((token) => {
      if (token.startsWith("<")) {
        const closing = token.match(/^<\/\s*([\w:-]+)/);
        if (closing?.[1]) {
          const name = closing[1].toLowerCase();
          if (protectedTags.at(-1) === name) protectedTags.pop();
          return token;
        }

        const opening = token.match(/^<\s*([\w:-]+)/);
        const name = opening?.[1]?.toLowerCase();
        if (name && (name === "style" || name === "code" || name === "pre") && !token.endsWith("/>")) {
          protectedTags.push(name);
        }
        return token;
      }

      if (protectedTags.length > 0 || token.trim().length === 0) return token;
      count += 1;
      textIndex += 1;
      const leading = token.match(/^\s*/)?.[0] ?? "";
      const trailing = token.match(/\s*$/)?.[0] ?? "";
      return `${leading}Synthetic text ${textIndex}.${trailing}`;
    })
    .join("");

  return { value, count };
}

function collectSensitiveValues(source: string): string[] {
  const values = new Set<string>();
  for (const match of source.matchAll(/https?:\/\/[^\s"'<>)}]+/gi)) {
    const value = match[0];
    const publicNamespace = /^(?:https?:\/\/)?(?:www\.)?(?:w3\.org|idpf\.org|purl\.org|oasis-open\.org)\//i.test(value);
    if (value.length >= 8 && !publicNamespace) values.add(value);
  }
  for (const match of source.matchAll(/>([^<]+)</g)) {
    const value = (match[1] ?? "").replace(/\s+/g, " ").trim();
    if (value.length >= 5 && !/^\d{4}-\d{2}-\d{2}T/.test(value)) values.add(value);
  }
  return [...values];
}

function asArchive(entries: ReadonlyMap<string, Buffer>): Buffer {
  const output: ZipEntry[] = [...entries].map(([entryPath, data]) => ({ path: entryPath, data }));
  return writeZip(output);
}

function safeSearchText(entries: ReadonlyMap<string, Buffer>): string {
  return [...entries.values()].map((entry) => entry.toString("utf8")).join("\n");
}

export async function sanitizePublication(input: SanitizeInput): Promise<SanitizeResult> {
  const publication = inspectPublication(input.archive);
  const entries = new Map<string, Buffer>(
    [...publication.entries].map(([entryPath, data]) => [entryPath, Buffer.from(data)]),
  );
  const originalSearchText = safeSearchText(entries);
  const sensitiveValues = new Set<string>([
    publication.metadata.title,
    ...publication.metadata.creators,
    ...publication.metadata.identifiers,
    ...(publication.metadata.publisher ? [publication.metadata.publisher] : []),
    ...collectSensitiveValues(originalSearchText),
  ]);

  const scriptItems = publication.manifest.filter(
    (item) => item.mediaType.includes("javascript") || item.properties.includes("scripted"),
  );
  const scriptIds = new Set(scriptItems.map((item) => item.id));
  for (const item of scriptItems) entries.delete(item.path);

  const opf = entries.get(publication.opfPath)?.toString("utf8");
  if (!opf) throw new Error(`package document disappeared: ${publication.opfPath}`);
  let sanitizedOpf = replaceElementContent(opf, "title", SYNTHETIC_TITLE);
  sanitizedOpf = replaceElementContent(sanitizedOpf, "creator", SYNTHETIC_CREATOR);
  sanitizedOpf = replaceElementContent(sanitizedOpf, "identifier", SYNTHETIC_IDENTIFIER);
  sanitizedOpf = replaceElementContent(sanitizedOpf, "publisher", SYNTHETIC_PUBLISHER);
  sanitizedOpf = replaceElementContent(sanitizedOpf, "description", SYNTHETIC_DESCRIPTION);
  sanitizedOpf = replaceElementContent(sanitizedOpf, "subject", "Synthetic subject");
  sanitizedOpf = replaceElementContent(sanitizedOpf, "rights", "Synthetic fixture");
  sanitizedOpf = sanitizedOpf.replace(
    /(<meta\b[^>]*property=["']dcterms:modified["'][^>]*>)[\s\S]*?(<\/meta>)/gi,
    "$12000-01-01T00:00:00Z$2",
  );
  sanitizedOpf = removeManifestItems(sanitizedOpf, scriptIds);
  sanitizedOpf = removeSpineItems(sanitizedOpf, scriptIds);
  entries.set(publication.opfPath, Buffer.from(sanitizedOpf));

  let proseCount = 0;
  let remoteUrlCount = 0;
  let eventHandlerCount = 0;
  let imageCount = 0;

  for (const item of publication.manifest) {
    if (scriptIds.has(item.id)) continue;
    const data = entries.get(item.path);
    if (!data) continue;

    if (item.mediaType === "application/xhtml+xml" || item.mediaType === "text/html") {
      let document = data.toString("utf8");
      document = document.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
      document = document.replace(/<script\b[^>]*\/\s*>/gi, "");
      const events = stripEventHandlers(document);
      document = events.value;
      eventHandlerCount += events.count;
      const remotes = neutralizeRemoteAttributes(document);
      document = remotes.value;
      remoteUrlCount += remotes.count;
      const text = replaceHumanText(document);
      document = text.value;
      proseCount += text.count;
      entries.set(item.path, Buffer.from(document));
      continue;
    }

    if (item.mediaType === "text/css") {
      const css = neutralizeCssUrls(data.toString("utf8"));
      remoteUrlCount += css.count;
      entries.set(item.path, Buffer.from(css.value));
      continue;
    }

    if (item.mediaType === "image/svg+xml") {
      imageCount += 1;
      entries.set(
        item.path,
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#e2e8f0"/></svg>',
        ),
      );
    }
  }

  const archive = asArchive(entries);
  const sanitizedPublication = inspectPublication(archive);
  const sanitizedSearchText = safeSearchText(sanitizedPublication.entries);
  const remainingSensitiveValues = [...sensitiveValues].filter(
    (value) => value.length >= 5 && sanitizedSearchText.includes(value),
  ).length;
  const witness = await runWitness({
    archive,
    scenario: input.scenario,
    target: {
      id: "fixture-reader@legacy-fragment-resolver",
      fragmentResolution: "literal",
    },
    mode: "local",
  });

  if (witness.verdict !== "PRESERVED") {
    throw new Error(`sanitization did not preserve the reported failure: ${witness.verdict}`);
  }

  const actions: PrivacyAction[] = [
    { category: "metadata", count: 5, action: "replaced with deterministic synthetic metadata" },
    { category: "prose", count: proseCount, action: "replaced text nodes while preserving element structure and identifiers" },
    { category: "remote-url", count: remoteUrlCount, action: "removed or neutralized remote references" },
    { category: "script", count: scriptItems.length, action: "removed script resources and script elements" },
    { category: "image", count: imageCount, action: "replaced artwork with a neutral generated image" },
    { category: "event-handler", count: eventHandlerCount, action: "removed inline event handlers" },
  ];

  return {
    archive,
    report: {
      version: 1,
      sourceHash: sha256(input.archive),
      sanitizedHash: sha256(archive),
      inspectedSensitiveValues: sensitiveValues.size,
      remainingSensitiveValues,
      actions,
    },
    witness,
  };
}
