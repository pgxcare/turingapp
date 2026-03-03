'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { API_BASE } from '@/lib/api';
import { clearPkceState, loadPkceStateFor, saveSmartTokenSession } from '@/lib/smart-session';

type TokenExchangeResponse = {
  access_token: string;
  expires_in: number | null;
  token_type: string;
  patient: string | null;
  encounter: string | null;
  scope: string | null;
  id_token: string | null;
};

type ExchangeMarker = {
  status: 'pending' | 'done';
  updatedAt: number;
};

const EXCHANGE_PENDING_WAIT_MS = 12_000;
const EXCHANGE_PENDING_POLL_MS = 350;

const CALLBACK_STEPS = [
  'Validate callback payload',
  'Load launch session + PKCE',
  'Exchange auth code for token',
  'Open patient workspace',
] as const;

const SMART_DEBUG_BYPASS_ENABLED = process.env.NEXT_PUBLIC_SMART_DEBUG_BYPASS === '1';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { detail?: string };
  return body.detail || `Request failed: ${response.status}`;
}

function classifyCallbackError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('access_denied') ||
    lower.includes('user cancelled') ||
    lower.includes('user canceled') ||
    lower.includes('cancelled') ||
    lower.includes('canceled') ||
    lower.includes('consent')
  ) {
    return 'Authorization was cancelled by the user. Relaunch SMART and complete consent to continue.';
  }
  if (lower.includes('missing `code`') || lower.includes('missing `state`')) {
    return 'Epic callback URL is incomplete. Relaunch SMART from Epic and retry authorization.';
  }
  if (
    lower.includes('ssl') ||
    lower.includes('certificate') ||
    lower.includes('cert') ||
    lower.includes('network') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('connection') ||
    lower.includes('econn') ||
    lower.includes('enotfound')
  ) {
    return 'Token exchange could not reach Epic endpoint (network/certificate). Verify connectivity and retry.';
  }
  if (lower.includes('authorization failed') || lower.includes('registration') || lower.includes('client_id')) {
    return 'Epic denied authorization. Check app registration/scopes, then relaunch.';
  }
  if (lower.includes('scope')) {
    return 'Epic did not grant required SMART scopes. Relaunch and approve patient read scopes.';
  }
  if (lower.includes('expired') || lower.includes('401') || lower.includes('authorization failed')) {
    return 'Epic token request was rejected or expired. Relaunch from Epic and retry.';
  }
  if (lower.includes('state mismatch') || lower.includes('launch context')) {
    return 'Callback no longer matches stored launch state. Restart SMART launch for safety.';
  }
  return 'Retry token exchange. If it still fails, relaunch from Epic onboarding.';
}

function stepClass(index: number, activeStep: number, hasError: boolean): string {
  if (hasError && index === activeStep) {
    return 'border-rose-300 bg-rose-50 text-rose-800';
  }
  if (index < activeStep) {
    return 'border-emerald-300 bg-emerald-50 text-emerald-900';
  }
  if (index === activeStep && !hasError) {
    return 'border-blue-300 bg-blue-50 text-blue-900';
  }
  return 'border-border bg-background text-muted-foreground';
}

function buildRelaunchHref(iss: string | null, launch: string | null): string {
  if (!iss) return '/';
  const params = new URLSearchParams({ iss });
  if (launch) params.set('launch', launch);
  return `/smart/launch?${params.toString()}`;
}

function SmartCallbackPageContent() {
  const searchParams = useSearchParams();
  const callbackError = (searchParams.get('error') || '').trim();
  const callbackErrorDescription = (searchParams.get('error_description') || '').trim();
  const callbackCode = (searchParams.get('code') || '').trim();
  const callbackState = (searchParams.get('state') || '').trim();
  const [statusText, setStatusText] = useState('Validating SMART callback state...');
  const [error, setError] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [relaunchHref, setRelaunchHref] = useState('/');
  const exchangeStartedRef = useRef(false);

  useEffect(() => {
    let active = true;
    exchangeStartedRef.current = false;

    async function exchangeToken() {
      const readExchangeMarker = (key: string): ExchangeMarker | null => {
        if (typeof window === 'undefined') return null;
        const raw = window.sessionStorage.getItem(key);
        if (!raw) return null;

        if (raw === 'pending' || raw === 'done') {
          return { status: raw, updatedAt: 0 };
        }

        try {
          const marker = JSON.parse(raw) as Partial<ExchangeMarker>;
          if (marker.status !== 'pending' && marker.status !== 'done') return null;
          const updatedAt = Number(marker.updatedAt);
          return { status: marker.status, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0 };
        } catch {
          return null;
        }
      };

      const writeExchangeMarker = (key: string, status: ExchangeMarker['status']) => {
        if (typeof window === 'undefined') return;
        const marker: ExchangeMarker = {
          status,
          updatedAt: Date.now(),
        };
        window.sessionStorage.setItem(key, JSON.stringify(marker));
      };

      const waitForPendingExchange = async (key: string): Promise<'done' | 'stale'> => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < EXCHANGE_PENDING_WAIT_MS) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, EXCHANGE_PENDING_POLL_MS);
          });
          const marker = readExchangeMarker(key);
          if (marker?.status === 'done') {
            return 'done';
          }
        }
        return 'stale';
      };

      if (exchangeStartedRef.current) return;
      exchangeStartedRef.current = true;

      if (callbackError) {
        const suffix = callbackErrorDescription ? `: ${callbackErrorDescription}` : '';
        setStatusText('Epic callback returned an authorization error.');
        setError(`Epic authorization failed (${callbackError})${suffix}`);
        setActiveStep(0);
        return;
      }

      const code = callbackCode;
      const state = callbackState;
      if (!code || !state) {
        setStatusText('Callback is missing required values.');
        setError('SMART callback is missing `code` or `state`.');
        setActiveStep(0);
        return;
      }

      setActiveStep(1);
      setStatusText('Loading launch session from browser storage...');
      const pkceState = loadPkceStateFor(state);
      if (!pkceState) {
        setError('SMART launch context not found. Relaunch from Epic Launchpad.');
        return;
      }

      setRelaunchHref(buildRelaunchHref(pkceState.iss, pkceState.launch));

      if (pkceState.state !== state) {
        clearPkceState(state);
        setError('SMART state mismatch. Restart launch from Epic for safety.');
        return;
      }

      const exchangeKey = `tt_smart_exchange_${state}`;
      if (typeof window !== 'undefined') {
        const exchangeMarker = readExchangeMarker(exchangeKey);
        if (exchangeMarker?.status === 'done') {
          window.location.replace('/smart/patient');
          return;
        }
        if (exchangeMarker?.status === 'pending') {
          setStatusText('Completing token exchange from another tab...');
          const waitingResult = await waitForPendingExchange(exchangeKey);
          if (waitingResult === 'done') {
            window.location.replace('/smart/patient');
            return;
          }
          window.sessionStorage.removeItem(exchangeKey);
        }
        writeExchangeMarker(exchangeKey, 'pending');
      }

      try {
        setActiveStep(2);
        setStatusText('Exchanging code for Epic access token...');
        const response = await fetch(`${API_BASE}/integrations/epic/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            iss: pkceState.iss,
            code,
            redirect_uri: pkceState.redirectUri,
            code_verifier: pkceState.codeVerifier,
          }),
        });

        if (!response.ok) {
          throw new Error(await parseError(response));
        }

        const token = (await response.json()) as TokenExchangeResponse;
        if (!token.access_token) {
          throw new Error('Epic token exchange succeeded but returned no access token.');
        }

        saveSmartTokenSession({
          iss: pkceState.iss,
          accessToken: token.access_token,
          tokenType: token.token_type || 'Bearer',
          expiresIn: token.expires_in ?? null,
          patient: token.patient ?? null,
          encounter: token.encounter ?? null,
          scope: token.scope ?? null,
          idToken: token.id_token ?? null,
          receivedAt: new Date().toISOString(),
        });
        clearPkceState(state);
        if (typeof window !== 'undefined') {
          writeExchangeMarker(exchangeKey, 'done');
        }

        setActiveStep(3);
        setStatusText('Token exchange complete. Opening patient workspace...');
        window.location.replace('/smart/patient');
      } catch (err) {
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(exchangeKey);
        }
        if (active) {
          setError(err instanceof Error ? err.message : 'Token exchange failed.');
        }
      }
    }

    setError('');
    setActiveStep(0);
    setStatusText('Validating SMART callback state...');
    void exchangeToken();
    return () => {
      active = false;
    };
  }, [attempt, callbackCode, callbackError, callbackErrorDescription, callbackState]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Epic SMART Callback</CardTitle>
          <CardDescription>Finalizing OAuth token exchange and preparing patient context.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant={callbackError ? 'danger' : 'success'}>Auth error {callbackError ? 'reported' : 'not reported'}</Badge>
            <Badge variant={callbackCode ? 'success' : 'warning'}>Code {callbackCode ? 'received' : 'missing'}</Badge>
            <Badge variant={callbackState ? 'success' : 'warning'}>State {callbackState ? 'received' : 'missing'}</Badge>
          </div>
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground">{statusText}</p>
          <div className="grid gap-2">
            {CALLBACK_STEPS.map((step, index) => (
              <div key={step} className={`rounded-md border px-3 py-2 text-xs ${stepClass(index, activeStep, Boolean(error))}`}>
                <span className="font-medium">Step {index + 1}:</span> {step}
              </div>
            ))}
          </div>

          {error ? (
            <div className="space-y-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-800">
              <p className="font-medium">Callback error</p>
              <p>{error}</p>
              <p className="text-xs">{classifyCallbackError(error)}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => {
                    setError('');
                    setAttempt((current) => current + 1);
                  }}
                >
                  Retry exchange
                </Button>
                <Link href={relaunchHref}>
                  <Button variant="outline">Relaunch SMART</Button>
                </Link>
                <Link href="/">
                  <Button variant="outline">Back to Epic Onboarding</Button>
                </Link>
                {SMART_DEBUG_BYPASS_ENABLED ? (
                  <Link href="/smart/patient">
                    <Button variant="outline">Open Patient Workspace (debug path)</Button>
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SmartCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl space-y-4 p-6">
          <Card>
            <CardHeader>
              <CardTitle>Epic SMART Callback</CardTitle>
              <CardDescription>Completing authorization callback...</CardDescription>
            </CardHeader>
          </Card>
        </div>
      }
    >
      <SmartCallbackPageContent />
    </Suspense>
  );
}
