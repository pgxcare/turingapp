import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const setupTimeline = [
  {
    label: 'Week 1',
    detail: 'Bootstrap environment, validate deterministic scenarios, confirm role-based access paths.'
  },
  {
    label: 'Week 2',
    detail: 'Validate SMART/FHIR read-only launch flow and align data contract assumptions with clinic stakeholders.'
  }
];

const weekSixDeliverables = [
  'Operational launch narrative for HOLD / ABSTAIN / CAUTION outcomes.',
  'Audit-ready evidence chain across cases and policy outcomes.',
  'Governed change workflow from proposal to canary to release/rollback.',
  'Reusable docs set for pilot handoff (packet, security FAQ, integration overview).'
];

const boundaries = [
  'No production PHI in this repository; synthetic IDs and seeded demo data only.',
  'Read-only Epic SMART/FHIR pilot path; no write-back to Epic order logic.',
  'No certification claims (SOC2/HITRUST/etc.) beyond documented MVP controls.'
];

export default function PilotPackPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 md:px-10 md:py-14">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Pilot Pack</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight text-slate-950">Turing pilot packet</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">
            Practical summary for launch-readiness conversations: buyer profile, pain points, KPI framing, setup scope, and
            clear caveats.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/launch">
              <Button variant="outline">Back to launch page</Button>
            </Link>
            <Link href="/launch/demo-kit">
              <Button>Open demo kit</Button>
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Buyer, pain, KPI</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-700">
              <p>
                Buyer profile: Clinical Ops, Quality/Risk, and IT/Data platform stakeholders who own safe operation of
                predictive risk workflows.
              </p>
              <p>
                Core pain: unclear stop conditions, fragmented evidence, and non-deterministic change requests that delay
                decisions.
              </p>
              <p>
                KPI examples: time-to-investigate, percent of cases with complete evidence chain, and alert burden movement
                after governed changes.
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Setup in first 2 weeks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-700">
              {setupTimeline.map((item) => (
                <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="font-semibold text-slate-900">{item.label}</p>
                  <p>{item.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>What the clinic gets by week 6</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm leading-6 text-slate-700">
              {weekSixDeliverables.map((item) => (
                <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Security and integration boundaries</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm leading-6 text-slate-700">
              {boundaries.map((item) => (
                <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-slate-500">
              Source docs in repository: `docs/PILOT_PACKET.md`, `docs/SECURITY_FAQ.md`, `docs/EPIC_INTEGRATION_OVERVIEW.md`.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
