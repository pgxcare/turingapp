'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  clearEpicConnectionState,
  EPIC_CONNECTION_CHANGE_EVENT,
  readEpicConnectionSnapshot,
  type EpicConnectionSnapshot
} from '@/lib/epic-connection';
import { cn } from '@/lib/utils';

type EhrConnectionBannerProps = {
  className?: string;
};

export function EhrConnectionBanner({ className }: EhrConnectionBannerProps) {
  const { pushToast } = useToast();
  const [snapshot, setSnapshot] = useState<EpicConnectionSnapshot | null>(null);

  useEffect(() => {
    const sync = () => setSnapshot(readEpicConnectionSnapshot());
    sync();

    window.addEventListener('focus', sync);
    window.addEventListener('storage', sync);
    window.addEventListener(EPIC_CONNECTION_CHANGE_EVENT, sync);

    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener(EPIC_CONNECTION_CHANGE_EVENT, sync);
    };
  }, []);

  const connected = snapshot?.connected ?? false;
  const busy = snapshot === null;

  const lastSyncLabel = useMemo(() => {
    if (busy) return 'Reading local Epic connection state...';
    if (!connected) return 'Epic feed is not connected.';
    if (!snapshot?.lastSyncAt) return 'Last sync: unavailable.';
    const parsed = new Date(snapshot.lastSyncAt);
    if (Number.isNaN(parsed.getTime())) return `Last sync: ${snapshot.lastSyncAt}`;
    return `Last sync: ${parsed.toLocaleString()}`;
  }, [busy, connected, snapshot?.lastSyncAt]);

  const statusLabel = busy ? 'Checking...' : connected ? 'Connected' : 'Disconnected';

  return (
    <div
      className={cn(
        'epic-contour flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        connected && 'epic-contour--active',
        className
      )}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5">
            <span
              className={cn(
                'connection-lamp',
                busy ? 'connection-lamp--busy' : connected ? 'connection-lamp--on' : 'connection-lamp--off'
              )}
            />
            <span className="text-sm font-medium">EHR: {statusLabel}</span>
          </div>
          {snapshot?.analysisStarted ? (
            <span className="text-xs font-medium text-emerald-700">Inspection ready</span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{lastSyncLabel}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Button variant="outline" size="sm">
            Epic Onboarding
          </Button>
        </Link>

        {connected ? (
          <Button
            variant="outline"
            size="sm"
            className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
            onClick={() => {
              clearEpicConnectionState();
              pushToast({
                title: 'EHR disconnected',
                description: 'Epic feed session cleared (local demo state).',
                variant: 'info'
              });
            }}
          >
            Disconnect
          </Button>
        ) : null}
      </div>
    </div>
  );
}
