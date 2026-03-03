'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarClock, Filter, Loader2, Search, X } from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { EhrConnectionBanner } from '@/components/features/ehr-connection-banner';
import { MetricCard } from '@/components/features/metric-card';
import { GateChip, HealthChip, OutcomeChip, SourceChip, StatusLegend } from '@/components/features/status-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select } from '@/components/ui/select';
import { SideDrawer } from '@/components/ui/side-drawer';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { EPIC_CONNECTION_CHANGE_EVENT } from '@/lib/epic-connection';
import { isWriteEnabledDemoRole, writeEnabledDemoRoleLabel } from '@/lib/roles';
import { useQueryResource } from '@/lib/use-query-resource';
import { cn } from '@/lib/utils';
import { AuditCase, AuditCaseListPayload, ControlTowerPayload, DemoResetPayload, DemoSource } from '@/types/api';

type CaseFilters = {
  q: string;
  model_id: string;
  source: DemoSource;
  outcome: 'non_allow' | 'ALLOW' | 'CAUTION' | 'ABSTAIN' | 'HOLD';
  reason_code: string;
  start_time: string;
  end_time: string;
};

type TimePreset = 'any' | '24h' | '7d' | '30d' | '90d' | 'custom';

type ModelDefinition = {
  id: string;
  code: string;
  name: string;
};

type InspectionTarget = 'all' | 'epic_sepsis_bpa' | 'epic_deterioration_index';

type PatientSummaryObservationEvidence = {
  metric: string;
  observation_id: string | null;
  code: string | null;
  value: string | number | null;
  unit: string | null;
  observed_at: string | null;
  source: string | null;
};

type PatientSummaryEvidence = {
  captured_at: string | null;
  fhir_iss: string | null;
  encounter: {
    id: string | null;
    class: string | null;
    unit_name: string | null;
    care_setting: string | null;
  } | null;
  observations: PatientSummaryObservationEvidence[];
  missing_fields: string[];
};

type EventDetailPayload = {
  event_context: {
    event_id: string;
    event_type?: string | null;
    event_time?: string | null;
    model_id: string;
    source?: DemoSource | null;
    encounter_id: string;
    patient_id_hash?: string | null;
    location_unit: string;
    care_setting: string;
    config_version?: string | null;
    threshold_applied?: number | null;
    score_value?: number | null;
    age?: number | null;
    patient_summary?: PatientSummaryEvidence | null;
  };
  decision_context?: {
    decision_id?: string;
    decision_time?: string;
    policy_id?: string | null;
    policy_name?: string | null;
    policy_version?: string | null;
  } | null;
  gates: Array<{
    gate_name: string;
    status: string;
    reason_codes: string[];
    explanation: string;
    evidence: Record<string, unknown>;
  }>;
  policy_decision: {
    outcome: 'ALLOW' | 'CAUTION' | 'ABSTAIN' | 'HOLD';
    reason_codes: string[];
    explanation: string;
    evidence: Record<string, unknown>;
  } | null;
  incidents: Array<{
    id: string;
    trigger_event_id?: string | null;
    status: string;
    title: string;
    severity: string;
    owner_role?: string | null;
    rca_notes?: string | null;
    created_at?: string;
    updated_at?: string;
  }>;
  raw_payload?: Record<string, unknown>;
};

type PolicyDefinition = {
  id: string;
  name: string;
  version: number;
  intended_use_config?: {
    min_age?: number;
    max_age?: number;
    allowed_units?: string[];
    allowed_care_settings?: string[];
  };
};

type IntendedUseBoundary = {
  minAge: number | null;
  maxAge: number | null;
  allowedUnits: string[];
  allowedCareSettings: string[];
};

type ChangeProposalSummary = {
  id: string;
  model_id: string;
  incident_id: string | null;
  title: string;
  status: string;
  policy_patch: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type PolicyOutcome = 'ALLOW' | 'CAUTION' | 'ABSTAIN' | 'HOLD';

const INCIDENT_STATUS_OPTIONS = ['Open', 'Investigating', 'Resolved'] as const;
type IncidentStatusOption = (typeof INCIDENT_STATUS_OPTIONS)[number];

const PAGE_SIZE = 10;
const DEFAULT_FILTERS: CaseFilters = {
  q: '',
  model_id: '',
  source: 'epic_sandbox',
  outcome: 'non_allow',
  reason_code: '',
  start_time: '',
  end_time: ''
};

const PRESETS: Array<{ value: string; label: string; filters: CaseFilters }> = [
  {
    value: 'unit-hold',
    label: 'unit mismatch: HOLD',
    filters: {
      ...DEFAULT_FILTERS,
      source: 'seeded_demo',
      q: 'ENC-S-HOLD-001',
      outcome: 'HOLD',
      reason_code: 'unit_mismatch'
    }
  },
  {
    value: 'peds-abstain',
    label: 'pediatric OOD: ABSTAIN',
    filters: {
      ...DEFAULT_FILTERS,
      source: 'seeded_demo',
      q: 'ENC-D-ABSTAIN-001',
      outcome: 'ABSTAIN',
      reason_code: 'age_out_of_scope'
    }
  },
  {
    value: 'drift-caution',
    label: 'drift spike: CAUTION',
    filters: {
      ...DEFAULT_FILTERS,
      source: 'seeded_demo',
      q: 'ENC-D-CAUTION-001',
      outcome: 'CAUTION',
      reason_code: 'ks_shift_detected'
    }
  }
];

const STORYLINE_SHORTCUTS: Array<{ value: string; label: string }> = [
  { value: 'unit-hold', label: 'Show HOLD' },
  { value: 'peds-abstain', label: 'Show ABSTAIN' },
  { value: 'drift-caution', label: 'Show CAUTION' }
];

const DEMO_SEQUENCE_STEPS: Array<{ preset: string; label: string }> = [
  { preset: 'unit-hold', label: 'HOLD' },
  { preset: 'peds-abstain', label: 'ABSTAIN' },
  { preset: 'drift-caution', label: 'CAUTION' }
];

const RECOMMENDED_ACTION: Record<PolicyOutcome, string> = {
  ALLOW: 'Proceed with monitoring; no immediate intervention required.',
  CAUTION: 'Review drift signal and launch change proposal if signal persists.',
  ABSTAIN: 'Do not use model output for this cohort; route to manual clinical review.',
  HOLD: 'HOLD is a stop-button: pause this case and escalate data-quality mapping fix before reuse.'
};

const HARD_STOP_REASON_CODES = [
  'unit_mismatch',
  'required_field_missing',
  'timestamp_invalid',
  'score_out_of_range',
  'missing_required_inputs',
  'missing_required_context'
] as const;

const HARD_STOP_REASON_SET = new Set<string>(HARD_STOP_REASON_CODES);

const REASON_CODE_GLOSSARY: Record<string, string> = {
  ks_shift_detected: 'Recent score pattern is different from baseline. This may indicate workflow or population shift.',
  psi_critical: 'Patient mix changed sharply vs baseline. Pause and review before trusting model output.',
  psi_warning: 'Patient mix drifted vs baseline. Keep using with caution and monitor closely.',
  unit_mismatch: 'Expected unit does not match observed unit (for example °C expected, °F observed). This is a mapping issue, not model quality.',
  care_setting_mismatch: 'Case came from a care setting outside approved operating boundaries.',
  age_out_of_scope: 'Patient age is outside the approved age boundary. Keep the model silent here.',
  unit_out_of_scope: 'Current unit is outside approved deployment units. Keep the model silent here.',
  care_setting_out_of_scope: 'Current care setting is outside approved settings. Keep the model silent here.',
  missing_required_inputs: 'A required clinical field was missing or invalid at scoring time.',
  review_required: 'System could not assign a specific reason code. Manual review is needed.'
};

const REASON_CODE_OPERATOR_LABELS: Record<string, string> = {
  age_out_of_scope: 'Age outside approved cohort',
  unit_out_of_scope: 'Unit outside approved deployment',
  care_setting_out_of_scope: 'Care setting outside approved workflow',
  psi_elevated: 'Patient mix drift above CAUTION threshold',
  psi_critical: 'Patient mix drift above HOLD threshold',
  ks_shift_detected: 'Score shape shift above CAUTION threshold',
  alert_burden_spike: 'Alert burden jump above CAUTION threshold'
};

const OUT_OF_SCOPE_REASON_CODES = ['age_out_of_scope', 'unit_out_of_scope', 'care_setting_out_of_scope'] as const;

const REASON_CODE_RECOMMENDED_ACTION: Record<string, string> = {
  age_out_of_scope: 'Suppress in this context and reroute to an age-appropriate workflow. Do not display model output.',
  unit_out_of_scope: 'Suppress in this context and reroute to an approved unit workflow. Do not display model output.',
  care_setting_out_of_scope: 'Suppress in this context and reroute to an approved care-setting workflow. Do not display model output.',
  psi_elevated:
    'Open Drift Investigation, confirm which cohort attributes shifted, and keep model active with CAUTION monitoring.',
  ks_shift_detected:
    'Compare baseline vs current score buckets by unit, then prepare a change proposal if shift persists after re-check.',
  alert_burden_spike:
    'Review routing/suppression rules and create a mitigation proposal to reduce operator burden before next release cycle.',
  psi_critical:
    'Escalate to drift incident review immediately and confirm whether policy should move this model to HOLD for this cohort.'
};

const STORAGE_KEYS = {
  connected: 'tt_epic_connected',
  analysisStarted: 'tt_analysis_started',
  scope: 'tt_inspection_scope'
} as const;

const SOURCE_LABELS: Record<DemoSource, string> = {
  seeded_demo: 'Seeded Demo',
  epic_sandbox: 'Epic Sandbox'
};

function expectedScenarioForPreset(
  presetValue: string | null
): { presetValue: string; label: string; encounterId: string; outcome: 'ALLOW' | 'CAUTION' | 'ABSTAIN' | 'HOLD' | null } | null {
  if (!presetValue) return null;
  const preset = PRESETS.find((item) => item.value === presetValue);
  if (!preset) return null;

  const encounterId = preset.filters.q.trim();
  const outcome = preset.filters.outcome === 'non_allow' ? null : preset.filters.outcome;

  if (!encounterId) return null;
  return {
    presetValue,
    label: preset.label,
    encounterId,
    outcome
  };
}

function changeSourceEventId(policyPatch: unknown): string | null {
  if (!policyPatch || typeof policyPatch !== 'object') return null;
  const payload = policyPatch as Record<string, unknown>;
  const lineage = payload.lineage && typeof payload.lineage === 'object'
    ? (payload.lineage as Record<string, unknown>)
    : null;
  const value = lineage?.source_event_id ?? payload.source_event_id;
  return typeof value === 'string' && value.trim() ? value : null;
}

function metricDescriptionForOperator(title: string): string {
  const normalized = title.toLowerCase();
  if (normalized.includes('alert')) {
    return 'Operator review load (alert burden): how many model alerts reached teams in this window. Sustained growth means more triage pressure.';
  }
  if (normalized.includes('psi')) {
    return 'Patient-mix drift pressure (PSI): how far current patient mix moved from baseline. Larger movement means context drift risk.';
  }
  if (normalized.includes('ks')) {
    return 'Score-shape drift pressure (KS): how much score distribution changed vs baseline. Larger change can shift who gets alerted.';
  }
  if (normalized.includes('incident')) {
    return 'Number of active risk cases that still require operational follow-up.';
  }
  return 'Operational signal used by analysts to decide whether to continue, review, or escalate model usage.';
}

function parseInspectionTarget(rawValue: string | null): InspectionTarget {
  if (!rawValue) return 'all';
  try {
    const parsed = JSON.parse(rawValue) as { target?: unknown };
    if (parsed.target === 'all' || parsed.target === 'epic_sepsis_bpa' || parsed.target === 'epic_deterioration_index') {
      return parsed.target;
    }
  } catch {
    return 'all';
  }
  return 'all';
}

function toIsoString(datetimeLocal: string): string | null {
  if (!datetimeLocal) return null;
  const value = new Date(datetimeLocal);
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

function toDatetimeLocalValue(value: Date): string {
  const pad = (entry: number) => String(entry).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(
    value.getMinutes()
  )}`;
}

function formatDateTimeLocalShort(datetimeLocal: string): string {
  if (!datetimeLocal) return '-';
  const date = new Date(datetimeLocal);
  if (Number.isNaN(date.getTime())) return datetimeLocal;
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatTimeRange(startTime: string, endTime: string): string {
  if (!startTime && !endTime) return 'Any time';
  const startLabel = startTime ? formatDateTimeLocalShort(startTime) : null;
  const endLabel = endTime ? formatDateTimeLocalShort(endTime) : null;
  if (startLabel && endLabel) return `${startLabel} → ${endLabel}`;
  if (startLabel) return `Since ${startLabel}`;
  if (endLabel) return `Before ${endLabel}`;
  return 'Any time';
}

function humanizeReasonCode(reasonCode: string | null): string {
  if (!reasonCode) return 'review_required';
  if (REASON_CODE_OPERATOR_LABELS[reasonCode]) return REASON_CODE_OPERATOR_LABELS[reasonCode];
  return reasonCode.replace(/_/g, ' ');
}

function valuePreview(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '-';
  if (!Number.isFinite(value)) return String(value);
  return value.toFixed(digits);
}

function formatDelta(score: number | null | undefined, threshold: number | null | undefined): string | null {
  if (score === null || score === undefined || threshold === null || threshold === undefined) return null;
  const delta = score - threshold;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(2)}`;
}

function shortToken(value: string | null | undefined, lead = 6, tail = 4): string {
  if (!value) return '-';
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

function reasonCodeHelp(reasonCode: string | null | undefined): string | null {
  if (!reasonCode) return null;
  return REASON_CODE_GLOSSARY[reasonCode] || null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asStringOrNull(item))
    .filter((item): item is string => Boolean(item && item.trim()))
    .map((item) => item.trim());
}

function normalizeIntendedUseBoundary(value: unknown): IntendedUseBoundary {
  if (!value || typeof value !== 'object') {
    return {
      minAge: 18,
      maxAge: 120,
      allowedUnits: [],
      allowedCareSettings: []
    };
  }
  const payload = value as Record<string, unknown>;
  return {
    minAge: asNumber(payload.min_age) ?? 18,
    maxAge: asNumber(payload.max_age) ?? 120,
    allowedUnits: toStringList(payload.allowed_units),
    allowedCareSettings: toStringList(payload.allowed_care_settings)
  };
}

function formatAgeBoundary(boundary: IntendedUseBoundary): string {
  const { minAge, maxAge } = boundary;
  if (minAge !== null && minAge >= 18 && maxAge !== null) return `Adults only (${minAge}-${maxAge})`;
  if (minAge !== null && maxAge !== null) return `Age ${minAge}-${maxAge}`;
  if (minAge !== null) return `Age ${minAge}+`;
  if (maxAge !== null) return `Age <= ${maxAge}`;
  return 'Policy-defined age cohort';
}

function formatCareSettingBoundary(boundary: IntendedUseBoundary): string {
  if (boundary.allowedCareSettings.length === 0) return 'Allowed care settings only';
  return `Allowed settings: ${boundary.allowedCareSettings.join(', ')}`;
}

function formatUnitBoundary(boundary: IntendedUseBoundary): string {
  if (boundary.allowedUnits.length === 0) return 'Allowed units only';
  return `Allowed units: ${boundary.allowedUnits.join(', ')}`;
}

function outOfScopeReasonCodes(reasonCodes: string[]): string[] {
  return reasonCodes.filter((code) =>
    (OUT_OF_SCOPE_REASON_CODES as readonly string[]).includes(code)
  );
}

function primaryOutOfScopeReasonCode(reasonCodes: string[]): string | null {
  for (const code of OUT_OF_SCOPE_REASON_CODES) {
    if (reasonCodes.includes(code)) return code;
  }
  return null;
}

function recommendedActionForCase(
  outcome: PolicyOutcome,
  reasonCodes: string[]
): string {
  const primaryOutOfScopeCode = primaryOutOfScopeReasonCode(reasonCodes);
  const hardStopReasonCode = reasonCodes.find((code) => HARD_STOP_REASON_SET.has(code));

  if (outcome === 'HOLD') {
    if (hardStopReasonCode === 'unit_mismatch') {
      return 'HOLD is a stop-button: pause this case, fix unit/data mapping, and rerun checks before reuse.';
    }
    if (hardStopReasonCode) {
      return 'HOLD is a stop-button: pause this case, fix source/data integrity issues, and rerun policy checks before reuse.';
    }
    if (primaryOutOfScopeCode) {
      return 'HOLD this case, suppress model output in this context, and escalate policy-boundary review before reuse.';
    }
    return RECOMMENDED_ACTION.HOLD;
  }

  if (outcome === 'ABSTAIN') {
    if (primaryOutOfScopeCode && REASON_CODE_RECOMMENDED_ACTION[primaryOutOfScopeCode]) {
      return REASON_CODE_RECOMMENDED_ACTION[primaryOutOfScopeCode];
    }
    return RECOMMENDED_ACTION.ABSTAIN;
  }

  const prioritizedReasonCodes = [
    ...reasonCodes,
    ...OUT_OF_SCOPE_REASON_CODES.filter((code) => !reasonCodes.includes(code))
  ];
  for (const reasonCode of prioritizedReasonCodes) {
    if (REASON_CODE_RECOMMENDED_ACTION[reasonCode]) {
      return REASON_CODE_RECOMMENDED_ACTION[reasonCode];
    }
  }
  return RECOMMENDED_ACTION[outcome];
}

function changeProposalTitleForOutcome(outcome: PolicyOutcome, modelName: string): string {
  if (outcome === 'HOLD') return `HOLD containment follow-up: ${modelName}`;
  if (outcome === 'ABSTAIN') return `ABSTAIN boundary follow-up: ${modelName}`;
  if (outcome === 'ALLOW') return `ALLOW monitoring follow-up: ${modelName}`;
  return `CAUTION follow-up: ${modelName}`;
}

function changeProposalRiskAssessmentForOutcome(outcome: PolicyOutcome): string {
  if (outcome === 'HOLD') {
    return 'Hard-stop containment: do not release tuning until source/data mapping is fixed and revalidated.';
  }
  if (outcome === 'ABSTAIN') {
    return 'Boundary containment: keep suppression and manual route until policy-boundary review is approved.';
  }
  return 'Requires simulation and reviewer sign-off before release. Keep rollback readiness.';
}

function changeProposalTriggerForOutcome(outcome: PolicyOutcome, reasonCodes: string[]): string {
  const summary = reasonCodes.length > 0 ? reasonCodes.map((code) => code.replace(/_/g, ' ')).join(', ') : outcome;
  if (outcome === 'HOLD') return `HOLD hard-stop trigger: ${summary}`;
  if (outcome === 'ABSTAIN') return `ABSTAIN boundary trigger: ${summary}`;
  if (outcome === 'ALLOW') return `ALLOW monitoring trigger: ${summary}`;
  return `CAUTION drift trigger: ${summary}`;
}

type DriftEvidence = {
  psi: number | null;
  psi_threshold: number | null;
  psi_hold_threshold: number | null;
  ks_stat: number | null;
  ks_threshold: number | null;
  baseline_alert_burden: number | null;
  recent_alert_burden: number | null;
  alert_delta_pct: number | null;
  alert_delta_note: string | null;
  alert_delta_threshold_pct: number | null;
  baseline_samples: number | null;
  recent_samples: number | null;
};

type DriftSignalStatus = 'within_baseline' | 'attention' | 'hold';

type DriftSignalSummary = {
  id: 'psi' | 'ks' | 'alert_delta';
  operator_label: string;
  metric_label: string;
  current_value: number | null;
  caution_threshold: number | null;
  hold_threshold: number | null;
  status: DriftSignalStatus;
  decimals: number;
  suffix: string;
  context_text: string;
};

type UnitMismatchEvidence = {
  field_name: string;
  expected_unit: string | null;
  observed_unit: string | null;
  sample_values: string[];
};

function parseDriftEvidence(evidence: Record<string, unknown>): DriftEvidence {
  const baseline_alert_burden = asNumber(evidence.baseline_alert_burden);
  const recent_alert_burden = asNumber(evidence.recent_alert_burden);
  let alert_delta_pct = asNumber(evidence.alert_delta_pct);
  let alert_delta_note = asStringOrNull(evidence.alert_delta_note);

  if (baseline_alert_burden !== null && recent_alert_burden !== null) {
    if (baseline_alert_burden > 0) {
      const recomputed = ((recent_alert_burden - baseline_alert_burden) / baseline_alert_burden) * 100;
      if (alert_delta_pct === null || Math.abs(alert_delta_pct - recomputed) >= 0.1) {
        alert_delta_pct = Number(recomputed.toFixed(2));
        alert_delta_note = `Alert delta recomputed from baseline/recent burden (${baseline_alert_burden.toFixed(2)}% -> ${recent_alert_burden.toFixed(2)}%).`;
      } else if (Math.abs(recomputed) < 0.01 && recent_alert_burden >= 20) {
        alert_delta_note = `Alert burden is high (${recent_alert_burden.toFixed(2)}%) but stable vs baseline (${baseline_alert_burden.toFixed(2)}%).`;
      }
    } else if (recent_alert_burden > 0) {
      alert_delta_pct = Number(recent_alert_burden.toFixed(2));
      alert_delta_note = `Baseline alert burden is 0.00%; using absolute recent burden (${recent_alert_burden.toFixed(2)}%) as delta proxy.`;
    } else if (alert_delta_pct === null) {
      alert_delta_pct = 0;
    }
  }

  return {
    psi: asNumber(evidence.psi),
    psi_threshold: asNumber(evidence.psi_threshold),
    psi_hold_threshold: asNumber(evidence.psi_hold_threshold),
    ks_stat: asNumber(evidence.ks_stat),
    ks_threshold: asNumber(evidence.ks_threshold),
    baseline_alert_burden,
    recent_alert_burden,
    alert_delta_pct,
    alert_delta_note,
    alert_delta_threshold_pct: asNumber(evidence.alert_delta_threshold_pct),
    baseline_samples: asNumber(evidence.baseline_samples),
    recent_samples: asNumber(evidence.recent_samples)
  };
}

function driftSignalStatus(
  currentValue: number | null,
  cautionThreshold: number | null,
  holdThreshold: number | null = null
): DriftSignalStatus {
  if (currentValue === null) return 'within_baseline';
  if (holdThreshold !== null && currentValue >= holdThreshold) return 'hold';
  if (cautionThreshold !== null && currentValue >= cautionThreshold) return 'attention';
  return 'within_baseline';
}

function driftSignalStatusBadgeVariant(status: DriftSignalStatus): 'success' | 'warning' | 'danger' {
  if (status === 'hold') return 'danger';
  if (status === 'attention') return 'warning';
  return 'success';
}

function driftSignalStatusText(status: DriftSignalStatus): string {
  if (status === 'hold') return 'At HOLD boundary';
  if (status === 'attention') return 'Needs attention';
  return 'Within baseline';
}

function buildDriftSignalSummaries(drift: DriftEvidence): DriftSignalSummary[] {
  return [
    {
      id: 'psi',
      operator_label: 'Patient-mix drift pressure',
      metric_label: 'PSI',
      current_value: drift.psi,
      caution_threshold: drift.psi_threshold,
      hold_threshold: drift.psi_hold_threshold,
      status: driftSignalStatus(drift.psi, drift.psi_threshold, drift.psi_hold_threshold),
      decimals: 3,
      suffix: '',
      context_text: 'PSI tracks patient-mix movement versus baseline. Higher PSI means context drift risk while scoring may still continue.'
    },
    {
      id: 'ks',
      operator_label: 'Score-shape drift pressure',
      metric_label: 'KS',
      current_value: drift.ks_stat,
      caution_threshold: drift.ks_threshold,
      hold_threshold: null,
      status: driftSignalStatus(drift.ks_stat, drift.ks_threshold),
      decimals: 3,
      suffix: '',
      context_text: 'KS tracks score-distribution shape changes versus baseline. Large KS shifts can change alert routing behavior.'
    },
    {
      id: 'alert_delta',
      operator_label: 'Operator review load shift',
      metric_label: 'Delta %',
      current_value: drift.alert_delta_pct,
      caution_threshold: drift.alert_delta_threshold_pct,
      hold_threshold: null,
      status: driftSignalStatus(drift.alert_delta_pct, drift.alert_delta_threshold_pct),
      decimals: 2,
      suffix: '%',
      context_text: 'Alert burden delta shows review-load change relative to baseline and signals when threshold tuning may be needed.'
    }
  ];
}

function incidentStatusForDisplay(value: string | null | undefined): IncidentStatusOption {
  if (!value) return 'Open';
  if (value === 'Investigating') return 'Investigating';
  if (value === 'Resolved' || value === 'Mitigated' || value === 'Closed') return 'Resolved';
  return 'Open';
}

function incidentStatusForApi(value: IncidentStatusOption): string {
  if (value === 'Resolved') return 'Closed';
  return value;
}

function incidentStatusBadgeVariant(value: IncidentStatusOption): 'danger' | 'warning' | 'success' {
  if (value === 'Resolved') return 'success';
  if (value === 'Investigating') return 'warning';
  return 'danger';
}

function toSampleValueList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => valuePreview(item)).filter((item) => item !== '-');
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([key, sample]) => `${key}: ${valuePreview(sample)}`);
  }
  const single = valuePreview(value);
  return single === '-' ? [] : [single];
}

function parseUnitMismatchEvidence(detail: EventDetailPayload | null): UnitMismatchEvidence | null {
  if (!detail) return null;
  const dataQualityGate = detail.gates.find(
    (gate) => gate.gate_name === 'DataQuality' && (gate.reason_codes || []).includes('unit_mismatch')
  );
  if (!dataQualityGate) return null;

  const evidence = dataQualityGate.evidence || {};
  const expected_unit = asStringOrNull(evidence.expected_unit);
  const observed_unit = asStringOrNull(evidence.observed_unit);
  const field_name = asStringOrNull(evidence.field_name) || 'temperature';

  const sample_values =
    toSampleValueList(evidence.sample_values).length > 0
      ? toSampleValueList(evidence.sample_values)
      : toSampleValueList(evidence.sample_value);

  if (!expected_unit && !observed_unit) return null;
  return {
    field_name,
    expected_unit,
    observed_unit,
    sample_values,
  };
}

function normalizePatientSummaryEvidence(value: unknown): PatientSummaryEvidence | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  const encounterRaw = payload.encounter;
  const encounter = encounterRaw && typeof encounterRaw === 'object'
    ? {
        id: asStringOrNull((encounterRaw as Record<string, unknown>).id),
        class: asStringOrNull((encounterRaw as Record<string, unknown>).class),
        unit_name: asStringOrNull((encounterRaw as Record<string, unknown>).unit_name),
        care_setting: asStringOrNull((encounterRaw as Record<string, unknown>).care_setting),
      }
    : null;

  const observationsRaw = Array.isArray(payload.observations) ? payload.observations : [];
  const observations: PatientSummaryObservationEvidence[] = observationsRaw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      metric: asStringOrNull(item.metric) || 'unknown',
      observation_id: asStringOrNull(item.observation_id),
      code: asStringOrNull(item.code),
      value:
        typeof item.value === 'number' || typeof item.value === 'string'
          ? item.value
          : null,
      unit: asStringOrNull(item.unit),
      observed_at: asStringOrNull(item.observed_at),
      source: asStringOrNull(item.source),
    }));

  const missingFieldsRaw = Array.isArray(payload.missing_fields) ? payload.missing_fields : [];
  const missingFields = missingFieldsRaw
    .map((item) => asStringOrNull(item))
    .filter((item): item is string => Boolean(item));

  return {
    captured_at: asStringOrNull(payload.captured_at),
    fhir_iss: asStringOrNull(payload.fhir_iss),
    encounter,
    observations,
    missing_fields: missingFields,
  };
}

function ControlTowerPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();
  const { user } = useAuth();
  const deepLinkedCase = searchParams.get('case')?.trim() || '';
  const deepLinkedPreset = searchParams.get('preset')?.trim() || '';
  const demoMode = searchParams.get('demo_mode') === '1';

  const [, startModelPassportTransition] = useTransition();
  const [modelPassportOpening, setModelPassportOpening] = useState<{ id: string; name: string } | null>(null);

  const openModelPassport = useCallback(
    (model: { id: string; name: string }) => {
      if (modelPassportOpening) return;
      setModelPassportOpening({ id: model.id, name: model.name });
      startModelPassportTransition(() => {
        router.push(`/models/${model.id}`);
      });
    },
    [modelPassportOpening, router, startModelPassportTransition]
  );

  const prefetchModelPassport = useCallback(
    (modelId: string) => {
      router.prefetch(`/models/${modelId}`);
    },
    [router]
  );

  const [connectionStateReady, setConnectionStateReady] = useState(false);
  const [epicConnected, setEpicConnected] = useState(false);
  const [inspectionReady, setInspectionReady] = useState(false);
  const [inspectionTarget, setInspectionTarget] = useState<InspectionTarget>('all');
  const [modelFilterTouched, setModelFilterTouched] = useState(false);
  const [sourceFilterTouched, setSourceFilterTouched] = useState(false);
  const [autoScopeResolved, setAutoScopeResolved] = useState(false);

  const initialFilters = useMemo<CaseFilters>(() => {
    if (!deepLinkedCase) return DEFAULT_FILTERS;
    return {
      ...DEFAULT_FILTERS,
      q: deepLinkedCase
    };
  }, [deepLinkedCase]);

  const [draftFilters, setDraftFilters] = useState<CaseFilters>(initialFilters);
  const [filters, setFilters] = useState<CaseFilters>(initialFilters);
  const [page, setPage] = useState(0);
  const [activePreset, setActivePreset] = useState('');
  const [deepLinkPresetApplied, setDeepLinkPresetApplied] = useState('');
  const [timePreset, setTimePreset] = useState<TimePreset>('any');
  const [customTimeOpen, setCustomTimeOpen] = useState(false);

  const hasPendingChanges =
    draftFilters.q !== filters.q ||
    draftFilters.model_id !== filters.model_id ||
    draftFilters.source !== filters.source ||
    draftFilters.outcome !== filters.outcome ||
    draftFilters.reason_code !== filters.reason_code ||
    draftFilters.start_time !== filters.start_time ||
    draftFilters.end_time !== filters.end_time;
  const previousPendingChangesRef = useRef(hasPendingChanges);

  const [caseRows, setCaseRows] = useState<AuditCase[]>([]);
  const [totalCases, setTotalCases] = useState(0);
  const [caseListLoading, setCaseListLoading] = useState(false);
  const [caseListError, setCaseListError] = useState('');
  const [demoResetStatus, setDemoResetStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [demoResetMessage, setDemoResetMessage] = useState('');

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const caseListRef = useRef<HTMLDivElement | null>(null);

  const [detail, setDetail] = useState<EventDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [incidentStatusDraft, setIncidentStatusDraft] = useState<IncidentStatusOption>('Open');
  const [incidentNoteDraft, setIncidentNoteDraft] = useState('');
  const [incidentActionLoading, setIncidentActionLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncConnectionState = () => {
      const connected = localStorage.getItem(STORAGE_KEYS.connected) === '1';
      const analysisStarted = localStorage.getItem(STORAGE_KEYS.analysisStarted) === '1';
      setEpicConnected(connected);
      setInspectionReady(connected && analysisStarted);
      setInspectionTarget(
        connected && analysisStarted ? parseInspectionTarget(localStorage.getItem(STORAGE_KEYS.scope)) : 'all'
      );
      setConnectionStateReady(true);
    };

    syncConnectionState();
    window.addEventListener('focus', syncConnectionState);
    window.addEventListener('storage', syncConnectionState);
    window.addEventListener(EPIC_CONNECTION_CHANGE_EVENT, syncConnectionState);

    return () => {
      window.removeEventListener('focus', syncConnectionState);
      window.removeEventListener('storage', syncConnectionState);
      window.removeEventListener(EPIC_CONNECTION_CHANGE_EVENT, syncConnectionState);
    };
  }, []);

  const controlTowerUnlocked = connectionStateReady && inspectionReady;
  const awaitingAutoScope =
    controlTowerUnlocked && !modelFilterTouched && inspectionTarget !== 'all' && !filters.model_id && !autoScopeResolved;
  const controlTowerReady = controlTowerUnlocked && !awaitingAutoScope;
  const controlTowerQuery = useQueryResource<ControlTowerPayload>(() => {
    const params = new URLSearchParams();
    if (filters.model_id) params.set('model_id', filters.model_id);
    const query = params.toString();
    return api.get(`/metrics/control-tower${query ? `?${query}` : ''}`);
  }, {
    enabled: controlTowerReady
  });
  const modelsQuery = useQueryResource<ModelDefinition[]>(() => api.get('/models'), {
    enabled: controlTowerUnlocked
  });
  const policiesQuery = useQueryResource<PolicyDefinition[]>(() => api.get('/policies'), {
    enabled: controlTowerUnlocked
  });
  const changesQuery = useQueryResource<ChangeProposalSummary[]>(() => api.get('/changes'), {
    enabled: controlTowerUnlocked
  });

  useEffect(() => {
    if (!controlTowerUnlocked) {
      setAutoScopeResolved(false);
      setModelFilterTouched(false);
      setSourceFilterTouched(false);
      return;
    }
    setAutoScopeResolved(false);
  }, [controlTowerUnlocked, inspectionTarget]);

  useEffect(() => {
    if (!controlTowerUnlocked) return;
    if (inspectionTarget === 'all') {
      setAutoScopeResolved(true);
      return;
    }
    if (modelFilterTouched || filters.model_id || autoScopeResolved) return;
    if (!modelsQuery.data) return;

    const scopedModel = modelsQuery.data.find((model) => model.code === inspectionTarget);
    if (scopedModel) {
      setDraftFilters((current) => ({ ...current, model_id: scopedModel.id }));
      setFilters((current) => ({ ...current, model_id: scopedModel.id }));
      setPage(0);
      setActivePreset('');
    }

    setAutoScopeResolved(true);
  }, [autoScopeResolved, controlTowerUnlocked, filters.model_id, inspectionTarget, modelFilterTouched, modelsQuery.data]);

  const previousModelIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!controlTowerReady) return;

    if (previousModelIdRef.current === null) {
      previousModelIdRef.current = filters.model_id;
      return;
    }

    if (previousModelIdRef.current === filters.model_id) return;
    previousModelIdRef.current = filters.model_id;
    void controlTowerQuery.refetch();
  }, [controlTowerReady, filters.model_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!deepLinkedCase) return;
    const nextFilters = {
      ...DEFAULT_FILTERS,
      q: deepLinkedCase
    };
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
    setPage(0);
    setActivePreset('');
    setTimePreset('any');
    setCustomTimeOpen(false);
    setSourceFilterTouched(false);
  }, [deepLinkedCase]);

  useEffect(() => {
    if (!deepLinkedPreset) {
      setDeepLinkPresetApplied('');
      return;
    }
    if (deepLinkPresetApplied === deepLinkedPreset) return;
    const preset = PRESETS.find((item) => item.value === deepLinkedPreset);
    if (!preset) return;

    setActivePreset(preset.value);
    setDraftFilters(preset.filters);
    setFilters(preset.filters);
    setTimePreset('any');
    setCustomTimeOpen(false);
    setSourceFilterTouched(true);
    setPage(0);
    setDeepLinkPresetApplied(deepLinkedPreset);
  }, [deepLinkPresetApplied, deepLinkedPreset]);

  useEffect(() => {
    const hadPendingChanges = previousPendingChangesRef.current;
    if (hasPendingChanges && !hadPendingChanges) {
      pushToast({
        title: 'Pending changes',
        description: 'Apply filters to refresh the case list.'
      });
    }
    previousPendingChangesRef.current = hasPendingChanges;
  }, [hasPendingChanges, pushToast]);

  const fetchCases = useCallback(async () => {
    if (!controlTowerReady) {
      setCaseRows([]);
      setTotalCases(0);
      setCaseListError('');
      setCaseListLoading(false);
      return;
    }

    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));

    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.model_id) params.set('model_id', filters.model_id);
    if (filters.source) params.set('source', filters.source);
    if (filters.outcome !== 'non_allow') params.set('outcome', filters.outcome);
    if (filters.reason_code.trim()) params.set('reason_code', filters.reason_code.trim());

    const startIso = toIsoString(filters.start_time);
    const endIso = toIsoString(filters.end_time);
    if (startIso) params.set('start_time', startIso);
    if (endIso) params.set('end_time', endIso);

    try {
      setCaseListLoading(true);
      setCaseListError('');
      const payload = await api.get<AuditCaseListPayload>(`/audit/cases?${params.toString()}`);
      if (!sourceFilterTouched && filters.source === 'epic_sandbox' && payload.total === 0) {
        setDraftFilters((current) => ({ ...current, source: 'seeded_demo' }));
        setFilters((current) => ({ ...current, source: 'seeded_demo' }));
        setPage(0);
        pushToast({
          title: 'Source fallback',
          description: 'Epic Sandbox is empty. Showing Seeded Demo cases.',
          variant: 'info'
        });
        return;
      }
      setCaseRows(payload.items);
      setTotalCases(payload.total);
    } catch (error) {
      setCaseRows([]);
      setTotalCases(0);
      setCaseListError(error instanceof Error ? error.message : 'Failed to load cases');
    } finally {
      setCaseListLoading(false);
    }
  }, [controlTowerReady, filters, page, pushToast, sourceFilterTouched]);

  useEffect(() => {
    void fetchCases();
  }, [fetchCases]);

  useEffect(() => {
    if (!controlTowerReady) {
      setSelectedIndex(0);
      setDetailOpen(false);
      return;
    }

    if (caseRows.length === 0) {
      setSelectedIndex(0);
      setDetailOpen(false);
      return;
    }

    if (deepLinkedCase) {
      const deepLinkedIndex = caseRows.findIndex((row) => row.event_id === deepLinkedCase || row.encounter_id === deepLinkedCase);
      if (deepLinkedIndex >= 0) {
        setSelectedIndex(deepLinkedIndex);
        return;
      }
    }

    setSelectedIndex((current) => Math.min(current, caseRows.length - 1));
  }, [caseRows, controlTowerReady, deepLinkedCase]);

  useEffect(() => {
    const selectedEventId = caseRows[selectedIndex]?.event_id || null;
    if (!controlTowerReady || !selectedEventId || !detailOpen) {
      setDetail(null);
      setDetailError('');
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError('');
    setDetail(null);
    api
      .get<EventDetailPayload>(`/audit/event-details/${selectedEventId}`)
      .then((payload) => {
        if (cancelled) return;
        setDetail(payload);
      })
      .catch((error) => {
        if (cancelled) return;
        setDetail(null);
        setDetailError(error instanceof Error ? error.message : 'Failed to load event detail');
      })
      .finally(() => {
        if (cancelled) return;
        setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [controlTowerReady, caseRows, detailOpen, selectedIndex]);

  const selectedCase = caseRows[selectedIndex] || null;
  const canRunMutatingActions = isWriteEnabledDemoRole(user?.role);
  const writeRoleHelpText = `Write-enabled demo role required (${writeEnabledDemoRoleLabel()}). Current role: ${user?.role || 'Unknown'}.`;
  const failedGates = (detail?.gates || []).filter((gate) => gate.status !== 'PASS');
  const driftGateFailed = failedGates.some((gate) => gate.gate_name === 'Drift');
  const patientSummaryEvidence = normalizePatientSummaryEvidence(detail?.event_context?.patient_summary);
  const unitMismatchEvidence = parseUnitMismatchEvidence(detail);
  const selectedPolicy = useMemo(() => {
    const policyId = detail?.decision_context?.policy_id;
    if (!policyId || !policiesQuery.data) return null;
    return policiesQuery.data.find((item) => item.id === policyId) || null;
  }, [detail?.decision_context?.policy_id, policiesQuery.data]);
  const intendedUseBoundary = useMemo(
    () => normalizeIntendedUseBoundary(selectedPolicy?.intended_use_config),
    [selectedPolicy?.id, selectedPolicy?.intended_use_config]
  );
  const caseReasonCodes = useMemo(() => {
    const codes = new Set<string>();
    if (selectedCase?.primary_reason_code) codes.add(selectedCase.primary_reason_code);
    (detail?.policy_decision?.reason_codes || []).forEach((code) => codes.add(code));
    failedGates.forEach((gate) => (gate.reason_codes || []).forEach((code) => codes.add(code)));
    return Array.from(codes);
  }, [detail?.policy_decision?.reason_codes, failedGates, selectedCase?.primary_reason_code]);
  const caseDriftEvidence = useMemo(() => {
    const driftGate = failedGates.find((gate) => gate.gate_name === 'Drift');
    if (!driftGate) return null;
    return parseDriftEvidence(driftGate.evidence || {});
  }, [failedGates]);
  const caseDriftSignals = useMemo(
    () => (caseDriftEvidence ? buildDriftSignalSummaries(caseDriftEvidence) : []),
    [caseDriftEvidence]
  );
  const cautionSignals = useMemo(
    () => caseDriftSignals.filter((signal) => signal.status === 'attention'),
    [caseDriftSignals]
  );
  const holdSignals = useMemo(
    () => caseDriftSignals.filter((signal) => signal.status === 'hold'),
    [caseDriftSignals]
  );
  const changedSignals = useMemo(
    () => caseDriftSignals.filter((signal) => signal.status !== 'within_baseline'),
    [caseDriftSignals]
  );
  const outOfScopeCodes = useMemo(() => outOfScopeReasonCodes(caseReasonCodes), [caseReasonCodes]);
  const caseOutcome: PolicyOutcome = detail?.policy_decision?.outcome || selectedCase?.outcome || 'ALLOW';
  const primaryOutOfScopeCode = useMemo(() => primaryOutOfScopeReasonCode(caseReasonCodes), [caseReasonCodes]);
  const recommendedAction = useMemo(
    () => recommendedActionForCase(caseOutcome, caseReasonCodes),
    [caseOutcome, caseReasonCodes]
  );
  const policyBoundaryHref = useMemo(() => {
    const params = new URLSearchParams();
    if (detail?.decision_context?.policy_id) params.set('policy_id', detail.decision_context.policy_id);
    params.set('focus', 'intended-use');
    if (primaryOutOfScopeCode) params.set('reason_code', primaryOutOfScopeCode);
    const query = params.toString();
    return `/policy${query ? `?${query}` : ''}#policy-intended-use-fail`;
  }, [detail?.decision_context?.policy_id, primaryOutOfScopeCode]);
  const driftWorkspaceHref = useMemo(() => {
    if (!selectedCase) return '/drift';
    const params = new URLSearchParams({ event_id: selectedCase.event_id });
    return `/drift/${selectedCase.model_id}?${params.toString()}`;
  }, [selectedCase?.event_id, selectedCase?.model_id]);
  const caseChangeProposalHref = useMemo(() => {
    if (!selectedCase) return '/changes';
    const effectiveUnit = detail?.event_context?.location_unit || selectedCase.location_unit;
    const effectiveCareSetting = detail?.event_context?.care_setting || selectedCase.care_setting;
    const triggeredRule = changeProposalTriggerForOutcome(caseOutcome, caseReasonCodes);
    const proposalTitle = changeProposalTitleForOutcome(caseOutcome, selectedCase.model_name);
    const proposalRiskAssessment = changeProposalRiskAssessmentForOutcome(caseOutcome);
    const params = new URLSearchParams({
      model_id: selectedCase.model_id,
      source: 'control_tower_case',
      event_id: selectedCase.event_id,
      outcome: caseOutcome,
      title: proposalTitle,
      expected_effect: recommendedAction,
      suggested_action: recommendedAction,
      risk_assessment: proposalRiskAssessment,
      triggered_rule: triggeredRule,
      location_unit: effectiveUnit,
      care_setting: effectiveCareSetting
    });
    if (caseReasonCodes.length > 0) {
      params.set('reason_codes', caseReasonCodes.join(','));
    }
    if (caseDriftEvidence?.psi !== null && caseDriftEvidence?.psi !== undefined) {
      params.set('psi', String(caseDriftEvidence.psi));
    }
    if (caseDriftEvidence?.ks_stat !== null && caseDriftEvidence?.ks_stat !== undefined) {
      params.set('ks_stat', String(caseDriftEvidence.ks_stat));
    }
    if (caseDriftEvidence?.alert_delta_pct !== null && caseDriftEvidence?.alert_delta_pct !== undefined) {
      params.set('alert_delta_pct', String(caseDriftEvidence.alert_delta_pct));
    }
    if (caseDriftEvidence?.psi_threshold !== null && caseDriftEvidence?.psi_threshold !== undefined) {
      params.set('psi_threshold', String(caseDriftEvidence.psi_threshold));
    }
    if (caseDriftEvidence?.psi_hold_threshold !== null && caseDriftEvidence?.psi_hold_threshold !== undefined) {
      params.set('psi_hold_threshold', String(caseDriftEvidence.psi_hold_threshold));
    }
    if (caseDriftEvidence?.ks_threshold !== null && caseDriftEvidence?.ks_threshold !== undefined) {
      params.set('ks_threshold', String(caseDriftEvidence.ks_threshold));
    }
    if (caseDriftEvidence?.alert_delta_threshold_pct !== null && caseDriftEvidence?.alert_delta_threshold_pct !== undefined) {
      params.set('alert_delta_threshold_pct', String(caseDriftEvidence.alert_delta_threshold_pct));
    }

    const baseThreshold = detail?.event_context?.threshold_applied ?? selectedCase.threshold_applied;
    if (baseThreshold !== null && baseThreshold !== undefined && Number.isFinite(baseThreshold)) {
      params.set('current_threshold', Number(baseThreshold).toFixed(2));
      const alertBurdenCrossedThreshold =
        caseOutcome === 'CAUTION' &&
        caseDriftEvidence?.alert_delta_pct !== null &&
        caseDriftEvidence?.alert_delta_pct !== undefined &&
        caseDriftEvidence?.alert_delta_threshold_pct !== null &&
        caseDriftEvidence?.alert_delta_threshold_pct !== undefined &&
        caseDriftEvidence.alert_delta_pct >= caseDriftEvidence.alert_delta_threshold_pct;
      const thresholdDelta = caseOutcome === 'CAUTION' ? (alertBurdenCrossedThreshold ? 0.05 : 0.03) : 0;
      params.set('proposed_threshold', Math.min(baseThreshold + thresholdDelta, 0.95).toFixed(2));
    }
    return `/changes?${params.toString()}`;
  }, [
    caseDriftEvidence,
    caseReasonCodes,
    caseOutcome,
    detail?.event_context?.threshold_applied,
    detail?.event_context?.care_setting,
    detail?.event_context?.location_unit,
    recommendedAction,
    selectedCase?.care_setting,
    selectedCase?.event_id,
    selectedCase?.location_unit,
    selectedCase?.model_id,
    selectedCase?.model_name,
    selectedCase?.threshold_applied
  ]);
  const linkedIncident = useMemo(() => {
    if (!detail?.incidents?.length) return null;
    return (
      detail.incidents.find((item) => incidentStatusForDisplay(item.status) !== 'Resolved') || detail.incidents[0] || null
    );
  }, [detail?.incidents]);
  const linkedChangeProposals = useMemo(() => {
    if (!selectedCase || !changesQuery.data) return [];
    const incidentId = linkedIncident?.id || null;

    return changesQuery.data
      .filter((item) => {
        const sourceEventId = changeSourceEventId(item.policy_patch);
        if (sourceEventId && sourceEventId === selectedCase.event_id) return true;
        if (incidentId && item.incident_id === incidentId) return true;
        return false;
      })
      .sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at).getTime();
        const bTime = new Date(b.updated_at || b.created_at).getTime();
        return bTime - aTime;
      });
  }, [changesQuery.data, linkedIncident?.id, selectedCase]);

  const totalPages = Math.max(1, Math.ceil(totalCases / PAGE_SIZE));
  const draftReasonHelpText = reasonCodeHelp(draftFilters.reason_code.trim());
  const draftTimeLabel = formatTimeRange(draftFilters.start_time, draftFilters.end_time);
  const appliedTimeLabel = formatTimeRange(filters.start_time, filters.end_time);
  const activePresetLabel = activePreset ? PRESETS.find((preset) => preset.value === activePreset)?.label ?? null : null;
  const activePresetScenario = useMemo(() => expectedScenarioForPreset(activePreset || null), [activePreset]);
  const activePresetMatchIndex = useMemo(() => {
    if (!activePresetScenario) return -1;
    return caseRows.findIndex((item) => {
      if (item.encounter_id !== activePresetScenario.encounterId) return false;
      if (!activePresetScenario.outcome) return true;
      return item.outcome === activePresetScenario.outcome;
    });
  }, [activePresetScenario, caseRows]);
  const presetScenarioMissing =
    Boolean(activePresetScenario) && !caseListLoading && !hasPendingChanges && activePresetMatchIndex < 0;
  const appliedModelName = filters.model_id
    ? (modelsQuery.data || []).find((model) => model.id === filters.model_id)?.name ?? null
    : null;

  useEffect(() => {
    if (!linkedIncident) {
      setIncidentStatusDraft('Open');
      setIncidentNoteDraft('');
      return;
    }
    setIncidentStatusDraft(incidentStatusForDisplay(linkedIncident.status));
    setIncidentNoteDraft('');
  }, [linkedIncident?.id, linkedIncident?.status]);

  useEffect(() => {
    if (!activePresetScenario || caseListLoading) return;
    if (activePresetMatchIndex >= 0) {
      setSelectedIndex((current) => (current === activePresetMatchIndex ? current : activePresetMatchIndex));
      setDetailOpen(true);
      return;
    }

    if (caseRows.length === 0) {
      setDetailOpen(false);
    }
  }, [activePresetMatchIndex, activePresetScenario, caseListLoading, caseRows.length]);

  function applyFilters() {
    setFilters(draftFilters);
    setPage(0);
  }

  function resetFilters() {
    setDraftFilters({ ...DEFAULT_FILTERS });
    setFilters({ ...DEFAULT_FILTERS });
    setActivePreset('');
    setTimePreset('any');
    setCustomTimeOpen(false);
    setModelFilterTouched(true);
    setSourceFilterTouched(false);
    setPage(0);
  }

  function applyPreset(value: string) {
    setActivePreset(value);
    const preset = PRESETS.find((item) => item.value === value);
    if (!preset) return;
    setDraftFilters(preset.filters);
    setFilters(preset.filters);
    setTimePreset('any');
    setCustomTimeOpen(false);
    setSourceFilterTouched(true);
    setPage(0);
  }

  function applyTimePreset(preset: TimePreset) {
    setActivePreset('');
    setTimePreset(preset);

    if (preset === 'custom') {
      setCustomTimeOpen(true);
      return;
    }

    setCustomTimeOpen(false);

    if (preset === 'any') {
      setDraftFilters((current) => ({ ...current, start_time: '', end_time: '' }));
      return;
    }

    const now = new Date();
    now.setSeconds(0, 0);
    const minutes =
      preset === '24h'
        ? 24 * 60
        : preset === '7d'
          ? 7 * 24 * 60
          : preset === '30d'
            ? 30 * 24 * 60
            : 90 * 24 * 60;
    const start = new Date(now.getTime() - minutes * 60 * 1000);

    setDraftFilters((current) => ({
      ...current,
      start_time: toDatetimeLocalValue(start),
      end_time: toDatetimeLocalValue(now)
    }));
  }

  function clearAppliedFilter(field: keyof CaseFilters) {
    setActivePreset('');
    setPage(0);
    if (field === 'source') {
      setSourceFilterTouched(true);
    }
    setFilters((current) => ({ ...current, [field]: DEFAULT_FILTERS[field] }));
    setDraftFilters((current) => ({ ...current, [field]: DEFAULT_FILTERS[field] }));
  }

  function clearAppliedTimeRange() {
    setActivePreset('');
    setTimePreset('any');
    setCustomTimeOpen(false);
    setPage(0);
    setFilters((current) => ({ ...current, start_time: '', end_time: '' }));
    setDraftFilters((current) => ({ ...current, start_time: '', end_time: '' }));
  }

  function onCaseListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (caseRows.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setDetailOpen(true);
      setSelectedIndex((current) => Math.min(current + 1, caseRows.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setDetailOpen(true);
      setSelectedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
    }
  }

  async function handleDemoReset() {
    if (demoResetStatus === 'loading') return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Reset demo will clear current demo data and reseed deterministic cases. Continue?'
      );
      if (!confirmed) return;
    }

    setDemoResetStatus('loading');
    setDemoResetMessage('Resetting and reseeding demo data...');
    try {
      const payload = await api.post<DemoResetPayload>('/demo/reset');
      setDemoResetStatus('success');
      setDemoResetMessage(
        `Done: ${payload.prediction_events} prediction events seeded (${payload.incidents} incidents).`
      );
      pushToast({
        title: 'Demo reset completed',
        description: `Seeded ${payload.prediction_events} prediction events.`,
        variant: 'success'
      });
      setDraftFilters({ ...DEFAULT_FILTERS });
      setFilters({ ...DEFAULT_FILTERS });
      setPage(0);
      setActivePreset('');
      setTimePreset('any');
      setCustomTimeOpen(false);
      setSourceFilterTouched(false);
      setDetailOpen(false);
      await controlTowerQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Demo reset failed';
      setDemoResetStatus('error');
      setDemoResetMessage(message);
      pushToast({
        title: 'Demo reset failed',
        description: message,
        variant: 'error'
      });
    }
  }

  async function refreshSelectedCaseDetail() {
    if (!selectedCase) return;
    const payload = await api.get<EventDetailPayload>(`/audit/event-details/${selectedCase.event_id}`);
    setDetail(payload);
  }

  async function handleOpenIncident() {
    if (!canRunMutatingActions) {
      pushToast({
        title: 'Read-only session',
        description: writeRoleHelpText,
        variant: 'info'
      });
      return;
    }
    if (!selectedCase) return;
    if (linkedIncident) {
      router.push('/incidents');
      return;
    }
    if (selectedCase.outcome !== 'HOLD') {
      pushToast({
        title: 'Incident creation is blocked',
        description: 'Open incident is available for HOLD cases.',
        variant: 'info'
      });
      return;
    }

    const reasonCode = selectedCase.primary_reason_code || detail?.policy_decision?.reason_codes?.[0] || 'review_required';
    const title = `${selectedCase.outcome}: ${reasonCode}`;

    try {
      setIncidentActionLoading(true);
      await api.post('/incidents', {
        model_id: selectedCase.model_id,
        trigger_event_id: selectedCase.event_id,
        title,
        severity: selectedCase.outcome === 'HOLD' ? 'High' : 'Medium',
        owner_role: 'QualityRisk',
      });
      await refreshSelectedCaseDetail();
      await controlTowerQuery.refetch();
      pushToast({
        title: 'Incident opened',
        description: 'Incident was linked to this case.',
        variant: 'success'
      });
    } catch (error) {
      pushToast({
        title: 'Failed to open incident',
        description: error instanceof Error ? error.message : 'Incident creation failed',
        variant: 'error'
      });
    } finally {
      setIncidentActionLoading(false);
    }
  }

  async function handleIncidentStatusUpdate() {
    if (!canRunMutatingActions) {
      pushToast({
        title: 'Read-only session',
        description: writeRoleHelpText,
        variant: 'info'
      });
      return;
    }
    if (!linkedIncident) return;
    const statusPayload = incidentStatusForApi(incidentStatusDraft);
    if (statusPayload === linkedIncident.status) return;

    try {
      setIncidentActionLoading(true);
      await api.patch(`/incidents/${linkedIncident.id}`, { status: statusPayload });
      await refreshSelectedCaseDetail();
      await controlTowerQuery.refetch();
      pushToast({
        title: 'Incident status updated',
        description: `Status is now ${incidentStatusDraft}.`,
        variant: 'success'
      });
    } catch (error) {
      pushToast({
        title: 'Failed to update incident status',
        description: error instanceof Error ? error.message : 'Status update failed',
        variant: 'error'
      });
    } finally {
      setIncidentActionLoading(false);
    }
  }

  async function handleIncidentNoteAdd() {
    if (!canRunMutatingActions) {
      pushToast({
        title: 'Read-only session',
        description: writeRoleHelpText,
        variant: 'info'
      });
      return;
    }
    if (!linkedIncident) return;
    const note = incidentNoteDraft.trim();
    if (!note) return;

    try {
      setIncidentActionLoading(true);
      await api.post(`/incidents/${linkedIncident.id}/notes`, { note });
      setIncidentNoteDraft('');
      pushToast({
        title: 'Incident note added',
        description: 'Note was appended to incident timeline.',
        variant: 'success'
      });
    } catch (error) {
      pushToast({
        title: 'Failed to add incident note',
        description: error instanceof Error ? error.message : 'Note update failed',
        variant: 'error'
      });
    } finally {
      setIncidentActionLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div>
          <h2 className="text-2xl font-semibold">Control Tower</h2>
          <p className="prose-limited text-sm text-muted-foreground">
            Case Explorer runs from server-side case list (`/audit/cases`) and opens event evidence on demand.
          </p>
        </div>
        {demoMode ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Demo host mode active</CardTitle>
              <CardDescription>
                Deterministic order: HOLD → ABSTAIN → CAUTION, then Drift/Change links in case detail.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="flex flex-wrap gap-2">
                {DEMO_SEQUENCE_STEPS.map((item) => (
                  <Link key={item.preset} href={`/control-tower?demo_mode=1&preset=${item.preset}`}>
                    <Button size="sm" variant={activePreset === item.preset ? 'default' : 'outline'}>
                      {item.label}
                    </Button>
                  </Link>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Recovery: if no case appears, use <span className="font-medium text-foreground">Reset filters</span>, then{' '}
                <span className="font-medium text-foreground">Reset demo</span>, then reapply the same shortcut.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/demo-mode">
                  <Button size="sm" variant="outline">
                    Open operator checklist
                  </Button>
                </Link>
                <Link href="/smart/launch">
                  <Button size="sm" variant="outline">
                    Continue to SMART live path
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : null}
        {connectionStateReady && epicConnected ? <EhrConnectionBanner /> : null}
      </div>

      {!connectionStateReady ? (
        <Card>
          <CardHeader>
            <CardTitle>Checking Epic connection state...</CardTitle>
          </CardHeader>
        </Card>
      ) : null}

      {connectionStateReady && !controlTowerUnlocked ? (
        <Card>
          <CardHeader>
            <CardTitle>{epicConnected ? 'Run safety inspection first' : 'Epic connection required'}</CardTitle>
            <CardDescription>
              {epicConnected
                ? 'Control Tower unlocks after you run inspection in Epic Onboarding.'
                : 'Connect Epic feed in Epic Onboarding before opening Control Tower.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button>Open Epic Onboarding</Button>
            </Link>
          </CardContent>
        </Card>
      ) : null}

	      {controlTowerUnlocked ? (
	        <>
	          <StatusLegend />

	          {awaitingAutoScope ? (
	            <Card>
	              <CardHeader>
	                <CardTitle>Applying inspection scope...</CardTitle>
	                <CardDescription>Loading selected model from Epic inspection scope.</CardDescription>
	              </CardHeader>
	            </Card>
	          ) : null}

	          {controlTowerQuery.loading ? (
	            <Card>
	              <CardHeader>
	                <CardTitle>Loading control metrics...</CardTitle>
	              </CardHeader>
            </Card>
          ) : null}

          {controlTowerQuery.error ? (
            <Card>
              <CardHeader>
                <CardTitle>Control metrics unavailable</CardTitle>
                <CardDescription>{controlTowerQuery.error}</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {controlTowerQuery.data ? (
            <>
              <section className="metric-grid">
                {controlTowerQuery.data.trend_cards.map((card) => (
                  <MetricCard
                    key={card.key}
                    title={card.title}
                    value={card.value}
                    trend={card.trend}
                    description={metricDescriptionForOperator(card.title)}
                  />
                ))}
              </section>

	              <Card>
	                <CardHeader>
	                  <CardTitle>Health Semantics (Policy-Linked)</CardTitle>
	                  <CardDescription>
	                    Health reason and thresholds are returned by API, without UI hardcoding. Click a row to open the model
	                    passport.
	                  </CardDescription>
	                </CardHeader>
	                <CardContent>
                    <div className="relative">
  	                  <Table aria-busy={modelPassportOpening ? true : undefined}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Model</TableHead>
                          <TableHead>Health</TableHead>
                          <TableHead>Health Reason</TableHead>
                          <TableHead>Drift thresholds</TableHead>
                        </TableRow>
                      </TableHeader>
  	                    <TableBody>
  	                      {controlTowerQuery.data.models.map((model) => (
  	                        <TableRow
  	                          key={model.id}
  	                          role="link"
  	                          tabIndex={0}
  	                          aria-label={`Open model passport: ${model.name}`}
                            aria-disabled={modelPassportOpening ? true : undefined}
  	                          className={cn(
                              'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              modelPassportOpening && 'cursor-wait',
                              modelPassportOpening?.id === model.id && 'bg-muted/50'
                            )}
                            onMouseEnter={() => prefetchModelPassport(model.id)}
                            onFocus={() => prefetchModelPassport(model.id)}
  	                          onClick={() => openModelPassport({ id: model.id, name: model.name })}
  	                          onKeyDown={(event) => {
  	                            if (event.key === 'Enter' || event.key === ' ') {
  	                              event.preventDefault();
  	                              openModelPassport({ id: model.id, name: model.name });
  	                            }
  	                          }}
  	                        >
  	                          <TableCell>
  	                            <p className="font-medium">{model.name}</p>
  	                            <p className="text-xs text-muted-foreground">{model.code}</p>
  	                          </TableCell>
  	                          <TableCell>
  	                            <HealthChip status={model.health} />
  	                          </TableCell>
  	                          <TableCell className="text-xs text-muted-foreground">{model.health_reason}</TableCell>
  	                          <TableCell className="text-xs text-muted-foreground">
  	                            watch {model.thresholds.psi_threshold.toFixed(2)} | hold {model.thresholds.psi_hold_threshold.toFixed(2)}
  	                          </TableCell>
  	                        </TableRow>
  	                      ))}
  	                    </TableBody>
  	                  </Table>

                      {modelPassportOpening ? (
                        <div
                          className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[1px]"
                          role="status"
                          aria-live="polite"
                        >
                          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 shadow-sm">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                            <p className="text-sm text-muted-foreground">
                              Opening <span className="font-medium text-foreground">{modelPassportOpening.name}</span>…
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
	                </CardContent>
	              </Card>
            </>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Case Walkthrough</CardTitle>
              <CardDescription>
                Split-view case explorer with server pagination. Use presets to jump to demo storyline cases.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-border bg-card/70 p-3 shadow-sm backdrop-blur-sm">
                <div className="grid gap-3 lg:grid-cols-12">
                  <div className="lg:col-span-5">
                    <Label htmlFor="case-search">Search</Label>
                    <div className="relative mt-1">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        id="case-search"
                        className="pl-9 pr-9"
                        value={draftFilters.q}
                        onChange={(event) => {
                          setActivePreset('');
                          setDraftFilters((current) => ({ ...current, q: event.target.value }));
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            applyFilters();
                            return;
                          }

                          if (event.key === 'Escape' && draftFilters.q) {
                            event.preventDefault();
                            setActivePreset('');
                            setDraftFilters((current) => ({ ...current, q: '' }));
                          }
                        }}
                        placeholder="Search event / encounter / patient"
                      />
                      {draftFilters.q ? (
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => {
                            setActivePreset('');
                            setDraftFilters((current) => ({ ...current, q: '' }));
                          }}
                          aria-label="Clear search"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="lg:col-span-3">
                    <Label htmlFor="case-model">Model</Label>
                    <Select
                      id="case-model"
                      className="mt-1"
                      value={draftFilters.model_id}
                      onChange={(event) => {
                        const modelId = event.target.value;
                        setModelFilterTouched(true);
                        setDraftFilters((current) => ({ ...current, model_id: modelId }));
                        setFilters((current) => ({ ...current, model_id: modelId }));
                        setPage(0);
                        setActivePreset('');
                      }}
                    >
                      <option value="">All models</option>
                      {(modelsQuery.data || []).map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="lg:col-span-2">
                    <Label htmlFor="case-source">Source</Label>
                    <Select
                      id="case-source"
                      className="mt-1"
                      value={draftFilters.source}
                      onChange={(event) => {
                        const source = event.target.value as DemoSource;
                        setSourceFilterTouched(true);
                        setActivePreset('');
                        setDraftFilters((current) => ({ ...current, source }));
                        setFilters((current) => ({ ...current, source }));
                        setPage(0);
                      }}
                    >
                      <option value="epic_sandbox">Epic Sandbox</option>
                      <option value="seeded_demo">Seeded Demo</option>
                    </Select>
                  </div>

                  <div className="lg:col-span-2">
                    <Label htmlFor="case-reason">Reason code</Label>
                    <Input
                      id="case-reason"
                      className="mt-1"
                      value={draftFilters.reason_code}
                      list="case-reason-options"
                      onChange={(event) => {
                        setActivePreset('');
                        setDraftFilters((current) => ({ ...current, reason_code: event.target.value }));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          applyFilters();
                        }
                      }}
                      placeholder="unit_mismatch"
                    />
                    {draftReasonHelpText ? (
                      <p className="mt-1 text-xs text-muted-foreground">{draftReasonHelpText}</p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Exact match (type to autocomplete).</p>
                    )}
                    <datalist id="case-reason-options">
                      {Object.keys(REASON_CODE_GLOSSARY)
                        .sort()
                        .map((reasonCode) => (
                          <option key={reasonCode} value={reasonCode} />
                        ))}
                    </datalist>
                  </div>

                  <div className="lg:col-span-12">
                    <Label>Time window</Label>
                    <div className="mt-1 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        {(
                          [
                            { value: 'any', label: 'Any' },
                            { value: '24h', label: '24h' },
                            { value: '7d', label: '7d' },
                            { value: '30d', label: '30d' },
                            { value: '90d', label: '90d' }
                          ] as const
                        ).map((option) => (
                          <Button
                            key={option.value}
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn(
                              'rounded-full',
                              timePreset === option.value && 'border-primary/40 bg-primary/10 text-foreground'
                            )}
                            onClick={() => applyTimePreset(option.value)}
                          >
                            {option.label}
                          </Button>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn('rounded-full', timePreset === 'custom' && 'border-primary/40 bg-primary/10 text-foreground')}
                          onClick={() => applyTimePreset('custom')}
                        >
                          Custom
                        </Button>
                      </div>
                      <div className="flex w-full min-w-0 items-center gap-2 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm xl:w-auto xl:max-w-[44rem]">
                        <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">Selected</span>
                        <span className="min-w-0 whitespace-normal break-words font-medium leading-snug text-foreground">
                          {draftTimeLabel}
                        </span>
                      </div>
                    </div>

                    {customTimeOpen ? (
                      <div className="mt-2 rounded-lg border border-border bg-background/60 p-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label htmlFor="case-start" className="text-xs text-muted-foreground">
                              Start (local time)
                            </Label>
                            <Input
                              id="case-start"
                              className="min-w-0"
                              type="datetime-local"
                              value={draftFilters.start_time}
                              onChange={(event) => {
                                setActivePreset('');
                                setTimePreset('custom');
                                setDraftFilters((current) => ({ ...current, start_time: event.target.value }));
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="case-end" className="text-xs text-muted-foreground">
                              End (local time)
                            </Label>
                            <Input
                              id="case-end"
                              className="min-w-0"
                              type="datetime-local"
                              value={draftFilters.end_time}
                              onChange={(event) => {
                                setActivePreset('');
                                setTimePreset('custom');
                                setDraftFilters((current) => ({ ...current, end_time: event.target.value }));
                              }}
                            />
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            onClick={() => {
                              setActivePreset('');
                              setTimePreset('custom');
                              const now = new Date();
                              now.setSeconds(0, 0);
                              setDraftFilters((current) => ({ ...current, end_time: toDatetimeLocalValue(now) }));
                            }}
                          >
                            Set end = now
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            onClick={() => applyTimePreset('any')}
                          >
                            Clear
                          </Button>
                          <p className="text-xs text-muted-foreground">Converted to UTC when sent to the API.</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <Separator className="my-3" />

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap items-center gap-1 rounded-full border border-border bg-muted/30 px-1 py-1">
                    <span className="px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      Scenario shortcuts
                    </span>
                    {STORYLINE_SHORTCUTS.map((shortcut) => (
                      <Button
                        key={shortcut.value}
                        type="button"
                        size="sm"
                        variant={activePreset === shortcut.value ? 'default' : 'outline'}
                        className="rounded-full"
                        onClick={() => applyPreset(shortcut.value)}
                      >
                        {shortcut.label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={activePreset} onChange={(event) => applyPreset(event.target.value)} className="max-w-[340px]">
                      <option value="">Demo presets</option>
                      {PRESETS.map((preset) => (
                        <option key={preset.value} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </Select>
                    <Button
                      onClick={applyFilters}
                      disabled={!hasPendingChanges}
                      className={cn('gap-2 rounded-full', hasPendingChanges && 'epic-cta-highlight')}
                    >
                      <Filter className="h-4 w-4" aria-hidden="true" />
                      Apply filters
                    </Button>
                    <Button type="button" variant="outline" className="rounded-full" onClick={resetFilters}>
                      Reset filters
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="gap-2 rounded-full"
                      onClick={() => void handleDemoReset()}
                      disabled={demoResetStatus === 'loading'}
                    >
                      {demoResetStatus === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                      Reset demo
                    </Button>
                    {activePresetLabel ? (
                      <Badge variant="outline">
                        {activePresetLabel}
                      </Badge>
                    ) : null}
                    {activePresetScenario ? (
                      <Badge
                        variant={
                          caseListLoading ? 'outline' : activePresetMatchIndex >= 0 ? 'success' : 'warning'
                        }
                      >
                        {caseListLoading
                          ? `Locating ${activePresetScenario.encounterId}...`
                          : activePresetMatchIndex >= 0
                            ? `Scenario ready: ${activePresetScenario.encounterId}`
                            : `Scenario missing: ${activePresetScenario.encounterId}`}
                      </Badge>
                    ) : null}
                    {demoResetStatus !== 'idle' ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          demoResetStatus === 'success' && 'border-emerald-300 bg-emerald-100 text-emerald-900',
                          demoResetStatus === 'error' && 'border-rose-300 bg-rose-100 text-rose-900',
                          demoResetStatus === 'loading' && 'border-amber-300 bg-amber-100 text-amber-900'
                        )}
                      >
                        {demoResetStatus === 'loading' ? 'Reset in progress' : demoResetStatus === 'success' ? 'Reset done' : 'Reset failed'}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                {demoResetMessage ? (
                  <p className="mt-2 text-xs text-muted-foreground">{demoResetMessage}</p>
                ) : null}
                {presetScenarioMissing && activePresetScenario ? (
                  <div className="mt-2 rounded-md border border-amber-300 bg-amber-50/70 p-2 text-xs">
                    <p className="font-medium text-amber-900">
                      {activePresetScenario.label} did not return {activePresetScenario.encounterId}.
                    </p>
                    <p className="mt-1 text-amber-900/90">
                      This usually means demo data drifted. Reapply shortcut or run Reset demo to restore deterministic cases.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => applyPreset(activePresetScenario.presetValue)}>
                        Reapply shortcut
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSourceFilterTouched(true);
                          setDraftFilters((current) => ({ ...current, source: 'seeded_demo' }));
                          setFilters((current) => ({ ...current, source: 'seeded_demo' }));
                          setPage(0);
                        }}
                      >
                        Switch to Seeded Demo
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void handleDemoReset()}>
                        Reset demo
                      </Button>
                    </div>
                  </div>
                ) : null}

                {filters.q.trim() ||
                filters.model_id ||
                filters.source ||
                filters.reason_code.trim() ||
                filters.start_time ||
                filters.end_time ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium text-muted-foreground">Active:</p>
                    {filters.q.trim() ? (
                      <Badge variant="outline" className="gap-1">
                        Search: <span className="max-w-[220px] truncate">{filters.q.trim()}</span>
                        <button
                          type="button"
                          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => clearAppliedFilter('q')}
                          aria-label="Clear search filter"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </Badge>
                    ) : null}
                    {filters.model_id ? (
                      <Badge variant="outline" className="gap-1">
                        Model: <span className="max-w-[220px] truncate">{appliedModelName ?? shortToken(filters.model_id)}</span>
                        <button
                          type="button"
                          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => {
                            setModelFilterTouched(true);
                            clearAppliedFilter('model_id');
                          }}
                          aria-label="Clear model filter"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </Badge>
                    ) : null}
                    {filters.source ? (
                      <Badge variant="outline" className="gap-1">
                        Source: {SOURCE_LABELS[filters.source]}
                        <button
                          type="button"
                          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => clearAppliedFilter('source')}
                          aria-label="Clear source filter"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </Badge>
                    ) : null}
                    {filters.reason_code.trim() ? (
                      <Badge variant="outline" className="gap-1">
                        Reason: <span className="max-w-[220px] truncate">{filters.reason_code.trim()}</span>
                        <button
                          type="button"
                          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => clearAppliedFilter('reason_code')}
                          aria-label="Clear reason code filter"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </Badge>
                    ) : null}
                    {filters.start_time || filters.end_time ? (
                      <Badge variant="outline" className="gap-1">
                        Time: <span className="max-w-[320px] truncate">{appliedTimeLabel}</span>
                        <button
                          type="button"
                          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={clearAppliedTimeRange}
                          aria-label="Clear time window filter"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {caseListError ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Case list failed</CardTitle>
                    <CardDescription>{caseListError}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={() => void fetchCases()}>Retry</Button>
                  </CardContent>
                </Card>
              ) : null}

              <div className="relative">
                <div
                  ref={caseListRef}
                  tabIndex={0}
                  className="flex h-full min-w-0 flex-col rounded-lg border border-border bg-background/70 p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onKeyDown={onCaseListKeyDown}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">Cases</p>
                      <Badge variant="outline" className="h-7 rounded-full px-2.5 text-xs">
                        Total: <span className="ml-1 font-medium tabular-nums text-foreground">{totalCases}</span>
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Arrow Up/Down or click to preview, Esc to close detail.</p>
                  </div>

                  {caseListLoading ? (
                    <p className="text-sm text-muted-foreground">Loading cases...</p>
                  ) : null}

                  {!caseListLoading && caseRows.length === 0 ? (
                    <div className="rounded-md border border-border bg-muted/25 p-3">
                      <p className="text-sm text-muted-foreground">No cases for selected filters.</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Try clearing filters or running Reset demo to restore deterministic storyline cases.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={resetFilters}>
                          Reset filters
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void handleDemoReset()}>
                          Reset demo
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {caseRows.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[160px]">When</TableHead>
                          <TableHead className="min-w-[220px]">Model</TableHead>
                          <TableHead className="min-w-[220px]">Encounter</TableHead>
                          <TableHead className="min-w-[180px]">Context</TableHead>
                          <TableHead className="min-w-[170px]">Outcome</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {caseRows.map((item, index) => {
                          const reasonHelpText = reasonCodeHelp(item.primary_reason_code);
                          const scoreDelta = formatDelta(item.score_value, item.threshold_applied);

                          return (
                            <TableRow
                              key={item.event_id}
                              className={cn('cursor-pointer', selectedIndex === index && 'bg-muted/60 ring-1 ring-primary/30')}
                              onClick={() => {
                                setSelectedIndex(index);
                                setDetailOpen(true);
                                caseListRef.current?.focus();
                              }}
                            >
                              <TableCell className="text-xs tabular-nums">{formatDateTime(item.created_at)}</TableCell>
                              <TableCell>
                                <p className="text-sm font-medium">{item.model_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {reasonHelpText ? (
                                    <Tooltip text={reasonHelpText}>{humanizeReasonCode(item.primary_reason_code)}</Tooltip>
                                  ) : (
                                    humanizeReasonCode(item.primary_reason_code)
                                  )}
                                </p>
                              </TableCell>
                              <TableCell className="text-xs">
                                <p className="font-medium">{item.encounter_id}</p>
                                <p className="text-[11px] text-muted-foreground" title={item.patient_id_hash || undefined}>
                                  Patient: {shortToken(item.patient_id_hash)}
                                </p>
                              </TableCell>
                              <TableCell className="text-xs">
                                <p className="font-medium">{item.location_unit}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {item.care_setting} • age {item.age ?? '-'}
                                </p>
                                <div className="mt-1">
                                  <SourceChip source={item.source} />
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <OutcomeChip outcome={item.outcome} />
                                  <p className="text-[11px] tabular-nums text-muted-foreground">
                                    score {formatNumber(item.score_value, 2)} / {formatNumber(item.threshold_applied, 2)}
                                    {scoreDelta ? ` (Δ ${scoreDelta})` : ''}
                                  </p>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : null}

                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        disabled={page === 0 || caseListLoading}
                        onClick={() => setPage((current) => current - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        disabled={(page + 1) * PAGE_SIZE >= totalCases || caseListLoading}
                        onClick={() => setPage((current) => current + 1)}
                      >
                        Next
                      </Button>
                      <Badge variant="outline" className="tabular-nums">
                        {page + 1}/{totalPages}
                      </Badge>
                    </div>

                  </div>
                </div>

                <SideDrawer
                  open={detailOpen}
                  onOpenChange={(nextOpen) => {
                    setDetailOpen(nextOpen);
                    if (!nextOpen) {
                      caseListRef.current?.focus();
                    }
                  }}
                  title="Case Detail"
                  actions={selectedCase ? <OutcomeChip outcome={selectedCase.outcome} /> : null}
                >
                  {!selectedCase ? <p className="text-sm text-muted-foreground">Select a case to review details.</p> : null}
                  {detailLoading ? <p className="text-sm text-muted-foreground">Loading case evidence...</p> : null}
                  {detailError ? <p className="text-sm text-rose-700">{detailError}</p> : null}

                  {selectedCase && detail && !detailLoading ? (
                    <div className="space-y-3 text-sm">
                      <div className="rounded-md border border-border bg-white/70 p-2">
                        <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Case summary</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant="outline" title={detail.event_context.event_id}>
                            Event: {shortToken(detail.event_context.event_id)}
                          </Badge>
                          <Badge variant="outline" title={selectedCase.model_id}>
                            Model: {shortToken(selectedCase.model_id)}
                          </Badge>
                          <SourceChip source={selectedCase.source} />
                          {(detail.event_context.patient_id_hash || selectedCase.patient_id_hash) ? (
                            <Badge
                              variant="outline"
                              title={String(detail.event_context.patient_id_hash || selectedCase.patient_id_hash)}
                            >
                              Patient: {shortToken(detail.event_context.patient_id_hash || selectedCase.patient_id_hash)}
                            </Badge>
                          ) : null}
                          {detail.event_context.config_version ? (
                            <Badge variant="outline">Config: {detail.event_context.config_version}</Badge>
                          ) : null}
                          {detail.decision_context?.policy_name ? (
                            <Badge variant="outline">
                              Policy: {detail.decision_context.policy_name}
                              {detail.decision_context.policy_version ? ` v${detail.decision_context.policy_version}` : ''}
                            </Badge>
                          ) : null}
                        </div>

                        <dl className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
                          <div className="min-w-0">
                            <dt className="text-[11px] font-medium text-muted-foreground">Event time</dt>
                            <dd className="mt-0.5 break-words tabular-nums">
                              {formatDateTime(detail.event_context.event_time || selectedCase.created_at)}
                            </dd>
                          </div>

                          <div className="min-w-0">
                            <dt className="text-[11px] font-medium text-muted-foreground">Encounter</dt>
                            <dd className="mt-0.5 break-words font-mono text-xs">{selectedCase.encounter_id}</dd>
                          </div>

                          <div className="min-w-0">
                            <dt className="text-[11px] font-medium text-muted-foreground">Unit</dt>
                            <dd className="mt-0.5 break-words">{detail.event_context.location_unit || selectedCase.location_unit}</dd>
                          </div>

                          <div className="min-w-0">
                            <dt className="text-[11px] font-medium text-muted-foreground">Care setting</dt>
                            <dd className="mt-0.5 break-words">
                              {detail.event_context.care_setting || selectedCase.care_setting}
                            </dd>
                          </div>

                          <div className="min-w-0">
                            <dt className="text-[11px] font-medium text-muted-foreground">Age</dt>
                            <dd className="mt-0.5 tabular-nums">{detail.event_context.age ?? selectedCase.age ?? '-'}</dd>
                          </div>

                          <div className="min-w-0">
                            <dt className="text-[11px] font-medium text-muted-foreground">Score / threshold</dt>
                            <dd className="mt-0.5 tabular-nums">
                              <span className="font-medium">
                                {formatNumber(detail.event_context.score_value ?? selectedCase.score_value, 2)}
                              </span>{' '}
                              <span className="text-muted-foreground">/</span>{' '}
                              <span className="font-medium">
                                {formatNumber(
                                  detail.event_context.threshold_applied ?? selectedCase.threshold_applied,
                                  2
                                )}
                              </span>
                              {(() => {
                                const delta = formatDelta(
                                  detail.event_context.score_value ?? selectedCase.score_value,
                                  detail.event_context.threshold_applied ?? selectedCase.threshold_applied
                                );
                                return delta ? <span className="text-muted-foreground"> (Δ {delta})</span> : null;
                              })()}
                            </dd>
                          </div>

                          <div className="min-w-0 col-span-full">
                            <dt className="text-[11px] font-medium text-muted-foreground">Primary reason</dt>
                            <dd className="mt-0.5 break-words">
                              {(() => {
                                const reasonCode = selectedCase.primary_reason_code || 'review_required';
                                const label = humanizeReasonCode(reasonCode);
                                const help = reasonCodeHelp(reasonCode);
                                return (
                                  <span className="flex flex-wrap items-center gap-2">
                                    <span>{help ? <Tooltip text={help}>{label}</Tooltip> : label}</span>
                                    <span className="font-mono text-xs text-muted-foreground">{reasonCode}</span>
                                  </span>
                                );
                              })()}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      {caseOutcome === 'ABSTAIN' ? (
                        <div className="rounded-md border border-slate-300 bg-slate-50/90 p-3">
                          <p className="text-xs uppercase tracking-[0.1em] text-slate-700">Intended use vs Current context</p>
                          <p className="mt-1 text-xs text-slate-700">
                            ABSTAIN means this model should stay silent in this context.
                          </p>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            <div className="rounded border border-slate-200 bg-white p-2">
                              <p className="text-[11px] font-medium text-muted-foreground">Intended use (policy boundary)</p>
                              <div className="mt-2 space-y-1 text-xs">
                                <p>
                                  <span className="font-medium text-foreground">Age:</span>{' '}
                                  {formatAgeBoundary(intendedUseBoundary)}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">Care setting:</span>{' '}
                                  {formatCareSettingBoundary(intendedUseBoundary)}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">Unit:</span> {formatUnitBoundary(intendedUseBoundary)}
                                </p>
                              </div>
                            </div>
                            <div className="rounded border border-slate-200 bg-white p-2">
                              <p className="text-[11px] font-medium text-muted-foreground">Current context (this case)</p>
                              <div className="mt-2 space-y-1 text-xs">
                                <p>
                                  <span className="font-medium text-foreground">Age:</span>{' '}
                                  {detail.event_context.age ?? selectedCase.age ?? '-'}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">Care setting:</span>{' '}
                                  {detail.event_context.care_setting || selectedCase.care_setting || '-'}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">Unit:</span>{' '}
                                  {detail.event_context.location_unit || selectedCase.location_unit || '-'}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 rounded border border-slate-200 bg-white p-2">
                            <p className="text-[11px] font-medium text-muted-foreground">Triggered boundary rule</p>
                            {outOfScopeCodes.length === 0 ? (
                              <p className="mt-1 text-xs text-muted-foreground">No explicit out-of-scope reason code on this event.</p>
                            ) : (
                              <div className="mt-2 space-y-1">
                                {outOfScopeCodes.map((code) => (
                                  <div key={code} className="flex flex-wrap items-center gap-2 text-xs">
                                    <Badge variant="outline">{humanizeReasonCode(code)}</Badge>
                                    <span className="font-mono text-[11px] text-muted-foreground">{code}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <p className="mt-2 text-xs">
                              <span className="font-medium text-foreground">Recommended action:</span> {recommendedAction}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Link href={policyBoundaryHref}>
                                <Button size="sm" variant="outline">Open Policy Boundary</Button>
                              </Link>
                              <Link href={`/audit?event_id=${encodeURIComponent(selectedCase.event_id)}`}>
                                <Button size="sm" variant="outline">Open Audit Vault</Button>
                              </Link>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {patientSummaryEvidence ? (
                        <div className="rounded-md border border-border bg-white/70 p-2">
                          <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                            FHIR patient summary evidence
                          </p>
                          <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                            <p>FHIR issuer: {patientSummaryEvidence.fhir_iss || '-'}</p>
                            <p>
                              Captured at:{' '}
                              {patientSummaryEvidence.captured_at
                                ? formatDateTime(patientSummaryEvidence.captured_at)
                                : '-'}
                            </p>
                            <p>Encounter: {patientSummaryEvidence.encounter?.id || selectedCase.encounter_id}</p>
                            <p>
                              Unit / setting: {patientSummaryEvidence.encounter?.unit_name || selectedCase.location_unit} /{' '}
                              {patientSummaryEvidence.encounter?.care_setting || selectedCase.care_setting}
                            </p>
                          </div>

                          <div className="mt-2">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Metric</TableHead>
                                  <TableHead>Value</TableHead>
                                  <TableHead>Unit</TableHead>
                                  <TableHead>Observed</TableHead>
                                  <TableHead>Source</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {patientSummaryEvidence.observations.map((row) => (
                                  <TableRow key={`${row.metric}-${row.observation_id || row.source || 'obs'}`}>
                                    <TableCell className="font-medium">{row.metric}</TableCell>
                                    <TableCell>{valuePreview(row.value)}</TableCell>
                                    <TableCell>{row.unit || '-'}</TableCell>
                                    <TableCell>{row.observed_at ? formatDateTime(row.observed_at) : '-'}</TableCell>
                                    <TableCell>{row.source || '-'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                            {patientSummaryEvidence.missing_fields.length > 0 ? (
                              <p className="mt-2 text-xs text-amber-700">
                                Missing metrics: {patientSummaryEvidence.missing_fields.join(', ')}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {unitMismatchEvidence ? (
                        <div className="rounded-md border border-zinc-300 bg-zinc-50/80 p-3">
                          <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                            Expected unit vs Observed unit
                          </p>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            <div className="rounded border border-border bg-background p-2">
                              <p className="text-[11px] font-medium text-muted-foreground">Expected unit</p>
                              <p className="mt-1 text-sm font-semibold">{unitMismatchEvidence.expected_unit || '-'}</p>
                            </div>
                            <div className="rounded border border-border bg-background p-2">
                              <p className="text-[11px] font-medium text-muted-foreground">Observed unit</p>
                              <p className="mt-1 text-sm font-semibold">{unitMismatchEvidence.observed_unit || '-'}</p>
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Field: <span className="font-medium">{unitMismatchEvidence.field_name}</span>
                          </p>
                          {unitMismatchEvidence.sample_values.length > 0 ? (
                            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                              <p className="font-medium text-foreground">Sample value(s)</p>
                              {unitMismatchEvidence.sample_values.map((sample) => (
                                <p key={sample}>• {sample}</p>
                              ))}
                            </div>
                          ) : null}
                          <p className="mt-2 text-xs text-muted-foreground">
                            HOLD is a stop-button here: pause this case and fix data/unit mapping before operational reuse.
                          </p>
                        </div>
                      ) : null}

                      <div className="rounded-md border border-border bg-white/70 p-2">
                        <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                          Checks affecting outcome
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Gates below did not PASS and contributed to the policy decision.
                        </p>
                        {failedGates.length === 0 ? (
                          <p className="mt-2 text-xs text-muted-foreground">No non-pass gates for this event.</p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {failedGates.map((gate) => {
                              const drift = gate.gate_name === 'Drift' ? parseDriftEvidence(gate.evidence || {}) : null;
                              const driftSignals = drift ? buildDriftSignalSummaries(drift) : [];
                              return (
                                <div
                                  key={`${gate.gate_name}-${gate.status}`}
                                  className="rounded border border-border bg-background p-2"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="font-medium">{gate.gate_name}</p>
                                    <GateChip status={gate.status} />
                                  </div>
                                  <p className="text-xs text-muted-foreground">{gate.explanation}</p>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {(gate.reason_codes || []).map((code) => (
                                      <Badge
                                        key={`${gate.gate_name}-${code}`}
                                        variant="outline"
                                        title={reasonCodeHelp(code) || undefined}
                                      >
                                        {code}
                                      </Badge>
                                    ))}
                                  </div>

                                  {drift ? (
                                    <div className="mt-2 rounded border border-border bg-muted/30 p-2 text-xs">
                                      <p className="text-xs font-medium">Drift signals</p>
                                      <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
                                        {driftSignals.map((signal) => {
                                          const currentValue =
                                            signal.current_value === null
                                              ? '-'
                                              : `${formatNumber(signal.current_value, signal.decimals)}${signal.suffix}`;
                                          const cautionThreshold =
                                            signal.caution_threshold === null
                                              ? '-'
                                              : `${formatNumber(signal.caution_threshold, signal.decimals)}${signal.suffix}`;
                                          const holdThreshold =
                                            signal.hold_threshold === null
                                              ? null
                                              : `${formatNumber(signal.hold_threshold, signal.decimals)}${signal.suffix}`;
                                          return (
                                            <div key={signal.id} className="rounded border border-border bg-background p-2">
                                              <div className="flex items-center justify-between gap-2">
                                                <p className="text-[11px] font-medium">
                                                  <Tooltip text={signal.context_text}>
                                                    {signal.operator_label} ({signal.metric_label})
                                                  </Tooltip>
                                                </p>
                                                <Badge variant={driftSignalStatusBadgeVariant(signal.status)}>
                                                  {driftSignalStatusText(signal.status)}
                                                </Badge>
                                              </div>
                                              <p className="mt-1 text-sm font-semibold tabular-nums">{currentValue}</p>
                                              <p className="text-[11px] text-muted-foreground">
                                                Current {currentValue} vs CAUTION threshold {cautionThreshold}
                                                {holdThreshold ? ` and HOLD threshold ${holdThreshold}` : ''}
                                              </p>
                                            </div>
                                          );
                                        })}

                                        <div className="rounded border border-border bg-background p-2">
                                          <p className="text-[11px] font-medium">
                                            <Tooltip text="Operator review load (alert burden): compare baseline vs current workload to spot triage pressure shifts.">
                                              Operator review load (alert burden)
                                            </Tooltip>
                                          </p>
                                          <p className="mt-1 text-sm font-semibold tabular-nums">
                                            {formatNumber(drift.baseline_alert_burden, 2)} → {formatNumber(drift.recent_alert_burden, 2)}
                                          </p>
                                          <p className="text-[11px] text-muted-foreground">
                                            Baseline → current workload while scoring remains active under CAUTION controls.
                                          </p>
                                        </div>

                                        <div className="rounded border border-border bg-background p-2">
                                          <p className="text-[11px] font-medium">Samples</p>
                                          <p className="mt-1 text-sm font-semibold tabular-nums">
                                            {formatNumber(drift.baseline_samples, 0)} baseline / {formatNumber(drift.recent_samples, 0)} recent
                                          </p>
                                        </div>
                                      </div>

		                                      <div className="mt-2 flex flex-wrap gap-2">
		                                        <Link href={driftWorkspaceHref}>
		                                          <Button
		                                            variant="default"
		                                            size="sm"
		                                            className="shadow-sm ring-1 ring-primary/40 ring-offset-1 ring-offset-background"
		                                          >
		                                            Open Drift Workspace
		                                          </Button>
		                                        </Link>
		                                        <Link href={caseChangeProposalHref}>
		                                          <Button size="sm" variant="outline">Create Change Proposal (prefilled)</Button>
		                                        </Link>
		                                      </div>
                                    </div>
                                  ) : null}

                                  <details className="mt-2 rounded border border-border bg-muted/30 p-2 text-xs">
                                    <summary className="cursor-pointer text-muted-foreground">Raw evidence</summary>
                                    <div className="mt-2 space-y-1">
                                      {Object.keys(gate.evidence || {}).length === 0 ? (
                                        <p className="text-muted-foreground">No evidence payload.</p>
                                      ) : (
                                        Object.entries(gate.evidence || {}).map(([key, value]) => (
                                          <p key={`${gate.gate_name}-${key}`}>
                                            <span className="font-medium">{key}:</span> {valuePreview(value)}
                                          </p>
                                        ))
                                      )}
                                    </div>
                                  </details>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="rounded-md border border-primary/30 bg-primary/5 p-2">
                        <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Policy outcome + recommended action</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <OutcomeChip outcome={detail.policy_decision?.outcome || selectedCase.outcome} />
                          {(detail.policy_decision?.reason_codes || [selectedCase.primary_reason_code || 'review_required']).map(
                            (reasonCode) => (
                              <div key={reasonCode} className="flex items-center gap-1">
                                <Badge variant="outline" title={reasonCodeHelp(reasonCode) || undefined}>
                                  {humanizeReasonCode(reasonCode)}
                                </Badge>
                                <span className="font-mono text-[11px] text-muted-foreground">{reasonCode}</span>
                              </div>
                            )
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {detail.policy_decision?.explanation || 'Policy explanation unavailable.'}
                        </p>
                        {caseOutcome === 'CAUTION' && caseDriftSignals.length > 0 ? (
                          <div className="mt-2 space-y-2 rounded-md border border-amber-300 bg-amber-50/70 p-2 text-xs">
                            {caseDriftEvidence ? (
                              <div className="rounded border border-amber-200 bg-white/85 p-2">
                                <p className="font-medium text-amber-900">Cohort context (baseline vs recent)</p>
                                <p className="mt-1 text-amber-900/90">
                                  Drift evidence compares deterministic baseline and recent cohorts seeded by demo reset.
                                </p>
                                <div className="mt-2 grid gap-2 md:grid-cols-3">
                                  <div className="rounded border border-amber-200 bg-white p-2">
                                    <p className="font-medium text-amber-900">Baseline cohort</p>
                                    <p className="mt-1 text-amber-900/90 tabular-nums">
                                      {formatNumber(caseDriftEvidence.baseline_samples, 0)} samples
                                    </p>
                                    <p className="text-amber-900/80 tabular-nums">
                                      Alert burden {formatNumber(caseDriftEvidence.baseline_alert_burden, 2)}
                                    </p>
                                  </div>
                                  <div className="rounded border border-amber-200 bg-white p-2">
                                    <p className="font-medium text-amber-900">Recent cohort</p>
                                    <p className="mt-1 text-amber-900/90 tabular-nums">
                                      {formatNumber(caseDriftEvidence.recent_samples, 0)} samples
                                    </p>
                                    <p className="text-amber-900/80 tabular-nums">
                                      Alert burden {formatNumber(caseDriftEvidence.recent_alert_burden, 2)}
                                    </p>
                                  </div>
                                  <div className="rounded border border-amber-200 bg-white p-2">
                                    <p className="font-medium text-amber-900">Observed shift</p>
                                    <p className="mt-1 text-amber-900/90 tabular-nums">
                                      Patient-mix drift (PSI) {formatNumber(caseDriftEvidence.psi, 3)} / Score-shape drift (KS){' '}
                                      {formatNumber(caseDriftEvidence.ks_stat, 3)}
                                    </p>
                                    <p className="text-amber-900/80 tabular-nums">
                                      Review-load change (alert delta) {formatNumber(caseDriftEvidence.alert_delta_pct, 2)}%
                                    </p>
                                    {caseDriftEvidence.alert_delta_note ? (
                                      <p className="mt-1 text-[11px] text-amber-900/80">{caseDriftEvidence.alert_delta_note}</p>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                            <p className="font-semibold text-amber-900">Why this is CAUTION, not HOLD</p>
                            <p className="text-amber-900/90">
                              System scoring is still active. This case passed hard-stop checks, but drift signals show the operating context
                              changed from baseline.
                            </p>
                            <div className="grid gap-2 md:grid-cols-3">
                              <div className="rounded border border-amber-200 bg-white/80 p-2">
                                <p className="font-medium text-amber-900">What changed</p>
                                {changedSignals.length > 0 ? (
                                  <div className="mt-1 space-y-1 text-amber-900/90">
                                    {changedSignals.map((signal) => {
                                      const currentValue =
                                        signal.current_value === null
                                          ? '-'
                                          : `${formatNumber(signal.current_value, signal.decimals)}${signal.suffix}`;
                                      const cautionThreshold =
                                        signal.caution_threshold === null
                                          ? '-'
                                          : `${formatNumber(signal.caution_threshold, signal.decimals)}${signal.suffix}`;
                                      return (
                                        <p key={`changed-${signal.id}`}>
                                          {signal.operator_label}: current {currentValue} vs CAUTION {cautionThreshold}
                                        </p>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="mt-1 text-amber-900/90">No drift metric crossed CAUTION thresholds in this snapshot.</p>
                                )}
                              </div>
                              <div className="rounded border border-amber-200 bg-white/80 p-2">
                                <p className="font-medium text-amber-900">Why not HOLD</p>
                                {holdSignals.length === 0 ? (
                                  <p className="mt-1 text-amber-900/90">
                                    No drift signal crossed HOLD boundary, and no hard-stop boundary violation was triggered.
                                  </p>
                                ) : (
                                  <p className="mt-1 text-amber-900/90">
                                    Policy-priority note: HOLD-level PSI was observed, but this policy maps drift-only
                                    escalation to CAUTION for controlled investigation unless a hard-stop gate fails.
                                  </p>
                                )}
                              </div>
                              <div className="rounded border border-amber-200 bg-white/80 p-2">
                                <p className="font-medium text-amber-900">Why attention is required now</p>
                                <p className="mt-1 text-amber-900/90">
                                  {cautionSignals.length > 0
                                    ? 'Policy CAUTION thresholds were crossed; investigate drift source, capture evidence, and decide whether to tune threshold.'
                                    : 'Drift signals remain near baseline but this outcome still requires routine follow-up and audit confirmation.'}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {detail.decision_context?.policy_name ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Policy: {detail.decision_context.policy_name}
                            {detail.decision_context.policy_version ? ` v${detail.decision_context.policy_version}` : ''}
                          </p>
                        ) : null}
                        {primaryOutOfScopeCode ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Triggered ABSTAIN rule: {humanizeReasonCode(primaryOutOfScopeCode)} ({primaryOutOfScopeCode})
                          </p>
                        ) : null}
                        <p className="mt-2 text-sm font-medium">
                          Recommended action: {recommendedAction}
                        </p>
                      </div>

                      <div className="rounded-md border border-sky-300 bg-sky-50/70 p-2">
                        <p className="text-xs uppercase tracking-[0.1em] text-sky-900">Lineage chain</p>
                        <p className="mt-1 text-xs text-sky-900/90">
                          Source event → policy decision → incident → change proposal.
                        </p>
                        <div className="mt-2 space-y-2 text-xs">
                          <div className="rounded border border-sky-200 bg-white/90 p-2">
                            <p className="font-medium text-sky-900">1. Source event</p>
                            <p className="mt-1 text-sky-900/90">Event {selectedCase.event_id} started this case chain.</p>
                            <div className="mt-2">
                              <Link href={`/audit?event_id=${encodeURIComponent(selectedCase.event_id)}`}>
                                <Button size="sm" variant="outline">Open source event in Audit</Button>
                              </Link>
                            </div>
                          </div>

                          <div className="rounded border border-sky-200 bg-white/90 p-2">
                            <p className="font-medium text-sky-900">2. Policy decision</p>
                            <p className="mt-1 text-sky-900/90">
                              Outcome {detail.policy_decision?.outcome || selectedCase.outcome} with reason{' '}
                              {(detail.policy_decision?.reason_codes || [selectedCase.primary_reason_code || 'review_required']).join(', ')}.
                            </p>
                          </div>

                          <div className="rounded border border-sky-200 bg-white/90 p-2">
                            <p className="font-medium text-sky-900">3. Incident</p>
                            {linkedIncident ? (
                              <div className="mt-1 space-y-1 text-sky-900/90">
                                <p>
                                  Linked incident {linkedIncident.id} is currently {incidentStatusForDisplay(linkedIncident.status)}.
                                </p>
                                <Link href="/incidents">
                                  <Button size="sm" variant="outline">Open incident queue</Button>
                                </Link>
                              </div>
                            ) : (
                              <p className="mt-1 text-sky-900/90">No incident yet for this case.</p>
                            )}
                          </div>

                          <div className="rounded border border-sky-200 bg-white/90 p-2">
                            <p className="font-medium text-sky-900">4. Change proposal</p>
                            {changesQuery.loading && !changesQuery.data ? (
                              <p className="mt-1 text-sky-900/90">Loading proposal linkage...</p>
                            ) : changesQuery.error ? (
                              <p className="mt-1 text-sky-900/90">Unable to read proposals: {changesQuery.error}</p>
                            ) : linkedChangeProposals.length > 0 ? (
                              <div className="mt-1 space-y-2 text-sky-900/90">
                                {linkedChangeProposals.slice(0, 2).map((proposal) => (
                                  <div key={proposal.id} className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline">Proposal {shortToken(proposal.id)}</Badge>
                                    <Badge variant="outline">{proposal.status}</Badge>
                                    <span>{proposal.title}</span>
                                    <Link
                                      href={`/changes?change_id=${encodeURIComponent(proposal.id)}&event_id=${encodeURIComponent(
                                        selectedCase.event_id
                                      )}`}
                                    >
                                      <Button size="sm" variant="outline">Open proposal</Button>
                                    </Link>
                                  </div>
                                ))}
                                {linkedChangeProposals.length > 2 ? (
                                  <p className="text-[11px] text-muted-foreground">
                                    +{linkedChangeProposals.length - 2} more linked proposal(s).
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <div className="mt-1 space-y-2 text-sky-900/90">
                                <p>No proposal yet for this case lineage.</p>
                                <Link href={caseChangeProposalHref}>
                                  <Button size="sm" variant="outline">Create linked proposal</Button>
                                </Link>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-md border border-border bg-white/70 p-2">
                        <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Incident escalation</p>
                        {linkedIncident ? (
                          <div className="mt-2 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={incidentStatusBadgeVariant(incidentStatusForDisplay(linkedIncident.status))}>
                                {incidentStatusForDisplay(linkedIncident.status)}
                              </Badge>
                              <Badge variant="outline" title={linkedIncident.id}>
                                Incident: {shortToken(linkedIncident.id)}
                              </Badge>
                              <Badge variant="outline">{linkedIncident.severity}</Badge>
                              {linkedIncident.updated_at ? (
                                <span className="text-xs text-muted-foreground">
                                  Updated: {formatDateTime(linkedIncident.updated_at)}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">{linkedIncident.title}</p>
                            {linkedIncident.rca_notes ? (
                              <p className="text-xs text-muted-foreground">Notes: {linkedIncident.rca_notes}</p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">
                            No linked incident yet for this case.
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => void handleOpenIncident()}
                            disabled={incidentActionLoading || !canRunMutatingActions || (!linkedIncident && selectedCase.outcome !== 'HOLD')}
                          >
                            {incidentActionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Open incident
                          </Button>
                          {linkedIncident ? (
                            <Link href="/incidents">
                              <Button size="sm" variant="outline">Open incident queue</Button>
                            </Link>
                          ) : null}
                        </div>

                        {!canRunMutatingActions ? (
                          <p className="mt-2 text-xs text-muted-foreground">{writeRoleHelpText}</p>
                        ) : null}

                        {linkedIncident ? (
                          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                            <div>
                              <Label htmlFor="incident-status">Status</Label>
                              <Select
                                id="incident-status"
                                value={incidentStatusDraft}
                                onChange={(event) => setIncidentStatusDraft(event.target.value as IncidentStatusOption)}
                              >
                                {INCIDENT_STATUS_OPTIONS.map((statusOption) => (
                                  <option key={statusOption} value={statusOption}>
                                    {statusOption}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="flex items-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handleIncidentStatusUpdate()}
                                disabled={
                                  incidentActionLoading ||
                                  !canRunMutatingActions ||
                                  incidentStatusForApi(incidentStatusDraft) === linkedIncident.status
                                }
                              >
                                Update status
                              </Button>
                            </div>
                            <div className="md:col-span-2">
                              <Label htmlFor="incident-note">Add note</Label>
                              <Input
                                id="incident-note"
                                value={incidentNoteDraft}
                                onChange={(event) => setIncidentNoteDraft(event.target.value)}
                                placeholder="What did we verify, and what is next?"
                              />
                            </div>
                            <div className="md:col-span-2 flex justify-end">
                              <Button
                                size="sm"
                                onClick={() => void handleIncidentNoteAdd()}
                                disabled={incidentActionLoading || !canRunMutatingActions || !incidentNoteDraft.trim()}
                              >
                                Add note
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-md border border-border bg-white/70 p-2">
                        <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                          Reason codes (what they mean)
                        </p>
                        {(() => {
                          const codes = new Set<string>();
                          if (selectedCase.primary_reason_code) codes.add(selectedCase.primary_reason_code);
                          (detail.policy_decision?.reason_codes || []).forEach((code) => codes.add(code));
                          failedGates.forEach((gate) => (gate.reason_codes || []).forEach((code) => codes.add(code)));
                          const list = Array.from(codes);
                          if (list.length === 0) {
                            return <p className="mt-2 text-xs text-muted-foreground">No reason codes recorded.</p>;
                          }

                          return (
                            <div className="mt-2 space-y-2 text-xs">
                              {list.map((code) => (
                                <div key={code} className="rounded border border-border bg-background p-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline">{humanizeReasonCode(code)}</Badge>
                                    <span className="font-mono text-[11px] text-muted-foreground">{code}</span>
                                  </div>
                                  <p className="mt-1 text-muted-foreground">
                                    {reasonCodeHelp(code) || 'No glossary entry yet; see gate/policy explanation above.'}
                                  </p>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>

		                      <div className="flex flex-wrap gap-2">
		                        <Link href={`/audit?event_id=${encodeURIComponent(selectedCase.event_id)}`}>
		                          <Button variant="outline">Open Audit Vault</Button>
		                        </Link>
			                        <Link href={`/models/${selectedCase.model_id}`}>
			                          <Button variant="outline">Open Model Passport</Button>
			                        </Link>
			                        <Link href={driftWorkspaceHref}>
			                          <Button
			                            variant="default"
			                            className={cn(
			                              driftGateFailed
			                                ? 'shadow-sm ring-2 ring-primary/40 ring-offset-2 ring-offset-background'
			                                : null
			                            )}
			                          >
			                            Open Drift Workspace
			                          </Button>
			                        </Link>
			                        <Link href={caseChangeProposalHref}>
			                          <Button variant="outline">Create Change Proposal</Button>
			                        </Link>
			                      </div>
		                    </div>
		                  ) : null}
                </SideDrawer>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

export default function ControlTowerPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading control tower...</p>}>
      <ControlTowerPageContent />
    </Suspense>
  );
}
