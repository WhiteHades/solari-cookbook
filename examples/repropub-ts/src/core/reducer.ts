import { inspectPublication, parseXmlAttributes } from "./epub.js";
import { sha256 } from "./hash.js";
import type {
  NavigationScenario,
  ReaderTarget,
  Verdict,
  WitnessResult,
  ZipEntry,
} from "./types.js";
import { runWitness } from "./witness.js";
import { writeZip } from "./zip.js";

export interface ReductionDecision {
  readonly sequence: number;
  readonly id: string;
  readonly description: string;
  readonly accepted: boolean;
  readonly beforeBytes: number;
  readonly afterBytes: number;
  readonly candidateHash: string | undefined;
  readonly verdict: Verdict | undefined;
  readonly reason: string;
}

export interface ReductionResult {
  readonly archive: Buffer;
  readonly baselineWitness: WitnessResult;
  readonly finalWitness: WitnessResult;
  readonly decisions: readonly ReductionDecision[];
}

interface ReduceInput {
  readonly archive: Buffer;
  readonly scenario: NavigationScenario;
  readonly target: ReaderTarget;
  readonly maxCandidates: number;
}

interface Transformation {
  readonly id: string;
  readonly description: string;
  readonly apply: (archive: Buffer) => Buffer;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asArchive(entries: ReadonlyMap<string, Buffer>): Buffer {
  const output: ZipEntry[] = [...entries].map(([entryPath, data]) => ({ path: entryPath, data }));
  return writeZip(output);
}

function removeMatchingTag(source: string, tagName: string, attribute: string, expected: string): string {
  const pattern = new RegExp(`\\s*<${tagName}\\b([^>]*)\\/?\\s*>`, "gi");
  return source.replace(pattern, (tag, attributesSource: string) => {
    const attributes = parseXmlAttributes(attributesSource);
    return attributes[attribute] === expected ? "" : tag;
  });
}

function removeReferences(source: string, href: string): string {
  let output = source.replace(/\s*<li\b[^>]*>[\s\S]*?<\/li>/gi, (listItem) => {
    const anchor = listItem.match(/<a\b([^>]*)>/i);
    if (!anchor) return listItem;
    const linkedHref = parseXmlAttributes(anchor[1] ?? "").href;
    return linkedHref?.split("#", 1)[0] === href ? "" : listItem;
  });
  output = output.replace(
    /\s*<(?:link|script|img|image|audio|video|source)\b[^>]*(?:\/\s*>|>[\s\S]*?<\/(?:script|audio|video)\s*>)/gi,
    (tag) => {
      const opening = tag.match(/^\s*<[^>]+>/)?.[0] ?? tag;
      const attributes = parseXmlAttributes(opening);
      const linkedHref = attributes.href ?? attributes.src ?? attributes["xlink:href"];
      return linkedHref === href ? "" : tag;
    },
  );
  return output;
}

function removeManifestItem(archive: Buffer, itemId: string): Buffer {
  const publication = inspectPublication(archive);
  const item = publication.manifest.find((candidate) => candidate.id === itemId);
  if (!item) return archive;

  const entries = new Map<string, Buffer>(
    [...publication.entries].map(([entryPath, data]) => [entryPath, Buffer.from(data)]),
  );
  const opf = entries.get(publication.opfPath)?.toString("utf8");
  if (!opf) return archive;

  let nextOpf = removeMatchingTag(opf, "item", "id", item.id);
  nextOpf = removeMatchingTag(nextOpf, "itemref", "idref", item.id);
  nextOpf = nextOpf.replace(
    new RegExp(`\\s*<meta\\b[^>]*(?:name=["']cover["'][^>]*content=["']${escapeRegExp(item.id)}["']|content=["']${escapeRegExp(item.id)}["'][^>]*name=["']cover["'])[^>]*\\/?\\s*>`, "gi"),
    "",
  );
  entries.set(publication.opfPath, Buffer.from(nextOpf));
  entries.delete(item.path);

  for (const [entryPath, data] of entries) {
    if (!/\.(?:xhtml|html|xml|opf)$/i.test(entryPath)) continue;
    entries.set(entryPath, Buffer.from(removeReferences(data.toString("utf8"), item.href)));
  }
  return asArchive(entries);
}

function pruneNavigation(archive: Buffer, selectedHref: string): Buffer {
  const publication = inspectPublication(archive);
  const navItem = publication.manifest.find((item) => item.properties.includes("nav"));
  if (!navItem) return archive;
  const entries = new Map<string, Buffer>(publication.entries);
  const document = entries.get(navItem.path)?.toString("utf8");
  if (!document) return archive;

  const output = document.replace(/\s*<li\b[^>]*>[\s\S]*?<\/li>/gi, (listItem) => {
    const anchor = listItem.match(/<a\b([^>]*)>/i);
    if (!anchor) return "";
    const href = parseXmlAttributes(anchor[1] ?? "").href;
    return href === selectedHref ? listItem : "";
  });
  entries.set(navItem.path, Buffer.from(output));
  return asArchive(entries);
}

function removeTargetParagraphs(archive: Buffer, scenario: NavigationScenario): Buffer {
  const publication = inspectPublication(archive);
  const navigation = scenario.navigationHref
    ? publication.navigation.find((entry) => entry.href === scenario.navigationHref)
    : publication.navigation[scenario.navigationIndex];
  if (!navigation) return archive;
  const entries = new Map<string, Buffer>(publication.entries);
  const document = entries.get(navigation.path)?.toString("utf8");
  if (!document) return archive;
  entries.set(navigation.path, Buffer.from(document.replace(/\s*<p\b[^>]*>[\s\S]*?<\/p>/gi, "")));
  return asArchive(entries);
}

function normalizeTargetFragment(archive: Buffer, selectedHref: string): Buffer {
  const publication = inspectPublication(archive);
  const navItem = publication.manifest.find((item) => item.properties.includes("nav"));
  if (!navItem) return archive;
  const splitAt = selectedHref.indexOf("#");
  if (splitAt === -1) return archive;
  const rawFragment = selectedHref.slice(splitAt + 1);
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawFragment);
  } catch {
    return archive;
  }
  const normalizedHref = `${selectedHref.slice(0, splitAt + 1)}${decoded}`;
  const entries = new Map<string, Buffer>(publication.entries);
  const document = entries.get(navItem.path)?.toString("utf8");
  if (!document) return archive;
  entries.set(navItem.path, Buffer.from(document.replaceAll(selectedHref, normalizedHref)));
  return asArchive(entries);
}

function removeFallbackHeading(archive: Buffer, scenario: NavigationScenario): Buffer {
  const publication = inspectPublication(archive);
  const navigation = scenario.navigationHref
    ? publication.navigation.find((entry) => entry.href === scenario.navigationHref)
    : publication.navigation[scenario.navigationIndex];
  if (!navigation) return archive;
  const entries = new Map<string, Buffer>(publication.entries);
  const document = entries.get(navigation.path)?.toString("utf8");
  if (!document) return archive;
  const id = escapeRegExp(scenario.reportedObservedTargetId);
  const pattern = new RegExp(`\\s*<h([1-6])\\b([^>]*\\bid=["']${id}["'][^>]*)>[\\s\\S]*?<\\/h\\1>`, "gi");
  entries.set(navigation.path, Buffer.from(document.replace(pattern, "")));
  return asArchive(entries);
}

function buildTransformations(archive: Buffer, scenario: NavigationScenario): Transformation[] {
  const publication = inspectPublication(archive);
  const selected = scenario.navigationHref
    ? publication.navigation.find((entry) => entry.href === scenario.navigationHref)
    : publication.navigation[scenario.navigationIndex];
  if (!selected) throw new Error("selected navigation entry is unavailable before reduction");
  const navItem = publication.manifest.find((item) => item.properties.includes("nav"));
  if (!navItem) throw new Error("navigation item is unavailable before reduction");
  const targetItem = publication.manifest.find((item) => item.path === selected.path);
  if (!targetItem) throw new Error(`target resource ${selected.path} is not in the manifest`);

  const removable = publication.manifest
    .filter((item) => item.id !== navItem.id && item.id !== targetItem.id)
    .sort((left, right) => {
      const leftInSpine = publication.spine.some((item) => item.idref === left.id);
      const rightInSpine = publication.spine.some((item) => item.idref === right.id);
      if (leftInSpine !== rightInSpine) return leftInSpine ? 1 : -1;
      return left.id.localeCompare(right.id);
    });

  return [
    ...removable.map<Transformation>((item) => ({
      id: `remove-resource:${item.id}`,
      description: `Remove manifest resource ${item.id} (${item.mediaType}) and its references`,
      apply: (candidate) => removeManifestItem(candidate, item.id),
    })),
    {
      id: "prune-navigation",
      description: "Keep only the selected navigation entry",
      apply: (candidate) => pruneNavigation(candidate, selected.href),
    },
    {
      id: "remove-target-paragraphs",
      description: "Remove prose paragraphs from the target document while retaining identified headings",
      apply: (candidate) => removeTargetParagraphs(candidate, scenario),
    },
    {
      id: "normalize-target-fragment",
      description: "Decode the target fragment in the navigation href",
      apply: (candidate) => normalizeTargetFragment(candidate, selected.href),
    },
    {
      id: "remove-fallback-heading",
      description: "Remove the heading reached by the reported failure",
      apply: (candidate) => removeFallbackHeading(candidate, scenario),
    },
  ];
}

export async function reducePublication(input: ReduceInput): Promise<ReductionResult> {
  if (!Number.isInteger(input.maxCandidates) || input.maxCandidates < 1) {
    throw new Error("maxCandidates must be a positive integer");
  }

  const baselineWitness = await runWitness({
    archive: input.archive,
    scenario: input.scenario,
    target: input.target,
    mode: "local",
  });
  if (baselineWitness.verdict !== "PRESERVED") {
    throw new Error(`reduction requires a PRESERVED baseline, received ${baselineWitness.verdict}`);
  }

  const transformations = buildTransformations(input.archive, input.scenario);
  const decisions: ReductionDecision[] = [];
  let current = Buffer.from(input.archive);

  for (const [index, transformation] of transformations.entries()) {
    if (index >= input.maxCandidates) break;
    const beforeBytes = current.length;
    try {
      const candidate = transformation.apply(current);
      inspectPublication(candidate);
      const witness = await runWitness({
        archive: candidate,
        scenario: input.scenario,
        target: input.target,
        mode: "local",
      });
      const smaller = candidate.length < beforeBytes;
      const accepted = smaller && witness.verdict === "PRESERVED";
      decisions.push({
        sequence: decisions.length + 1,
        id: transformation.id,
        description: transformation.description,
        accepted,
        beforeBytes,
        afterBytes: candidate.length,
        candidateHash: sha256(candidate),
        verdict: witness.verdict,
        reason: accepted
          ? "candidate is smaller and independently preserves the failure"
          : !smaller
            ? "candidate did not reduce the archive"
            : `candidate verdict was ${witness.verdict}`,
      });
      if (accepted) current = Buffer.from(candidate);
    } catch (error) {
      decisions.push({
        sequence: decisions.length + 1,
        id: transformation.id,
        description: transformation.description,
        accepted: false,
        beforeBytes,
        afterBytes: beforeBytes,
        candidateHash: undefined,
        verdict: undefined,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const finalWitness = await runWitness({
    archive: current,
    scenario: input.scenario,
    target: input.target,
    mode: "local",
  });
  if (finalWitness.verdict !== "PRESERVED") {
    throw new Error(`final independent witness returned ${finalWitness.verdict}`);
  }

  return { archive: current, baselineWitness, finalWitness, decisions };
}
