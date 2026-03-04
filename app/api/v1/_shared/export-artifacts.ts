import { NextRequest } from 'next/server';

export type UpstreamModel = {
  id: string;
  code?: string;
  name: string;
  default_threshold?: number;
  threshold?: number;
  health?: string;
  health_reason?: string;
};

export type ChangeSimulation = {
  baseline_alert_burden?: number;
  projected_alert_burden?: number;
  baseline_ppv_proxy?: number;
  projected_ppv_proxy?: number;
  delta_alert_burden_pct?: number;
  delta_ppv_proxy_pct?: number;
  sample_size?: number;
};

export type UpstreamChange = {
  id: string;
  model_id: string;
  incident_id: string | null;
  title: string;
  status: string;
  proposed_threshold: number;
  current_threshold: number;
  policy_patch: Record<string, unknown>;
  simulation_result?: ChangeSimulation;
  created_at?: string;
  updated_at?: string;
};

export type RoiSnapshot = {
  predictions_total: number;
  alerts_total: number;
  non_allow_total: number;
  alert_rate_pct: number;
  non_allow_rate_pct: number;
  ppv_proxy_pct: number;
  mean_score: number;
};

export type RoiArtifactsPayload = {
  report_type: 'roi_artifacts';
  generated_at: string;
  window: {
    start_time: string | null;
    end_time: string | null;
    split_time: string | null;
  };
  kpi_before: RoiSnapshot;
  kpi_after: RoiSnapshot;
  kpi_delta: Record<string, number>;
  incidents: Array<{
    id: string;
    title: string;
    status: string;
    severity: string;
    model_id: string;
    created_at: string | null;
  }>;
  change_log: Array<{
    id: string;
    title: string;
    status: string;
    model_id: string;
    current_threshold: number;
    proposed_threshold: number;
    created_at: string | null;
  }>;
};

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

function normalizeRatePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 1 && value >= 0) return value * 100;
  return value;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function parseIsoDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function isInsideWindow(value: string | undefined, start: Date | null, end: Date | null): boolean {
  if (!value) return true;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return true;
  if (start && parsed < start) return false;
  if (end && parsed > end) return false;
  return true;
}

function splitEvenly<T>(items: T[]): [T[], T[]] {
  if (items.length === 0) return [[], []];
  const splitIndex = Math.max(1, Math.floor(items.length / 2));
  const before = items.slice(0, splitIndex);
  const after = items.slice(splitIndex);
  return [before, after.length > 0 ? after : before];
}

function snapshotFromChanges(changes: UpstreamChange[], mode: 'before' | 'after'): RoiSnapshot {
  if (changes.length === 0) {
    return {
      predictions_total: 0,
      alerts_total: 0,
      non_allow_total: 0,
      alert_rate_pct: 0,
      non_allow_rate_pct: 0,
      ppv_proxy_pct: 0,
      mean_score: 0
    };
  }

  const predictionsTotal = changes.reduce((sum, change) => {
    const sample = toNumber(change.simulation_result?.sample_size, 120);
    return sum + Math.max(1, Math.round(sample));
  }, 0);

  const alertRatePctRaw = changes.reduce((sum, change) => {
    const rate =
      mode === 'before'
        ? toNumber(change.simulation_result?.baseline_alert_burden, 0)
        : toNumber(change.simulation_result?.projected_alert_burden, 0);
    return sum + normalizeRatePercent(rate);
  }, 0);
  const alertRatePct = round(alertRatePctRaw / changes.length);
  const alertsTotal = Math.max(0, Math.round((predictionsTotal * alertRatePct) / 100));

  const nonAllowTotal = changes.filter((change) => change.status !== 'Released').length;
  const nonAllowRatePct = round(predictionsTotal > 0 ? (nonAllowTotal / predictionsTotal) * 100 : 0);

  const ppvProxyRaw = changes.reduce((sum, change) => {
    const value =
      mode === 'before'
        ? toNumber(change.simulation_result?.baseline_ppv_proxy, 0)
        : toNumber(change.simulation_result?.projected_ppv_proxy, 0);
    return sum + normalizeRatePercent(value);
  }, 0);
  const ppvProxyPct = round(ppvProxyRaw / changes.length);

  const meanScore = round(
    changes.reduce((sum, change) => {
      return sum + (mode === 'before' ? toNumber(change.current_threshold, 0) : toNumber(change.proposed_threshold, 0));
    }, 0) / changes.length,
    4
  );

  return {
    predictions_total: predictionsTotal,
    alerts_total: alertsTotal,
    non_allow_total: nonAllowTotal,
    alert_rate_pct: alertRatePct,
    non_allow_rate_pct: nonAllowRatePct,
    ppv_proxy_pct: ppvProxyPct,
    mean_score: meanScore
  };
}

function delta(before: RoiSnapshot, after: RoiSnapshot): Record<string, number> {
  return {
    predictions_total_delta: round(after.predictions_total - before.predictions_total, 4),
    alerts_total_delta: round(after.alerts_total - before.alerts_total, 4),
    non_allow_total_delta: round(after.non_allow_total - before.non_allow_total, 4),
    alert_rate_pct_delta: round(after.alert_rate_pct - before.alert_rate_pct, 4),
    non_allow_rate_pct_delta: round(after.non_allow_rate_pct - before.non_allow_rate_pct, 4),
    ppv_proxy_pct_delta: round(after.ppv_proxy_pct - before.ppv_proxy_pct, 4),
    mean_score_delta: round(after.mean_score - before.mean_score, 4)
  };
}

function resolveUpstreamApiBase(request: NextRequest): string {
  const explicitBase = process.env.INTERNAL_API_URL?.trim();
  if (explicitBase) {
    return explicitBase.replace(/\/$/, '');
  }
  const origin = new URL(request.url).origin;
  return `${origin}/api/v1`;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

type ControlTowerMetrics = {
  models?: Array<{
    id: string;
    health?: string;
    health_reason?: string;
  }>;
};

export async function fetchUpstreamSources(request: NextRequest): Promise<{
  models: UpstreamModel[];
  changes: UpstreamChange[];
  metrics: ControlTowerMetrics | null;
}> {
  const base = resolveUpstreamApiBase(request);
  const [modelsRaw, changesRaw, metrics] = await Promise.all([
    fetchJson<UpstreamModel[] | { models?: UpstreamModel[] }>(`${base}/models`),
    fetchJson<UpstreamChange[] | { items?: UpstreamChange[] }>(`${base}/changes`),
    fetchJson<ControlTowerMetrics>(`${base}/metrics/control-tower`)
  ]);

  const models = Array.isArray(modelsRaw) ? modelsRaw : modelsRaw?.models ?? [];
  const changes = Array.isArray(changesRaw) ? changesRaw : changesRaw?.items ?? [];
  return { models, changes, metrics };
}

export function buildRoiArtifactsPayload(input: {
  models: UpstreamModel[];
  changes: UpstreamChange[];
  startTime: string | null;
  endTime: string | null;
  metrics: {
    models?: Array<{
      id: string;
      health?: string;
      health_reason?: string;
    }>;
  } | null;
}): RoiArtifactsPayload {
  const start = parseIsoDate(input.startTime);
  const end = parseIsoDate(input.endTime);
  const filteredChanges = input.changes.filter((change) => isInsideWindow(change.created_at, start, end));
  const sortedChanges = [...filteredChanges].sort((a, b) => {
    const left = a.created_at ? Date.parse(a.created_at) : 0;
    const right = b.created_at ? Date.parse(b.created_at) : 0;
    return left - right;
  });
  const [before, after] = splitEvenly(sortedChanges);
  const kpiBefore = snapshotFromChanges(before, 'before');
  const kpiAfter = snapshotFromChanges(after, 'after');
  const kpiDelta = delta(kpiBefore, kpiAfter);

  const metricModelById = new Map(
    (input.metrics?.models || []).map((model) => [model.id, model] as const)
  );

  const incidents = sortedChanges
    .filter((change) => change.status !== 'Released')
    .map((change) => {
      const metricModel = metricModelById.get(change.model_id);
      return {
        id: `inc-${change.id}`,
        title: `Risk review needed: ${change.title}`,
        status: change.status === 'RolledBack' ? 'Resolved' : 'Open',
        severity: metricModel?.health === 'Red' ? 'High' : metricModel?.health === 'Yellow' ? 'Medium' : 'Low',
        model_id: change.model_id,
        created_at: change.created_at || null
      };
    });

  const changeLog = sortedChanges.map((change) => ({
    id: change.id,
    title: change.title,
    status: change.status,
    model_id: change.model_id,
    current_threshold: toNumber(change.current_threshold, 0),
    proposed_threshold: toNumber(change.proposed_threshold, 0),
    created_at: change.created_at || null
  }));

  return {
    report_type: 'roi_artifacts',
    generated_at: new Date().toISOString(),
    window: {
      start_time: input.startTime,
      end_time: input.endTime,
      split_time:
        before.length > 0
          ? before[before.length - 1].created_at || null
          : sortedChanges.length > 0
            ? sortedChanges[0].created_at || null
            : null
    },
    kpi_before: kpiBefore,
    kpi_after: kpiAfter,
    kpi_delta: kpiDelta,
    incidents,
    change_log: changeLog
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
