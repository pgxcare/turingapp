'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis
} from 'recharts';

import { HealthChip, OutcomeChip } from '@/components/features/status-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tooltip } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { useQueryResource } from '@/lib/use-query-resource';

type DriftPayload = {
  model: {
    id: string;
    name: string;
    code: string;
    default_threshold: number;
    health: string;
  } | null;
  signals: {
    psi: number;
    ks_stat: number;
    baseline_alert_burden: number;
    recent_alert_burden: number;
    alert_delta_pct: number;
    alert_delta_note?: string | null;
    baseline_samples: number;
    recent_samples: number;
  };
  thresholds: {
    psi_threshold: number;
    psi_hold_threshold: number;
    ks_threshold: number;
    alert_delta_threshold_pct: number;
  };
  health_reason: string;
  score_distribution: Array<{ date: string; mean: number; p90: number; count: number }>;
  alert_trend: Array<{ date: string; alerts: number; rate: number }>;
  hypotheses: string[];
  next_best_actions: string[];
  proposal_prefill: {
    model_id: string;
    title: string;
    proposed_threshold: number;
    expected_effect: string;
    risk_assessment: string;
    reason_codes: string[];
    recommended_outcome: string;
  };
  signal_source?: {
    type: 'model_live' | 'event_snapshot';
    event_id?: string;
    event_time?: string | null;
    location_unit?: string | null;
    care_setting?: string | null;
  };
};

const chartTokens = {
  grid: 'hsl(var(--chart-grid))',
  scoreMean: 'hsl(var(--chart-1))',
  scoreP90: 'hsl(var(--chart-2))',
  alerts: 'hsl(var(--chart-3))',
  alertRate: 'hsl(var(--chart-4))'
};

type SignalStatus = 'baseline' | 'caution' | 'hold';

type AlertDeltaNormalization = {
  delta: number;
  note: string | null;
};

function signalStatus(value: number, cautionThreshold: number, holdThreshold: number | null = null): SignalStatus {
  if (holdThreshold !== null && value >= holdThreshold) return 'hold';
  if (value >= cautionThreshold) return 'caution';
  return 'baseline';
}

function signalStatusBadge(status: SignalStatus): { variant: 'success' | 'warning' | 'danger'; label: string } {
  if (status === 'hold') return { variant: 'danger', label: 'At HOLD boundary' };
  if (status === 'caution') return { variant: 'warning', label: 'CAUTION threshold crossed' };
  return { variant: 'success', label: 'Within baseline' };
}

function metricTooltip(metricId: string): string {
  if (metricId === 'psi') {
    return 'PSI (Population Stability Index): measures how far the current patient mix moved from baseline.';
  }
  if (metricId === 'ks') {
    return 'KS (Kolmogorov-Smirnov): measures score-distribution shape shift versus baseline.';
  }
  return 'Alert burden delta: measures operator review-load change versus baseline.';
}

function normalizeAlertDelta(
  baselineAlertBurden: number,
  recentAlertBurden: number,
  reportedDeltaPct: number,
  reportedNote: string | null | undefined
): AlertDeltaNormalization {
  if (baselineAlertBurden > 0) {
    const recomputed = ((recentAlertBurden - baselineAlertBurden) / baselineAlertBurden) * 100;
    if (Math.abs(reportedDeltaPct - recomputed) >= 0.1) {
      return {
        delta: Number(recomputed.toFixed(2)),
        note: `Alert delta recomputed from baseline/recent burden (${baselineAlertBurden.toFixed(2)}% -> ${recentAlertBurden.toFixed(2)}%).`
      };
    }
    if (Math.abs(recomputed) < 0.01 && recentAlertBurden >= 20) {
      return {
        delta: Number(recomputed.toFixed(2)),
        note: `Alert burden is high (${recentAlertBurden.toFixed(2)}%) but stable vs baseline (${baselineAlertBurden.toFixed(2)}%).`
      };
    }
    return {
      delta: Number(recomputed.toFixed(2)),
      note: reportedNote || null
    };
  }

  if (recentAlertBurden > 0) {
    return {
      delta: Number(recentAlertBurden.toFixed(2)),
      note:
        reportedNote ||
        `Baseline alert burden is 0.00%; using absolute recent burden (${recentAlertBurden.toFixed(2)}%) as delta proxy.`
    };
  }

  return {
    delta: 0,
    note: reportedNote || null
  };
}

export default function DriftWorkspacePage() {
  const params = useParams<{ modelId: string }>();
  const searchParams = useSearchParams();
  const eventId = searchParams.get('event_id');

  const driftEndpoint = useMemo(() => {
    const query = new URLSearchParams();
    if (eventId) query.set('event_id', eventId);
    const suffix = query.toString();
    return `/metrics/models/${params.modelId}/drift${suffix ? `?${suffix}` : ''}`;
  }, [eventId, params.modelId]);

  const { data, loading, error, refetch } = useQueryResource<DriftPayload>(() => api.get(driftEndpoint));
  const normalizedAlertDelta = data
    ? normalizeAlertDelta(
        data.signals.baseline_alert_burden,
        data.signals.recent_alert_burden,
        data.signals.alert_delta_pct,
        data.signals.alert_delta_note
      )
    : { delta: 0, note: null };

  const changeProposalHref = useMemo(() => {
    if (!data?.proposal_prefill) return '/changes';
    const triggeredRule =
      data.proposal_prefill.reason_codes.length > 0
        ? `Drift policy trigger: ${data.proposal_prefill.reason_codes.join(', ')}`
        : `Drift policy trigger: ${data.proposal_prefill.recommended_outcome}`;
    const query = new URLSearchParams({
      model_id: data.proposal_prefill.model_id,
      title: data.proposal_prefill.title,
      proposed_threshold: String(data.proposal_prefill.proposed_threshold),
      current_threshold: String(data.model?.default_threshold ?? data.proposal_prefill.proposed_threshold),
      expected_effect: data.proposal_prefill.expected_effect,
      suggested_action: data.next_best_actions[0] || data.proposal_prefill.expected_effect,
      risk_assessment: data.proposal_prefill.risk_assessment,
      triggered_rule: triggeredRule,
      reason_codes: data.proposal_prefill.reason_codes.join(','),
      psi: String(data.signals.psi),
      ks_stat: String(data.signals.ks_stat),
      alert_delta_pct: String(normalizedAlertDelta.delta),
      psi_threshold: String(data.thresholds.psi_threshold),
      psi_hold_threshold: String(data.thresholds.psi_hold_threshold),
      ks_threshold: String(data.thresholds.ks_threshold),
      alert_delta_threshold_pct: String(data.thresholds.alert_delta_threshold_pct),
      source: 'drift_workspace'
    });
    if (eventId) query.set('event_id', eventId);
    if (data.signal_source?.location_unit) query.set('location_unit', data.signal_source.location_unit);
    if (data.signal_source?.care_setting) query.set('care_setting', data.signal_source.care_setting);
    return `/changes?${query.toString()}`;
  }, [data, eventId, normalizedAlertDelta.delta]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading drift workspace...</CardTitle>
          <CardDescription>Calculating patient mix shift, score-shape drift, and alert workload change.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unable to load drift workspace</CardTitle>
          <CardDescription>{error || 'Unknown API error'}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => void refetch()}>Retry</Button>
          <Link href="/control-tower">
            <Button variant="outline">Back to Control Tower</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const psiSignalStatus = signalStatus(
    data.signals.psi,
    data.thresholds.psi_threshold,
    data.thresholds.psi_hold_threshold
  );
  const ksSignalStatus = signalStatus(data.signals.ks_stat, data.thresholds.ks_threshold);
  const alertSignalStatus = signalStatus(normalizedAlertDelta.delta, data.thresholds.alert_delta_threshold_pct);
  const recommendedOutcome = (data.proposal_prefill?.recommended_outcome || 'CAUTION').toUpperCase();
  const holdBoundaryWithCaution =
    data.signals.psi >= data.thresholds.psi_hold_threshold && recommendedOutcome === 'CAUTION';

  const policyLinkage = [
    {
      id: 'psi',
      metric: 'Patient-mix drift pressure (PSI)',
      baseline: 'Baseline expectation: patient mix stays close to historical baseline (PSI near 0.00).',
      current: data.signals.psi.toFixed(3),
      threshold: `CAUTION ${data.thresholds.psi_threshold.toFixed(2)} / HOLD ${data.thresholds.psi_hold_threshold.toFixed(2)}`,
      status: psiSignalStatus,
      action:
        psiSignalStatus === 'hold'
          ? 'Escalate immediately: review incident + policy mapping for possible HOLD behavior.'
          : psiSignalStatus === 'caution'
            ? 'Keep CAUTION controls, investigate cohort shift driver, and prepare proposal if signal persists.'
            : 'No escalation from PSI right now; continue routine monitoring.'
    },
    {
      id: 'ks',
      metric: 'Score-shape drift pressure (KS)',
      baseline: 'Baseline expectation: score distribution shape stays near historical baseline.',
      current: data.signals.ks_stat.toFixed(3),
      threshold: `CAUTION ${data.thresholds.ks_threshold.toFixed(2)}`,
      status: ksSignalStatus,
      action:
        ksSignalStatus === 'caution'
          ? 'Compare baseline vs current score buckets by unit, then validate feature/mapping changes.'
          : 'No KS-driven escalation right now.'
    },
    {
      id: 'alert_delta',
      metric: 'Operator review-load shift (alert burden)',
      baseline: `Baseline review load ${data.signals.baseline_alert_burden.toFixed(2)}%`,
      current: `${data.signals.recent_alert_burden.toFixed(2)}% (${normalizedAlertDelta.delta.toFixed(2)}% change)`,
      threshold: `CAUTION ${data.thresholds.alert_delta_threshold_pct.toFixed(2)}% delta`,
      status: alertSignalStatus,
      action:
        alertSignalStatus === 'caution'
          ? 'Review routing/suppression and tune threshold through governed change proposal.'
          : 'Alert workload remains within policy guardrail.'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Drift Investigation</p>
        <h2 className="text-2xl font-semibold">{data.model?.name || 'Model Drift Workspace'}</h2>
        <p className="prose-limited text-sm text-muted-foreground">
          Baseline vs current triage workspace: what changed, why health moved to yellow/red, and what the next controlled action is.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {data.model ? <Badge variant="outline">{data.model.code}</Badge> : null}
          {data.model ? <HealthChip status={data.model.health} /> : null}
          <OutcomeChip outcome={data.proposal_prefill?.recommended_outcome || 'CAUTION'} />
          <Badge variant="outline">Default threshold: {data.model?.default_threshold ?? '-'}</Badge>
          <Badge variant="outline">
            PSI watch/hold: {data.thresholds.psi_threshold.toFixed(2)} / {data.thresholds.psi_hold_threshold.toFixed(2)}
          </Badge>
          <Badge variant="outline">
            Samples baseline/recent: {data.signals.baseline_samples} / {data.signals.recent_samples}
          </Badge>
          {data.signal_source?.type === 'event_snapshot' ? (
            <Badge variant="warning">Context: case event {data.signal_source.event_id}</Badge>
          ) : (
            <Badge variant="outline">Context: model live window</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={changeProposalHref}>
            <Button>Create Change Proposal</Button>
          </Link>
          <Link href={`/audit?model_id=${params.modelId}`}>
            <Button variant="outline">View audit events</Button>
          </Link>
          <Link href="/policy">
            <Button variant="secondary">Open policy</Button>
          </Link>
        </div>
      </div>

      <Card className="border-primary/25 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Why health is {data.model?.health?.toUpperCase() || 'UNKNOWN'}</CardTitle>
          <CardDescription>
            Health status means the system still runs, but context may have shifted enough to require operator intervention.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{data.health_reason}</p>
          {normalizedAlertDelta.note ? (
            <p className="text-xs text-muted-foreground">Alert delta note: {normalizedAlertDelta.note}</p>
          ) : null}
          {holdBoundaryWithCaution ? (
            <p className="text-xs text-muted-foreground">
              Policy-priority note: PSI reached HOLD boundary, but this policy keeps drift-only escalation at CAUTION
              unless a hard-stop gate fails (DataQuality/IntendedUse).
            </p>
          ) : null}
          {data.signal_source?.type === 'event_snapshot' ? (
            <p className="text-xs text-muted-foreground">
              This investigation is anchored to case event {data.signal_source.event_id} and keeps the same context into Change Proposal.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Decision rule: if PSI/KS/alert burden exceeds policy thresholds, keep CAUTION controls and move to investigation + governed
            change workflow.
          </p>
        </CardContent>
      </Card>

      <section className="metric-grid">
        {policyLinkage.map((row) => {
          const statusBadge = signalStatusBadge(row.status);
          return (
            <Card key={row.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">
                    <Tooltip text={`${metricTooltip(row.id)} ${row.baseline} Threshold: ${row.threshold}.`}>{row.metric}</Tooltip>
                  </CardTitle>
                  <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-semibold">{row.current}</p>
                <p className="text-xs text-muted-foreground">{row.baseline}</p>
                <p className="text-xs text-muted-foreground">Policy threshold: {row.threshold}</p>
                <p className="text-xs text-foreground">Resulting action: {row.action}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Metric change → policy threshold → resulting action</CardTitle>
          <CardDescription>Single-source operator mapping used for investigation and handoff.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {policyLinkage.map((row) => (
            <div key={`policy-${row.id}`} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <p className="font-medium">
                <Tooltip text={metricTooltip(row.id)}>{row.metric}</Tooltip>
              </p>
              <p className="text-xs text-muted-foreground">
                Current: {row.current} | Threshold: {row.threshold}
              </p>
              <p className="text-xs">{row.action}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Score Distribution Trend</CardTitle>
            <CardDescription>Mean and P90 trend by day.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {data.score_distribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.score_distribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTokens.grid} />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="mean" stroke={chartTokens.scoreMean} strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="p90" stroke={chartTokens.scoreP90} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded border border-dashed border-border text-sm text-muted-foreground">
                No score-distribution history yet. Run `Reset demo` and reopen this drift view.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alert Trend</CardTitle>
            <CardDescription>Alerts and rate by day.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {data.alert_trend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.alert_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTokens.grid} />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="alerts" stroke={chartTokens.alerts} strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="rate" stroke={chartTokens.alertRate} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded border border-dashed border-border text-sm text-muted-foreground">
                No alert trend history yet. Re-open from a CAUTION case after `Reset demo`.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Investigation Hypotheses</CardTitle>
            <CardDescription>
              Operational hypotheses to verify first. This means context shift, not &quot;the model is broken.&quot;
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.hypotheses.length > 0 ? (
              data.hypotheses.map((hypothesis, index) => (
                <div key={hypothesis} className="rounded-lg border border-border bg-muted/50 px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground">Hypothesis {index + 1}</p>
                  <p>{hypothesis}</p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No hypotheses generated yet for this model snapshot.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next Best Actions (Runbook)</CardTitle>
            <CardDescription>Deterministic actions from policy rules, ready for operator handoff.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.next_best_actions.length > 0 ? (
              data.next_best_actions.map((action, index) => (
                <div key={action} className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
                  <Badge variant="outline" className="mb-1">
                    Step {index + 1}
                  </Badge>
                  <p>{action}</p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No next-best actions available yet for this drift snapshot.</p>
            )}
            <Separator />
            <p className="text-xs text-muted-foreground">
              Recommendations are rule-based and audit-traceable; same thresholds drive both investigation and action text.
            </p>
            {data.proposal_prefill?.reason_codes?.length ? (
              <p className="text-xs text-muted-foreground">
                Suggested reason codes: {data.proposal_prefill.reason_codes.join(', ')}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
