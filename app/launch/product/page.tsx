import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const whatItDoes = [
  'Applies explicit safety gates before model guidance is shown to operators.',
  'Preserves a clear evidence path from case signal to policy outcome.',
  'Supports governed change flow for threshold tuning and controlled rollout.'
];

const intendedUsers = [
  'Clinical operations leaders running high-signal workflows.',
  'Quality and risk teams validating safe model usage boundaries.',
  'Data and integration teams responsible for reliable Epic SMART/FHIR read paths.'
];

const safetyOutcomes = [
  'HOLD: hard stop when data integrity or safety boundary is violated.',
  'ABSTAIN: suppress guidance when context is outside intended use.',
  'CAUTION: continue with explicit monitoring when drift pressure rises.',
  'ALLOW: proceed when checks pass and evidence is complete.'
];

const boundaries = [
  'No hidden or autonomous decisioning; all outcomes are explicit and reviewable.',
  'No claims of completed certifications in product copy.',
  'No repository disclosure of proprietary model internals or customer-sensitive implementation detail.'
];

export default function ProductOverviewPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 md:px-10 md:py-14">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Product Overview</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight text-slate-950">Turing product page (short form)</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">
            High-level explanation of what Turing does in operations, where it fits in clinical governance, and what
            boundaries are intentionally enforced.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/launch">
              <Button variant="outline">Back to launch page</Button>
            </Link>
            <Link href="/launch/docs">
              <Button variant="outline">Open docs overview</Button>
            </Link>
            <Link href="/">
              <Button>Open product workflow</Button>
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>What Turing does</CardTitle>
              <CardDescription>Operational safety layer around predictive risk workflows.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm leading-6 text-slate-700">
                {whatItDoes.map((item) => (
                  <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Who it serves</CardTitle>
              <CardDescription>Clear user groups and operational ownership.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm leading-6 text-slate-700">
                {intendedUsers.map((item) => (
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
            <CardTitle>Safety outcome semantics</CardTitle>
            <CardDescription>Stable language for demo, policy, and audit discussions.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm leading-6 text-slate-700">
              {safetyOutcomes.map((item) => (
                <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Scope boundaries</CardTitle>
            <CardDescription>What this page intentionally does not expose.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm leading-6 text-slate-700">
              {boundaries.map((item) => (
                <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
