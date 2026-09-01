import { inspectPublication, parseXmlAttributes } from "./epub.js";
import { judgeNavigationObservation } from "./oracle.js";
import type {
  ExecutionMode,
  NavigationObservation,
  NavigationScenario,
  ReaderTarget,
  WitnessEnvironment,
  WitnessResult,
} from "./types.js";

interface RunWitnessInput {
  readonly archive: Buffer;
  readonly scenario: NavigationScenario;
  readonly target: ReaderTarget;
  readonly mode: ExecutionMode;
  readonly environment?: WitnessEnvironment;
}

interface Heading {
  readonly id: string;
  readonly text: string;
}

const DEFAULT_ENVIRONMENT: WitnessEnvironment = {
  viewport: { width: 1280, height: 800 },
  locale: "en-US",
  timezone: "UTC",
};

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function readHeadings(document: string): Heading[] {
  const headings: Heading[] = [];
  for (const match of document.matchAll(/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi)) {
    const attributes = parseXmlAttributes(match[2] ?? "");
    const id = attributes.id;
    if (!id) continue;
    headings.push({ id, text: stripTags(match[3] ?? "") });
  }
  return headings;
}

function resolveFragment(fragment: string | undefined, target: ReaderTarget): string | undefined {
  if (fragment === undefined || target.fragmentResolution === "literal") return fragment;
  try {
    return decodeURIComponent(fragment);
  } catch {
    return undefined;
  }
}

function blockedObservation(
  input: RunWitnessInput,
  reason: string,
  partial: Partial<NavigationObservation> = {},
): NavigationObservation {
  return {
    kind: "navigation-target",
    scenarioId: input.scenario.id,
    targetReaderId: input.target.id,
    navigationLabel: partial.navigationLabel,
    requestedHref: partial.requestedHref,
    requestedFragment: partial.requestedFragment,
    lookupFragment: partial.lookupFragment,
    targetPath: partial.targetPath,
    expectedTargetId: input.scenario.expectedTargetId,
    reportedObservedTargetId: input.scenario.reportedObservedTargetId,
    observedTargetId: partial.observedTargetId,
    observedHeading: partial.observedHeading,
    availableTargetIds: partial.availableTargetIds ?? [],
    blockedReason: reason,
  };
}

export async function runWitness(input: RunWitnessInput): Promise<WitnessResult> {
  const startedAt = performance.now();
  let observation: NavigationObservation;

  try {
    const publication = inspectPublication(input.archive);
    const navigation = publication.navigation[input.scenario.navigationIndex];
    if (!navigation) {
      observation = blockedObservation(input, `navigation index ${input.scenario.navigationIndex} is missing`);
    } else {
      const lookupFragment = resolveFragment(navigation.fragment, input.target);
      const document = publication.entries.get(navigation.path);
      if (!document) {
        observation = blockedObservation(input, `navigation target ${navigation.path} is missing`, {
          navigationLabel: navigation.label,
          requestedHref: navigation.href,
          requestedFragment: navigation.fragment,
          lookupFragment,
          targetPath: navigation.path,
        });
      } else {
        const headings = readHeadings(document.toString("utf8"));
        if (headings.length === 0) {
          observation = blockedObservation(input, `navigation target ${navigation.path} has no identified headings`, {
            navigationLabel: navigation.label,
            requestedHref: navigation.href,
            requestedFragment: navigation.fragment,
            lookupFragment,
            targetPath: navigation.path,
          });
        } else {
          const selected = headings.find((heading) => heading.id === lookupFragment) ?? headings[0];
          observation = {
            kind: "navigation-target",
            scenarioId: input.scenario.id,
            targetReaderId: input.target.id,
            navigationLabel: navigation.label,
            requestedHref: navigation.href,
            requestedFragment: navigation.fragment,
            lookupFragment,
            targetPath: navigation.path,
            expectedTargetId: input.scenario.expectedTargetId,
            reportedObservedTargetId: input.scenario.reportedObservedTargetId,
            observedTargetId: selected?.id,
            observedHeading: selected?.text,
            availableTargetIds: headings.map((heading) => heading.id),
            blockedReason: undefined,
          };
        }
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    observation = blockedObservation(input, reason);
  }

  return {
    mode: input.mode,
    verdict: judgeNavigationObservation(observation),
    observation,
    durationMs: Math.max(0, performance.now() - startedAt),
    environment: input.environment ?? DEFAULT_ENVIRONMENT,
  };
}
