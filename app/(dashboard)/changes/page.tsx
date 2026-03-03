'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { OutcomeChip, StatusLegend } from '@/components/features/status-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isWriteEnabledDemoRole, writeEnabledDemoRoleLabel } from '@/lib/roles';
import { useQueryResource } from '@/lib/use-query-resource';

const schema = z.object({
  model_id: z.string().min(1, 'Select a model'),
  title: z.string().min(4, 'Title should be at least 4 characters'),
  proposed_threshold: z.coerce.number().min(0).max(1),
  expected_effect: z.string().min(4, 'Expected effect is required'),
  risk_assessment: z.string().min(4, 'Risk assessment is required')
});

type FormValues = z.infer<typeof schema>;

type Model = { id: string; name: string; default_threshold: number };
type Change = {
  id: string;
  title: string;
  model_id: string;
  incident_id: string | null;
  status: string;
  proposed_threshold: number;
  current_threshold: number;
  policy_patch: Record<string, unknown>;
  simulation_result: {
    baseline_alert_burden?: number;
    projected_alert_burden?: number;
    baseline_ppv_proxy?: number;
    projected_ppv_proxy?: number;
    delta_alert_burden_pct?: number;
    delta_ppv_proxy_pct?: number;
    sample_size?: number;
  };
};

type ProposalOutcome = 'ALLOW' | 'CAUTION' | 'ABSTAIN' | 'HOLD';

const transitionTargets = ['Review', 'Approved', 'Canary', 'Released', 'RolledBack'];

function parseReasonCodes(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberFromQuery(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatReasonCode(reasonCode: string): string {
  return reasonCode.replace(/_/g, ' ');
}

function parseProposalOutcome(value: string | null): ProposalOutcome {
  if (!value) return 'CAUTION';
  const normalized = value.trim().toUpperCase();
  if (normalized === 'ALLOW' || normalized === 'CAUTION' || normalized === 'ABSTAIN' || normalized === 'HOLD') {
    return normalized;
  }
  return 'CAUTION';
}

function defaultReasonSummary(outcome: ProposalOutcome): string {
  if (outcome === 'HOLD') return 'hold containment handoff';
  if (outcome === 'ABSTAIN') return 'boundary suppression handoff';
  if (outcome === 'ALLOW') return 'allow monitoring handoff';
  return 'drift caution handoff';
}

function defaultTriggeredRule(outcome: ProposalOutcome, reasonSummary: string): string {
  if (outcome === 'HOLD') return `HOLD hard-stop trigger: ${reasonSummary}`;
  if (outcome === 'ABSTAIN') return `ABSTAIN boundary trigger: ${reasonSummary}`;
  if (outcome === 'ALLOW') return `ALLOW monitoring trigger: ${reasonSummary}`;
  return `CAUTION drift trigger: ${reasonSummary}`;
}

function defaultProposalTitle(outcome: ProposalOutcome, modelName: string): string {
  if (outcome === 'HOLD') return `HOLD containment follow-up: ${modelName}`;
  if (outcome === 'ABSTAIN') return `ABSTAIN boundary follow-up: ${modelName}`;
  if (outcome === 'ALLOW') return `ALLOW monitoring follow-up: ${modelName}`;
  return `CAUTION follow-up: ${modelName}`;
}

function defaultRiskAssessment(outcome: ProposalOutcome): string {
  if (outcome === 'HOLD') {
    return 'Hard-stop containment: do not release changes until source/data mapping is fixed and revalidated.';
  }
  if (outcome === 'ABSTAIN') {
    return 'Boundary containment: keep suppression/manual route until boundary review is approved.';
  }
  return 'Use controlled release: review -> canary -> release, with rollback if alert burden or PPV proxy moves the wrong way.';
}

function defaultSummaryText(outcome: ProposalOutcome): string {
  if (outcome === 'HOLD') return 'HOLD containment proposal is being prepared.';
  if (outcome === 'ABSTAIN') return 'ABSTAIN boundary proposal is being prepared.';
  if (outcome === 'ALLOW') return 'ALLOW monitoring proposal is being prepared.';
  return 'CAUTION follow-up proposal is being prepared.';
}

function defaultContextDescription(outcome: ProposalOutcome): string {
  if (outcome === 'HOLD') return 'Prefilled context keeps HOLD hard-stop evidence attached to this draft.';
  if (outcome === 'ABSTAIN') return 'Prefilled context keeps ABSTAIN boundary evidence attached to this draft.';
  if (outcome === 'ALLOW') return 'Prefilled context keeps ALLOW monitoring context attached to this draft.';
  return 'Prefilled context keeps CAUTION drift investigation attached to this draft.';
}

function formatSignedPercent(value: number): string {
  if (value > 0) return `+${value.toFixed(2)}%`;
  return `${value.toFixed(2)}%`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ChangePageContent() {
  const { user } = useAuth();
  const modelsQuery = useQueryResource<Model[]>(() => api.get('/models'));
  const changesQuery = useQueryResource<Change[]>(() => api.get('/changes'));
  const searchParams = useSearchParams();
  const { pushToast } = useToast();
  const canRunMutatingActions = isWriteEnabledDemoRole(user?.role);
  const writeRoleHelpText = `Write-enabled demo role required (${writeEnabledDemoRoleLabel()}). Current role: ${user?.role || 'Unknown'}.`;

  const [selectedChangeId, setSelectedChangeId] = useState<string>('');
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [message, setMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [prefillApplied, setPrefillApplied] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [transitioningTo, setTransitioningTo] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  const reasonCodes = parseReasonCodes(searchParams.get('reason_codes'));
  const prefillOutcome = parseProposalOutcome(searchParams.get('outcome'));
  const psiValue = searchParams.get('psi');
  const ksValue = searchParams.get('ks_stat');
  const alertDelta = searchParams.get('alert_delta_pct');
  const suggestedAction = searchParams.get('suggested_action');
  const incidentId = searchParams.get('incident_id');
  const eventId = searchParams.get('event_id');
  const deepLinkedChangeId = searchParams.get('change_id');
  const sourceContext = searchParams.get('source');
  const triggeredRule = searchParams.get('triggered_rule');
  const locationUnit = searchParams.get('location_unit');
  const careSetting = searchParams.get('care_setting');
  const currentThresholdFromQuery = numberFromQuery(searchParams.get('current_threshold'));
  const psiThresholdFromQuery = numberFromQuery(searchParams.get('psi_threshold'));
  const psiHoldThresholdFromQuery = numberFromQuery(searchParams.get('psi_hold_threshold'));
  const ksThresholdFromQuery = numberFromQuery(searchParams.get('ks_threshold'));
  const alertDeltaThresholdFromQuery = numberFromQuery(searchParams.get('alert_delta_threshold_pct'));
  const psiFromQuery = numberFromQuery(psiValue);
  const ksFromQuery = numberFromQuery(ksValue);
  const alertDeltaFromQuery = numberFromQuery(alertDelta);

  const reasonSummary =
    reasonCodes.length > 0 ? reasonCodes.map((code) => formatReasonCode(code)).join(', ') : defaultReasonSummary(prefillOutcome);
  const triggeredRuleLabel = triggeredRule || defaultTriggeredRule(prefillOutcome, reasonSummary);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      model_id: '',
      title: 'ED threshold tuning after drift signal',
      proposed_threshold: 0.68,
      expected_effect: 'Reduce alert burden while keeping PPV proxy stable',
      risk_assessment: 'Monitor potential sensitivity drop in canary phase'
    }
  });

  const selectedChange = useMemo(
    () => changesQuery.data?.find((item) => item.id === selectedChangeId) ?? null,
    [changesQuery.data, selectedChangeId]
  );

  useEffect(() => {
    if (!changesQuery.data || changesQuery.data.length === 0) return;
    if (deepLinkedChangeId && changesQuery.data.some((item) => item.id === deepLinkedChangeId)) {
      setSelectedChangeId(deepLinkedChangeId);
      setWizardStep(3);
      return;
    }
    if (!selectedChangeId) {
      setSelectedChangeId(changesQuery.data[0].id);
    }
  }, [changesQuery.data, deepLinkedChangeId, selectedChangeId]);

  useEffect(() => {
    if (prefillApplied || !modelsQuery.data || modelsQuery.data.length === 0) return;

    const modelIdFromQuery = searchParams.get('model_id');
    const targetModel =
      modelsQuery.data.find((item) => item.id === modelIdFromQuery) || modelsQuery.data[0];

    form.setValue('model_id', targetModel.id);

    const titleFromQuery = searchParams.get('title');
    const proposedThresholdFromQuery = searchParams.get('proposed_threshold');
    const expectedEffectFromQuery = searchParams.get('expected_effect');
    const suggestedActionFromQuery = searchParams.get('suggested_action');
    const riskAssessmentFromQuery = searchParams.get('risk_assessment');

    const fallbackTitle = defaultProposalTitle(prefillOutcome, targetModel.name);
    const fallbackExpectedEffect = suggestedActionFromQuery
      ? suggestedActionFromQuery
      : prefillOutcome === 'HOLD'
        ? 'Contain the hard-stop condition: pause use, fix source/data mapping, and revalidate before reuse.'
        : prefillOutcome === 'ABSTAIN'
          ? 'Keep model output suppressed in this context and maintain manual clinical workflow until boundary review closes.'
          : `Reduce alert burden while preserving policy guardrails (PSI ${
          psiFromQuery?.toFixed(3) ?? 'n/a'
        }, KS ${ksFromQuery?.toFixed(3) ?? 'n/a'}, alert delta ${
          alertDeltaFromQuery !== null ? formatSignedPercent(alertDeltaFromQuery) : 'n/a'
        }).`;
    const fallbackRiskAssessment = defaultRiskAssessment(prefillOutcome);

    form.setValue('title', titleFromQuery || fallbackTitle);
    if (proposedThresholdFromQuery) {
      const numeric = Number(proposedThresholdFromQuery);
      if (!Number.isNaN(numeric)) form.setValue('proposed_threshold', numeric);
    } else {
      const suggestedThreshold = Math.min(targetModel.default_threshold + 0.03, 0.95);
      form.setValue('proposed_threshold', suggestedThreshold);
    }
    if (expectedEffectFromQuery) {
      form.setValue('expected_effect', expectedEffectFromQuery);
    } else if (suggestedActionFromQuery) {
      form.setValue('expected_effect', suggestedActionFromQuery);
    } else {
      form.setValue('expected_effect', fallbackExpectedEffect);
    }
    form.setValue('risk_assessment', riskAssessmentFromQuery || fallbackRiskAssessment);

    if (modelIdFromQuery || incidentId || eventId) {
      setWizardStep(1);
      pushToast({
        title: 'Draft context imported',
        description:
          'Model context and rationale were imported into this proposal for a faster mitigation workflow.',
        variant: 'info'
      });
    }

    setPrefillApplied(true);
  }, [
    alertDeltaFromQuery,
    eventId,
    form,
    incidentId,
    ksFromQuery,
    modelsQuery.data,
    prefillOutcome,
    prefillApplied,
    psiFromQuery,
    pushToast,
    searchParams
  ]);

  const loading = (modelsQuery.loading && !modelsQuery.data) || (changesQuery.loading && !changesQuery.data);
  const hardError = (!modelsQuery.data && modelsQuery.error) || (!changesQuery.data && changesQuery.error);
  const watchedModelId = form.watch('model_id');
  const watchedTitle = form.watch('title');
  const watchedProposedThreshold = form.watch('proposed_threshold');
  const watchedExpectedEffect = form.watch('expected_effect');
  const watchedRiskAssessment = form.watch('risk_assessment');
  const selectedModel = useMemo(
    () => modelsQuery.data?.find((item) => item.id === watchedModelId) ?? null,
    [modelsQuery.data, watchedModelId]
  );

  const currentThreshold = currentThresholdFromQuery ?? selectedModel?.default_threshold ?? null;
  const thresholdShift = currentThreshold !== null ? watchedProposedThreshold - currentThreshold : null;
  const hasMetricSnapshot = psiFromQuery !== null || ksFromQuery !== null || alertDeltaFromQuery !== null;

  const summaryText = watchedTitle || defaultSummaryText(prefillOutcome);
  const whyNowText = [
    triggeredRuleLabel,
    hasMetricSnapshot
      ? `Metric snapshot: PSI ${psiFromQuery?.toFixed(3) ?? 'n/a'}, KS ${ksFromQuery?.toFixed(3) ?? 'n/a'}, alert delta ${
          alertDeltaFromQuery !== null ? formatSignedPercent(alertDeltaFromQuery) : 'n/a'
        }.`
      : 'Metric snapshot was not passed from case/drift. Use this draft with current model defaults.',
    `Reason codes: ${reasonSummary}.`
  ];
  const proposedActionText =
    prefillOutcome === 'HOLD'
      ? 'Containment action: keep model use paused, fix hard-stop source issue, and rerun policy validation before release.'
      : prefillOutcome === 'ABSTAIN'
        ? 'Boundary action: keep suppression in this context and route to approved manual workflow until policy review closes.'
        : currentThreshold !== null
          ? `Tune threshold from ${currentThreshold.toFixed(2)} to ${watchedProposedThreshold.toFixed(2)}${
              thresholdShift !== null ? ` (shift ${thresholdShift >= 0 ? '+' : ''}${thresholdShift.toFixed(2)})` : ''
            }.`
          : `Tune threshold to ${watchedProposedThreshold.toFixed(2)} and keep this proposal in controlled release flow.`;
  const expectedImpactText =
    watchedExpectedEffect || 'Expected impact will be documented here before proposal submission.';
  const safetyNotesText =
    watchedRiskAssessment || 'Safety notes pending. Keep canary monitoring and rollback readiness enabled.';
  const reasonWeight = reasonCodes.includes('alert_burden_spike') ? 1.2 : reasonCodes.includes('ks_shift_detected') ? 1.05 : 1;
  const thresholdEffectPct = thresholdShift === null ? 0 : -thresholdShift * 220;
  const pressureEffectPct =
    thresholdShift === null || thresholdShift === 0 || alertDeltaFromQuery === null
      ? 0
      : (thresholdShift > 0 ? -1 : 1) * Math.min(Math.abs(alertDeltaFromQuery) * 0.25 * reasonWeight, 10);
  const estimatedAlertBurdenDeltaPct = clamp(thresholdEffectPct + pressureEffectPct, -60, 60);
  const expectedBurdenDirection =
    estimatedAlertBurdenDeltaPct < -0.5 ? 'down' : estimatedAlertBurdenDeltaPct > 0.5 ? 'up' : 'flat';
  const affectedContextLabel = locationUnit && careSetting ? `${locationUnit} / ${careSetting}` : locationUnit || careSetting || 'model-wide context';
  const signalLinkageSummary =
    psiFromQuery !== null || ksFromQuery !== null || alertDeltaFromQuery !== null
      ? [
          psiFromQuery !== null
            ? `PSI ${psiFromQuery.toFixed(3)}${psiThresholdFromQuery !== null ? ` vs CAUTION ${psiThresholdFromQuery.toFixed(2)}` : ''}${
                psiHoldThresholdFromQuery !== null ? ` / HOLD ${psiHoldThresholdFromQuery.toFixed(2)}` : ''
              }`
            : null,
          ksFromQuery !== null
            ? `KS ${ksFromQuery.toFixed(3)}${ksThresholdFromQuery !== null ? ` vs CAUTION ${ksThresholdFromQuery.toFixed(2)}` : ''}`
            : null,
          alertDeltaFromQuery !== null
            ? `Alert delta ${formatSignedPercent(alertDeltaFromQuery)}${
                alertDeltaThresholdFromQuery !== null ? ` vs CAUTION ${alertDeltaThresholdFromQuery.toFixed(2)}%` : ''
              }`
            : null
        ]
          .filter(Boolean)
          .join(' | ')
      : 'No drift metrics were passed into this draft.';
  const selectedChangeStatus = selectedChange?.status || 'Draft';
  const hasSimulationResult = Boolean(
    selectedChange?.simulation_result && Object.keys(selectedChange.simulation_result).length > 0
  );
  const reviewStepState: 'done' | 'active' | 'pending' =
    selectedChangeStatus === 'Draft'
      ? 'active'
      : ['Review', 'Approved', 'Canary', 'Released', 'RolledBack'].includes(selectedChangeStatus)
        ? 'done'
        : 'pending';
  const previewStepState: 'done' | 'active' | 'pending' = hasSimulationResult
    ? 'done'
    : wizardStep === 2 || selectedChangeStatus === 'Review'
      ? 'active'
      : 'pending';
  const canaryStepState: 'done' | 'active' | 'pending' = ['Canary', 'Released', 'RolledBack'].includes(
    selectedChangeStatus
  )
    ? 'done'
    : selectedChangeStatus === 'Approved'
      ? 'active'
      : 'pending';
  const releaseRollbackStepState: 'done' | 'active' | 'pending' =
    selectedChangeStatus === 'Released' || selectedChangeStatus === 'RolledBack'
      ? 'done'
      : selectedChangeStatus === 'Canary'
        ? 'active'
        : 'pending';
  const nextActionHint = !selectedChange
    ? 'Create Draft to start review workflow.'
    : !hasSimulationResult
      ? 'Run Simulate impact to replace preview with measured projection.'
      : selectedChangeStatus === 'Draft'
        ? 'Move draft to Review and collect reviewer sign-off.'
        : selectedChangeStatus === 'Review'
          ? 'After review, move to Approved then controlled Canary.'
          : selectedChangeStatus === 'Approved'
            ? 'Move to Canary for controlled release monitoring.'
            : selectedChangeStatus === 'Canary'
              ? 'Promote to Released if stable, or use RolledBack if guardrails regress.'
              : selectedChangeStatus === 'Released'
                ? 'Release completed. Keep rollback package available for incident response.'
                : 'Change rolled back. Re-open investigation and prepare next proposal iteration.';

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading Change Proposal workspace...</CardTitle>
          <CardDescription>Fetching models and existing proposals.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (hardError) {
    const forbidden = hardError.includes('Insufficient permissions');
    return (
      <Card>
        <CardHeader>
          <CardTitle>{forbidden ? 'No access to Change Control' : 'Unable to load Change Control'}</CardTitle>
          <CardDescription>{hardError}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button
            onClick={() => {
              void modelsQuery.refetch();
              void changesQuery.refetch();
            }}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Change Proposal</h2>
        <p className="prose-limited text-sm text-muted-foreground">
          Workflow: Draft, Review, Approved, Canary, then Released or Rolled Back.
        </p>
      </div>

      {!canRunMutatingActions ? (
        <Card className="border-amber-300 bg-amber-50/70">
          <CardHeader>
            <CardTitle className="text-base">Read-only session</CardTitle>
            <CardDescription>{writeRoleHelpText}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {(reasonCodes.length > 0 ||
        psiFromQuery !== null ||
        ksFromQuery !== null ||
        alertDeltaFromQuery !== null ||
        incidentId ||
        eventId ||
        suggestedAction ||
        sourceContext ||
        triggeredRule ||
        locationUnit ||
        careSetting) && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">Context Imported</CardTitle>
            <CardDescription>
              {defaultContextDescription(prefillOutcome)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <OutcomeChip outcome={prefillOutcome} />
              {sourceContext ? <Badge variant="outline">Source: {sourceContext.replace(/_/g, ' ')}</Badge> : null}
              {incidentId ? <Badge variant="outline">Incident: {incidentId}</Badge> : null}
              {eventId ? <Badge variant="outline">Event: {eventId}</Badge> : null}
              {locationUnit ? <Badge variant="outline">Unit: {locationUnit}</Badge> : null}
              {careSetting ? <Badge variant="outline">Context: {careSetting}</Badge> : null}
              {psiFromQuery !== null ? <Badge variant="outline">PSI: {psiFromQuery.toFixed(3)}</Badge> : null}
              {ksFromQuery !== null ? <Badge variant="outline">KS: {ksFromQuery.toFixed(3)}</Badge> : null}
              {alertDeltaFromQuery !== null ? (
                <Badge variant="outline">Alert delta: {alertDeltaFromQuery.toFixed(2)}%</Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">Triggered rule: {triggeredRuleLabel}</p>
            <p className="text-xs text-muted-foreground">Reason codes: {reasonSummary}</p>
            {suggestedAction ? (
              <p className="text-xs text-muted-foreground">
                Suggested action from investigation: {suggestedAction}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Suggested action from investigation was not provided; using outcome-aware policy draft template.
              </p>
            )}
            {!hasMetricSnapshot ? (
              <p className="text-xs text-muted-foreground">
                Metric snapshot was not passed from CAUTION/Drift context. Review signals manually before submitting.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              {eventId ? (
                <Link href={`/audit?event_id=${encodeURIComponent(eventId)}`}>
                  <Button size="sm" variant="outline">Open source event</Button>
                </Link>
              ) : null}
              {incidentId ? (
                <Link href="/incidents">
                  <Button size="sm" variant="outline">Open incident queue</Button>
                </Link>
              ) : null}
              {form.getValues('model_id') ? (
                <Link href={`/drift/${encodeURIComponent(form.getValues('model_id'))}${eventId ? `?event_id=${encodeURIComponent(eventId)}` : ''}`}>
                  <Button size="sm" variant="outline">Open drift context</Button>
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Decision Artifact</CardTitle>
          <CardDescription>Structured proposal summary for quality/risk review.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <section className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Summary</p>
            <p>{summaryText}</p>
          </section>
          <section className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Why now</p>
            <div className="space-y-1">
              {whyNowText.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </section>
          <section className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Proposed action</p>
            <p>{proposedActionText}</p>
          </section>
          <section className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Expected impact</p>
            <p>{expectedImpactText}</p>
          </section>
          <section className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Safety notes</p>
            <p>{safetyNotesText}</p>
          </section>
        </CardContent>
      </Card>

      <Card className="border-amber-300/40 bg-amber-50/40">
        <CardHeader>
          <CardTitle className="text-base">Expected impact (preview)</CardTitle>
          <CardDescription>
            Deterministic preview from current drift/context signals. This is not an ML forecast.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">What should improve</p>
            <p className="mt-1">{expectedImpactText}</p>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Alert burden expectation</p>
            <p className="mt-1">
              Expected direction: <span className="font-medium">{expectedBurdenDirection}</span> (
              {formatSignedPercent(estimatedAlertBurdenDeltaPct)} from current baseline)
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Threshold change effect</p>
            <p className="mt-1">
              {currentThreshold !== null
                ? `Current ${currentThreshold.toFixed(2)} -> Proposed ${watchedProposedThreshold.toFixed(2)}${
                    thresholdShift !== null ? ` (shift ${thresholdShift >= 0 ? '+' : ''}${thresholdShift.toFixed(2)})` : ''
                  }`
                : `Proposed threshold ${watchedProposedThreshold.toFixed(2)} (current threshold not provided).`}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Affected unit/context</p>
            <p className="mt-1">{affectedContextLabel}</p>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Signal linkage</p>
            <p className="mt-1">{signalLinkageSummary}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Preview rule: combines threshold shift with current alert-delta pressure to provide a transparent planning estimate.
            </p>
          </div>
        </CardContent>
      </Card>

      <StatusLegend />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review → rollout → rollback path</CardTitle>
          <CardDescription>Demonstrable control flow for quality/risk handoff and safe release.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">1. Review proposal artifact</p>
                <Badge variant={reviewStepState === 'done' ? 'success' : reviewStepState === 'active' ? 'warning' : 'outline'}>
                  {reviewStepState === 'done' ? 'Done' : reviewStepState === 'active' ? 'Now' : 'Pending'}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Verify why-now signals, triggered rule, and safety notes.</p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">2. Validate impact (preview/simulation)</p>
                <Badge
                  variant={previewStepState === 'done' ? 'success' : previewStepState === 'active' ? 'warning' : 'outline'}
                >
                  {previewStepState === 'done' ? 'Done' : previewStepState === 'active' ? 'Now' : 'Pending'}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Use deterministic preview first, then run simulation before release.
              </p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">3. Controlled Canary rollout</p>
                <Badge variant={canaryStepState === 'done' ? 'success' : canaryStepState === 'active' ? 'warning' : 'outline'}>
                  {canaryStepState === 'done' ? 'Done' : canaryStepState === 'active' ? 'Now' : 'Pending'}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Promote to Canary only after review approval and impact validation.
              </p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">4. Release or rollback</p>
                <Badge
                  variant={
                    releaseRollbackStepState === 'done' ? 'success' : releaseRollbackStepState === 'active' ? 'warning' : 'outline'
                  }
                >
                  {releaseRollbackStepState === 'done' ? 'Done' : releaseRollbackStepState === 'active' ? 'Now' : 'Pending'}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                If guardrails regress in Canary, transition to RolledBack and restore previous threshold.
              </p>
            </div>
          </div>
          <p className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-xs">{nextActionHint}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wizard</CardTitle>
          <CardDescription>
            Step {wizardStep}/3: propose, simulate impact, then transition and export package.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {[1, 2, 3].map((step) => (
              <Button
                key={step}
                variant={wizardStep === step ? 'default' : 'outline'}
                size="sm"
                onClick={() => setWizardStep(step)}
              >
                {step === 1 ? 'Propose' : step === 2 ? 'Simulate' : 'Release'}
              </Button>
            ))}
          </div>

          {wizardStep === 1 ? (
            <form
              className="grid gap-3 md:grid-cols-2"
              onSubmit={form.handleSubmit(async (values) => {
                if (!canRunMutatingActions) {
                  setErrorMessage(writeRoleHelpText);
                  pushToast({
                    title: 'Read-only session',
                    description: writeRoleHelpText,
                    variant: 'info'
                  });
                  return;
                }
                setMessage('');
                setErrorMessage('');
                setIsCreating(true);
                try {
                  const lineageContext = {
                    source: sourceContext || 'change_workspace',
                    source_event_id: eventId || null,
                    source_incident_id: incidentId || null,
                    triggered_rule: triggeredRuleLabel,
                    reason_codes: reasonCodes,
                    location_unit: locationUnit || null,
                    care_setting: careSetting || null
                  };
                  const change = await api.post<Change>('/changes', {
                    model_id: values.model_id,
                    incident_id: incidentId || null,
                    title: values.title,
                    proposed_threshold: values.proposed_threshold,
                    expected_effect: values.expected_effect,
                    risk_assessment: values.risk_assessment,
                    description: values.title,
                    policy_patch: {
                      lineage: lineageContext
                    }
                  });

                  setSelectedChangeId(change.id);
                  await changesQuery.refetch();
                  setMessage('Change proposal created. Continue to simulation step.');
                  setWizardStep(2);
                  pushToast({
                    title: 'Draft created',
                    description: 'Change proposal draft is ready for simulation.',
                    variant: 'success'
                  });
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'Failed to create draft';
                  setErrorMessage(message);
                  pushToast({ title: 'Create failed', description: message, variant: 'error' });
                } finally {
                  setIsCreating(false);
                }
              })}
            >
              <div className="space-y-1.5">
                <Label htmlFor="change-model">Model</Label>
                <Select id="change-model" {...form.register('model_id')}>
                  <option value="">Select model...</option>
                  {modelsQuery.data?.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="change-threshold">Proposed threshold</Label>
                <Input id="change-threshold" type="number" step="0.01" {...form.register('proposed_threshold')} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="change-title">Title</Label>
                <Input id="change-title" {...form.register('title')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="change-expected">Expected effect</Label>
                <Textarea id="change-expected" {...form.register('expected_effect')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="change-risk">Risk assessment</Label>
                <Textarea id="change-risk" {...form.register('risk_assessment')} />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={isCreating || !canRunMutatingActions}>
                  {isCreating ? 'Creating Draft...' : 'Create Draft'}
                </Button>
              </div>
            </form>
          ) : null}

          {wizardStep === 2 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="simulate-change">Change proposal</Label>
                <Select
                  id="simulate-change"
                  value={selectedChangeId}
                  onChange={(e) => setSelectedChangeId(e.target.value)}
                  className="max-w-[420px]"
                >
                  <option value="">Select proposal...</option>
                  {changesQuery.data?.map((change) => (
                    <option key={change.id} value={change.id}>
                      {change.title}
                    </option>
                  ))}
                </Select>
                <Button
                  disabled={!selectedChangeId || isSimulating || !canRunMutatingActions}
                  onClick={async () => {
                    if (!selectedChangeId) return;
                    if (!canRunMutatingActions) {
                      setErrorMessage(writeRoleHelpText);
                      pushToast({
                        title: 'Read-only session',
                        description: writeRoleHelpText,
                        variant: 'info'
                      });
                      return;
                    }
                    setMessage('');
                    setErrorMessage('');
                    setIsSimulating(true);
                    try {
                      await api.post(`/changes/${selectedChangeId}/simulate`);
                      await changesQuery.refetch();
                      setMessage('Simulation complete.');
                      pushToast({
                        title: 'Simulation complete',
                        description: 'Projected impact has been recalculated.',
                        variant: 'success'
                      });
                    } catch (error) {
                      const message = error instanceof Error ? error.message : 'Simulation failed';
                      setErrorMessage(message);
                      pushToast({ title: 'Simulation failed', description: message, variant: 'error' });
                    } finally {
                      setIsSimulating(false);
                    }
                  }}
                >
                  {isSimulating ? 'Simulating...' : 'Simulate impact'}
                </Button>
              </div>

              {!selectedChange ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-sm">
                  <p className="font-medium text-amber-900">No proposal selected for simulation.</p>
                  <p className="mt-1 text-amber-900/90">
                    Create or select a draft first, then run simulation to replace preview estimates.
                  </p>
                  <div className="mt-2">
                    <Button size="sm" variant="outline" onClick={() => setWizardStep(1)}>
                      Go to Propose step
                    </Button>
                  </div>
                </div>
              ) : selectedChange.simulation_result ? (
                <div className="grid gap-2 md:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Alert burden</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl font-semibold">
                        {selectedChange.simulation_result.baseline_alert_burden}% to{' '}
                        {selectedChange.simulation_result.projected_alert_burden}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Delta {selectedChange.simulation_result.delta_alert_burden_pct}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">PPV proxy</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl font-semibold">
                        {selectedChange.simulation_result.baseline_ppv_proxy} to{' '}
                        {selectedChange.simulation_result.projected_ppv_proxy}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Delta {selectedChange.simulation_result.delta_ppv_proxy_pct}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Sample size</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl font-semibold">{selectedChange.simulation_result.sample_size}</p>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Run simulation to replace preview estimates with measured projections from current demo events.
                </p>
              )}
            </div>
          ) : null}

          {wizardStep === 3 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="release-change">Change proposal</Label>
                <Select
                  id="release-change"
                  value={selectedChangeId}
                  onChange={(e) => setSelectedChangeId(e.target.value)}
                  className="max-w-[420px]"
                >
                  <option value="">Select proposal...</option>
                  {changesQuery.data?.map((change) => (
                    <option key={change.id} value={change.id}>
                      {change.title}
                    </option>
                  ))}
                </Select>
              </div>

              {selectedChange ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{selectedChange.title}</CardTitle>
                    <CardDescription>
                      Current status: <Badge variant="outline">{selectedChange.status}</Badge>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {transitionTargets.map((status) => (
                        <Button
                          key={status}
                          variant="outline"
                          disabled={transitioningTo.length > 0 || !canRunMutatingActions}
                          onClick={async () => {
                            if (!canRunMutatingActions) {
                              setErrorMessage(writeRoleHelpText);
                              pushToast({
                                title: 'Read-only session',
                                description: writeRoleHelpText,
                                variant: 'info'
                              });
                              return;
                            }
                            setMessage('');
                            setErrorMessage('');
                            setTransitioningTo(status);
                            try {
                              await api.post(`/changes/${selectedChange.id}/transition`, {
                                to_status: status,
                                note: `Moved to ${status} from UI wizard`
                              });
                              await changesQuery.refetch();
                              setMessage(`Transitioned to ${status}.`);
                              pushToast({ title: 'Status updated', description: `Moved to ${status}.`, variant: 'success' });
                            } catch (error) {
                              const message = error instanceof Error ? error.message : 'Transition failed';
                              setErrorMessage(message);
                              pushToast({ title: 'Transition failed', description: message, variant: 'error' });
                            } finally {
                              setTransitioningTo('');
                            }
                          }}
                        >
                          {transitioningTo === status ? `Moving to ${status}...` : `Move to ${status}`}
                        </Button>
                      ))}
                    </div>
                    <Button
                      disabled={isExporting}
                      onClick={async () => {
                        setIsExporting(true);
                        setErrorMessage('');
                        try {
                          const pkg = await api.get(`/changes/${selectedChange.id}/package`);
                          const text = JSON.stringify(pkg, null, 2);
                          await navigator.clipboard.writeText(text);

                          const blob = new Blob([text], { type: 'application/json' });
                          const objectUrl = URL.createObjectURL(blob);
                          const anchor = document.createElement('a');
                          anchor.href = objectUrl;
                          anchor.download = `change-package-${selectedChange.id}.json`;
                          document.body.appendChild(anchor);
                          anchor.click();
                          document.body.removeChild(anchor);
                          URL.revokeObjectURL(objectUrl);

                          setMessage('Change package copied and downloaded.');
                          pushToast({
                            title: 'Package exported',
                            description: 'JSON package copied to clipboard and downloaded.',
                            variant: 'success'
                          });
                        } catch (error) {
                          const message = error instanceof Error ? error.message : 'Export failed';
                          setErrorMessage(message);
                          pushToast({ title: 'Export failed', description: message, variant: 'error' });
                        } finally {
                          setIsExporting(false);
                        }
                      }}
                    >
                      {isExporting ? 'Exporting...' : 'Export Change Package'}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-sm">
                  <p className="font-medium text-amber-900">No proposal selected for release workflow.</p>
                  <p className="mt-1 text-amber-900/90">
                    Select a proposal above or create a draft before moving through review/canary/release transitions.
                  </p>
                  <div className="mt-2">
                    <Button size="sm" variant="outline" onClick={() => setWizardStep(1)}>
                      Create draft
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          {errorMessage ? <p className="text-sm text-rose-700">{errorMessage}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Proposals</CardTitle>
          <CardDescription>Governed history of threshold/policy tuning requests.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {changesQuery.data?.length ? (
            changesQuery.data.map((change) => (
              <div key={change.id} className="rounded-lg border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{change.title}</p>
                  <Badge variant="outline">{change.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Threshold {change.current_threshold} to {change.proposed_threshold}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3">
              <p className="text-sm text-amber-900">No proposals yet.</p>
              <p className="mt-1 text-xs text-amber-900/90">
                Start in `Propose` to create the first draft, then return here for governed history.
              </p>
              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={() => setWizardStep(1)}>
                  Open Propose step
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ChangePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading change workspace...</p>}>
      <ChangePageContent />
    </Suspense>
  );
}
