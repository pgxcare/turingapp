'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { OutcomeChip } from '@/components/features/status-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { API_BASE } from '@/lib/api';
import { emitEpicConnectionChanged, EPIC_STORAGE_KEYS } from '@/lib/epic-connection';
import {
  clearSmartTokenSession,
  loadSmartTokenSession,
  SmartTokenSession,
  smartTokenLooksExpired,
} from '@/lib/smart-session';

type Observation = {
  id?: string | null;
  code?: string | null;
  value?: number | string | null;
  unit?: string | null;
  time?: string | null;
};

type PatientSummaryResponse = {
  patient: {
    id: string;
    age: number | null;
    sex: string | null;
  };
  encounter: {
    id: string;
    class: string | null;
    unit_name: string | null;
    care_setting: string | null;
  } | null;
  observations: Record<string, Observation | null>;
  missing_fields: string[];
};

type ShadowScoreResponse = {
  event_id: string;
  model_id: string;
  model_code: string;
  score_value: number;
  threshold_applied: number;
  alert_fired: boolean;
  outcome: 'ALLOW' | 'CAUTION' | 'ABSTAIN' | 'HOLD' | null;
  reason_codes: string[];
  incident_id: string | null;
  missing_fields: string[];
  source: string;
};

type CohortConfigResponse = {
  baseline_patient_ids: string[];
  recent_patient_ids: string[];
  unit_name: string;
  care_setting: string;
  model_code: string;
  source_file: string;
};

type CohortRunResponse = {
  cohort: 'baseline' | 'recent';
  ingested: number;
  failed: number;
  event_ids: string[];
  failures: Array<{ patient_id: string; error: string }>;
};

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { detail?: string };
  return body.detail || `Request failed: ${response.status}`;
}

const PATIENT_WORKFLOW_STEPS = [
  'Confirm launch context (patient + encounter)',
  'Load read-only patient summary from Epic FHIR',
  'Run Shadow AI scoring',
  'Open Control Tower case or Audit evidence',
] as const;

type ReadinessState = 'done' | 'pending' | 'blocked';

type ObservationRow = {
  key: string;
  label: string;
  fhirCode: string;
};

const OBSERVATION_ROWS: ObservationRow[] = [
  { key: 'temperature', label: 'Body temperature', fhirCode: 'LOINC 8310-5' },
  { key: 'lactate', label: 'Lactate', fhirCode: 'LOINC 2524-7' },
  { key: 'systolic_bp', label: 'Systolic blood pressure', fhirCode: 'LOINC 8480-6' },
  { key: 'resp_rate', label: 'Respiratory rate', fhirCode: 'LOINC 9279-1' },
  { key: 'heart_rate', label: 'Heart rate', fhirCode: 'LOINC 8867-4' },
];

function summaryErrorHint(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('scope')) {
    return 'Token is missing patient read scopes. Relaunch SMART from Epic and approve access.';
  }
  if (lower.includes('expired') || lower.includes('401') || lower.includes('authorization')) {
    return 'SMART token may be expired. Relaunch from Epic Launchpad and retry.';
  }
  return 'Retry summary fetch. If it keeps failing, relaunch SMART from onboarding.';
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function readinessBadgeVariant(state: ReadinessState): 'success' | 'warning' | 'danger' {
  if (state === 'done') return 'success';
  if (state === 'blocked') return 'danger';
  return 'warning';
}

function readinessText(state: ReadinessState): string {
  if (state === 'done') return 'Ready';
  if (state === 'blocked') return 'Blocked';
  return 'Pending';
}

function applyConnectedState(modelCode: string) {
  if (typeof window === 'undefined') return;
  const now = new Date().toISOString();
  const target = modelCode === 'epic_deterioration_index' ? 'epic_deterioration_index' : 'epic_sepsis_bpa';

  window.localStorage.setItem(EPIC_STORAGE_KEYS.connected, '1');
  window.localStorage.setItem(EPIC_STORAGE_KEYS.lastSync, now);
  window.localStorage.setItem(EPIC_STORAGE_KEYS.analysisStarted, '1');
  window.localStorage.setItem(
    EPIC_STORAGE_KEYS.scope,
    JSON.stringify({
      target,
      unit: 'all',
      window: '7d',
    })
  );
  emitEpicConnectionChanged();
}

export default function SmartPatientPage() {
  const { pushToast } = useToast();
  const [session, setSession] = useState<SmartTokenSession | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summary, setSummary] = useState<PatientSummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState('');
  const [summaryReloadKey, setSummaryReloadKey] = useState(0);

  const [modelCode, setModelCode] = useState<'epic_sepsis_bpa' | 'epic_deterioration_index'>('epic_sepsis_bpa');
  const [runningShadow, setRunningShadow] = useState(false);
  const [shadowResult, setShadowResult] = useState<ShadowScoreResponse | null>(null);

  const [cohortConfig, setCohortConfig] = useState<CohortConfigResponse | null>(null);
  const [cohortConfigError, setCohortConfigError] = useState('');
  const [runningCohort, setRunningCohort] = useState<'baseline' | 'recent' | null>(null);
  const [lastCohortResult, setLastCohortResult] = useState<CohortRunResponse | null>(null);

  useEffect(() => {
    const current = loadSmartTokenSession();
    if (!current) {
      setSessionError('No SMART token found. Launch from Epic SMART Launchpad first.');
      setLoadingSummary(false);
      return;
    }
    if (smartTokenLooksExpired(current)) {
      setSessionError('SMART token appears expired. Relaunch from Epic SMART Launchpad.');
      setLoadingSummary(false);
      return;
    }
    if (!current.patient) {
      setSessionError('SMART token did not include patient context. Ensure `launch` and patient scopes are granted.');
      setLoadingSummary(false);
      return;
    }

    setSession(current);
  }, []);

  useEffect(() => {
    if (!session) return;
    const currentSession = session;

    let cancelled = false;
    async function fetchPatientSummary() {
      setLoadingSummary(true);
      setSummaryError('');

      const params = new URLSearchParams({
        iss: currentSession.iss,
        patient_id: currentSession.patient || '',
      });
      if (currentSession.encounter) {
        params.set('encounter_id', currentSession.encounter);
      }

      try {
        const response = await fetch(`${API_BASE}/integrations/epic/fhir/patient-summary?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${currentSession.accessToken}`,
          },
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(await parseError(response));
        }

        const payload = (await response.json()) as PatientSummaryResponse;
        if (!cancelled) {
          setSummary(payload);
        }
      } catch (err) {
        if (cancelled) return;
        setSummaryError(err instanceof Error ? err.message : 'Failed to load patient summary.');
      } finally {
        if (!cancelled) {
          setLoadingSummary(false);
        }
      }
    }

    async function fetchCohortConfig() {
      try {
        const response = await fetch(`${API_BASE}/integrations/epic/cohort-config`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(await parseError(response));
        }
        const payload = (await response.json()) as CohortConfigResponse;
        if (!cancelled) {
          setCohortConfig(payload);
          if (payload.model_code === 'epic_sepsis_bpa' || payload.model_code === 'epic_deterioration_index') {
            setModelCode(payload.model_code);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setCohortConfigError(err instanceof Error ? err.message : 'Failed to load cohort config.');
        }
      }
    }

    void fetchPatientSummary();
    void fetchCohortConfig();

    return () => {
      cancelled = true;
    };
  }, [session, summaryReloadKey]);

  async function handleRunShadow() {
    if (!session) {
      setSessionError('SMART session is missing.');
      return;
    }
    if (!session.patient) {
      setSessionError('SMART session does not include patient id.');
      return;
    }

    setRunningShadow(true);
    try {
      const response = await fetch(`${API_BASE}/integrations/epic/shadow-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          iss: session.iss,
          access_token: session.accessToken,
          model_code: modelCode,
          mode: 'single_patient',
          patient_id: session.patient,
          encounter_id: summary?.encounter?.id || session.encounter || null,
        }),
      });
      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      const payload = (await response.json()) as ShadowScoreResponse;
      setShadowResult(payload);
      applyConnectedState(modelCode);

      pushToast({
        title: 'Run Shadow AI complete',
        description: '1 case sent to Trust Tower',
        variant: 'success',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Shadow score run failed.';
      pushToast({
        title: 'Run Shadow AI failed',
        description: message,
        variant: 'error',
      });
    } finally {
      setRunningShadow(false);
    }
  }

  async function handleRunCohort(cohort: 'baseline' | 'recent') {
    if (!session) {
      setSessionError('SMART session is missing.');
      return;
    }

    const patientIds =
      cohort === 'baseline'
        ? cohortConfig?.baseline_patient_ids || []
        : cohortConfig?.recent_patient_ids || [];

    setRunningCohort(cohort);
    try {
      const response = await fetch(`${API_BASE}/integrations/epic/run-cohort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          iss: session.iss,
          access_token: session.accessToken,
          model_code: modelCode,
          cohort,
          patient_ids: patientIds,
          unit_name: cohortConfig?.unit_name || 'ED-North',
          care_setting: cohortConfig?.care_setting || 'ED',
        }),
      });
      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      const payload = (await response.json()) as CohortRunResponse;
      setLastCohortResult(payload);
      applyConnectedState(modelCode);

      pushToast({
        title: `${cohort === 'baseline' ? 'Baseline' : 'Recent'} cohort run complete`,
        description: `${payload.ingested} case${payload.ingested === 1 ? '' : 's'} sent to Trust Tower`,
        variant: 'success',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Cohort run failed.';
      pushToast({
        title: 'Cohort run failed',
        description: message,
        variant: 'error',
      });
    } finally {
      setRunningCohort(null);
    }
  }

  const observationRows = summary ? OBSERVATION_ROWS : [];

  const quickLaunchStatus = sessionError
    ? 'Session required'
    : loadingSummary
      ? 'Loading patient context'
      : summaryError
        ? 'Retry required'
        : summary
          ? 'Ready for scoring'
          : 'Waiting for summary';

  const readinessChecks: Array<{ id: string; label: string; state: ReadinessState; detail: string }> = [
    {
      id: 'session',
      label: 'SMART session',
      state: sessionError ? 'blocked' : session ? 'done' : 'pending',
      detail: sessionError || (session ? 'Token and launch context available.' : 'Waiting for callback token.')
    },
    {
      id: 'patient-context',
      label: 'Patient context',
      state: sessionError ? 'blocked' : summary ? 'done' : loadingSummary ? 'pending' : 'blocked',
      detail: summary
        ? `Patient ${summary.patient.id} in ${summary.encounter?.unit_name || 'unknown unit'}.`
        : summaryError || 'Waiting for patient summary from Epic FHIR.'
    },
    {
      id: 'scoring',
      label: 'Scoring readiness',
      state: sessionError || summaryError ? 'blocked' : summary ? 'done' : 'pending',
      detail:
        sessionError || summaryError
          ? 'Resolve launch or summary issue, then retry.'
          : summary
            ? 'Shadow AI can run now.'
            : 'Run Shadow AI unlocks after patient summary loads.'
    }
  ];
  const shadowRunBlockedReason = !session
    ? 'SMART session is required before scoring.'
    : loadingSummary
      ? 'Wait for patient summary to finish loading.'
      : summaryError
        ? 'Resolve patient summary error before running Shadow AI.'
        : !summary
          ? 'Patient summary must be available before scoring.'
          : null;
  const canRunShadow = !shadowRunBlockedReason;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <h2 className="text-2xl font-semibold">Epic SMART Patient Workspace</h2>
        <p className="text-sm text-muted-foreground">
          Live sandbox mode: fetch patient data from Epic FHIR, run Shadow AI, and send evidence-first cases to Trust Tower.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Launch in under 60 seconds</CardTitle>
          <CardDescription>Follow the checklist and run scoring as soon as patient context is ready.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant="outline">Status: {quickLaunchStatus}</Badge>
          <div className="grid gap-2 md:grid-cols-3">
            {readinessChecks.map((check) => (
              <div key={check.id} className="rounded-md border border-border bg-background/70 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">{check.label}</p>
                  <Badge variant={readinessBadgeVariant(check.state)}>{readinessText(check.state)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{check.detail}</p>
              </div>
            ))}
          </div>
          <ol className="space-y-2 text-xs text-muted-foreground">
            {PATIENT_WORKFLOW_STEPS.map((step, index) => (
              <li key={step} className="rounded-md border border-border bg-background/70 px-3 py-2">
                <span className="font-medium text-foreground">Step {index + 1}:</span> {step}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {sessionError ? (
        <Card>
          <CardHeader>
            <CardTitle>SMART session required</CardTitle>
            <CardDescription>{sessionError}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link href="/">
              <Button variant="outline">Open Epic Onboarding</Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => {
                clearSmartTokenSession();
                setSession(null);
                setSummary(null);
                setShadowResult(null);
                setSessionError('SMART session cleared. Relaunch from Epic Launchpad.');
              }}
            >
              Clear SMART session
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {session ? (
        <Card>
          <CardHeader>
            <CardTitle>Launch Context</CardTitle>
            <CardDescription>Token and patient context from Epic SMART callback.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">ISS: {session.iss}</Badge>
            <Badge variant="outline">Patient: {session.patient || '-'}</Badge>
            <Badge variant="outline">Encounter: {session.encounter || '-'}</Badge>
            <Badge variant="outline">Scope: {session.scope || '-'}</Badge>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Patient Summary</CardTitle>
          <CardDescription>Read-only FHIR snapshot used by Shadow AI scoring.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingSummary ? <p className="text-sm text-muted-foreground">Loading patient summary...</p> : null}
          {summaryError ? (
            <div className="space-y-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <p>{summaryError}</p>
              <p className="text-xs">{summaryErrorHint(summaryError)}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSummaryError('');
                    setSummaryReloadKey((current) => current + 1);
                  }}
                >
                  Retry patient summary
                </Button>
                <Link href="/">
                  <Button variant="outline" size="sm">
                    Back to Epic Onboarding
                  </Button>
                </Link>
              </div>
            </div>
          ) : null}

          {summary ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-background/70 p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Patient</p>
                  <p className="mt-1 text-sm">ID: {summary.patient.id || '-'}</p>
                  <p className="text-sm">Age: {summary.patient.age ?? '-'}</p>
                  <p className="text-sm">Sex: {summary.patient.sex || '-'}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/70 p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Encounter</p>
                  <p className="mt-1 text-sm">ID: {summary.encounter?.id || session?.encounter || '-'}</p>
                  <p className="text-sm">Class: {summary.encounter?.class || '-'}</p>
                  <p className="text-sm">
                    Unit / care setting: {summary.encounter?.unit_name || '-'} / {summary.encounter?.care_setting || '-'}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                Context snapshot: read-only FHIR context loaded for patient{' '}
                <span className="font-medium text-foreground">{summary.patient.id || '-'}</span>. Use this snapshot to
                run Shadow AI and route the resulting case to Control Tower or Audit.
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {observationRows.map((row) => {
                    const obs = summary.observations[row.key];
                    return (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">
                          <p>{row.label}</p>
                          <p className="text-xs font-normal text-muted-foreground">{row.fhirCode}</p>
                        </TableCell>
                        <TableCell>{renderValue(obs?.value)}</TableCell>
                        <TableCell>{renderValue(obs?.unit)}</TableCell>
                        <TableCell>{obs?.time ? new Date(obs.time).toLocaleString() : '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {summary.missing_fields.length > 0 ? (
                <p className="text-xs text-amber-700">Missing fields: {summary.missing_fields.join(', ')}</p>
              ) : (
                <p className="text-xs text-muted-foreground">All requested observation fields were available.</p>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Run Shadow AI</CardTitle>
          <CardDescription>Score this patient and ingest to Trust Tower with attached FHIR evidence.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[280px_1fr] md:items-end">
            <div>
              <label htmlFor="smart-model" className="text-sm font-medium">
                Model
              </label>
              <Select
                id="smart-model"
                value={modelCode}
                disabled={runningShadow}
                onChange={(event) => setModelCode(event.target.value as typeof modelCode)}
                className="mt-1"
              >
                <option value="epic_sepsis_bpa">Epic Sepsis BPA</option>
                <option value="epic_deterioration_index">Epic Deterioration Index</option>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleRunShadow()} disabled={runningShadow || !canRunShadow}>
                {runningShadow ? 'Running Shadow AI...' : 'Run Shadow AI'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  clearSmartTokenSession();
                  setSession(null);
                  setSummary(null);
                  setShadowResult(null);
                  setSessionError('SMART session cleared. Relaunch from Epic Launchpad.');
                }}
              >
                Clear SMART session
              </Button>
            </div>
          </div>
          {shadowRunBlockedReason ? (
            <p className="text-xs text-amber-700">{shadowRunBlockedReason}</p>
          ) : null}

          {shadowResult ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {shadowResult.outcome ? <OutcomeChip outcome={shadowResult.outcome} /> : null}
                <Badge variant="outline">Event: {shadowResult.event_id}</Badge>
                <Badge variant="outline">Score: {shadowResult.score_value.toFixed(3)}</Badge>
                <Badge variant="outline">Threshold: {shadowResult.threshold_applied.toFixed(2)}</Badge>
                <Badge variant="outline">Alert fired: {shadowResult.alert_fired ? 'yes' : 'no'}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Reason codes: {shadowResult.reason_codes.length ? shadowResult.reason_codes.join(', ') : 'none'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link href={`/control-tower?case=${shadowResult.event_id}`}>
                  <Button size="sm">Open case in Control Tower</Button>
                </Link>
                <Link href={`/audit?event_id=${encodeURIComponent(shadowResult.event_id)}`}>
                  <Button size="sm" variant="outline">
                    Open in Audit Vault
                  </Button>
                </Link>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <details className="rounded-lg border border-border bg-card/80 p-3">
        <summary className="cursor-pointer text-sm font-medium">Cohort backfill (optional)</summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Use this to generate baseline vs recent drift signals (PSI / KS / alert burden).
          </p>
          {cohortConfigError ? <p className="text-xs text-rose-700">{cohortConfigError}</p> : null}
          {cohortConfig ? (
            <p className="text-xs text-muted-foreground">
              Baseline IDs: {cohortConfig.baseline_patient_ids.length} | Recent IDs: {cohortConfig.recent_patient_ids.length} |
              Unit: {cohortConfig.unit_name} | Care setting: {cohortConfig.care_setting}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={runningCohort !== null || !session}
              onClick={() => void handleRunCohort('baseline')}
            >
              {runningCohort === 'baseline' ? 'Running baseline cohort...' : 'Run baseline cohort'}
            </Button>
            <Button
              variant="outline"
              disabled={runningCohort !== null || !session}
              onClick={() => void handleRunCohort('recent')}
            >
              {runningCohort === 'recent' ? 'Running recent cohort...' : 'Run recent cohort'}
            </Button>
          </div>

          {lastCohortResult ? (
            <div className="rounded border border-border bg-background/70 p-2 text-xs">
              <p>
                Last run: {lastCohortResult.cohort} | ingested {lastCohortResult.ingested} | failed {lastCohortResult.failed}
              </p>
              {lastCohortResult.failed > 0 ? (
                <p className="text-amber-700">
                  Failed patient IDs:{' '}
                  {lastCohortResult.failures.map((item) => item.patient_id).join(', ')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
