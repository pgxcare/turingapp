'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { GateChip, OutcomeChip, SourceChip, StatusLegend } from '@/components/features/status-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

type AuditEvent = {
  id: string;
  category: string;
  action: string;
  actor: string;
  entity_type: string;
  entity_id: string;
  model_id: string | null;
  encounter_id: string | null;
  patient_id_hash: string | null;
  source: 'seeded_demo' | 'epic_sandbox';
  outcome?: 'ALLOW' | 'CAUTION' | 'ABSTAIN' | 'HOLD';
  primary_reason_code?: string | null;
  created_at: string;
};

type AuditCaseListPayload = {
  items: Array<{
    event_id: string;
    created_at: string;
    model_id: string;
    model_name: string;
    encounter_id: string;
    patient_id_hash: string | null;
    outcome: 'ALLOW' | 'CAUTION' | 'ABSTAIN' | 'HOLD';
    primary_reason_code: string | null;
    source: 'seeded_demo' | 'epic_sandbox';
  }>;
  total: number;
};

type EventDetail = {
  event: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  event_context: Record<string, unknown>;
  decision_context?: Record<string, unknown> | null;
  gates: Array<{
    gate_name: string;
    status: string;
    reason_codes: string[];
    explanation: string;
    evidence: Record<string, unknown>;
  }>;
  policy_decision?: {
    outcome: string;
    reason_codes: string[];
    explanation: string;
    evidence: Record<string, unknown>;
  };
  related_actions: Array<{ id: string; event_time: string; context: Record<string, unknown> }>;
  outcomes: Array<{ id: string; event_time: string; context: Record<string, unknown> }>;
  incidents: Array<{ id: string; status: string; title: string; severity: string; rca_notes: string }>;
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

type AuditFilters = {
  q: string;
  model_id: string;
  source: 'seeded_demo' | 'epic_sandbox';
  outcome: string;
  gate_name: string;
  reason_code: string;
  start_time: string;
  end_time: string;
};

const EMPTY_FILTERS: AuditFilters = {
  q: '',
  model_id: '',
  source: 'epic_sandbox',
  outcome: '',
  gate_name: '',
  reason_code: '',
  start_time: '',
  end_time: ''
};

const AUDIT_CASE_LIMIT = 200;

const OUT_OF_SCOPE_REASON_CODES = ['age_out_of_scope', 'unit_out_of_scope', 'care_setting_out_of_scope'] as const;

const REASON_CODE_LABELS: Record<string, string> = {
  age_out_of_scope: 'Age outside approved cohort',
  unit_out_of_scope: 'Unit outside approved deployment',
  care_setting_out_of_scope: 'Care setting outside approved workflow'
};

const REASON_CODE_RECOMMENDED_ACTION: Record<string, string> = {
  age_out_of_scope: 'Suppress in this context and reroute to an age-appropriate workflow. Do not display model output.',
  unit_out_of_scope: 'Suppress in this context and reroute to an approved unit workflow. Do not display model output.',
  care_setting_out_of_scope: 'Suppress in this context and reroute to an approved care-setting workflow. Do not display model output.'
};

function buildQuery(filters: AuditFilters) {
  const params = new URLSearchParams();
  params.set('limit', String(AUDIT_CASE_LIMIT));
  params.set('offset', '0');
  Object.entries(filters).forEach(([key, value]) => {
    if (!value.trim()) return;
    if ((key === 'start_time' || key === 'end_time') && value) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        params.append(key, date.toISOString());
        return;
      }
    }
    params.append(key, value.trim());
  });
  const qs = params.toString();
  return qs ? `/audit/cases?${qs}` : '/audit/cases';
}

function toAuditEvent(caseItem: AuditCaseListPayload['items'][number]): AuditEvent {
  return {
    id: caseItem.event_id,
    category: 'prediction',
    action: 'prediction_ingested',
    actor: 'policy_engine',
    entity_type: 'prediction_event',
    entity_id: caseItem.event_id,
    model_id: caseItem.model_id,
    encounter_id: caseItem.encounter_id,
    patient_id_hash: caseItem.patient_id_hash,
    source: caseItem.source,
    outcome: caseItem.outcome,
    primary_reason_code: caseItem.primary_reason_code,
    created_at: caseItem.created_at
  };
}

function formatDateTimeLocal(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function valuePreview(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
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

function humanizeReasonCode(reasonCode: string): string {
  if (REASON_CODE_LABELS[reasonCode]) return REASON_CODE_LABELS[reasonCode];
  return reasonCode.replace(/_/g, ' ');
}

function outOfScopeReasonCodes(reasonCodes: string[]): string[] {
  return reasonCodes.filter((code) => (OUT_OF_SCOPE_REASON_CODES as readonly string[]).includes(code));
}

function primaryOutOfScopeReasonCode(reasonCodes: string[]): string | null {
  for (const code of OUT_OF_SCOPE_REASON_CODES) {
    if (reasonCodes.includes(code)) return code;
  }
  return null;
}

function recommendedActionForCase(
  outcome: 'ALLOW' | 'CAUTION' | 'ABSTAIN' | 'HOLD',
  reasonCodes: string[]
): string {
  const reasonCode = primaryOutOfScopeReasonCode(reasonCodes);
  if (reasonCode && REASON_CODE_RECOMMENDED_ACTION[reasonCode]) {
    return REASON_CODE_RECOMMENDED_ACTION[reasonCode];
  }
  if (outcome === 'ABSTAIN') return 'Do not display model output for this context; route to manual clinical workflow.';
  if (outcome === 'HOLD') return 'Pause this case and escalate mapping/data-quality correction.';
  if (outcome === 'CAUTION') return 'Continue with caution and investigate drift or workflow changes.';
  return 'Proceed with standard monitoring.';
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

function extractPatientSummaryEvidence(details: EventDetail | null): PatientSummaryEvidence | null {
  if (!details || typeof details.event_context !== 'object' || !details.event_context) return null;
  const context = details.event_context as Record<string, unknown>;
  const candidate = context.patient_summary;

  if (candidate && typeof candidate === 'object') {
    const payload = candidate as Record<string, unknown>;
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

  const fallbackRows = Array.isArray(context.fhir_observations) ? context.fhir_observations : [];
  if (fallbackRows.length === 0) return null;

  const observations: PatientSummaryObservationEvidence[] = fallbackRows
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      metric: asStringOrNull(item.metric) || 'unknown',
      observation_id: asStringOrNull(item.id),
      code: asStringOrNull(item.code),
      value:
        typeof item.value === 'number' || typeof item.value === 'string'
          ? item.value
          : null,
      unit: asStringOrNull(item.unit),
      observed_at: asStringOrNull(item.time),
      source: 'legacy_context',
    }));

  return {
    captured_at: null,
    fhir_iss: null,
    encounter: null,
    observations,
    missing_fields: [],
  };
}

function AuditVaultPageContent() {
  const searchParams = useSearchParams();
  const { pushToast } = useToast();
  const deepLinkedEventId = searchParams.get('event_id') || '';

  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [details, setDetails] = useState<EventDetail | null>(null);
  const [policies, setPolicies] = useState<PolicyDefinition[]>([]);
  const [allChanges, setAllChanges] = useState<ChangeProposalSummary[]>([]);
  const [changesLoading, setChangesLoading] = useState(false);
  const [changesError, setChangesError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [rawExpanded, setRawExpanded] = useState(false);
  const [patientSummaryRawExpanded, setPatientSummaryRawExpanded] = useState(false);
  const [expandedGateRaw, setExpandedGateRaw] = useState<Record<string, boolean>>({});
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [sourceFilterTouched, setSourceFilterTouched] = useState(false);
  const [deepLinkError, setDeepLinkError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get<PolicyDefinition[]>('/policies')
      .then((payload) => {
        if (cancelled) return;
        setPolicies(payload);
      })
      .catch(() => {
        if (cancelled) return;
        setPolicies([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setChangesLoading(true);
    setChangesError('');
    api
      .get<ChangeProposalSummary[]>('/changes')
      .then((payload) => {
        if (cancelled) return;
        setAllChanges(payload);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setAllChanges([]);
        setChangesError(requestError instanceof Error ? requestError.message : 'Failed to load change proposals');
      })
      .finally(() => {
        if (cancelled) return;
        setChangesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const search = useCallback(async (activeFilters: AuditFilters, preferredEventId?: string) => {
    try {
      setLoading(true);
      setError('');
      setDeepLinkError('');
      let effectiveFilters = activeFilters;
      let casePayload = await api.get<AuditCaseListPayload>(buildQuery(effectiveFilters));
      let payload = casePayload.items.map(toAuditEvent);

      if (!sourceFilterTouched && effectiveFilters.source === 'epic_sandbox' && payload.length === 0) {
        effectiveFilters = {
          ...effectiveFilters,
          source: 'seeded_demo'
        };
        setFilters(effectiveFilters);
        casePayload = await api.get<AuditCaseListPayload>(buildQuery(effectiveFilters));
        payload = casePayload.items.map(toAuditEvent);
        pushToast({
          title: 'Source fallback',
          description: 'Epic Sandbox is empty. Showing Seeded Demo audit events.',
          variant: 'info'
        });
      }

      const findPreferredEvent = (rows: AuditEvent[]) =>
        rows.find(
          (row) =>
            row.entity_type === 'prediction_event' &&
            (row.entity_id === preferredEventId || row.id === preferredEventId)
        ) || null;

      if (preferredEventId) {
        let deepLinkMatch = findPreferredEvent(payload);
        if (!deepLinkMatch) {
          const alternateSource = effectiveFilters.source === 'epic_sandbox' ? 'seeded_demo' : 'epic_sandbox';
          const alternateFilters: AuditFilters = {
            ...EMPTY_FILTERS,
            source: alternateSource
          };
          const alternateCasePayload = await api.get<AuditCaseListPayload>(buildQuery(alternateFilters));
          const alternatePayload = alternateCasePayload.items.map(toAuditEvent);
          deepLinkMatch = findPreferredEvent(alternatePayload);
          if (deepLinkMatch) {
            payload = alternatePayload;
            casePayload = alternateCasePayload;
            effectiveFilters = alternateFilters;
            setFilters(alternateFilters);
            pushToast({
              title: 'Deep link source fallback',
              description: `Event found in ${alternateSource === 'seeded_demo' ? 'Seeded Demo' : 'Epic Sandbox'}.`,
              variant: 'info'
            });
          }
        }

        if (!deepLinkMatch) {
          setDeepLinkError(`Event ${preferredEventId} was not found in Audit Vault.`);
          setEvents(payload);
          setTotalCount(casePayload.total);
          setSelected(null);
          return;
        }
      }

      setEvents(payload);
      setTotalCount(casePayload.total);
      const defaultEvent =
        payload.find(
          (row) =>
            row.entity_type === 'prediction_event' &&
            (row.entity_id === preferredEventId || row.id === preferredEventId)
        ) ||
        payload.find((row) => row.entity_type === 'prediction_event') ||
        payload[0] ||
        null;
      setSelected(defaultEvent);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load audit events');
      setEvents([]);
      setTotalCount(0);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }, [pushToast, sourceFilterTouched]);

  useEffect(() => {
    if (prefillApplied) return;

    const fromUrl: AuditFilters = {
      q: searchParams.get('q') || searchParams.get('encounter_id') || searchParams.get('patient_id_hash') || '',
      model_id: searchParams.get('model_id') || '',
      source:
        searchParams.get('source') === 'seeded_demo' || searchParams.get('source') === 'epic_sandbox'
          ? (searchParams.get('source') as 'seeded_demo' | 'epic_sandbox')
          : EMPTY_FILTERS.source,
      outcome: searchParams.get('outcome') || '',
      gate_name: searchParams.get('gate_name') || '',
      reason_code: searchParams.get('reason_code') || '',
      start_time: formatDateTimeLocal(searchParams.get('start_time')),
      end_time: formatDateTimeLocal(searchParams.get('end_time'))
    };

    setFilters(fromUrl);
    setPrefillApplied(true);
    void search(fromUrl, deepLinkedEventId || undefined);
  }, [deepLinkedEventId, prefillApplied, search, searchParams]);

  useEffect(() => {
    if (!selected || selected.entity_type !== 'prediction_event') {
      setDetails(null);
      return;
    }

    setDetailsLoading(true);
    setDetailsError('');
    setRawExpanded(false);
    setPatientSummaryRawExpanded(false);
    setExpandedGateRaw({});
    api
      .get<EventDetail>(`/audit/event-details/${selected.entity_id}`)
      .then((payload) => {
        setDetails(payload);
      })
      .catch((error) => {
        setDetailsError(error instanceof Error ? error.message : 'Unable to load event details');
        setDetails(null);
      })
      .finally(() => {
        setDetailsLoading(false);
      });
  }, [selected]);

  const predictionRows = useMemo(
    () => events.filter((row) => row.entity_type === 'prediction_event' && row.action === 'prediction_ingested'),
    [events]
  );

  const selectedOutcome = (details?.policy_decision?.outcome as 'ALLOW' | 'CAUTION' | 'ABSTAIN' | 'HOLD' | null) || null;
  const caseReasonCodes = useMemo(() => {
    const codes = new Set<string>();
    (details?.policy_decision?.reason_codes || []).forEach((code) => codes.add(code));
    (details?.gates || []).forEach((gate) => (gate.reason_codes || []).forEach((code) => codes.add(code)));
    return Array.from(codes);
  }, [details?.gates, details?.policy_decision?.reason_codes]);
  const outOfScopeCodes = useMemo(() => outOfScopeReasonCodes(caseReasonCodes), [caseReasonCodes]);
  const primaryOutOfScopeCode = useMemo(() => primaryOutOfScopeReasonCode(caseReasonCodes), [caseReasonCodes]);
  const selectedPolicy = useMemo(() => {
    const policyId = asStringOrNull(details?.decision_context?.policy_id);
    if (!policyId) return null;
    return policies.find((item) => item.id === policyId) || null;
  }, [details?.decision_context?.policy_id, policies]);
  const intendedUseBoundary = useMemo(
    () => normalizeIntendedUseBoundary(selectedPolicy?.intended_use_config),
    [selectedPolicy?.id, selectedPolicy?.intended_use_config]
  );
  const recommendedAction = useMemo(() => {
    if (!selectedOutcome) return null;
    return recommendedActionForCase(selectedOutcome, caseReasonCodes);
  }, [caseReasonCodes, selectedOutcome]);
  const policyBoundaryHref = useMemo(() => {
    const params = new URLSearchParams();
    const policyId = asStringOrNull(details?.decision_context?.policy_id);
    if (policyId) params.set('policy_id', policyId);
    params.set('focus', 'intended-use');
    if (primaryOutOfScopeCode) params.set('reason_code', primaryOutOfScopeCode);
    const query = params.toString();
    return `/policy${query ? `?${query}` : ''}#policy-intended-use-fail`;
  }, [details?.decision_context?.policy_id, primaryOutOfScopeCode]);
  const patientSummaryEvidence = useMemo(() => extractPatientSummaryEvidence(details), [details]);
  const patientSummaryRawPayload = useMemo(() => {
    if (!details || typeof details.event_context !== 'object' || !details.event_context) return null;
    const context = details.event_context as Record<string, unknown>;
    if (context.patient_summary && typeof context.patient_summary === 'object') {
      return context.patient_summary as Record<string, unknown>;
    }
    if (Array.isArray(context.fhir_observations)) {
      return { fhir_observations: context.fhir_observations };
    }
    return null;
  }, [details]);
  const linkedChangeProposals = useMemo(() => {
    if (!selected) return [];
    const incidentIds = new Set((details?.incidents || []).map((incident) => incident.id));

    return allChanges
      .filter((change) => {
        const sourceEvent = changeSourceEventId(change.policy_patch);
        if (sourceEvent && sourceEvent === selected.entity_id) return true;
        if (change.incident_id && incidentIds.has(change.incident_id)) return true;
        return false;
      })
      .sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at).getTime();
        const bTime = new Date(b.updated_at || b.created_at).getTime();
        return bTime - aTime;
      });
  }, [allChanges, details?.incidents, selected]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Audit Vault</h2>
        <p className="text-sm text-muted-foreground">
          Evidence-first traceability across ingestion, gate outcomes, policy decisions, actions, and incidents.
        </p>
      </div>

      <StatusLegend />

      <Card>
        <CardHeader>
          <CardTitle>Audit Search 2.0</CardTitle>
          <CardDescription>Server-side search + filters by outcome, gate, reason code, source, and date range.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div>
            <Label htmlFor="audit-q">Search</Label>
            <Input
              id="audit-q"
              value={filters.q}
              onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
              placeholder="event_id / encounter / patient hash"
            />
          </div>
          <div>
            <Label htmlFor="audit-model">Model ID</Label>
            <Input
              id="audit-model"
              value={filters.model_id}
              onChange={(e) => setFilters((prev) => ({ ...prev, model_id: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="audit-source">Source</Label>
            <Select
              id="audit-source"
              value={filters.source}
              onChange={(e) => {
                setSourceFilterTouched(true);
                setFilters((prev) => ({ ...prev, source: e.target.value as 'seeded_demo' | 'epic_sandbox' }));
              }}
            >
              <option value="epic_sandbox">Epic Sandbox</option>
              <option value="seeded_demo">Seeded Demo</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="audit-outcome">Outcome</Label>
            <Select
              id="audit-outcome"
              value={filters.outcome}
              onChange={(e) => setFilters((prev) => ({ ...prev, outcome: e.target.value }))}
            >
              <option value="">Any</option>
              <option value="ALLOW">ALLOW</option>
              <option value="CAUTION">CAUTION</option>
              <option value="ABSTAIN">ABSTAIN</option>
              <option value="HOLD">HOLD</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="audit-gate">Gate name</Label>
            <Select
              id="audit-gate"
              value={filters.gate_name}
              onChange={(e) => setFilters((prev) => ({ ...prev, gate_name: e.target.value }))}
            >
              <option value="">Any</option>
              <option value="DataQuality">DataQuality</option>
              <option value="IntendedUseOOD">IntendedUseOOD</option>
              <option value="Drift">Drift</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="audit-reason">Reason code</Label>
            <Input
              id="audit-reason"
              value={filters.reason_code}
              onChange={(e) => setFilters((prev) => ({ ...prev, reason_code: e.target.value }))}
              placeholder="unit_mismatch"
            />
          </div>
          <div>
            <Label htmlFor="audit-start">Start time</Label>
            <Input
              id="audit-start"
              type="datetime-local"
              value={filters.start_time}
              onChange={(e) => setFilters((prev) => ({ ...prev, start_time: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="audit-end">End time</Label>
            <Input
              id="audit-end"
              type="datetime-local"
              value={filters.end_time}
              onChange={(e) => setFilters((prev) => ({ ...prev, end_time: e.target.value }))}
            />
          </div>

          <div className="md:col-span-4 flex flex-wrap gap-2">
            <Button onClick={() => void search(filters)} disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSourceFilterTouched(false);
                const nextFilters = { ...EMPTY_FILTERS };
                setFilters(nextFilters);
                void search(nextFilters);
              }}
            >
              Reset
            </Button>
            {deepLinkedEventId ? (
              <Badge variant="outline">Deep link event_id: {deepLinkedEventId.slice(0, 12)}...</Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Search failed</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void search(filters)}>Retry</Button>
          </CardContent>
        </Card>
      ) : null}

      {deepLinkError ? (
        <Card>
          <CardHeader>
            <CardTitle>Deep-link event not found</CardTitle>
            <CardDescription>{deepLinkError}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSourceFilterTouched(false);
                const nextFilters = { ...EMPTY_FILTERS };
                setFilters(nextFilters);
                void search(nextFilters);
              }}
            >
              Reset filters
            </Button>
            <Link href="/control-tower">
              <Button variant="outline">Back to Control Tower</Button>
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Event Log</CardTitle>
            <CardDescription>
              {loading ? 'Loading...' : `${events.length} of ${totalCount} records (limit ${AUDIT_CASE_LIMIT})`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-sm">
                <p className="font-medium text-amber-900">No events found for selected filters.</p>
                <p className="mt-1 text-amber-900/90">
                  Use a storyline shortcut to recover a deterministic case chain.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const nextFilters = {
                        ...EMPTY_FILTERS,
                        source: 'seeded_demo' as const,
                        reason_code: 'unit_mismatch',
                        outcome: 'HOLD'
                      };
                      setSourceFilterTouched(true);
                      setFilters(nextFilters);
                      void search(nextFilters);
                    }}
                  >
                    Show HOLD
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const nextFilters = {
                        ...EMPTY_FILTERS,
                        source: 'seeded_demo' as const,
                        reason_code: 'age_out_of_scope',
                        outcome: 'ABSTAIN'
                      };
                      setSourceFilterTouched(true);
                      setFilters(nextFilters);
                      void search(nextFilters);
                    }}
                  >
                    Show ABSTAIN
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const nextFilters = {
                        ...EMPTY_FILTERS,
                        source: 'seeded_demo' as const,
                        reason_code: 'ks_shift_detected',
                        outcome: 'CAUTION'
                      };
                      setSourceFilterTouched(true);
                      setFilters(nextFilters);
                      void search(nextFilters);
                    }}
                  >
                    Show CAUTION
                  </Button>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Encounter</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow
                      key={event.id}
                      role="button"
                      tabIndex={0}
                      className={
                        selected?.id === event.id ? 'cursor-pointer bg-muted/70 outline-none' : 'cursor-pointer outline-none'
                      }
                      onClick={() => setSelected(event)}
                      onKeyDown={(keyboardEvent) => {
                        if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                          keyboardEvent.preventDefault();
                          setSelected(event);
                        }
                      }}
                    >
                      <TableCell>{new Date(event.created_at).toLocaleString()}</TableCell>
                      <TableCell>
                        {event.outcome ? <OutcomeChip outcome={event.outcome} /> : <Badge variant="outline">-</Badge>}
                      </TableCell>
                      <TableCell>{event.primary_reason_code || '-'}</TableCell>
                      <TableCell>{event.encounter_id || '-'}</TableCell>
                      <TableCell>
                        <SourceChip source={event.source} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Event Details</CardTitle>
            <CardDescription>Inputs → gate evidence → policy decision → raw payload.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {selected ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Event: {selected.entity_id}</Badge>
                  {selectedOutcome ? <OutcomeChip outcome={selectedOutcome} /> : selected.outcome ? <OutcomeChip outcome={selected.outcome} /> : null}
                  <SourceChip source={selected.source} />
                  <Badge variant="outline">Encounter: {selected.encounter_id || '-'}</Badge>
                </div>

                {detailsLoading ? (
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="font-medium">Loading evidence</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Fetching inputs, gate traces, policy decision, and raw payload JSON.
                    </p>
                  </div>
                ) : null}
                {detailsError ? (
                  <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-rose-900">
                    <p className="font-medium">Unable to load event details</p>
                    <p className="mt-1 text-xs">{detailsError}</p>
                    <div className="mt-2">
                      <Button size="sm" variant="outline" onClick={() => void search(filters, selected.entity_id)}>
                        Retry
                      </Button>
                    </div>
                  </div>
                ) : null}

                {details ? (
                  <>
                    <div className="rounded-lg border border-border bg-muted/40 p-3">
                      <p className="font-medium">1. Inputs</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Input snapshot captured at prediction time.
                      </p>
                      <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                        <p>Event ID: {valuePreview(details.event_context?.event_id || selected.entity_id)}</p>
                        <p>Event time: {formatDateTime(asStringOrNull(details.event_context?.event_time))}</p>
                        <p>Model ID: {valuePreview(details.event_context?.model_id || selected.model_id)}</p>
                        <p>Config version: {valuePreview(details.event_context?.config_version)}</p>
                        <p>Score value: {valuePreview(details.event_context?.score_value)}</p>
                        <p>Threshold applied: {valuePreview(details.event_context?.threshold_applied)}</p>
                        <p>Location unit: {valuePreview(details.event_context?.location_unit)}</p>
                        <p>Care setting: {valuePreview(details.event_context?.care_setting)}</p>
                        <p>Age: {valuePreview(details.event_context?.age)}</p>
                        <p>Source: {valuePreview(details.event_context?.source || selected.source)}</p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/40 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">FHIR evidence (clinical table)</p>
                        <Badge variant="outline">Linked event: {selected.entity_id}</Badge>
                      </div>
                      {patientSummaryEvidence ? (
                        <>
                          <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                            <p>FHIR issuer: {patientSummaryEvidence.fhir_iss || '-'}</p>
                            <p>Captured at: {formatDateTime(patientSummaryEvidence.captured_at)}</p>
                            <p>Encounter: {patientSummaryEvidence.encounter?.id || '-'}</p>
                            <p>
                              Unit / setting: {patientSummaryEvidence.encounter?.unit_name || '-'} / {patientSummaryEvidence.encounter?.care_setting || '-'}
                            </p>
                          </div>

                          <div className="mt-3">
                            {patientSummaryEvidence.observations.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No Observation rows in evidence payload.</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Metric</TableHead>
                                    <TableHead>Observation ID</TableHead>
                                    <TableHead>Resource code</TableHead>
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
                                      <TableCell>{row.observation_id || '-'}</TableCell>
                                      <TableCell>{row.code || '-'}</TableCell>
                                      <TableCell>{valuePreview(row.value)}</TableCell>
                                      <TableCell>{row.unit || '-'}</TableCell>
                                      <TableCell>{formatDateTime(row.observed_at)}</TableCell>
                                      <TableCell>{row.source || '-'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                            {patientSummaryEvidence.missing_fields.length > 0 ? (
                              <p className="mt-2 text-xs text-amber-700">
                                Missing metrics: {patientSummaryEvidence.missing_fields.join(', ')}
                              </p>
                            ) : null}
                          </div>

                          <div className="mt-3 rounded border border-border bg-background p-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-medium">FHIR evidence JSON (second level)</p>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setPatientSummaryRawExpanded((current) => !current)}
                                >
                                  {patientSummaryRawExpanded ? 'Collapse' : 'Expand'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    try {
                                      const text = JSON.stringify(patientSummaryRawPayload || {}, null, 2);
                                      if (!navigator.clipboard?.writeText) {
                                        throw new Error('Clipboard API not available');
                                      }
                                      await navigator.clipboard.writeText(text);
                                      pushToast({
                                        title: 'FHIR evidence copied',
                                        description: 'FHIR evidence JSON copied to clipboard.',
                                        variant: 'success'
                                      });
                                    } catch {
                                      pushToast({
                                        title: 'Copy failed',
                                        description: 'Clipboard access is unavailable in this browser context.',
                                        variant: 'error'
                                      });
                                    }
                                  }}
                                >
                                  Copy
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const text = JSON.stringify(patientSummaryRawPayload || {}, null, 2);
                                    const blob = new Blob([text], { type: 'application/json' });
                                    const objectUrl = URL.createObjectURL(blob);
                                    const anchor = document.createElement('a');
                                    anchor.href = objectUrl;
                                    anchor.download = `audit-event-${selected.entity_id}-fhir-evidence.json`;
                                    document.body.appendChild(anchor);
                                    anchor.click();
                                    document.body.removeChild(anchor);
                                    URL.revokeObjectURL(objectUrl);
                                  }}
                                >
                                  Download
                                </Button>
                              </div>
                            </div>
                            {patientSummaryRawExpanded ? (
                              <pre className="mt-2 max-h-52 overflow-auto rounded border border-border bg-muted/40 p-2 text-[11px]">
                                {JSON.stringify(patientSummaryRawPayload || {}, null, 2)}
                              </pre>
                            ) : (
                              <p className="mt-1 text-xs text-muted-foreground">Collapsed to keep panel readable.</p>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          No FHIR evidence payload captured for this event.
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="font-medium">2. Gate evidence</p>
                      <div className="mt-2 space-y-2">
                        {details.gates.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No gate evaluations were recorded for this event.</p>
                        ) : (
                          details.gates.map((gate) => (
                            <div key={gate.gate_name} className="rounded border border-border bg-muted/50 p-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{gate.gate_name}</span>
                                <GateChip status={gate.status} />
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{gate.explanation}</p>
                              {gate.reason_codes.length > 0 ? (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {gate.reason_codes.map((code) => (
                                    <Badge key={`${gate.gate_name}-${code}`} variant="outline">
                                      {code}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                              {Object.keys(gate.evidence || {}).length > 0 ? (
                                <div className="mt-2 rounded border border-border bg-background p-2 text-xs">
                                  {Object.entries(gate.evidence).map(([key, value]) => (
                                    <p key={`${gate.gate_name}-${key}`}>
                                      <span className="font-medium">{key}:</span> {valuePreview(value)}
                                    </p>
                                  ))}
                                  <div className="mt-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        setExpandedGateRaw((current) => ({
                                          ...current,
                                          [gate.gate_name]: !current[gate.gate_name]
                                        }))
                                      }
                                    >
                                      {expandedGateRaw[gate.gate_name] ? 'Hide raw evidence JSON' : 'Expand raw evidence JSON'}
                                    </Button>
                                  </div>
                                  {expandedGateRaw[gate.gate_name] ? (
                                    <pre className="mt-2 max-h-52 overflow-auto rounded border border-border bg-muted/40 p-2 text-[11px]">
                                      {JSON.stringify(gate.evidence || {}, null, 2)}
                                    </pre>
                                  ) : null}
                                </div>
                              ) : (
                                <p className="mt-2 text-xs text-muted-foreground">No additional evidence payload.</p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {details.policy_decision ? (
                      <div className="rounded border border-primary/30 bg-primary/5 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">3. Policy decision</p>
                          <OutcomeChip outcome={details.policy_decision.outcome} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{details.policy_decision.explanation}</p>
                        {details.policy_decision.reason_codes.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {details.policy_decision.reason_codes.map((code) => (
                              <div key={code} className="flex items-center gap-1">
                                <Badge variant="outline">{humanizeReasonCode(code)}</Badge>
                                <span className="font-mono text-[11px] text-muted-foreground">{code}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <p className="mt-1 text-xs">
                          Policy version: {valuePreview(details.decision_context?.policy_version)} | Policy id:{' '}
                          {valuePreview(details.decision_context?.policy_id)}
                        </p>
                        {primaryOutOfScopeCode ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Triggered ABSTAIN rule: {humanizeReasonCode(primaryOutOfScopeCode)} ({primaryOutOfScopeCode})
                          </p>
                        ) : null}
                        {recommendedAction ? (
                          <p className="mt-2 text-xs">
                            <span className="font-medium">Recommended action:</span> {recommendedAction}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Link href={policyBoundaryHref}>
                            <Button size="sm" variant="outline">Open Policy Boundary</Button>
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded border border-border bg-muted/30 p-3">
                        <p className="font-medium">3. Policy decision</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          No policy decision payload is attached to this event.
                        </p>
                      </div>
                    )}

                    <div className="rounded border border-sky-300 bg-sky-50/70 p-3">
                      <p className="font-medium text-sky-900">Lineage chain</p>
                      <p className="mt-1 text-xs text-sky-900/90">
                        Source event → policy decision → incident → change proposal.
                      </p>
                      <div className="mt-2 space-y-2 text-xs">
                        <div className="rounded border border-sky-200 bg-white/90 p-2">
                          <p className="font-medium text-sky-900">1. Source event</p>
                          <p className="mt-1 text-sky-900/90">Event {selected.entity_id} is the lineage anchor.</p>
                        </div>
                        <div className="rounded border border-sky-200 bg-white/90 p-2">
                          <p className="font-medium text-sky-900">2. Policy decision</p>
                          {details.policy_decision ? (
                            <p className="mt-1 text-sky-900/90">
                              Outcome {details.policy_decision.outcome} with reason codes{' '}
                              {details.policy_decision.reason_codes.length > 0
                                ? details.policy_decision.reason_codes.join(', ')
                                : 'not provided'}.
                            </p>
                          ) : (
                            <p className="mt-1 text-sky-900/90">No policy decision payload attached to this event.</p>
                          )}
                        </div>
                        <div className="rounded border border-sky-200 bg-white/90 p-2">
                          <p className="font-medium text-sky-900">3. Incident</p>
                          {details.incidents.length > 0 ? (
                            <div className="mt-1 space-y-1 text-sky-900/90">
                              {details.incidents.slice(0, 2).map((incident) => (
                                <p key={`lineage-incident-${incident.id}`}>
                                  {incident.id} ({incident.status}) - {incident.title}
                                </p>
                              ))}
                              {details.incidents.length > 2 ? (
                                <p className="text-[11px] text-muted-foreground">
                                  +{details.incidents.length - 2} more linked incident(s).
                                </p>
                              ) : null}
                              <Link href="/incidents">
                                <Button size="sm" variant="outline">Open incident queue</Button>
                              </Link>
                            </div>
                          ) : (
                            <p className="mt-1 text-sky-900/90">No incident yet for this event.</p>
                          )}
                        </div>
                        <div className="rounded border border-sky-200 bg-white/90 p-2">
                          <p className="font-medium text-sky-900">4. Change proposal</p>
                          {changesLoading ? (
                            <p className="mt-1 text-sky-900/90">Loading proposal linkage...</p>
                          ) : changesError ? (
                            <p className="mt-1 text-sky-900/90">Unable to load proposals: {changesError}</p>
                          ) : linkedChangeProposals.length > 0 ? (
                            <div className="mt-1 space-y-1 text-sky-900/90">
                              {linkedChangeProposals.slice(0, 2).map((change) => (
                                <div key={`lineage-change-${change.id}`} className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline">Proposal {change.id}</Badge>
                                  <Badge variant="outline">{change.status}</Badge>
                                  <span>{change.title}</span>
                                  <Link
                                    href={`/changes?change_id=${encodeURIComponent(change.id)}&event_id=${encodeURIComponent(
                                      selected.entity_id
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
                            <p className="mt-1 text-sky-900/90">No proposal yet for this lineage.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {selectedOutcome === 'ABSTAIN' ? (
                      <div className="rounded border border-slate-300 bg-slate-50/90 p-3">
                        <p className="text-xs uppercase tracking-[0.1em] text-slate-700">Policy boundary (intended use)</p>
                        <p className="mt-1 text-xs text-slate-700">
                          ABSTAIN means the model should stay silent in this context.
                        </p>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <div className="rounded border border-slate-200 bg-white p-2 text-xs">
                            <p className="text-[11px] font-medium text-muted-foreground">Intended use</p>
                            <p className="mt-1">
                              <span className="font-medium text-foreground">Age:</span> {formatAgeBoundary(intendedUseBoundary)}
                            </p>
                            <p>
                              <span className="font-medium text-foreground">Care setting:</span>{' '}
                              {formatCareSettingBoundary(intendedUseBoundary)}
                            </p>
                            <p>
                              <span className="font-medium text-foreground">Unit:</span> {formatUnitBoundary(intendedUseBoundary)}
                            </p>
                          </div>
                          <div className="rounded border border-slate-200 bg-white p-2 text-xs">
                            <p className="text-[11px] font-medium text-muted-foreground">Current context</p>
                            <p className="mt-1">
                              <span className="font-medium text-foreground">Age:</span> {valuePreview(details.event_context.age)}
                            </p>
                            <p>
                              <span className="font-medium text-foreground">Care setting:</span>{' '}
                              {valuePreview(details.event_context.care_setting)}
                            </p>
                            <p>
                              <span className="font-medium text-foreground">Unit:</span> {valuePreview(details.event_context.location_unit)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 rounded border border-slate-200 bg-white p-2">
                          <p className="text-[11px] font-medium text-muted-foreground">Triggered rule(s)</p>
                          {outOfScopeCodes.length === 0 ? (
                            <p className="mt-1 text-xs text-muted-foreground">No explicit out-of-scope reason code on this event.</p>
                          ) : (
                            <div className="mt-1 space-y-1">
                              {outOfScopeCodes.map((code) => (
                                <div key={code} className="flex flex-wrap items-center gap-2 text-xs">
                                  <Badge variant="outline">{humanizeReasonCode(code)}</Badge>
                                  <span className="font-mono text-[11px] text-muted-foreground">{code}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-lg border border-border bg-muted/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">4. Raw payload JSON</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setRawExpanded((current) => !current)}>
                            {rawExpanded ? 'Collapse' : 'Expand'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                const text = JSON.stringify(details.raw_payload || details.event, null, 2);
                                if (!navigator.clipboard?.writeText) {
                                  throw new Error('Clipboard API not available');
                                }
                                await navigator.clipboard.writeText(text);
                                pushToast({
                                  title: 'Raw payload copied',
                                  description: 'JSON payload copied to clipboard.',
                                  variant: 'success'
                                });
                              } catch {
                                pushToast({
                                  title: 'Copy failed',
                                  description: 'Clipboard access is unavailable in this browser context.',
                                  variant: 'error'
                                });
                              }
                            }}
                          >
                            Copy
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const text = JSON.stringify(details.raw_payload || details.event, null, 2);
                              const blob = new Blob([text], { type: 'application/json' });
                              const objectUrl = URL.createObjectURL(blob);
                              const anchor = document.createElement('a');
                              anchor.href = objectUrl;
                              anchor.download = `audit-event-${selected.entity_id}.json`;
                              document.body.appendChild(anchor);
                              anchor.click();
                              document.body.removeChild(anchor);
                              URL.revokeObjectURL(objectUrl);
                            }}
                          >
                            Download
                          </Button>
                        </div>
                      </div>
                      {rawExpanded ? (
                        <pre className="mt-2 max-h-64 overflow-auto rounded border border-border bg-background p-2 text-xs">
                          {JSON.stringify(details.raw_payload || details.event, null, 2)}
                        </pre>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">Collapsed to keep panel readable.</p>
                      )}
                    </div>

                    <div>
                      <p className="font-medium">Linked incidents</p>
                      {details.incidents.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No incidents linked.</p>
                      ) : (
                        <div className="mt-1 space-y-1">
                          {details.incidents.map((incident) => (
                            <p key={incident.id} className="text-xs">
                              {incident.id} - {incident.status} - {incident.title}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Select an event row to inspect evidence.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scenario Shortcuts</CardTitle>
          <CardDescription>Quick filter presets for demo storylines.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const nextFilters = {
                ...EMPTY_FILTERS,
                source: 'seeded_demo' as const,
                reason_code: 'unit_mismatch',
                outcome: 'HOLD'
              };
              setSourceFilterTouched(true);
              setFilters(nextFilters);
              void search(nextFilters);
            }}
          >
            unit_mismatch: HOLD
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const nextFilters = {
                ...EMPTY_FILTERS,
                source: 'seeded_demo' as const,
                reason_code: 'age_out_of_scope',
                outcome: 'ABSTAIN'
              };
              setSourceFilterTouched(true);
              setFilters(nextFilters);
              void search(nextFilters);
            }}
          >
            OOD pediatric: ABSTAIN
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const nextFilters = {
                ...EMPTY_FILTERS,
                source: 'seeded_demo' as const,
                reason_code: 'ks_shift_detected',
                outcome: 'CAUTION'
              };
              setSourceFilterTouched(true);
              setFilters(nextFilters);
              void search(nextFilters);
            }}
          >
            drift shift: CAUTION
          </Button>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Tip: search by reason code (for example `unit_mismatch`) and outcome (`HOLD`) to find root-cause decisions quickly.
      </p>

      {predictionRows.length > 0 ? null : (
        <p className="text-xs text-muted-foreground">Prediction event list is empty for current filter set.</p>
      )}
    </div>
  );
}

export default function AuditVaultPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading audit workspace...</p>}>
      <AuditVaultPageContent />
    </Suspense>
  );
}
