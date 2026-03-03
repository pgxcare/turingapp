import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const scenarios = [
  {
    label: 'HOLD',
    tone: 'border-red-200 bg-red-50 text-red-900',
    summary: 'Hard stop when data integrity or safety boundary is clearly violated.',
    example: 'Example: unit mismatch (`Expected C`, `Observed F`) blocks operational use until corrected.'
  },
  {
    label: 'ABSTAIN',
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
    summary: 'Do not render model guidance when current context is out of intended-use scope.',
    example: 'Example: pediatric context outside approved model population.'
  },
  {
    label: 'CAUTION',
    tone: 'border-yellow-200 bg-yellow-50 text-yellow-900',
    summary: 'Continue operation with explicit caution when drift pressure is rising.',
    example: 'Example: cohort mix shift and alert burden growth require monitored mitigation plan.'
  }
];

const trustLayerSteps = [
  'Read event and context (prediction, encounter attributes, lineage metadata).',
  'Run explicit safety gates (data quality, intended use, drift pressure).',
  'Map gate evidence to outcome semantics (ALLOW, CAUTION, ABSTAIN, HOLD).',
  'Open audit trace and investigation path with deterministic links.',
  'Escalate governed change proposal when thresholds or workflows need adjustment.'
];

const pilotOutcomes = [
  'Week 1-2: environment alignment, data contract check, deterministic demo baseline.',
  'Week 3-4: operational safety review with HOLD/ABSTAIN/CAUTION investigations.',
  'Week 5-6: governed change loop and handoff pack for clinical + IT stakeholders.'
];

export default function LaunchPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 md:px-10 md:py-14">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Turing / turing.care</p>
          <h1 className="max-w-3xl text-3xl font-semibold leading-tight text-slate-950 md:text-4xl">
            Quiet-mode launch page for Epic-native predictive risk governance
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
            Turing is a safety layer around predictive risk workflows. It helps clinical operations teams decide when
            model output can run, when it should pause, and how to document every decision path with audit-ready evidence.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/launch/pilot-pack">
              <Button>View pilot pack</Button>
            </Link>
            <Link href="/demo-mode">
              <Button variant="outline">Open in-product demo mode</Button>
            </Link>
            <Link href="/">
              <Button variant="outline">See product workflow</Button>
            </Link>
            <Link href="/launch/demo-kit">
              <Button variant="secondary">Open demo kit</Button>
            </Link>
          </div>
        </header>

        <section className="grid gap-5 md:grid-cols-2">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>What Turing is</CardTitle>
              <CardDescription>Evidence-first safety operations for predictive risk programs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-700">
              <p>Turing does not replace clinicians or care workflows.</p>
              <p>It enforces operational guardrails around model output and keeps a full audit trail of why outcomes changed.</p>
              <p>The current MVP is focused on controlled pilot operations and reproducible demo workflows.</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Who it is for</CardTitle>
              <CardDescription>Clinical operations, quality/risk, and data platform teams.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-700">
              <p>Clinical operations leaders who need predictable guardrails before scaling model usage.</p>
              <p>Quality and risk teams who need transparent, reviewable evidence across every policy decision.</p>
              <p>Technical teams integrating Epic SMART/FHIR read paths into safe operational workflows.</p>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="scenarios" className="space-y-4">
          <h2 id="scenarios" className="text-2xl font-semibold text-slate-950">
            Three core safety scenarios
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {scenarios.map((scenario) => (
              <Card key={scenario.label} className={`border ${scenario.tone}`}>
                <CardHeader>
                  <CardTitle className="text-lg">{scenario.label}</CardTitle>
                  <CardDescription className="text-current">{scenario.summary}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6">{scenario.example}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>How the trust layer works</CardTitle>
              <CardDescription>Deterministic, policy-driven flow from event to action.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm leading-6 text-slate-700">
                {trustLayerSteps.map((step, index) => (
                  <li key={step} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="mr-2 font-semibold text-slate-900">{index + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card id="pilot-outcomes" className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>What a clinic gets after a 6-week pilot</CardTitle>
              <CardDescription>Operational deliverables, not marketing promises.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm leading-6 text-slate-700">
                {pilotOutcomes.map((item) => (
                  <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-5 text-slate-500">
                Scope note: current pilot scope is read-only Epic integration with governed safety workflows and audit traceability.
              </p>
            </CardContent>
          </Card>
        </section>

        <section id="demo-kit" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-xl font-semibold text-slate-950">Demo and launch materials</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Use the demo kit to run HOLD, ABSTAIN, and CAUTION scenarios in consistent order and connect them to audit,
            drift, and change-control evidence.
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
            Canonical sequence source: `docs/DEMO_RUNBOOK.md` (HOLD to ABSTAIN to CAUTION to SMART).
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/launch/demo-kit">
              <Button variant="outline">Open demo kit route</Button>
            </Link>
            <Link href="/launch/pilot-pack">
              <Button variant="outline">Open pilot packet route</Button>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
