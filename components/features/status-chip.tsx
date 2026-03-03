import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type HealthStatus = 'Green' | 'Yellow' | 'Red' | string;
type GateStatus = 'PASS' | 'WARN' | 'FAIL' | string;
type PolicyOutcome = 'ALLOW' | 'CAUTION' | 'ABSTAIN' | 'HOLD' | string;
type DemoSource = 'seeded_demo' | 'epic_sandbox' | string;

const HEALTH_STYLES: Record<string, string> = {
  Green: 'border-emerald-300 bg-emerald-100 text-emerald-900',
  Yellow: 'border-amber-300 bg-amber-100 text-amber-900',
  Red: 'border-rose-300 bg-rose-100 text-rose-900'
};

const GATE_STYLES: Record<string, string> = {
  PASS: 'border-emerald-300 bg-emerald-100 text-emerald-900',
  WARN: 'border-amber-300 bg-amber-100 text-amber-900',
  FAIL: 'border-rose-300 bg-rose-100 text-rose-900'
};

const OUTCOME_STYLES: Record<string, string> = {
  ALLOW: 'border-emerald-300 bg-emerald-100 text-emerald-900',
  CAUTION: 'border-amber-300 bg-amber-100 text-amber-900',
  ABSTAIN: 'border-slate-300 bg-slate-100 text-slate-900',
  HOLD: 'border-zinc-400 bg-zinc-200 text-zinc-900'
};

const SOURCE_STYLES: Record<string, string> = {
  seeded_demo: 'border-blue-300 bg-blue-100 text-blue-900',
  epic_sandbox: 'border-violet-300 bg-violet-100 text-violet-900'
};

const SOURCE_LABELS: Record<string, string> = {
  seeded_demo: 'Seeded Demo',
  epic_sandbox: 'Epic Sandbox'
};

function chipClass(map: Record<string, string>, value: string) {
  return map[value] || 'border-border bg-background text-foreground';
}

export function HealthChip({ status }: { status: HealthStatus }) {
  return (
    <Badge variant="outline" className={cn('gap-1 border', chipClass(HEALTH_STYLES, status))}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </Badge>
  );
}

export function GateChip({ status }: { status: GateStatus }) {
  const icon =
    status === 'PASS' ? (
      <CheckCircle2 className="h-3.5 w-3.5" />
    ) : status === 'WARN' ? (
      <AlertTriangle className="h-3.5 w-3.5" />
    ) : status === 'FAIL' ? (
      <XCircle className="h-3.5 w-3.5" />
    ) : null;

  return (
    <Badge variant="outline" className={cn('gap-1 border', chipClass(GATE_STYLES, status))}>
      {icon}
      {status}
    </Badge>
  );
}

// Backward-compatible alias used by existing pages.
export function GateStatusChip({ status }: { status: GateStatus }) {
  return <GateChip status={status} />;
}

export function OutcomeChip({ outcome }: { outcome: PolicyOutcome }) {
  return (
    <Badge variant="outline" className={cn('border', chipClass(OUTCOME_STYLES, outcome))}>
      {outcome}
    </Badge>
  );
}

export function SourceChip({ source }: { source: DemoSource }) {
  const normalized = (source || '').toLowerCase();
  return (
    <Badge variant="outline" className={cn('border', chipClass(SOURCE_STYLES, normalized))}>
      {SOURCE_LABELS[normalized] || source || 'Seeded Demo'}
    </Badge>
  );
}

export function StatusLegend({ className }: { className?: string }) {
  return (
    <details className={cn('group rounded-lg border border-border bg-muted/40', className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <span>Status legend</span>
        <span className="text-xs font-normal text-muted-foreground/80">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <div className="grid gap-2 px-3 pb-3 md:grid-cols-3">
        <div className="space-y-1 rounded-md border border-border/70 bg-background/70 p-2">
          <p className="text-xs font-medium text-muted-foreground">Health</p>
          <div className="flex flex-wrap gap-1">
            <HealthChip status="Green" />
            <HealthChip status="Yellow" />
            <HealthChip status="Red" />
          </div>
          <p className="text-[11px] text-muted-foreground">Green = stable, Yellow = watch, Red = critical risk.</p>
        </div>
        <div className="space-y-1 rounded-md border border-border/70 bg-background/70 p-2">
          <p className="text-xs font-medium text-muted-foreground">Gate</p>
          <div className="flex flex-wrap gap-1">
            <GateChip status="PASS" />
            <GateChip status="WARN" />
            <GateChip status="FAIL" />
          </div>
          <p className="text-[11px] text-muted-foreground">PASS = pass checks, WARN = caution, FAIL = block condition.</p>
        </div>
        <div className="space-y-1 rounded-md border border-border/70 bg-background/70 p-2">
          <p className="text-xs font-medium text-muted-foreground">Outcome</p>
          <div className="flex flex-wrap gap-1">
            <OutcomeChip outcome="ALLOW" />
            <OutcomeChip outcome="CAUTION" />
            <OutcomeChip outcome="ABSTAIN" />
            <OutcomeChip outcome="HOLD" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            ALLOW = proceed, CAUTION = investigate, ABSTAIN = manual review, HOLD = stop and escalate.
          </p>
        </div>
      </div>
    </details>
  );
}

// Backward-compatible alias used in existing pages.
export function StatusChip({ status }: { status: HealthStatus }) {
  return <HealthChip status={status} />;
}
