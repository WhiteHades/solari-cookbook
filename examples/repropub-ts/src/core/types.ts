export type Verdict = "PRESERVED" | "LOST" | "BLOCKED" | "INCONCLUSIVE";
export type ExecutionMode = "local" | "solari";

export interface ArchiveLimits {
  readonly maxEntries: number;
  readonly maxCompressedBytes: number;
  readonly maxUncompressedBytes: number;
  readonly maxEntryBytes: number;
  readonly maxCompressionRatio: number;
}

export interface ZipEntry {
  readonly path: string;
  readonly data: Buffer;
}

export interface PublicationMetadata {
  readonly title: string;
  readonly creators: readonly string[];
  readonly identifiers: readonly string[];
  readonly publisher: string | undefined;
}

export interface ManifestItem {
  readonly id: string;
  readonly href: string;
  readonly path: string;
  readonly mediaType: string;
  readonly properties: readonly string[];
}

export interface SpineItem {
  readonly idref: string;
  readonly path: string;
  readonly linear: boolean;
}

export interface NavigationEntry {
  readonly label: string;
  readonly href: string;
  readonly path: string;
  readonly fragment: string | undefined;
}

export interface Publication {
  readonly archive: Buffer;
  readonly entries: ReadonlyMap<string, Buffer>;
  readonly opfPath: string;
  readonly metadata: PublicationMetadata;
  readonly manifest: readonly ManifestItem[];
  readonly spine: readonly SpineItem[];
  readonly navigation: readonly NavigationEntry[];
  readonly sourceHash: string;
}

export interface NavigationScenario {
  readonly id: string;
  readonly navigationIndex: number;
  readonly navigationHref?: string;
  readonly expectedTargetId: string;
  readonly reportedObservedTargetId: string;
}

export interface ReaderTarget {
  readonly id: string;
  readonly fragmentResolution: "literal" | "decoded";
}

export interface WitnessEnvironment {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly locale: string;
  readonly timezone: string;
}

export interface NavigationObservation {
  readonly kind: "navigation-target";
  readonly scenarioId: string;
  readonly targetReaderId: string;
  readonly navigationLabel: string | undefined;
  readonly requestedHref: string | undefined;
  readonly requestedFragment: string | undefined;
  readonly lookupFragment: string | undefined;
  readonly targetPath: string | undefined;
  readonly expectedTargetId: string;
  readonly reportedObservedTargetId: string;
  readonly observedTargetId: string | undefined;
  readonly observedHeading: string | undefined;
  readonly availableTargetIds: readonly string[];
  readonly blockedReason: string | undefined;
}

export interface WitnessResult {
  readonly mode: ExecutionMode;
  readonly verdict: Verdict;
  readonly observation: NavigationObservation;
  readonly durationMs: number;
  readonly environment: WitnessEnvironment;
}
