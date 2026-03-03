export type DemoScenarioOutcome = 'ALLOW' | 'CAUTION' | 'ABSTAIN' | 'HOLD';

export type DemoScenario = {
  id: string;
  title: string;
  presetLabel: string;
  shortcutLabel: string;
  encounterId: string;
  outcome: DemoScenarioOutcome;
  reasonCode?: string;
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'scenario-01-thermometer',
    title: 'Thermometer went rogue',
    presetLabel: '01. Thermometer went rogue: HOLD',
    shortcutLabel: '01 Thermometer: HOLD',
    encounterId: 'ENC-S-HOLD-001',
    outcome: 'HOLD',
    reasonCode: 'unit_mismatch',
  },
  {
    id: 'scenario-02-peds',
    title: 'Pediatrics trap',
    presetLabel: '02. Pediatrics trap: ABSTAIN',
    shortcutLabel: '02 Pediatrics: ABSTAIN',
    encounterId: 'ENC-D-ABSTAIN-001',
    outcome: 'ABSTAIN',
    reasonCode: 'age_out_of_scope',
  },
  {
    id: 'scenario-03-silent-epic-update',
    title: 'Silent Epic update',
    presetLabel: '03. Silent Epic update: CAUTION',
    shortcutLabel: '03 Epic update: CAUTION',
    encounterId: 'ENC-D-CAUTION-001',
    outcome: 'CAUTION',
  },
  {
    id: 'scenario-04-protocol-shift',
    title: 'Protocol shift, model shift',
    presetLabel: '04. Protocol shift, model shift: CAUTION',
    shortcutLabel: '04 Protocol shift: CAUTION',
    encounterId: 'ENC-S-CAUTION-004',
    outcome: 'CAUTION',
  },
  {
    id: 'scenario-05-joint-commission',
    title: 'Night before Joint Commission',
    presetLabel: '05. Night before Joint Commission: HOLD',
    shortcutLabel: '05 Joint Commission: HOLD',
    encounterId: 'ENC-S-HOLD-005',
    outcome: 'HOLD',
    reasonCode: 'unit_mismatch',
  },
  {
    id: 'scenario-06-holiday-shift',
    title: 'Holiday shift conflict',
    presetLabel: '06. Holiday shift conflict: CAUTION',
    shortcutLabel: '06 Holiday shift: CAUTION',
    encounterId: 'ENC-D-CAUTION-006',
    outcome: 'CAUTION',
  },
  {
    id: 'scenario-07-two-units',
    title: 'Two units, two truths',
    presetLabel: '07. Two units, two truths: ABSTAIN',
    shortcutLabel: '07 Two units: ABSTAIN',
    encounterId: 'ENC-S-ABSTAIN-007',
    outcome: 'ABSTAIN',
    reasonCode: 'unit_out_of_scope',
  },
  {
    id: 'scenario-08-near-miss',
    title: 'Incident without tragedy',
    presetLabel: '08. Incident without tragedy: HOLD',
    shortcutLabel: '08 Near-miss: HOLD',
    encounterId: 'ENC-S-HOLD-008',
    outcome: 'HOLD',
    reasonCode: 'unit_mismatch',
  },
  {
    id: 'scenario-09-merger',
    title: 'Hospital merger, two data realities',
    presetLabel: '09. Hospital merger data mismatch: ABSTAIN',
    shortcutLabel: '09 Merger data: ABSTAIN',
    encounterId: 'ENC-D-ABSTAIN-009',
    outcome: 'ABSTAIN',
    reasonCode: 'unit_out_of_scope',
  },
  {
    id: 'scenario-10-cfo',
    title: 'CFO asks for silence',
    presetLabel: '10. CFO asks for silence: CAUTION',
    shortcutLabel: '10 CFO asks silence: CAUTION',
    encounterId: 'ENC-D-CAUTION-010',
    outcome: 'CAUTION',
  },
];
