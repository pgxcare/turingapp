'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  clearEpicConnectionState,
  EPIC_CONNECTION_CHANGE_EVENT,
  readEpicConnectionSnapshot,
  type EpicConnectionSnapshot
} from '@/lib/epic-connection';
import { cn } from '@/lib/utils';

type EhrConnectionStatusProps = {
  className?: string;
};

export function EhrConnectionStatus({ className }: EhrConnectionStatusProps) {
  const { pushToast } = useToast();
  const [snapshot, setSnapshot] = useState<EpicConnectionSnapshot>({
    connected: false,
    analysisStarted: false,
    lastSyncAt: null
  });

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

  const lastSyncLabel = useMemo(() => {
    if (!snapshot.connected || !snapshot.lastSyncAt) return 'Not connected.';
    const parsed = new Date(snapshot.lastSyncAt);
    if (Number.isNaN(parsed.getTime())) return `Last sync: ${snapshot.lastSyncAt}`;
    return `Last sync: ${parsed.toLocaleString()}`;
  }, [snapshot.connected, snapshot.lastSyncAt]);

  const chipClass = snapshot.connected
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700';

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Link
        href="/"
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Manage EHR connection"
      >
        <Badge variant="outline" className={cn('gap-1 border select-none', chipClass)} title={lastSyncLabel}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          EHR: {snapshot.connected ? 'Connected' : 'Disconnected'}
        </Badge>
      </Link>

      {snapshot.connected ? (
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
  );
}
