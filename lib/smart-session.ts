export type SmartPkceState = {
  iss: string;
  launch: string | null;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: string;
};

export type SmartTokenSession = {
  iss: string;
  accessToken: string;
  tokenType: string;
  expiresIn: number | null;
  patient: string | null;
  encounter: string | null;
  scope: string | null;
  idToken: string | null;
  receivedAt: string;
};

const PKCE_STORAGE_KEY = 'tt_smart_pkce_state';
const PKCE_STATE_MAP_KEY = 'tt_smart_pkce_state_map';
const TOKEN_STORAGE_KEY = 'tt_smart_token_session';
const PKCE_STATE_TTL_MS = 20 * 60_000;

function readStorageJsonFrom<T>(storage: Storage | null, key: string): T | null {
  if (!storage) return null;
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function isStateExpired(state: SmartPkceState): boolean {
  const createdAtEpochMs = Date.parse(state.createdAt);
  if (!Number.isFinite(createdAtEpochMs)) return false;
  return Date.now() - createdAtEpochMs > PKCE_STATE_TTL_MS;
}

function readStorageJson<T>(key: string): T | null {
  return readStorageJsonFrom<T>(getSessionStorage(), key) ?? readStorageJsonFrom<T>(getLocalStorage(), key);
}

export function loadPkceState(): SmartPkceState | null {
  const state = readStorageJson<SmartPkceState>(PKCE_STORAGE_KEY);
  if (!state || isStateExpired(state)) return null;
  return state;
}

function readPkceStateMap(): Record<string, SmartPkceState> {
  const sessionMap = readStorageJsonFrom<Record<string, SmartPkceState>>(getSessionStorage(), PKCE_STATE_MAP_KEY);
  const localMap = readStorageJsonFrom<Record<string, SmartPkceState>>(getLocalStorage(), PKCE_STATE_MAP_KEY);

  const merged = {
    ...(localMap && typeof localMap === 'object' ? localMap : {}),
    ...(sessionMap && typeof sessionMap === 'object' ? sessionMap : {}),
  };

  const staleStateKeys = Object.entries(merged)
    .filter(([, value]) => isStateExpired(value))
    .map(([key]) => key);
  if (staleStateKeys.length > 0) {
    staleStateKeys.forEach((key) => {
      delete merged[key];
    });
    writePkceStateMap(merged);
  }

  return merged;
}

function writePkceStateMap(stateMap: Record<string, SmartPkceState>) {
  const sessionStorage = getSessionStorage();
  const localStorage = getLocalStorage();
  if (Object.keys(stateMap).length === 0) {
    sessionStorage?.removeItem(PKCE_STATE_MAP_KEY);
    localStorage?.removeItem(PKCE_STATE_MAP_KEY);
    return;
  }
  const serialized = JSON.stringify(stateMap);
  sessionStorage?.setItem(PKCE_STATE_MAP_KEY, serialized);
  localStorage?.setItem(PKCE_STATE_MAP_KEY, serialized);
}

export function loadPkceStateFor(state: string): SmartPkceState | null {
  const normalizedState = state.trim();
  if (!normalizedState) return null;

  const stateMap = readPkceStateMap();
  if (stateMap[normalizedState]) return stateMap[normalizedState];

  const legacy = readStorageJson<SmartPkceState>(PKCE_STORAGE_KEY);
  if (legacy && legacy.state === normalizedState && !isStateExpired(legacy)) return legacy;
  return null;
}

export function savePkceState(state: SmartPkceState) {
  const sessionStorage = getSessionStorage();
  const localStorage = getLocalStorage();
  const serialized = JSON.stringify(state);
  sessionStorage?.setItem(PKCE_STORAGE_KEY, serialized);
  localStorage?.setItem(PKCE_STORAGE_KEY, serialized);

  const stateMap = readPkceStateMap();
  stateMap[state.state] = state;
  writePkceStateMap(stateMap);
}

export function clearPkceState(state?: string) {
  const sessionStorage = getSessionStorage();
  const localStorage = getLocalStorage();
  if (!state) {
    sessionStorage?.removeItem(PKCE_STORAGE_KEY);
    sessionStorage?.removeItem(PKCE_STATE_MAP_KEY);
    localStorage?.removeItem(PKCE_STORAGE_KEY);
    localStorage?.removeItem(PKCE_STATE_MAP_KEY);
    return;
  }

  const normalizedState = state.trim();
  if (!normalizedState) return;

  const legacy = readStorageJson<SmartPkceState>(PKCE_STORAGE_KEY);
  if (legacy && legacy.state === normalizedState) {
    sessionStorage?.removeItem(PKCE_STORAGE_KEY);
    localStorage?.removeItem(PKCE_STORAGE_KEY);
  }

  const stateMap = readPkceStateMap();
  if (stateMap[normalizedState]) {
    delete stateMap[normalizedState];
    writePkceStateMap(stateMap);
  }
}

export function loadSmartTokenSession(): SmartTokenSession | null {
  return readStorageJsonFrom<SmartTokenSession>(getSessionStorage(), TOKEN_STORAGE_KEY);
}

export function saveSmartTokenSession(session: SmartTokenSession) {
  getSessionStorage()?.setItem(TOKEN_STORAGE_KEY, JSON.stringify(session));
}

export function clearSmartTokenSession() {
  getSessionStorage()?.removeItem(TOKEN_STORAGE_KEY);
}

export function smartTokenLooksExpired(session: SmartTokenSession): boolean {
  if (!session.expiresIn || session.expiresIn <= 0) return false;
  const receivedAt = new Date(session.receivedAt).getTime();
  if (Number.isNaN(receivedAt)) return false;
  const expiresAt = receivedAt + session.expiresIn * 1000;
  return Date.now() >= expiresAt - 30_000;
}
