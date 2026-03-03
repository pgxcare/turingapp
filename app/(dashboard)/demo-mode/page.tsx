'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type DemoStep = {
  order: number;
  title: string;
  route: string;
  why: string;
  hostTalkTrack: string;
};

const deterministicFlow: DemoStep[] = [
  {
    order: 1,
    title: 'HOLD hard-stop',
    route: '/control-tower?demo_mode=1&preset=unit-hold',
    why: 'Establish trust boundary first: the product blocks unsafe reuse when data integrity is broken.',
    hostTalkTrack: 'This is a hard stop. We pause operational use and escalate mapping fix before reuse.'
  },
  {
    order: 2,
    title: 'ABSTAIN boundary',
    route: '/control-tower?demo_mode=1&preset=peds-abstain',
    why: 'Show intended-use enforcement: no output outside approved cohort.',
    hostTalkTrack: 'ABSTAIN keeps the model silent in this context and routes to manual review.'
  },
  {
    order: 3,
    title: 'CAUTION drift path',
    route: '/control-tower?demo_mode=1&preset=drift-caution',
    why: 'Show governed continuation under monitored risk, then open drift and change-control evidence.',
    hostTalkTrack: 'We continue carefully, inspect drift evidence, and launch governed change proposal if signal persists.'
  },
  {
    order: 4,
    title: 'SMART live path',
    route: '/smart/launch',
    why: 'Close with EHR-native proof path: launch, callback, patient summary, and shadow scoring.',
    hostTalkTrack: 'Now we show the live SMART path from launch context to patient-scoped shadow scoring.'
  }
];

const recoverySteps = [
  'If case list is empty, use `Reset filters` in Control Tower first.',
  'If deterministic case still does not appear, run `Reset demo`, then re-open the same shortcut.',
  'If source drifted to Epic Sandbox, switch source back to `Seeded Demo` and reapply shortcut.',
  'If SMART launch is missing context, restart from `/integrations/epic` and then retry `/smart/launch`.'
];

const prepChecks = [
  'Open `/launch/demo-kit` and keep it as external audience companion page.',
  'Use write-enabled demo role for mutating actions during Q&A.',
  'Confirm HOLD, ABSTAIN, and CAUTION shortcuts each resolve one deterministic case.',
  'Keep one browser tab on `/audit` for evidence deep-links during follow-up questions.'
];

export default function DemoModePage() {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Demo Mode</CardTitle>
          <CardDescription>
            Operator-first entry for deterministic executive walkthroughs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Use this flow when recording or hosting external demos. Keep the route order fixed to maintain consistent trust narrative:
            HOLD, ABSTAIN, CAUTION, then SMART live path.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/launch/demo-kit">
              <Button variant="outline">Open Launch Demo Kit</Button>
            </Link>
            <Link href="/control-tower?demo_mode=1&preset=unit-hold">
              <Button>Start Demo Flow</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deterministic Route Order</CardTitle>
          <CardDescription>Follow this order without skipping steps.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {deterministicFlow.map((step) => (
            <div key={step.order} className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Step {step.order}</Badge>
                  <p className="font-medium text-foreground">{step.title}</p>
                </div>
                <Link href={step.route}>
                  <Button size="sm" variant="outline">
                    Open route
                  </Button>
                </Link>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{step.why}</p>
              <p className="mt-2 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                Host line: {step.hostTalkTrack}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Route: {step.route}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pre-flight checks</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {prepChecks.map((item) => (
                <li key={item} className="rounded-md border border-border bg-muted/20 px-2 py-1.5">
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fallback and recovery</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {recoverySteps.map((item) => (
                <li key={item} className="rounded-md border border-border bg-muted/20 px-2 py-1.5">
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
