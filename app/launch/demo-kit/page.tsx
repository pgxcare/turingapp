import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const scenarioFlow = [
  {
    name: 'HOLD',
    caseId: 'ENC-S-HOLD-001',
    outcome: 'Stop operational usage when data integrity is broken (unit mismatch).',
    path: 'Control Tower -> Reset demo -> Show HOLD -> Case Detail -> Audit Vault'
  },
  {
    name: 'ABSTAIN',
    caseId: 'ENC-D-ABSTAIN-001',
    outcome: 'Suppress model output when context is outside intended-use policy boundary.',
    path: 'Control Tower -> Reset demo -> Show ABSTAIN -> Policy Boundary -> Audit Vault'
  },
  {
    name: 'CAUTION',
    caseId: 'ENC-D-CAUTION-001',
    outcome: 'Continue with caution while drift pressure and burden shift are investigated.',
    path: 'Control Tower -> Reset demo -> Show CAUTION -> Drift -> Change Proposal'
  }
];

const smokeChecklist = [
  'Open `/launch` and validate CTA routes (`/launch/pilot-pack`, `/launch/demo-kit`, `/`).',
  'Run `make demo-reset` and confirm scenario shortcuts open deterministic cases.',
  'Verify each scenario reaches matching evidence blocks (gate reason, policy outcome, lineage).',
  'Open `Drift` and `Change Proposal` from CAUTION path and confirm context import is visible.',
  'Confirm `docs/DEMO_RUNBOOK.md` and `docs/LAUNCH_CHECKLIST.md` match current UI labels.'
];

const fallbackSteps = [
  'If case did not open: click `Reapply shortcut`.',
  'If still missing: click `Reset demo`, then re-run the same scenario shortcut.',
  'If drift/change pages are empty: open from case drawer deep-link buttons to restore context.',
  'If SMART launch token/scope fails: use `Retry launch` or `Retry exchange` and continue with sandbox path if needed.'
];

const runbookLinks = [
  'docs/DEMO_RUNBOOK.md',
  'docs/LAUNCH_CHECKLIST.md',
  'docs/PILOT_PACKET.md',
  'docs/EPIC_INTEGRATION_OVERVIEW.md',
  'docs/SECURITY_FAQ.md'
];

export default function DemoKitPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 md:px-10 md:py-14">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Launch Demo Kit</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight text-slate-950">One-page flow for launch walkthrough</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">
            Use this page to run demo scenarios in fixed order and keep runbook/checklist consistency before soft launch.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/launch">
              <Button variant="outline">Back to launch page</Button>
            </Link>
            <Link href="/demo-mode">
              <Button variant="outline">Open in-product demo mode</Button>
            </Link>
            <Link href="/">
              <Button>Open product workflow</Button>
            </Link>
          </div>
        </header>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>What to show in deterministic order</CardTitle>
            <CardDescription>Recommended order for a stable 7-minute walkthrough.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-slate-700">
            <p>
              <span className="font-semibold text-slate-900">1.</span> Start with HOLD to establish hard-stop semantics.
            </p>
            <p>
              <span className="font-semibold text-slate-900">2.</span> Move to ABSTAIN to show intended-use boundary enforcement.
            </p>
            <p>
              <span className="font-semibold text-slate-900">3.</span> Finish with CAUTION, then open Drift and Change Proposal for governed response.
            </p>
            <p>
              <span className="font-semibold text-slate-900">4.</span> Close with SMART live path (`/smart/launch` to callback to patient).
            </p>
            <p className="text-xs text-slate-500">
              Canonical source of sequence: `docs/DEMO_RUNBOOK.md`.
            </p>
          </CardContent>
        </Card>

        <section className="grid gap-4 md:grid-cols-3">
          {scenarioFlow.map((item) => (
            <Card key={item.name} className="border-slate-200 bg-white">
              <CardHeader>
                <CardTitle>{item.name}</CardTitle>
                <CardDescription>{item.caseId}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm leading-6 text-slate-700">
                <p>{item.outcome}</p>
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">{item.path}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Smoke checklist</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm leading-6 text-slate-700">
                {smokeChecklist.map((item) => (
                  <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Fallback steps</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm leading-6 text-slate-700">
                {fallbackSteps.map((item) => (
                  <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Runbook references</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-slate-700">
            {runbookLinks.map((item) => (
              <p key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                {item}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
