'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { OutcomeChip } from '@/components/features/status-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { clearEpicConnectionState, emitEpicConnectionChanged, EPIC_CONNECTION_CHANGE_EVENT } from '@/lib/epic-connection';
import { clearSmartTokenSession, loadSmartTokenSession, smartTokenLooksExpired } from '@/lib/smart-session';
import { useQueryResource } from '@/lib/use-query-resource';
import { cn } from '@/lib/utils';
import { AuditCase, AuditCaseListPayload, ControlTowerPayload } from '@/types/api';

type ChecklistResponse = {
  checklist: Array<{
    id: string;
    title: string;
    description: string;
    required: boolean;
    status: 'Pending' | 'Ready' | 'Needs Input';
  }>;
  minimum_fields: string[];
};

type ToolState = 'idle' | 'loading' | 'ready';

type ConnectionSource = 'epic' | 'sandbox';

type InspectionScope = {
  target: 'all' | 'epic_sepsis_bpa' | 'epic_deterioration_index';
  unit: 'all' | 'ED-North' | 'Ward-5A';
  window: '24h' | '7d' | '14d';
};

const CONNECT_STAGES = [
  'Opening sandbox read-only feed...',
  'Validating data contract and schema mapping...',
  'Syncing model score streams and BPA logs...',
  'Sandbox connected. Awaiting inspection scope...'
] as const;

const INSPECTION_STAGES = [
  'Loading selected cohort from Epic extracts...',
  'Running Data Quality and OOD checks...',
  'Running drift and policy outcome simulation...',
  'Building analyst-ready investigation snapshot...'
] as const;

const AI_INSPECTION_TOOLS = [
  'Data Quality Gate',
  'OOD / Intended Use Gate',
  'Drift Monitor',
  'Policy Outcome Engine',
  'Reason Code Indexer',
  'Audit Evidence Extractor'
] as const;

const TOOL_STATE_CLASS: Record<ToolState, string> = {
  idle: 'epic-tool-chip--idle',
  loading: 'epic-tool-chip--loading',
  ready: 'epic-tool-chip--ready'
};

const STORAGE_KEYS = {
  connected: 'tt_epic_connected',
  lastSync: 'tt_epic_last_sync',
  analysisStarted: 'tt_analysis_started',
  scope: 'tt_inspection_scope'
} as const;

const DEFAULT_SCOPE: InspectionScope = {
  target: 'all',
  unit: 'all',
  window: '7d'
};

const DEFAULT_EPIC_ISS = process.env.NEXT_PUBLIC_EPIC_ISS || 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4';

function statusVariant(status: string): 'outline' | 'warning' | 'success' {
  if (status === 'Ready') return 'success';
  if (status === 'Needs Input') return 'warning';
  return 'outline';
}

function scenarioVariant(status: 'done' | 'active' | 'blocked'): 'success' | 'warning' | 'outline' {
  if (status === 'done') return 'success';
  if (status === 'active') return 'warning';
  return 'outline';
}

function scenarioLabel(status: 'done' | 'active' | 'blocked') {
  if (status === 'done') return 'Complete';
  if (status === 'active') return 'In progress';
  return 'Blocked';
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);

    handleChange();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return prefersReducedMotion;
}

function playFlipSwapAnimation(
  element: HTMLElement,
  previousRect: DOMRect,
  currentRect: DOMRect,
  durationMs: number
): Animation | null {
  const dx = previousRect.left - currentRect.left;
  const dy = previousRect.top - currentRect.top;
  const scaleX = previousRect.width / currentRect.width;
  const scaleY = previousRect.height / currentRect.height;

  const isNearlySame =
    Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(scaleX - 1) < 0.01 && Math.abs(scaleY - 1) < 0.01;
  if (isNearlySame) return null;

  return element.animate(
    [
      {
        transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`,
        filter: 'blur(8px)',
        opacity: 0.82,
      },
      {
        transform: 'translate(0px, 0px) scale(1, 1)',
        filter: 'blur(0px)',
        opacity: 1,
      },
    ],
    {
      duration: durationMs,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    }
  );
}

function parseScope(rawValue: string | null): InspectionScope {
  if (!rawValue) return DEFAULT_SCOPE;
  try {
    const parsed = JSON.parse(rawValue) as Partial<InspectionScope>;
    if (
      (parsed.target === 'all' || parsed.target === 'epic_sepsis_bpa' || parsed.target === 'epic_deterioration_index') &&
      (parsed.unit === 'all' || parsed.unit === 'ED-North' || parsed.unit === 'Ward-5A') &&
      (parsed.window === '24h' || parsed.window === '7d' || parsed.window === '14d')
    ) {
      return parsed as InspectionScope;
    }
  } catch {
    return DEFAULT_SCOPE;
  }
  return DEFAULT_SCOPE;
}

function scopeLabel(scope: InspectionScope) {
  const target =
    scope.target === 'all'
      ? 'All pilot models'
      : scope.target === 'epic_sepsis_bpa'
        ? 'Epic Sepsis BPA'
        : 'Epic Deterioration Index';

  const unit = scope.unit === 'all' ? 'All units' : scope.unit;
  const window = scope.window === '24h' ? 'Last 24h' : scope.window === '7d' ? 'Last 7 days' : 'Last 14 days';

  return `${target} • ${unit} • ${window}`;
}

function humanizeReasonCode(reasonCode: string | null) {
  if (!reasonCode) return 'review_required';
  return reasonCode.replace(/_/g, ' ');
}

function windowBounds(window: InspectionScope['window']) {
  const now = Date.now();
  const durationMs =
    window === '24h' ? 24 * 60 * 60 * 1000 : window === '7d' ? 7 * 24 * 60 * 60 * 1000 : 14 * 24 * 60 * 60 * 1000;
  return {
    startIso: new Date(now - durationMs).toISOString(),
    endIso: new Date(now).toISOString(),
  };
}

function stagedToolStates(currentStage: number, totalStages: number): ToolState[] {
  const progress = (currentStage + 1) / totalStages;
  const readyCount = Math.min(AI_INSPECTION_TOOLS.length, Math.floor(progress * AI_INSPECTION_TOOLS.length));
  const activeIndex = readyCount < AI_INSPECTION_TOOLS.length ? readyCount : -1;

  return AI_INSPECTION_TOOLS.map((_, index) => {
    if (index < readyCount) return 'ready';
    if (index === activeIndex) return 'loading';
    return 'idle';
  });
}

export default function EpicOnboardingPage() {
  const { pushToast } = useToast();
  const {
    data: checklistData,
    error: checklistError,
    refetch: refetchChecklist
  } = useQueryResource<ChecklistResponse>(() => api.get('/integrations/epic-checklist'));
  const {
    data: controlTowerData,
    error: controlTowerError,
    refetch: refetchControlTower
    } = useQueryResource<ControlTowerPayload>(() => api.get('/metrics/control-tower'));

    const [connected, setConnected] = useState(false);
    const [hasSmartSession, setHasSmartSession] = useState(false);
    const [connectionSource, setConnectionSource] = useState<ConnectionSource>('sandbox');
    const [analysisStarted, setAnalysisStarted] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [inspecting, setInspecting] = useState(false);
    const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
    const [connectError, setConnectError] = useState('');
  const [connectStage, setConnectStage] = useState(0);
  const [inspectionStage, setInspectionStage] = useState(0);
  const [scope, setScope] = useState<InspectionScope>(DEFAULT_SCOPE);
  const [showTrace, setShowTrace] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [firstFindings, setFirstFindings] = useState<AuditCase[]>([]);
  const [firstFindingsLoading, setFirstFindingsLoading] = useState(false);
  const [firstFindingsError, setFirstFindingsError] = useState('');
  const [swapFxActive, setSwapFxActive] = useState(false);
  const [highlightControlTower, setHighlightControlTower] = useState(false);

  const prefersReducedMotion = usePrefersReducedMotion();
  const connectionSourceLocked = connecting || inspecting || connected || hasSmartSession;
  const inspectionPanelRef = useRef<HTMLDivElement | null>(null);
  const detectionPanelRef = useRef<HTMLDivElement | null>(null);
    const previousRectsRef = useRef<{ inspection: DOMRect; detection: DOMRect } | null>(null);
    const previousShowDetectionRef = useRef(false);
    const previousInspectingRef = useRef(false);
  const disconnectSwapRequestedRef = useRef(false);
  const activeSwapAnimationsRef = useRef<Animation[]>([]);
  const swapFxTimeoutRef = useRef<number | null>(null);
  const highlightStartTimeoutRef = useRef<number | null>(null);
  const highlightStopTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncConnectionState = () => {
      const smartSession = loadSmartTokenSession();
      const smartReady = smartSession ? !smartTokenLooksExpired(smartSession) : false;
      const isConnected = localStorage.getItem(STORAGE_KEYS.connected) === '1';
      const isAnalysisStarted = localStorage.getItem(STORAGE_KEYS.analysisStarted) === '1';

      setHasSmartSession(smartReady);
      setConnected(isConnected);
      setAnalysisStarted(isConnected && isAnalysisStarted);
      setLastSyncAt(isConnected ? localStorage.getItem(STORAGE_KEYS.lastSync) : null);
      setScope(parseScope(localStorage.getItem(STORAGE_KEYS.scope)));
      setConnectStage(isConnected ? CONNECT_STAGES.length - 1 : 0);
      setInspectionStage(isConnected && isAnalysisStarted ? INSPECTION_STAGES.length - 1 : 0);

      if (!isConnected) {
        setConnecting(false);
        setInspecting(false);
        setConnectError('');
      }
    };

    syncConnectionState();
    window.addEventListener('focus', syncConnectionState);
    window.addEventListener('storage', syncConnectionState);
    window.addEventListener(EPIC_CONNECTION_CHANGE_EVENT, syncConnectionState);

    return () => {
      window.removeEventListener('focus', syncConnectionState);
      window.removeEventListener('storage', syncConnectionState);
      window.removeEventListener(EPIC_CONNECTION_CHANGE_EVENT, syncConnectionState);
      };
  }, []);

  useEffect(() => {
    if (hasSmartSession) {
      setConnectionSource('epic');
      return;
    }
    if (connected) {
      setConnectionSource('sandbox');
    }
  }, [connected, hasSmartSession]);

    useEffect(() => {
      if (connecting || inspecting) {
        setShowTrace(true);
      }
    }, [connecting, inspecting]);

  const checklist = checklistData?.checklist ?? [];
  const minimumFields = checklistData?.minimum_fields ?? [];
  const requiredTotal = checklist.filter((item) => item.required).length;
  const requiredReady = checklist.filter((item) => item.required && item.status === 'Ready').length;

  const scopedModels = useMemo(() => {
    const models = controlTowerData?.models ?? [];
    if (scope.target === 'all') return models;
    return models.filter((model) => model.code === scope.target);
  }, [controlTowerData, scope.target]);

  const scopedModelId = useMemo(() => {
    if (scope.target === 'all') return '';
    return scopedModels[0]?.id ?? '';
  }, [scope.target, scopedModels]);

  const atRiskModels = useMemo(() => scopedModels.filter((model) => model.health !== 'Green'), [scopedModels]);
  const openIncidentsCount = useMemo(
    () => scopedModels.reduce((sum, model) => sum + (model.open_incidents ?? 0), 0),
    [scopedModels]
  );
  const standaloneSmartLaunchHref = useMemo(
    () => `/smart/launch?iss=${encodeURIComponent(DEFAULT_EPIC_ISS)}`,
    []
  );

  const connectionProgress = connecting
    ? Math.round(((connectStage + 1) / CONNECT_STAGES.length) * 100)
    : inspecting
      ? Math.round(((inspectionStage + 1) / INSPECTION_STAGES.length) * 100)
      : analysisStarted
        ? 100
        : connected
          ? 55
          : 0;

  const connectionMessage = connecting
    ? CONNECT_STAGES[connectStage]
    : inspecting
      ? INSPECTION_STAGES[inspectionStage]
      : analysisStarted
        ? `Inspection complete for: ${scopeLabel(scope)}`
        : connected
          ? 'Sandbox connected. Choose scope and run safety inspection.'
          : hasSmartSession
            ? 'Sandbox demo feed is not connected. Flip to Sandbox to run inspection, or open SMART workspace.'
            : 'Sandbox demo feed is not connected. Connect Sandbox to run inspection, or switch to Epic SMART.';

  const toolStates = useMemo<ToolState[]>(() => {
    if (connecting) return stagedToolStates(connectStage, CONNECT_STAGES.length);
    if (inspecting) return stagedToolStates(inspectionStage, INSPECTION_STAGES.length);
    if (analysisStarted) return AI_INSPECTION_TOOLS.map(() => 'ready');
    return AI_INSPECTION_TOOLS.map(() => 'idle');
  }, [analysisStarted, connectStage, connecting, inspectionStage, inspecting]);

  const showDetection = connected && analysisStarted && !inspecting;

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const inspectionEl = inspectionPanelRef.current;
    const detectionEl = detectionPanelRef.current;

    if (!inspectionEl || !detectionEl) {
      previousShowDetectionRef.current = showDetection;
      previousInspectingRef.current = inspecting;
      return;
    }

    const currentRects = {
      inspection: inspectionEl.getBoundingClientRect(),
      detection: detectionEl.getBoundingClientRect(),
    };

    const previousRects = previousRectsRef.current;
    const showDetectionChanged = previousShowDetectionRef.current !== showDetection;
    const didJustCompleteInspection = previousInspectingRef.current && !inspecting && analysisStarted;
    const shouldAnimateDisconnectSwap = showDetectionChanged && !showDetection && disconnectSwapRequestedRef.current;

    if (shouldAnimateDisconnectSwap) {
      disconnectSwapRequestedRef.current = false;
    }

    if (showDetectionChanged && showDetection && didJustCompleteInspection) {
      const swapDurationMs = 720;
      const highlightDelayMs = prefersReducedMotion ? 0 : Math.max(0, swapDurationMs - 120);
      const highlightDurationMs = 9000;

      if (highlightStartTimeoutRef.current) {
        window.clearTimeout(highlightStartTimeoutRef.current);
      }
      if (highlightStopTimeoutRef.current) {
        window.clearTimeout(highlightStopTimeoutRef.current);
      }

      setHighlightControlTower(false);

      highlightStartTimeoutRef.current = window.setTimeout(() => setHighlightControlTower(true), highlightDelayMs);
      highlightStopTimeoutRef.current = window.setTimeout(
        () => setHighlightControlTower(false),
        highlightDelayMs + highlightDurationMs
      );
    }

    if (
      previousRects &&
      showDetectionChanged &&
      !prefersReducedMotion &&
      ((showDetection && didJustCompleteInspection) || shouldAnimateDisconnectSwap)
    ) {
      const durationMs = 720;

      activeSwapAnimationsRef.current.forEach((animation) => animation.cancel());
      activeSwapAnimationsRef.current = [];

      if (swapFxTimeoutRef.current) {
        window.clearTimeout(swapFxTimeoutRef.current);
      }
      setSwapFxActive(true);
      swapFxTimeoutRef.current = window.setTimeout(() => setSwapFxActive(false), durationMs);

      const inspectionAnimation = playFlipSwapAnimation(
        inspectionEl,
        previousRects.inspection,
        currentRects.inspection,
        durationMs
      );
      const detectionAnimation = playFlipSwapAnimation(
        detectionEl,
        previousRects.detection,
        currentRects.detection,
        durationMs
      );

      activeSwapAnimationsRef.current = [inspectionAnimation, detectionAnimation].filter(Boolean) as Animation[];
    }

    previousRectsRef.current = currentRects;
    previousShowDetectionRef.current = showDetection;
    previousInspectingRef.current = inspecting;
  });

  useEffect(() => {
    return () => {
      activeSwapAnimationsRef.current.forEach((animation) => animation.cancel());
      if (swapFxTimeoutRef.current) {
        window.clearTimeout(swapFxTimeoutRef.current);
      }
      if (highlightStartTimeoutRef.current) {
        window.clearTimeout(highlightStartTimeoutRef.current);
      }
      if (highlightStopTimeoutRef.current) {
        window.clearTimeout(highlightStopTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showDetection) {
      setFirstFindings([]);
      setFirstFindingsError('');
      setFirstFindingsLoading(false);
      return;
    }

    setFirstFindingsLoading(true);
    setFirstFindingsError('');

    if (scope.target !== 'all' && !scopedModelId) {
      setFirstFindings([]);
      setFirstFindingsError('Selected target is missing from the latest model snapshot.');
      setFirstFindingsLoading(false);
      return;
    }

    const params = new URLSearchParams();
    params.set('limit', '50');
    params.set('offset', '0');

    if (scopedModelId) {
      params.set('model_id', scopedModelId);
    }

    const bounds = windowBounds(scope.window);
    params.set('start_time', bounds.startIso);
    params.set('end_time', bounds.endIso);

    api
      .get<AuditCaseListPayload>(`/audit/cases?${params.toString()}`)
      .then((payload) => {
        const filtered =
          scope.unit === 'all' ? payload.items : payload.items.filter((item) => item.location_unit === scope.unit);
        setFirstFindings(filtered.slice(0, 3));
      })
      .catch((error) => {
        setFirstFindings([]);
        setFirstFindingsError(error instanceof Error ? error.message : 'Failed to load first findings');
      })
      .finally(() => {
        setFirstFindingsLoading(false);
      });
  }, [scopedModelId, scope.target, scope.unit, scope.window, showDetection]);

  const scenarioSteps = [
    {
      id: '1',
      title: 'Connect to Sandbox',
      description: 'Activate read-only sandbox sync for pilot data streams.',
      status: connected ? ('done' as const) : ('active' as const)
    },
    {
      id: '2',
      title: 'Choose inspection scope',
      description: 'Select model family, unit, and time window for analysis.',
      status: connected ? ('active' as const) : ('blocked' as const)
    },
    {
      id: '3',
      title: 'Run safety inspection',
      description: 'Execute gates and policy evaluation for the selected scope.',
      status: showDetection ? ('done' as const) : connected || inspecting ? ('active' as const) : ('blocked' as const)
    },
    {
      id: '4',
      title: 'Investigate and act',
      description: 'Open Control Tower to investigate findings and triage incidents.',
      status: showDetection ? ('active' as const) : ('blocked' as const)
    }
  ];

  async function handleConnect() {
    if (connecting || inspecting) return;

    const wasConnected = connected;
    setConnecting(true);
    setConnectError('');
    setConnectStage(0);

    try {
      const syncPromise = Promise.all([
        api.get<ChecklistResponse>('/integrations/epic-checklist'),
        api.get<ControlTowerPayload>('/metrics/control-tower')
      ]);

      for (let index = 0; index < CONNECT_STAGES.length; index += 1) {
        setConnectStage(index);
        await sleep(520);
      }

      const [checklistPayload, controlTowerPayload] = await syncPromise;
      await Promise.all([refetchChecklist(), refetchControlTower()]);

      const isConnected =
        Boolean(checklistPayload.checklist.length) &&
        Boolean(controlTowerPayload.models.length >= 0);

      if (!isConnected) {
        throw new Error('Sandbox sync returned empty payload');
      }

      const syncedAt = new Date().toISOString();
      setConnected(true);
      setLastSyncAt(syncedAt);

      if (!wasConnected) {
        setAnalysisStarted(false);
        setInspectionStage(0);
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.connected, '1');
        localStorage.setItem(STORAGE_KEYS.lastSync, syncedAt);
        if (!wasConnected) {
          localStorage.removeItem(STORAGE_KEYS.analysisStarted);
        }
      }
      emitEpicConnectionChanged();

      pushToast({
        title: 'Sandbox connected',
        description: 'Sandbox feed is ready. Choose scope and run safety inspection.',
        variant: 'success'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      setConnected(false);
      setAnalysisStarted(false);
      setLastSyncAt(null);
      setConnectError(message);
      setConnectStage(0);
      clearEpicConnectionState();
      pushToast({
        title: 'Sandbox connection failed',
        description: message,
        variant: 'error'
      });
    } finally {
      setConnecting(false);
    }
  }

  async function handleRunInspection() {
    if (!connected || connecting || inspecting) return;

    setInspecting(true);
    setConnectError('');
    setInspectionStage(0);

    try {
      const refreshPromise = Promise.all([refetchChecklist(), refetchControlTower()]);

      for (let index = 0; index < INSPECTION_STAGES.length; index += 1) {
        setInspectionStage(index);
        await sleep(620);
      }

      await refreshPromise;

      setAnalysisStarted(true);

      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.analysisStarted, '1');
        localStorage.setItem(STORAGE_KEYS.scope, JSON.stringify(scope));
        localStorage.setItem('tt_analysis_started', '1');
      }
      emitEpicConnectionChanged();

      pushToast({
        title: 'Inspection complete',
        description: `Scope processed: ${scopeLabel(scope)}`,
        variant: 'success'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Inspection failed';
      setConnectError(message);
      pushToast({
        title: 'Inspection failed',
        description: message,
        variant: 'error'
      });
    } finally {
      setInspecting(false);
    }
  }

  function handleDisconnect() {
    if (connecting || inspecting) return;

    disconnectSwapRequestedRef.current = showDetection;

    setConnected(false);
    setAnalysisStarted(false);
    setConnecting(false);
    setInspecting(false);
    setConnectError('');
    setConnectStage(0);
    setInspectionStage(0);
    setLastSyncAt(null);

    clearEpicConnectionState();

    pushToast({
      title: 'Sandbox disconnected',
      description: 'Sandbox state cleared. Reconnect sandbox and run inspection again.',
      variant: 'info'
    });
  }

  function handleDisconnectEpic() {
    if (connecting || inspecting) return;
    clearSmartTokenSession();
    emitEpicConnectionChanged();
    pushToast({
      title: 'Epic disconnected',
      description: 'SMART session cleared for this browser session.',
      variant: 'info'
    });
  }

  const sandboxCard = (
    <div className="rounded-lg border border-border bg-background/70 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-start gap-2">
          <span
            className={cn(
              'connection-lamp mt-1',
              connecting || inspecting ? 'connection-lamp--busy' : connected ? 'connection-lamp--on' : 'connection-lamp--off'
            )}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium">Sandbox demo feed</p>
            <p className="text-xs text-muted-foreground min-h-8">No credentials required. Use this to run inspection.</p>
          </div>
        </div>
        <Badge variant={connecting || inspecting ? 'warning' : connected ? 'success' : 'outline'} className="shrink-0">
          {connecting || inspecting ? 'Running' : connected ? 'Connected' : 'Demo'}
        </Badge>
      </div>

      {connected ? (
        <Button
          variant="outline"
          className="w-full border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
          onClick={handleDisconnect}
          disabled={connecting || inspecting}
        >
          Disconnect sandbox
        </Button>
      ) : (
        <Button variant="outline" className="w-full" onClick={handleConnect} disabled={connecting || inspecting}>
          {connecting ? 'Connecting sandbox...' : 'Connect to Sandbox'}
        </Button>
      )}

      <Button className="w-full" onClick={handleRunInspection} disabled={!connected || connecting || inspecting}>
        {inspecting ? 'Running safety inspection...' : showDetection ? 'Re-run safety inspection' : 'Run safety inspection'}
      </Button>

      <p className="text-xs text-muted-foreground">
        {lastSyncAt ? `Last sync: ${new Date(lastSyncAt).toLocaleString()}` : 'Not connected yet.'}
      </p>
    </div>
  );

  const epicCard = (
    <div className="rounded-lg border border-border bg-background/70 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-start gap-2">
          <span className={cn('connection-lamp mt-1', hasSmartSession ? 'connection-lamp--on' : 'connection-lamp--off')} />
          <div className="min-w-0">
            <p className="text-sm font-medium">Epic SMART</p>
            <p className="text-xs text-muted-foreground min-h-8">Unlock the live patient workspace.</p>
          </div>
        </div>
        {hasSmartSession ? (
          <Badge variant="success" className="shrink-0">
            Connected
          </Badge>
        ) : null}
      </div>

      {hasSmartSession ? (
        <Button
          variant="outline"
          className="w-full border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
          onClick={handleDisconnectEpic}
          disabled={connecting || inspecting}
        >
          Disconnect Epic
        </Button>
      ) : (
        <Link href={standaloneSmartLaunchHref} className="block">
          <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700" disabled={connecting || inspecting}>
            Connect to Epic
          </Button>
        </Link>
      )}

      {hasSmartSession ? (
        <Link href="/smart/patient" className="block">
          <Button variant="outline" className="w-full" disabled={connecting || inspecting}>
            Open live SMART workspace
          </Button>
        </Link>
      ) : (
        <Button variant="outline" className="w-full" disabled>
          Open live SMART workspace
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        {hasSmartSession ? 'SMART session active in this browser session.' : 'Connect to Epic if you have credentials.'}
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="relative grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        {swapFxActive ? <div className="epic-panel-swap-overlay" aria-hidden="true" /> : null}

        <div ref={inspectionPanelRef} className={cn(showDetection ? 'order-2' : 'order-1')}>
          <Card className="bg-white/85">
            <CardHeader>
              <CardTitle>Inspection Control Panel</CardTitle>
              <CardDescription>Main operator actions are here: connect, scope, run, investigate.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-background/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Session State</p>
                  <Badge variant={showDetection ? 'success' : connecting || inspecting ? 'warning' : 'outline'}>
                    {showDetection
                      ? 'Insights ready'
                      : connecting || inspecting
                        ? 'Running'
                        : connected
                          ? 'Sandbox connected'
                          : 'Idle'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{connectionMessage}</p>
                <div className="epic-progress mt-3">
                  <div
                    className={cn('epic-progress-fill', (connecting || inspecting) && 'epic-progress-fill--animated')}
                    style={{ width: `${connectionProgress}%` }}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background/70 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Inspection Scope</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="scope-target">Target</Label>
                    <Select
                      id="scope-target"
                      value={scope.target}
                      disabled={!connected || connecting || inspecting}
                      onChange={(event) =>
                        setScope((current) => ({ ...current, target: event.target.value as InspectionScope['target'] }))
                      }
                    >
                      <option value="all">All pilot models</option>
                      <option value="epic_sepsis_bpa">Epic Sepsis BPA</option>
                      <option value="epic_deterioration_index">Epic Deterioration Index</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="scope-unit">Unit</Label>
                    <Select
                      id="scope-unit"
                      value={scope.unit}
                      disabled={!connected || connecting || inspecting}
                      onChange={(event) =>
                        setScope((current) => ({ ...current, unit: event.target.value as InspectionScope['unit'] }))
                      }
                    >
                      <option value="all">All units</option>
                      <option value="ED-North">ED-North</option>
                      <option value="Ward-5A">Ward-5A</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="scope-window">Window</Label>
                    <Select
                      id="scope-window"
                      value={scope.window}
                      disabled={!connected || connecting || inspecting}
                      onChange={(event) =>
                        setScope((current) => ({ ...current, window: event.target.value as InspectionScope['window'] }))
                      }
                    >
                      <option value="24h">Last 24h</option>
                      <option value="7d">Last 7 days</option>
                      <option value="14d">Last 14 days</option>
                    </Select>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Current scope: {scopeLabel(scope)}</p>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Connection Source</p>
                    <p className="text-xs text-muted-foreground">Sandbox is default. Switch to Epic SMART for live SMART launch.</p>
                  </div>
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    <button
                      type="button"
                      className={cn(
                        'relative inline-flex items-center rounded-full border border-border bg-muted/60 p-1 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        connectionSourceLocked && 'opacity-70'
                      )}
                      title={
                        connectionSourceLocked
                          ? 'Selection locked while a connection is active. Disconnect to switch.'
                          : `Switch to ${connectionSource === 'epic' ? 'Sandbox' : 'Epic SMART'}`
                      }
                      onClick={() => setConnectionSource((current) => (current === 'epic' ? 'sandbox' : 'epic'))}
                      disabled={connectionSourceLocked}
                      role="switch"
                      aria-checked={connectionSource === 'sandbox'}
                      aria-label="Toggle connection source"
                    >
                      <span
                        className={cn(
                          'absolute inset-y-1 left-1 w-28 rounded-full bg-background shadow transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                          connectionSource === 'sandbox' && 'translate-x-full'
                        )}
                        aria-hidden="true"
                      />
                      <span
                        className={cn(
                          'relative z-10 flex h-8 w-28 items-center justify-center rounded-full px-3 text-xs font-medium transition-colors',
                          connectionSource === 'epic' ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        Epic SMART
                      </span>
                      <span
                        className={cn(
                          'relative z-10 flex h-8 w-28 items-center justify-center rounded-full px-3 text-xs font-medium transition-colors',
                          connectionSource === 'sandbox' ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        Sandbox
                      </span>
                    </button>
                    {connectionSourceLocked ? (
                      <p className="text-[11px] text-muted-foreground">Selection locked while connected.</p>
                    ) : null}
                  </div>
                </div>

                {prefersReducedMotion ? (
                  connectionSource === 'epic' ? (
                    epicCard
                  ) : (
                    sandboxCard
                  )
                ) : (
                  <div className="relative [perspective:1200px]">
                    <div
                      className={cn(
                        'grid transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] [transform-style:preserve-3d]',
                        connectionSource === 'sandbox' ? '[transform:rotateY(180deg)]' : '[transform:rotateY(0deg)]'
                      )}
                    >
                      <div
                        className={cn(
                          'col-start-1 row-start-1 [backface-visibility:hidden]',
                          connectionSource !== 'epic' && 'pointer-events-none'
                        )}
                        aria-hidden={connectionSource !== 'epic'}
                      >
                        {epicCard}
                      </div>
                      <div
                        className={cn(
                          'col-start-1 row-start-1 [transform:rotateY(180deg)] [backface-visibility:hidden]',
                          connectionSource !== 'sandbox' && 'pointer-events-none'
                        )}
                        aria-hidden={connectionSource !== 'sandbox'}
                      >
                        {sandboxCard}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                {connected
                  ? 'Next: choose scope and run safety inspection.'
                  : hasSmartSession
                    ? 'Epic SMART connected. Disconnect Epic to switch to Sandbox demo feed.'
                    : 'Sandbox demo feed is default. Connect Sandbox to run safety inspection, or switch to Epic SMART.'}
              </p>
              {connectError ? <p className="text-sm text-rose-700">{connectError}</p> : null}
              {checklistError ? <p className="text-sm text-rose-700">{checklistError}</p> : null}
              {controlTowerError && !controlTowerData ? (
                <p className="text-sm text-rose-700">{controlTowerError}</p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div ref={detectionPanelRef} className={cn(showDetection ? 'order-1' : 'order-2')}>
          <Card>
            <CardHeader>
              <CardTitle>Detection Snapshot</CardTitle>
              <CardDescription>
                {showDetection
                  ? 'Insights are ready. Open Control Tower to investigate.'
                  : 'Visible only after you explicitly run inspection.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {controlTowerError && !controlTowerData ? <p className="text-sm text-rose-700">{controlTowerError}</p> : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-background/70 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Models at risk</p>
                  <p className="mt-1 text-2xl font-semibold">{showDetection ? atRiskModels.length : '-'}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/70 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Open incidents</p>
                  <p className="mt-1 text-2xl font-semibold">{showDetection ? openIncidentsCount : '-'}</p>
                </div>
              </div>

              {showDetection ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-primary">First Findings (3)</p>
                    <div className="flex items-center gap-2">
                      <Link href="/control-tower">
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(highlightControlTower && 'epic-cta-highlight')}
                        >
                          Open Control Tower
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {firstFindingsLoading ? <p className="text-sm text-muted-foreground">Loading first findings...</p> : null}
                  {firstFindingsError ? <p className="text-sm text-rose-700">{firstFindingsError}</p> : null}

                  {!firstFindingsLoading && !firstFindingsError && firstFindings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No findings were returned by the latest inspection.</p>
                  ) : null}

                  {firstFindings.length > 0 ? (
                    <div className="space-y-2">
                      {firstFindings.map((finding) => (
                        <div key={finding.event_id} className="rounded-md border border-border bg-background/80 p-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">{finding.model_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {humanizeReasonCode(finding.primary_reason_code)} • {finding.encounter_id}
                              </p>
                            </div>
                            <OutcomeChip outcome={finding.outcome} />
                          </div>
                          <div className="mt-2">
                            <Link href={`/control-tower?case=${finding.event_id}`}>
                              <Button size="sm">Open case</Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {!connected
                    ? 'Connect sandbox feed first.'
                    : inspecting
                      ? 'Inspection is running. Snapshot will appear when complete.'
                      : 'Choose scope and click Run safety inspection to generate findings.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <Card className="bg-white/85">
        <CardHeader className="pb-2">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setShowTrace((value) => !value)}
            aria-expanded={showTrace}
          >
            <div>
              <p className="text-base font-semibold">Technical Trace (Optional)</p>
              <p className="text-sm text-muted-foreground">
                Epic boundary animation, AI tool states, and step-by-step workflow status.
              </p>
            </div>
            <Badge variant="outline">{showTrace ? 'Hide' : 'Show'}</Badge>
          </button>
        </CardHeader>
        {showTrace ? (
          <CardContent className="space-y-4">
            <div className={cn('epic-contour', (connecting || inspecting || connected) && 'epic-contour--active')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Epic Boundary Inspection</p>
                <Badge variant={showDetection ? 'success' : connecting || inspecting ? 'warning' : 'outline'}>
                  {showDetection
                    ? 'Insights ready'
                    : connecting || inspecting
                      ? 'Running'
                      : connected
                        ? 'Sandbox connected'
                        : 'Idle'}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{connectionMessage}</p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {AI_INSPECTION_TOOLS.map((tool, index) => (
                  <div key={tool} className={cn('epic-tool-chip', TOOL_STATE_CLASS[toolStates[index]])}>
                    <span className="epic-tool-dot" />
                    <span>{tool}</span>
                  </div>
                ))}
              </div>

              {connecting || inspecting ? <div className="epic-scanline" /> : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {scenarioSteps.map((step) => (
                <div key={step.id} className="rounded-lg border border-border bg-background/70 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Step {step.id}</p>
                      <p className="font-medium">{step.title}</p>
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                    </div>
                    <Badge variant={scenarioVariant(step.status)}>{scenarioLabel(step.status)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        ) : null}
      </Card>

      <Card className="bg-white/85">
        <CardHeader className="pb-2">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setShowChecklist((value) => !value)}
            aria-expanded={showChecklist}
          >
            <div>
              <p className="text-base font-semibold">Integration Details (Optional)</p>
              <p className="text-sm text-muted-foreground">
                Checklist and minimum fields used in this Epic pilot onboarding.
              </p>
            </div>
            <Badge variant="outline">{showChecklist ? 'Hide' : 'Show'}</Badge>
          </button>
        </CardHeader>
        {showChecklist ? (
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Required readiness: {requiredReady}/{requiredTotal}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checklist.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{item.required ? 'Yes' : 'Optional'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">Minimum Pilot Fields</p>
              <div className="flex flex-wrap gap-2">
                {minimumFields.map((field) => (
                  <Badge key={field} variant="outline">
                    {field}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
