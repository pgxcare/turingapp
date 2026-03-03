export const EPIC_STORAGE_KEYS = {
  connected: 'tt_epic_connected',
  lastSync: 'tt_epic_last_sync',
  analysisStarted: 'tt_analysis_started',
  scope: 'tt_inspection_scope'
} as const;

export const EPIC_CONNECTION_CHANGE_EVENT = 'tt_epic_connection_change';

export type EpicConnectionSnapshot = {
  connected: boolean;
  lastSyncAt: string | null;
  analysisStarted: boolean;
};

export function readEpicConnectionSnapshot(): EpicConnectionSnapshot {
  if (typeof window === 'undefined') {
    return { connected: false, lastSyncAt: null, analysisStarted: false };
  }

  const connected = window.localStorage.getItem(EPIC_STORAGE_KEYS.connected) === '1';
  const analysisStarted = window.localStorage.getItem(EPIC_STORAGE_KEYS.analysisStarted) === '1';
  const lastSyncAt = window.localStorage.getItem(EPIC_STORAGE_KEYS.lastSync);

  return {
    connected,
    analysisStarted: connected && analysisStarted,
    lastSyncAt: connected ? lastSyncAt : null
  };
}

export function emitEpicConnectionChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EPIC_CONNECTION_CHANGE_EVENT));
}

export function clearEpicConnectionState() {
  if (typeof window === 'undefined') return;

  window.localStorage.removeItem(EPIC_STORAGE_KEYS.connected);
  window.localStorage.removeItem(EPIC_STORAGE_KEYS.lastSync);
  window.localStorage.removeItem(EPIC_STORAGE_KEYS.analysisStarted);
  window.localStorage.removeItem(EPIC_STORAGE_KEYS.scope);

  emitEpicConnectionChanged();
}

