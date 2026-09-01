export type DashboardRunStatus = "idle" | "running" | "complete" | "error";
export type DashboardRunMode = "local" | "solari";
export type DashboardVerdict = "PRESERVED" | "LOST" | "BLOCKED" | "INCONCLUSIVE";
export type DashboardActivityStatus = "pending" | "active" | "complete" | "error";

export interface DashboardActivity {
  readonly id: string;
  readonly label: string;
  readonly status: DashboardActivityStatus;
  readonly detail: string;
}

export interface DashboardArtifact {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly url: string;
}

export interface DashboardDecision {
  readonly sequence: number;
  readonly id: string;
  readonly description: string;
  readonly accepted: boolean;
  readonly beforeBytes: number;
  readonly afterBytes: number;
  readonly verdict: DashboardVerdict | undefined;
  readonly reason: string;
}

export interface DashboardRunResult {
  readonly runId: string;
  readonly verdict: DashboardVerdict;
  readonly mode: DashboardRunMode;
  readonly targetId: string;
  readonly scenarioId: string;
  readonly sizes: {
    readonly original: number;
    readonly sanitized: number;
    readonly reduced: number;
  };
  readonly reduction: {
    readonly attempted: number;
    readonly accepted: number;
    readonly rejected: number;
  };
  readonly privacy: {
    readonly inspectedSensitiveValues: number;
    readonly remainingSensitiveValues: number;
  };
  readonly observation: {
    readonly navigationLabel: string | undefined;
    readonly requestedFragment: string | undefined;
    readonly lookupFragment: string | undefined;
    readonly observedTargetId: string | undefined;
    readonly expectedTargetId: string;
    readonly observedHeading: string | undefined;
  };
  readonly environment: {
    readonly viewport: { readonly width: number; readonly height: number };
    readonly locale: string;
    readonly timezone: string;
  };
  readonly cleanup: {
    readonly attempted: number;
    readonly succeeded: number;
    readonly failed: number;
  };
  readonly durationMs: number;
  readonly decisions: readonly DashboardDecision[];
  readonly artifacts: readonly DashboardArtifact[];
  readonly receiptUrl: string;
  readonly limitations: readonly string[];
}

export interface DashboardRun {
  readonly id: string;
  readonly mode: DashboardRunMode;
  readonly status: DashboardRunStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly activities: readonly DashboardActivity[];
  readonly error?: string;
  readonly result?: DashboardRunResult;
}

export interface DashboardCapabilities {
  readonly local: true;
  readonly solariConfigured: boolean;
  readonly product: "ReproPub";
}
