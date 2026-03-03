'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { API_BASE } from '@/lib/api';
import { savePkceState } from '@/lib/smart-session';

type SmartPublicConfig = {
  client_id: string;
  redirect_uri: string;
  default_scopes: string;
};

type SmartDiscoveryConfig = {
  authorization_endpoint: string;
};

const LAUNCH_STEPS = [
  'Capture SMART launch context',
  'Load Epic SMART configuration',
  'Create secure PKCE challenge',
  'Redirect to Epic sign-in',
] as const;

const LAUNCH_OPERATOR_NOTES = [
  'Authorize patient-read scopes when Epic prompts for consent.',
  'After callback, the app opens Patient Workspace automatically.',
  'If launch fails, use Retry first; if repeated, relaunch from Epic Onboarding.',
] as const;

const SMART_DEBUG_BYPASS_ENABLED = process.env.NEXT_PUBLIC_SMART_DEBUG_BYPASS === '1';

function normalizeScopes(scopeList: string): string {
  const uniqueScopes = Array.from(
    new Set(
      scopeList
        .split(/\s+/)
        .map((scope) => scope.trim())
        .filter(Boolean),
    ),
  );
  return uniqueScopes.join(' ');
}

function resolveRequestedScopes(defaultScopes: string, launchToken: string | null): string {
  const hasLaunchToken = Boolean(launchToken);
  const fallbackScopes = hasLaunchToken
    ? 'launch openid fhirUser patient/*.read profile'
    : 'launch/patient patient/*.read';

  if (!hasLaunchToken) {
    return fallbackScopes;
  }

  const normalizedDefault = normalizeScopes(defaultScopes || fallbackScopes);
  return normalizedDefault || fallbackScopes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Base64Url(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);
  return bytesToBase64Url(new Uint8Array(digest));
}

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { detail?: string };
  return body.detail || `Request failed: ${response.status}`;
}

function launchErrorHint(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('ssl') ||
    lower.includes('certificate') ||
    lower.includes('cert') ||
    lower.includes('network') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('connection') ||
    lower.includes('econn') ||
    lower.includes('enotfound') ||
    lower.includes('unable to load smart configuration')
  ) {
    return 'Epic endpoint connectivity failed (network/certificate). Verify ISS URL trust/SSL and retry launch.';
  }
  if (lower.includes('missing `iss`') || lower.includes('missing iss')) {
    return 'Epic launch URL is missing the `iss` parameter. Restart from Epic Launchpad.';
  }
  if (lower.includes('scope') || lower.includes('registration') || lower.includes('client_id')) {
    return 'Required SMART scopes are missing. Confirm your app allows launch + patient read scopes.';
  }
  if (lower.includes('authorization') || lower.includes('token')) {
    return 'Authorization setup failed. Verify Epic app registration and retry.';
  }
  return 'Retry launch. If this repeats, return to onboarding and re-open SMART Launch from Epic.';
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

function SmartLaunchPageContent() {
  const searchParams = useSearchParams();
  const iss = (searchParams.get('iss') || '').trim();
  const launchToken = (searchParams.get('launch') || '').trim() || null;
  const [statusText, setStatusText] = useState('Waiting for SMART launch parameters...');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function runLaunch() {
      const launch = launchToken;

      if (!iss) {
        setError('Missing `iss` query parameter from Epic SMART launch.');
        setStatusText('Launch cannot continue until Epic provides launch context.');
        setActiveStep(0);
        return;
      }

      try {
        setError('');
        setActiveStep(0);
        setStatusText('Launch context captured. Connecting to Epic SMART config...');

        setActiveStep(1);
        const [publicConfigResponse, smartConfigResponse] = await Promise.all([
          fetch(`${API_BASE}/integrations/epic/public-config`, { cache: 'no-store' }),
          fetch(`${API_BASE}/integrations/epic/smart-config?iss=${encodeURIComponent(iss)}`, { cache: 'no-store' }),
        ]);

        if (!publicConfigResponse.ok) {
          throw new Error(await parseError(publicConfigResponse));
        }
        if (!smartConfigResponse.ok) {
          throw new Error(await parseError(smartConfigResponse));
        }

        const publicConfig = (await publicConfigResponse.json()) as SmartPublicConfig;
        const smartConfig = (await smartConfigResponse.json()) as SmartDiscoveryConfig;

        if (!smartConfig.authorization_endpoint) {
          throw new Error('SMART discovery is missing `authorization_endpoint`.');
        }

        setActiveStep(2);
        setStatusText('Building secure PKCE challenge...');
        const codeVerifier = randomBase64Url(64);
        const codeChallenge = await sha256Base64Url(codeVerifier);
        const state = randomBase64Url(24);

        savePkceState({
          iss,
          launch,
          state,
          codeVerifier,
          redirectUri: publicConfig.redirect_uri,
          createdAt: new Date().toISOString(),
        });

        const params = new URLSearchParams({
          response_type: 'code',
          client_id: publicConfig.client_id,
          redirect_uri: publicConfig.redirect_uri,
          scope: resolveRequestedScopes(publicConfig.default_scopes, launch),
          aud: iss,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        });

        if (launch) {
          params.set('launch', launch);
        }

        setActiveStep(3);
        setStatusText('Redirecting to Epic sign-in...');
        if (!cancelled) {
          window.location.assign(`${smartConfig.authorization_endpoint}?${params.toString()}`);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to start SMART launch.');
      }
    }

    void runLaunch();
    return () => {
      cancelled = true;
    };
  }, [attempt, iss, launchToken]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Epic SMART Launch</CardTitle>
          <CardDescription>
            Quick start path: launch authorization, return with callback token, then run patient scoring.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant={iss ? 'success' : 'danger'}>ISS {iss ? 'received' : 'missing'}</Badge>
            <Badge variant={launchToken ? 'success' : 'warning'}>
              Launch token {launchToken ? 'received' : 'not provided'}
            </Badge>
          </div>
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground">{statusText}</p>
          <div className="grid gap-2">
            {LAUNCH_STEPS.map((step, index) => (
              <div key={step} className={`rounded-md border px-3 py-2 text-xs ${stepClass(index, activeStep, Boolean(error))}`}>
                <span className="font-medium">Step {index + 1}:</span> {step}
              </div>
            ))}
          </div>
          <div className="rounded-md border border-border bg-background/70 px-3 py-2">
            <p className="text-xs font-medium text-foreground">Operator notes</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {LAUNCH_OPERATOR_NOTES.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/">
              <Button variant="outline">Open Epic Onboarding</Button>
            </Link>
            {SMART_DEBUG_BYPASS_ENABLED ? (
              <Link href="/smart/patient">
                <Button variant="outline">Open Patient Workspace (debug path)</Button>
              </Link>
            ) : null}
          </div>
          {error ? (
            <div className="space-y-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-800">
              <p className="font-medium">Launch error</p>
              <p>{error}</p>
              <p className="text-xs">{launchErrorHint(error)}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => {
                    setError('');
                    setAttempt((current) => current + 1);
                  }}
                >
                  Retry launch
                </Button>
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

export default function SmartLaunchPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl space-y-4 p-6">
          <Card>
            <CardHeader>
              <CardTitle>Epic SMART Launch</CardTitle>
              <CardDescription>Preparing launch session...</CardDescription>
            </CardHeader>
          </Card>
        </div>
      }
    >
      <SmartLaunchPageContent />
    </Suspense>
  );
}
