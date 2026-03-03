export type DemoSource = 'seeded_demo' | 'epic_sandbox';

export type ModelOverview = {
  id: string;
  code: string;
  name: string;
  threshold: number;
  health: 'Green' | 'Yellow' | 'Red';
  health_reason: string;
  thresholds: {
    psi_threshold: number;
    psi_hold_threshold: number;
    ks_threshold: number;
    alert_delta_threshold_pct: number;
  };
  psi: number;
  alert_rate: number;
  open_incidents: number;
};

export type TrendCard = {
  key: string;
  title: string;
  value: number | string;
  trend: string;
};

export type ActionCard = {
  model_id: string;
  title: string;
  reason: string;
  cta: string;
};

export type ControlTowerPayload = {
  models: ModelOverview[];
  trend_cards: TrendCard[];
  action_cards: ActionCard[];
  last_updated: string;
};

export type AuditCase = {
  event_id: string;
  created_at: string;
  model_id: string;
  model_name: string;
  encounter_id: string;
  patient_id_hash: string | null;
  outcome: 'ALLOW' | 'CAUTION' | 'ABSTAIN' | 'HOLD';
  primary_reason_code: string | null;
  score_value: number | null;
  threshold_applied: number | null;
  location_unit: string;
  care_setting: string;
  age: number | null;
  source: DemoSource;
};

export type AuditCaseListPayload = {
  items: AuditCase[];
  total: number;
};

export type DemoResetPayload = {
  status: 'ok';
  users: number;
  models: number;
  prediction_events: number;
  policy_decisions: number;
  incidents: number;
  audit_event_id: string;
};
