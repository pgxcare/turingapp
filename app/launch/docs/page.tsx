import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const repoDocs = [
  'docs/release/PUBLIC_SMOKE_TEST_W12D.md',
  'docs/release/PUBLIC_BUGLIST_W12D.md',
  'docs/release/W14_RELEASE_CLOSURE.md'
];

const runtimeReferences = [
  '/launch (external launch-facing summary)',
  '/launch/pilot-pack (pilot framing and boundaries)',
  '/launch/demo-kit (deterministic walkthrough sequence)',
  '/changes (ROI export and case packet flows)'
];

const deferredPublicChecks = [
  '/changes export CSV',
  '/changes export PDF',
  '/changes case packet download',
  '/launch and /launch/demo-kit visual parity against local proof'
];

export default function DocsOverviewPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 md:px-10 md:py-14">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Docs Overview</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight text-slate-950">Launch and release documentation map</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">
            High-level index of repository docs and route-level verification references for local-first execution mode.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/launch">
              <Button variant="outline">Back to launch page</Button>
            </Link>
            <Link href="/launch/product">
              <Button variant="outline">Open product overview</Button>
            </Link>
            <Link href="/launch/demo-kit">
              <Button>Open demo kit</Button>
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Repository docs available now</CardTitle>
              <CardDescription>Current markdown files in this canonical app repo.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm leading-6 text-slate-700">
                {repoDocs.map((item) => (
                  <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Runtime verification entry points</CardTitle>
              <CardDescription>Local or Tailscale routes used for acceptance checks.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm leading-6 text-slate-700">
                {runtimeReferences.map((item) => (
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
            <CardTitle>Deferred public verification list</CardTitle>
            <CardDescription>Public checks postponed due hosting quota constraints.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-3 text-sm leading-6 text-slate-700">
              {deferredPublicChecks.map((item) => (
                <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-xs leading-5 text-slate-500">
              Note: public verification for these routes is deferred due hosting quota. Local and Tailscale checks remain canonical.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
