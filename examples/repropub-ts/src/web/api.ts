import type { DashboardCapabilities, DashboardRun, DashboardRunMode } from "../shared/dashboard";

interface ApiErrorBody {
  readonly error?: string;
  readonly run?: DashboardRun;
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = (await response.json()) as T & ApiErrorBody;
  if (!response.ok) throw new Error(body.error ?? `Request failed with HTTP ${response.status}`);
  return body;
}

export async function getCapabilities(): Promise<DashboardCapabilities> {
  const body = await request<{ readonly capabilities: DashboardCapabilities }>("/api/health");
  return body.capabilities;
}

export async function getLatestRun(): Promise<DashboardRun | null> {
  const body = await request<{ readonly run: DashboardRun | null }>("/api/runs/latest");
  return body.run;
}

export async function getRun(id: string): Promise<DashboardRun> {
  const body = await request<{ readonly run: DashboardRun }>(`/api/runs/${encodeURIComponent(id)}`);
  return body.run;
}

export async function startRun(mode: DashboardRunMode): Promise<DashboardRun> {
  const body = await request<{ readonly run: DashboardRun }>("/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  return body.run;
}
