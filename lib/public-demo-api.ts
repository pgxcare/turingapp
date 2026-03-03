type DemoSource = 'seeded_demo' | 'epic_sandbox';
type PolicyOutcome = 'ALLOW' | 'CAUTION' | 'ABSTAIN' | 'HOLD';

type ModelDefinition = {
  id: string;
  code: string;
  name: string;
  default_threshold: number;
  threshold: number;
  health: 'Green' | 'Yellow' | 'Red';
  health_reason: string;
  psi: number;
  alert_rate: number;
  open_incidents: number;
};

type AuditCase = {
  event_id: string;
  created_at: string;
  model_id: string;
  model_name: string;
  encounter_id: string;
  patient_id_hash: string | null;
  outcome: PolicyOutcome;
  primary_reason_code: string | null;
  score_value: number | null;
  threshold_applied: number | null;
  location_unit: string;
  care_setting: string;
  age: number | null;
  source: DemoSource;
};

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const MODELS: ModelDefinition[] = [
  {
    id: 'model-risk-v1',
    code: 'epic_sepsis_bpa',
    name: 'Epic Sepsis BPA',
    default_threshold: 0.62,
    threshold: 0.62,
    health: 'Yellow',
    health_reason: 'Drift caution threshold crossed in recent ED cohort.',
    psi: 0.31,
    alert_rate: 0.18,
    open_incidents: 1,
  },
  {
    id: 'model-risk-v2',
    code: 'epic_deterioration_index',
    name: 'Epic Deterioration Index',
    default_threshold: 0.58,
    threshold: 0.58,
    health: 'Red',
    health_reason: 'Pediatric context outside intended use; ABSTAIN in effect.',
    psi: 0.41,
    alert_rate: 0.11,
    open_incidents: 0,
  },
];

const POLICIES = [
  {
    id: 'policy-main-v3',
    name: 'Main Clinical Safety Policy',
    description: 'Evidence-first clinical safety policy for live pilot operations.',
    version: 3,
    intended_use_config: {
      min_age: 18,
      max_age: 120,
      allowed_units: ['ED-North', 'Ward-5A'],
      allowed_care_settings: ['ED', 'inpatient'],
    },
    drift_config: {
      psi_threshold: 0.2,
      psi_hold_threshold: 0.35,
      alert_delta_threshold_pct: 25,
    },
    action_map: {
      data_quality_fail: 'HOLD',
      intended_use_fail: 'ABSTAIN',
      drift_warn: 'CAUTION',
      drift_fail: 'HOLD',
    },
  },
];

const CHANGES = [
  {
    id: 'chg-caution-001',
    model_id: 'model-risk-v1',
    incident_id: 'inc-hold-001',
    title: 'ED threshold tuning after drift signal',
    status: 'Review',
    proposed_threshold: 0.65,
    current_threshold: 0.62,
    policy_patch: {
      drift_config: {
        psi_threshold: 0.22,
        alert_delta_threshold_pct: 28,
      },
    },
    simulation_result: {
      baseline_alert_burden: 8.4,
      projected_alert_burden: 6.9,
      baseline_ppv_proxy: 0.41,
      projected_ppv_proxy: 0.4,
      delta_alert_burden_pct: -17.86,
      delta_ppv_proxy_pct: -2.44,
      sample_size: 214,
    },
    created_at: isoMinutesAgo(160),
    updated_at: isoMinutesAgo(30),
  },
];

const AUDIT_CASES: AuditCase[] = [
  {
    event_id: 'evt-hold-001',
    created_at: isoMinutesAgo(45),
    model_id: 'model-risk-v1',
    model_name: 'Epic Sepsis BPA',
    encounter_id: 'ENC-S-HOLD-001',
    patient_id_hash: 'pat-hash-1001',
    outcome: 'HOLD',
    primary_reason_code: 'unit_mismatch',
    score_value: 0.91,
    threshold_applied: 0.62,
    location_unit: 'ED-North',
    care_setting: 'ED',
    age: 67,
    source: 'seeded_demo',
  },
  {
    event_id: 'evt-abstain-001',
    created_at: isoMinutesAgo(38),
    model_id: 'model-risk-v2',
    model_name: 'Epic Deterioration Index',
    encounter_id: 'ENC-D-ABSTAIN-001',
    patient_id_hash: 'pat-hash-1002',
    outcome: 'ABSTAIN',
    primary_reason_code: 'age_out_of_scope',
    score_value: 0.57,
    threshold_applied: 0.58,
    location_unit: 'Ward-5A',
    care_setting: 'inpatient',
    age: 14,
    source: 'seeded_demo',
  },
  {
    event_id: 'evt-caution-001',
    created_at: isoMinutesAgo(22),
    model_id: 'model-risk-v1',
    model_name: 'Epic Sepsis BPA',
    encounter_id: 'ENC-D-CAUTION-001',
    patient_id_hash: 'pat-hash-1003',
    outcome: 'CAUTION',
    primary_reason_code: 'ks_shift_detected',
    score_value: 0.66,
    threshold_applied: 0.62,
    location_unit: 'ED-North',
    care_setting: 'ED',
    age: 58,
    source: 'seeded_demo',
  },
];

const EVENT_DETAILS: Record<string, Record<string, unknown>> = {
  'evt-hold-001': {
    event: { id: 'evt-hold-001', category: 'prediction' },
    raw_payload: {
      encounter_id: 'ENC-S-HOLD-001',
      location_unit: 'ED-North',
      observed_unit: 'F',
      expected_unit: 'C',
    },
    event_context: {
      event_id: 'evt-hold-001',
      event_type: 'prediction',
      event_time: isoMinutesAgo(45),
      model_id: 'model-risk-v1',
      source: 'seeded_demo',
      encounter_id: 'ENC-S-HOLD-001',
      patient_id_hash: 'pat-hash-1001',
      location_unit: 'ED-North',
      care_setting: 'ED',
      config_version: 'demo-v3',
      threshold_applied: 0.62,
      score_value: 0.91,
      age: 67,
    },
    decision_context: {
      decision_id: 'decision-hold-001',
      decision_time: isoMinutesAgo(44),
      policy_id: 'policy-main-v3',
      policy_name: 'Main Clinical Safety Policy',
      policy_version: '3',
    },
    gates: [
      {
        gate_name: 'DataQuality',
        status: 'FAIL',
        reason_codes: ['unit_mismatch'],
        explanation: 'Temperature unit mapping mismatch detected.',
        evidence: {
          measurement_name: 'temperature',
          expected_unit: 'C',
          observed_unit: 'F',
          sample_values: ['101.6 F', '102.2 F'],
        },
      },
      {
        gate_name: 'IntendedUse',
        status: 'PASS',
        reason_codes: [],
        explanation: 'Within intended-use bounds.',
        evidence: {
          allowed_care_settings: ['ED', 'inpatient'],
          allowed_units: ['ED-North', 'Ward-5A'],
        },
      },
      {
        gate_name: 'Drift',
        status: 'PASS',
        reason_codes: [],
        explanation: 'No drift escalation triggered for this event.',
        evidence: {
          psi: 0.14,
          ks_stat: 0.11,
          alert_delta_pct: 9.1,
          psi_threshold: 0.2,
          psi_hold_threshold: 0.35,
          ks_threshold: 0.2,
          alert_delta_threshold_pct: 25,
          baseline_alert_burden: 7.2,
          recent_alert_burden: 7.86,
          baseline_samples: 220,
          recent_samples: 201,
        },
      },
    ],
    policy_decision: {
      outcome: 'HOLD',
      reason_codes: ['unit_mismatch'],
      explanation: 'Hard-stop containment triggered by DataQuality gate.',
      evidence: {
        priority_rule: 'data_quality_fail',
      },
    },
    related_actions: [],
    outcomes: [],
    incidents: [
      {
        id: 'inc-hold-001',
        trigger_event_id: 'evt-hold-001',
        status: 'Open',
        title: 'HOLD: unit_mismatch',
        severity: 'High',
        owner_role: 'QualityRisk',
        rca_notes: 'Verify Fahrenheit-to-Celsius ETL mapping in ADT feed.',
        created_at: isoMinutesAgo(43),
        updated_at: isoMinutesAgo(35),
      },
    ],
  },
  'evt-abstain-001': {
    event: { id: 'evt-abstain-001', category: 'prediction' },
    raw_payload: {
      encounter_id: 'ENC-D-ABSTAIN-001',
      age: 14,
    },
    event_context: {
      event_id: 'evt-abstain-001',
      event_type: 'prediction',
      event_time: isoMinutesAgo(38),
      model_id: 'model-risk-v2',
      source: 'seeded_demo',
      encounter_id: 'ENC-D-ABSTAIN-001',
      patient_id_hash: 'pat-hash-1002',
      location_unit: 'Ward-5A',
      care_setting: 'inpatient',
      config_version: 'demo-v3',
      threshold_applied: 0.58,
      score_value: 0.57,
      age: 14,
    },
    decision_context: {
      decision_id: 'decision-abstain-001',
      decision_time: isoMinutesAgo(37),
      policy_id: 'policy-main-v3',
      policy_name: 'Main Clinical Safety Policy',
      policy_version: '3',
    },
    gates: [
      {
        gate_name: 'DataQuality',
        status: 'PASS',
        reason_codes: [],
        explanation: 'Required fields present.',
        evidence: {},
      },
      {
        gate_name: 'IntendedUse',
        status: 'FAIL',
        reason_codes: ['age_out_of_scope'],
        explanation: 'Patient age outside approved cohort.',
        evidence: {
          min_age: 18,
          max_age: 120,
          observed_age: 14,
          allowed_care_settings: ['ED', 'inpatient'],
          allowed_units: ['ED-North', 'Ward-5A'],
        },
      },
      {
        gate_name: 'Drift',
        status: 'PASS',
        reason_codes: [],
        explanation: 'No drift escalation triggered for this event.',
        evidence: {
          psi: 0.16,
          ks_stat: 0.09,
          alert_delta_pct: 5.4,
          psi_threshold: 0.2,
          psi_hold_threshold: 0.35,
          ks_threshold: 0.2,
          alert_delta_threshold_pct: 25,
          baseline_alert_burden: 6.1,
          recent_alert_burden: 6.43,
          baseline_samples: 188,
          recent_samples: 174,
        },
      },
    ],
    policy_decision: {
      outcome: 'ABSTAIN',
      reason_codes: ['age_out_of_scope'],
      explanation: 'Suppression applied due to intended-use boundary violation.',
      evidence: {
        priority_rule: 'intended_use_fail',
      },
    },
    related_actions: [],
    outcomes: [],
    incidents: [],
  },
  'evt-caution-001': {
    event: { id: 'evt-caution-001', category: 'prediction' },
    raw_payload: {
      encounter_id: 'ENC-D-CAUTION-001',
      drift_signal: 'ks_shift_detected',
    },
    event_context: {
      event_id: 'evt-caution-001',
      event_type: 'prediction',
      event_time: isoMinutesAgo(22),
      model_id: 'model-risk-v1',
      source: 'seeded_demo',
      encounter_id: 'ENC-D-CAUTION-001',
      patient_id_hash: 'pat-hash-1003',
      location_unit: 'ED-North',
      care_setting: 'ED',
      config_version: 'demo-v3',
      threshold_applied: 0.62,
      score_value: 0.66,
      age: 58,
    },
    decision_context: {
      decision_id: 'decision-caution-001',
      decision_time: isoMinutesAgo(21),
      policy_id: 'policy-main-v3',
      policy_name: 'Main Clinical Safety Policy',
      policy_version: '3',
    },
    gates: [
      {
        gate_name: 'DataQuality',
        status: 'PASS',
        reason_codes: [],
        explanation: 'Required fields present.',
        evidence: {},
      },
      {
        gate_name: 'IntendedUse',
        status: 'PASS',
        reason_codes: [],
        explanation: 'Within intended-use bounds.',
        evidence: {},
      },
      {
        gate_name: 'Drift',
        status: 'WARN',
        reason_codes: ['ks_shift_detected'],
        explanation: 'Score-shape drift crossed CAUTION threshold.',
        evidence: {
          psi: 0.31,
          ks_stat: 0.23,
          alert_delta_pct: 38.6,
          psi_threshold: 0.2,
          psi_hold_threshold: 0.35,
          ks_threshold: 0.2,
          alert_delta_threshold_pct: 25,
          baseline_alert_burden: 8.4,
          recent_alert_burden: 11.64,
          baseline_samples: 236,
          recent_samples: 214,
        },
      },
    ],
    policy_decision: {
      outcome: 'CAUTION',
      reason_codes: ['ks_shift_detected'],
      explanation: 'Continue with caution and launch governed change proposal.',
      evidence: {
        priority_rule: 'drift_warn',
      },
    },
    related_actions: [],
    outcomes: [],
    incidents: [],
  },
};

function normalizeDate(value: string | null): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : ts;
}

function matchesQuery(caseRow: AuditCase, query: string): boolean {
  const haystack = [
    caseRow.event_id,
    caseRow.encounter_id,
    caseRow.model_name,
    caseRow.primary_reason_code || '',
    caseRow.location_unit,
    caseRow.care_setting,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export function getEpicChecklist() {
  return {
    checklist: [
      {
        id: 'epic-app-registration',
        title: 'Epic app registration complete',
        description: 'Client ID and redirect URI are configured for pilot tenant.',
        required: true,
        status: 'Ready',
      },
      {
        id: 'scope-consent',
        title: 'SMART scope consent verified',
        description: 'Launch and patient-read scopes are available for read-only demo.',
        required: true,
        status: 'Ready',
      },
      {
        id: 'audit-export',
        title: 'Audit export wiring confirmed',
        description: 'Evidence payloads are retained for governance walkthrough.',
        required: true,
        status: 'Ready',
      },
      {
        id: 'ops-runbook',
        title: 'Operator runbook reviewed',
        description: 'Host guidance updated for HOLD/ABSTAIN/CAUTION sequence.',
        required: false,
        status: 'Ready',
      },
    ],
    minimum_fields: ['encounter_id', 'patient_age', 'unit', 'care_setting', 'score_value'],
  };
}

export function getControlTowerPayload(modelId: string | null) {
  const scoped = modelId ? MODELS.filter((model) => model.id === modelId) : MODELS;
  const models = (scoped.length > 0 ? scoped : MODELS).map((model) => ({
    id: model.id,
    code: model.code,
    name: model.name,
    threshold: model.threshold,
    health: model.health,
    health_reason: model.health_reason,
    thresholds: {
      psi_threshold: 0.2,
      psi_hold_threshold: 0.35,
      ks_threshold: 0.2,
      alert_delta_threshold_pct: 25,
    },
    psi: model.psi,
    alert_rate: model.alert_rate,
    open_incidents: model.open_incidents,
  }));

  return {
    models,
    trend_cards: [
      {
        key: 'non_allow_rate',
        title: 'Non-ALLOW outcomes (24h)',
        value: '3 cases',
        trend: '+1 vs baseline',
      },
      {
        key: 'drift_pressure',
        title: 'Drift pressure (max PSI)',
        value: 0.31,
        trend: 'CAUTION',
      },
      {
        key: 'open_incidents',
        title: 'Open incidents',
        value: 1,
        trend: 'stable',
      },
    ],
    action_cards: [
      {
        model_id: 'model-risk-v1',
        title: 'Investigate CAUTION drift signal',
        reason: 'KS + alert-burden thresholds crossed for seeded ED cohort.',
        cta: 'Open Drift workspace',
      },
      {
        model_id: 'model-risk-v2',
        title: 'ABSTAIN boundary remains active',
        reason: 'Pediatric OOD boundary still suppressing output by policy.',
        cta: 'Review Audit evidence',
      },
    ],
    last_updated: new Date().toISOString(),
  };
}

export function getModels() {
  return MODELS.map((model) => ({
    id: model.id,
    code: model.code,
    name: model.name,
    default_threshold: model.default_threshold,
  }));
}

export function getPolicies() {
  return POLICIES;
}

export function getChanges() {
  return CHANGES;
}

export function queryAuditCases(params: URLSearchParams) {
  let rows = [...AUDIT_CASES];

  const q = params.get('q')?.trim();
  const modelId = params.get('model_id')?.trim();
  const source = params.get('source')?.trim();
  const outcome = params.get('outcome')?.trim();
  const reasonCode = params.get('reason_code')?.trim();
  const startTime = normalizeDate(params.get('start_time'));
  const endTime = normalizeDate(params.get('end_time'));

  if (q) rows = rows.filter((row) => matchesQuery(row, q));
  if (modelId) rows = rows.filter((row) => row.model_id === modelId);
  if (source === 'seeded_demo' || source === 'epic_sandbox') rows = rows.filter((row) => row.source === source);
  if (outcome === 'ALLOW' || outcome === 'CAUTION' || outcome === 'ABSTAIN' || outcome === 'HOLD') {
    rows = rows.filter((row) => row.outcome === outcome);
  }
  if (reasonCode) rows = rows.filter((row) => row.primary_reason_code === reasonCode);

  if (startTime !== null) {
    rows = rows.filter((row) => {
      const created = Date.parse(row.created_at);
      return !Number.isNaN(created) && created >= startTime;
    });
  }

  if (endTime !== null) {
    rows = rows.filter((row) => {
      const created = Date.parse(row.created_at);
      return !Number.isNaN(created) && created <= endTime;
    });
  }

  rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  const limitRaw = Number(params.get('limit') || '200');
  const offsetRaw = Number(params.get('offset') || '0');
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 200;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  return {
    items: rows.slice(offset, offset + limit),
    total: rows.length,
  };
}

export function getAuditEventDetail(eventId: string) {
  return EVENT_DETAILS[eventId] || EVENT_DETAILS['evt-caution-001'];
}

export function getDriftPayload(modelId: string, eventId: string | null) {
  const model = MODELS.find((item) => item.id === modelId) || MODELS[0];

  return {
    model: {
      id: model.id,
      name: model.name,
      code: model.code,
      default_threshold: model.default_threshold,
      health: model.health,
    },
    signals: {
      psi: 0.31,
      ks_stat: 0.23,
      baseline_alert_burden: 8.4,
      recent_alert_burden: 11.64,
      alert_delta_pct: 38.6,
      alert_delta_note: 'Alert burden rose in recent ED cohort versus baseline.',
      baseline_samples: 236,
      recent_samples: 214,
    },
    thresholds: {
      psi_threshold: 0.2,
      psi_hold_threshold: 0.35,
      ks_threshold: 0.2,
      alert_delta_threshold_pct: 25,
    },
    health_reason: 'CAUTION drift pressure persists for current cohort.',
    score_distribution: [
      { date: '2026-02-20', mean: 0.58, p90: 0.77, count: 42 },
      { date: '2026-02-23', mean: 0.6, p90: 0.8, count: 46 },
      { date: '2026-02-26', mean: 0.63, p90: 0.84, count: 41 },
      { date: '2026-03-01', mean: 0.66, p90: 0.86, count: 39 },
    ],
    alert_trend: [
      { date: '2026-02-20', alerts: 3, rate: 0.08 },
      { date: '2026-02-23', alerts: 4, rate: 0.1 },
      { date: '2026-02-26', alerts: 5, rate: 0.12 },
      { date: '2026-03-01', alerts: 7, rate: 0.16 },
    ],
    hypotheses: [
      'Recent ED triage protocol changes shifted score distribution.',
      'Feature mapping update may have altered score calibration for subset cohorts.',
      'Alert-routing threshold needs governed tuning to reduce operator burden.',
    ],
    next_best_actions: [
      'Launch governed Change Proposal and run canary simulation.',
      'Compare baseline vs recent feature capture rates by unit.',
      'Review linked audit evidence before threshold release.',
    ],
    proposal_prefill: {
      model_id: model.id,
      title: 'CAUTION drift follow-up threshold tune',
      proposed_threshold: 0.65,
      expected_effect: 'Reduce alert burden while keeping PPV proxy stable.',
      risk_assessment: 'Use controlled canary release with rollback guardrails.',
      reason_codes: ['ks_shift_detected', 'alert_burden_spike'],
      recommended_outcome: 'CAUTION',
    },
    signal_source: eventId
      ? {
          type: 'event_snapshot',
          event_id: eventId,
          event_time: isoMinutesAgo(22),
          location_unit: 'ED-North',
          care_setting: 'ED',
        }
      : {
          type: 'model_live',
        },
  };
}

export function getDemoResetPayload() {
  return {
    status: 'ok',
    users: 5,
    models: MODELS.length,
    prediction_events: 12,
    policy_decisions: 12,
    incidents: 1,
    audit_event_id: 'evt-reset-001',
  };
}

export function getSmartPublicConfig() {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://app.turing.care';
  const publicBaseUrl = configuredBaseUrl.replace(/\/$/, '');

  return {
    client_id: process.env.NEXT_PUBLIC_EPIC_SMART_CLIENT_ID || 'demo-smart-client-id',
    redirect_uri: `${publicBaseUrl}/smart/callback`,
    default_scopes: 'launch openid fhirUser patient/*.read profile',
  };
}

export function getSmartDiscoveryConfig() {
  return {
    authorization_endpoint:
      process.env.NEXT_PUBLIC_EPIC_AUTHORIZATION_ENDPOINT ||
      'https://fhir.epic.com/interconnect-fhir-oauth/oauth2/authorize',
  };
}
