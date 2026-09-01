import {
  Archive,
  ArrowDownToLine,
  ArrowRight,
  BookOpenCheck,
  Box,
  Braces,
  Check,
  ChevronRight,
  CircleDot,
  Cloud,
  Code2,
  FileCheck2,
  FileJson2,
  Fingerprint,
  Globe2,
  HardDriveUpload,
  LockKeyhole,
  Network,
  Play,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  TestTubeDiagonal,
  TriangleAlert,
  Unplug,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AgentActivity } from "@/components/agent-activity";
import { StatefulButton } from "@/components/stateful-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { getCapabilities, getLatestRun, getRun, startRun } from "@/api";
import { cn, formatBytes, formatDuration } from "@/lib";
import type {
  DashboardActivity,
  DashboardCapabilities,
  DashboardDecision,
  DashboardRun,
  DashboardRunMode,
  DashboardVerdict,
} from "../shared/dashboard";

const EMPTY_ACTIVITY: readonly DashboardActivity[] = [
  { id: "inspect", label: "Inspect publication graph", status: "pending", detail: "Waiting" },
  { id: "witness", label: "Witness reported navigation failure", status: "pending", detail: "Waiting" },
  { id: "sanitize", label: "Replace sensitive content", status: "pending", detail: "Waiting" },
  { id: "reduce", label: "Reduce and re-run candidates", status: "pending", detail: "Waiting" },
  { id: "publish", label: "Publish verifiable repro bundle", status: "pending", detail: "Waiting" },
];

type ViewTab = "overview" | "decisions" | "artifacts";

const VERDICT_COPY: Record<DashboardVerdict, { title: string; detail: string }> = {
  PRESERVED: {
    title: "The failure survived reduction",
    detail: "The reduced synthetic EPUB still reaches the reported wrong target under the same oracle.",
  },
  LOST: {
    title: "The candidate fixed the failure",
    detail: "This candidate is not a valid reproduction because the expected target was reached.",
  },
  BLOCKED: {
    title: "The witness could not reach the oracle",
    detail: "Setup or navigation stopped before the behavior could be judged.",
  },
  INCONCLUSIVE: {
    title: "The evidence is ambiguous",
    detail: "The run completed, but its observation does not match the known failure or expected behavior.",
  },
};

function Metric({ label, value, detail }: { readonly label: string; readonly value: string; readonly detail: string }) {
  return (
    <div className="metric">
      <span className="metric__label">{label}</span>
      <strong className="metric__value">{value}</strong>
      <span className="metric__detail">{detail}</span>
    </div>
  );
}

function StatusMark({ ok }: { readonly ok: boolean }) {
  return <span className={cn("status-mark", ok ? "status-mark--ok" : "status-mark--bad")}>{ok ? <Check /> : <X />}</span>;
}

function DecisionRow({ decision }: { readonly decision: DashboardDecision }) {
  const delta = Math.max(0, decision.beforeBytes - decision.afterBytes);
  return (
    <li className="decision-row">
      <StatusMark ok={decision.accepted} />
      <span className="decision-row__copy">
        <strong>{decision.description}</strong>
        <span>{decision.reason}</span>
      </span>
      <span className="decision-row__meta">
        {decision.accepted ? `−${formatBytes(delta)}` : decision.verdict ?? "rejected"}
      </span>
    </li>
  );
}

function EmptyResult() {
  return (
    <div className="empty-result">
      <div className="empty-result__glyph"><BookOpenCheck aria-hidden="true" /></div>
      <div>
        <strong>No evidence bundle yet</strong>
        <p>Run the synthetic case. ReproPub will execute the failure, sanitize the publication, test reduction candidates, and hash the final artifacts.</p>
      </div>
    </div>
  );
}

function RunError({ error }: { readonly error: string }) {
  return (
    <div className="run-error" role="alert">
      <TriangleAlert aria-hidden="true" />
      <div><strong>The run stopped safely</strong><p>{error}</p></div>
    </div>
  );
}

function ResultOverview({ run }: { readonly run: DashboardRun }) {
  const result = run.result;
  if (!result) return run.error ? <RunError error={run.error} /> : <EmptyResult />;
  const copy = VERDICT_COPY[result.verdict];
  const reductionPercent = Math.round((1 - result.sizes.reduced / result.sizes.original) * 100);
  const evidence = result.artifacts.find((artifact) => artifact.path === "evidence/navigation-witness.svg")?.url;

  return (
    <div className="result-overview">
      <div className={cn("verdict-panel", `verdict-panel--${result.verdict.toLowerCase()}`)}>
        <div className="verdict-panel__topline">
          <Badge className="badge--verdict"><CircleDot aria-hidden="true" />{result.verdict}</Badge>
          <span>{result.mode === "solari" ? "Recorded Solari witness" : "Deterministic local witness"}</span>
        </div>
        <h3>{copy.title}</h3>
        <p>{copy.detail}</p>
        <div className="verdict-panel__route" aria-label="Observed and expected navigation targets">
          <span><small>Observed</small><strong className="text-danger">{result.observation.observedTargetId ?? "none"}</strong></span>
          <ArrowRight aria-hidden="true" />
          <span><small>Expected</small><strong className="text-success">{result.observation.expectedTargetId}</strong></span>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label="Original" value={formatBytes(result.sizes.original)} detail="Synthetic private-shaped input" />
        <Metric label="Reduced" value={formatBytes(result.sizes.reduced)} detail={`${reductionPercent}% smaller`} />
        <Metric label="Accepted" value={`${result.reduction.accepted}/${result.reduction.attempted}`} detail="Every candidate re-witnessed" />
        <Metric label="Duration" value={formatDuration(result.durationMs)} detail={`${result.cleanup.failed} cleanup failures`} />
      </div>

      <div className="evidence-grid">
        <div className="oracle-card">
          <div className="section-kicker"><ScanSearch aria-hidden="true" /> Oracle input</div>
          <dl className="evidence-list">
            <div><dt>Entry</dt><dd>{result.observation.navigationLabel ?? "selected entry"}</dd></div>
            <div><dt>Requested</dt><dd>{result.observation.requestedFragment ?? "none"}</dd></div>
            <div><dt>Reader lookup</dt><dd>{result.observation.lookupFragment ?? "none"}</dd></div>
            <div><dt>Heading</dt><dd>{result.observation.observedHeading ?? "none"}</dd></div>
          </dl>
          <div className="environment-line">
            <span>{result.environment.viewport.width}×{result.environment.viewport.height}</span>
            <span>{result.environment.locale}</span>
            <span>{result.environment.timezone}</span>
          </div>
        </div>
        {evidence ? (
          <a className="evidence-preview" href={evidence} target="_blank" rel="noreferrer" aria-label="Open the rendered navigation witness">
            <img src={evidence} alt="Rendered ReproPub navigation witness showing the observed and expected targets" />
            <span>Open rendered witness <ChevronRight aria-hidden="true" /></span>
          </a>
        ) : null}
      </div>
    </div>
  );
}

function DecisionsView({ run }: { readonly run: DashboardRun }) {
  const decisions = run.result?.decisions ?? [];
  if (decisions.length === 0) return <EmptyResult />;
  return (
    <div className="decisions-view">
      <div className="decisions-view__intro">
        <div><span className="section-kicker"><Braces aria-hidden="true" /> Reduction history</span><h3>Nothing is removed on faith.</h3></div>
        <p>Each candidate is structurally inspected and executed against the same oracle. A smaller file is kept only when the reported failure remains.</p>
      </div>
      <ol className="decision-list">{decisions.map((decision) => <DecisionRow key={decision.id} decision={decision} />)}</ol>
    </div>
  );
}

function ArtifactsView({ run }: { readonly run: DashboardRun }) {
  const result = run.result;
  if (!result) return <EmptyResult />;
  return (
    <div className="artifacts-view">
      <div className="artifact-grid">
        {result.artifacts.map((artifact) => (
          <a className="artifact" href={artifact.url} key={artifact.path} target="_blank" rel="noreferrer">
            <span className="artifact__icon">{artifact.path.endsWith(".epub") ? <BookOpenCheck /> : artifact.path.endsWith(".json") || artifact.path.endsWith(".jsonl") ? <FileJson2 /> : <FileCheck2 />}</span>
            <span className="artifact__copy"><strong>{artifact.path}</strong><span>{formatBytes(artifact.bytes)} · {artifact.sha256.slice(0, 12)}…</span></span>
            <ArrowDownToLine aria-hidden="true" />
          </a>
        ))}
      </div>
      <a className="receipt-link" href={result.receiptUrl} target="_blank" rel="noreferrer"><Fingerprint aria-hidden="true" /> Download machine-readable receipt <ArrowRight aria-hidden="true" /></a>
      <div className="limitations">
        <span className="section-kicker"><TriangleAlert aria-hidden="true" /> Honest limits</span>
        <ul>{result.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
      </div>
    </div>
  );
}

export default function App() {
  const reduceMotion = useReducedMotion();
  const [capabilities, setCapabilities] = useState<DashboardCapabilities | null>(null);
  const [run, setRun] = useState<DashboardRun | null>(null);
  const [mode, setMode] = useState<DashboardRunMode>("local");
  const [tab, setTab] = useState<ViewTab>("overview");
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([getCapabilities(), getLatestRun()])
      .then(([nextCapabilities, latest]) => {
        setCapabilities(nextCapabilities);
        setRun(latest);
        if (latest) setMode(latest.mode);
      })
      .catch((error: unknown) => setRequestError(error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(() => {
    if (!run || run.status !== "running") return;
    const timer = window.setInterval(() => {
      void getRun(run.id)
        .then((next) => {
          setRun(next);
          if (next.status !== "running") window.clearInterval(timer);
        })
        .catch((error: unknown) => {
          window.clearInterval(timer);
          setRequestError(error instanceof Error ? error.message : String(error));
        });
    }, 350);
    return () => window.clearInterval(timer);
  }, [run?.id, run?.status]);

  const launch = useCallback(async () => {
    setRequestError(null);
    setTab("overview");
    try {
      const next = await startRun(mode);
      setRun(next);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error));
    }
  }, [mode]);

  const status = run?.status ?? "idle";
  const buttonState = status === "running" ? "loading" : status === "complete" ? "success" : status === "error" || requestError ? "error" : "idle";
  const result = run?.result;
  const progress = run ? Math.round((run.activities.filter((item) => item.status === "complete").length / run.activities.length) * 100) : 0;
  const activities = run?.activities ?? EMPTY_ACTIVITY;
  const solariReady = capabilities?.solariConfigured ?? false;
  const latestLabel = result ? `${result.verdict} · ${formatDuration(result.durationMs)}` : status === "running" ? "Witness in progress" : "Awaiting first run";

  const tabs = useMemo(
    () => [
      { value: "overview" as const, label: "Overview", icon: <ScanSearch aria-hidden="true" /> },
      { value: "decisions" as const, label: "Decisions", icon: <Braces aria-hidden="true" /> },
      { value: "artifacts" as const, label: "Artifacts", icon: <Archive aria-hidden="true" /> },
    ],
    [],
  );

  return (
    <div className="app-shell">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="ambient ambient--two" aria-hidden="true" />
      <header className="site-header">
        <a className="brand" href="#top" aria-label="ReproPub home">
          <span className="brand__mark"><BookOpenCheck aria-hidden="true" /></span>
          <span><strong>ReproPub</strong><small>Verified EPUB reductions</small></span>
        </a>
        <nav className="site-header__nav" aria-label="Project links">
          <a href="https://github.com/WhiteHades/solari-cookbook/tree/feat/repropub/examples/repropub-ts" target="_blank" rel="noreferrer"><Code2 aria-hidden="true" /> Source</a>
          <Badge className={cn("badge--status", solariReady ? "badge--online" : "badge--offline")}>
            {solariReady ? <Cloud aria-hidden="true" /> : <Unplug aria-hidden="true" />}
            {solariReady ? "Solari configured" : "Local mode"}
          </Badge>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero__copy">
            <Badge className="hero__badge"><Sparkles aria-hidden="true" /> Evidence, not an AI guess</Badge>
            <h1>Turn an unshareable ebook bug into a <span>tiny, trusted reproduction.</span></h1>
            <p>ReproPub removes private publication content, cuts away irrelevant EPUB structure, and executes every candidate against the same reader oracle. What remains is a small fixture and a receipt a maintainer can actually trust.</p>
            <div className="hero__actions">
              <StatefulButton state={buttonState} onClick={() => void launch()}>
                Run verified demo
              </StatefulButton>
              <a className="text-link" href="#how-it-works">See the evidence chain <ArrowRight aria-hidden="true" /></a>
            </div>
            <div className="hero__trust">
              <span><ShieldCheck aria-hidden="true" /> Original prose removed</span>
              <span><TestTubeDiagonal aria-hidden="true" /> Every candidate rerun</span>
              <span><LockKeyhole aria-hidden="true" /> Secrets never enter receipts</span>
            </div>
          </div>

          <motion.div
            className="hero__visual"
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="artifact-flow">
              <div className="artifact-flow__header"><span className="window-dots"><i /><i /><i /></span><span>repropub witness</span><Badge>{status}</Badge></div>
              <div className="artifact-flow__body">
                <div className="flow-file flow-file--source"><HardDriveUpload aria-hidden="true" /><span><small>Source EPUB</small><strong>{result ? formatBytes(result.sizes.original) : "private + complex"}</strong></span></div>
                <span className="flow-arrow"><ArrowRight aria-hidden="true" /></span>
                <div className="flow-engine"><Network aria-hidden="true" /><span>inspect</span><span>sanitize</span><span>witness</span><span>reduce</span></div>
                <span className="flow-arrow"><ArrowRight aria-hidden="true" /></span>
                <div className="flow-file flow-file--result"><FileCheck2 aria-hidden="true" /><span><small>Repro bundle</small><strong>{result ? formatBytes(result.sizes.reduced) : "synthetic + verified"}</strong></span></div>
              </div>
              <div className="terminal-line"><TerminalSquare aria-hidden="true" /><code>{result ? `verdict=${result.verdict}  run=${result.runId}` : "waiting for an executed observation…"}</code></div>
            </div>
          </motion.div>
        </section>

        <section className="workspace" aria-labelledby="workspace-title">
          <div className="workspace__heading">
            <div><span className="section-kicker"><CircleDot aria-hidden="true" /> Live product workspace</span><h2 id="workspace-title">Run the complete evidence chain.</h2></div>
            <div className="workspace__latest"><small>Latest state</small><strong>{latestLabel}</strong></div>
          </div>

          <div className="workspace-grid">
            <Card className="run-card">
              <CardHeader>
                <CardTitle>Witness control</CardTitle>
                <CardDescription>Choose the execution surface, then run the same core pipeline used by the CLI.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs
                  value={mode}
                  onValueChange={setMode}
                  label="Execution mode"
                  options={[
                    { value: "local", label: "Local", icon: <Code2 aria-hidden="true" /> },
                    {
                      value: "solari",
                      label: "Solari",
                      icon: <Cloud aria-hidden="true" />,
                      disabled: !solariReady,
                      title: solariReady ? "Use the recorded Solari Browser and Sandbox witness" : "Set SOLARI_API_KEY on the server to enable live mode",
                    },
                  ]}
                />
                <div className="run-mode-note">
                  {mode === "local" ? <><Box aria-hidden="true" /><span><strong>Real deterministic execution</strong>Runs without credentials and never pretends to be a cloud recording.</span></> : <><Globe2 aria-hidden="true" /><span><strong>Independent cloud witness</strong>Builds in Solari Sandbox and records the action in Solari Browser.</span></>}
                </div>
                <Progress value={progress} label="Pipeline progress" />
                <div className="run-card__progress"><span>{progress}% verified</span><span>{run?.startedAt ? new Date(run.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "not started"}</span></div>
                <StatefulButton state={buttonState} onClick={() => void launch()} className="run-card__button">
                  Run verified demo
                </StatefulButton>
                {requestError ? <RunError error={requestError} /> : null}
              </CardContent>
            </Card>

            <Card className="activity-card">
              <CardHeader>
                <CardTitle>Agent activity</CardTitle>
                <CardDescription>Every displayed step comes from the running pipeline, not a staged animation.</CardDescription>
              </CardHeader>
              <CardContent><AgentActivity items={activities} status={status} /></CardContent>
            </Card>

            <Card className="result-card">
              <CardHeader className="result-card__header">
                <div><CardTitle>Evidence review</CardTitle><CardDescription>Inspect the verdict, candidate history, and downloadable bundle.</CardDescription></div>
                <Tabs value={tab} onValueChange={setTab} options={tabs} label="Evidence view" />
              </CardHeader>
              <CardContent>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={tab}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                    transition={{ duration: reduceMotion ? 0.1 : 0.22 }}
                  >
                    {tab === "overview" ? (run ? <ResultOverview run={run} /> : <EmptyResult />) : null}
                    {tab === "decisions" ? (run ? <DecisionsView run={run} /> : <EmptyResult />) : null}
                    {tab === "artifacts" ? (run ? <ArtifactsView run={run} /> : <EmptyResult />) : null}
                  </motion.div>
                </AnimatePresence>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="how" id="how-it-works">
          <div className="how__heading"><span className="section-kicker"><Fingerprint aria-hidden="true" /> Why maintainers can trust it</span><h2>A chain of custody for a bug.</h2><p>The useful output is not a confident explanation. It is a fixture whose failure was observed again after every destructive change.</p></div>
          <div className="principle-grid">
            <article><span><BookOpenCheck /></span><small>01</small><h3>Model the publication</h3><p>Read the container, package, manifest, spine, navigation, content, and references as one graph.</p></article>
            <article><span><ShieldCheck /></span><small>02</small><h3>Remove the identity</h3><p>Replace prose and metadata, neutralize artwork and remote links, and strip executable content.</p></article>
            <article><span><TestTubeDiagonal /></span><small>03</small><h3>Execute every candidate</h3><p>Keep a reduction only when the same reader scenario still produces the reported observation.</p></article>
            <article><span><Fingerprint /></span><small>04</small><h3>Publish the evidence</h3><p>Hash the EPUB, observations, transformations, privacy report, screenshots, and cleanup state.</p></article>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div><span className="brand__mark"><BookOpenCheck /></span><span><strong>ReproPub</strong><small>Built in the Solari cookbook fork.</small></span></div>
        <p>Privacy-risk reduction, not legal clearance. Ambiguous evidence returns <code>INCONCLUSIVE</code>.</p>
      </footer>
    </div>
  );
}
