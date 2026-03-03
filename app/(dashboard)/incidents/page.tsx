'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useQueryResource } from '@/lib/use-query-resource';

type Incident = {
  id: string;
  model_id: string;
  trigger_event_id: string | null;
  title: string;
  severity: 'Low' | 'Medium' | 'High' | string;
  status: 'Open' | 'Investigating' | 'Mitigated' | 'Closed' | string;
  owner_role: string;
  rca_notes: string | null;
  created_at: string;
  updated_at: string;
};

type TimelineEntry = {
  id: string;
  actor: string;
  action: string;
  note: string | null;
  created_at: string;
};

type IncidentDetails = {
  incident: Incident;
  timeline: TimelineEntry[];
};

const statusFilters = ['All', 'Open', 'Investigating', 'Mitigated', 'Closed'] as const;

function severityTone(value: string): 'default' | 'outline' | 'warning' | 'danger' {
  if (value === 'High') return 'danger';
  if (value === 'Medium') return 'warning';
  return 'outline';
}

function buildChangeHref(incident: Incident): string {
  const params = new URLSearchParams({
    model_id: incident.model_id,
    incident_id: incident.id,
    source: 'incident_queue',
    title: `Mitigation plan for ${incident.id}`,
    expected_effect: `Reduce repeated event pattern linked to incident ${incident.id}.`,
    risk_assessment: `Validate no regression in safe outcomes while closing incident ${incident.id}.`,
    triggered_rule: `Incident follow-up: ${incident.title}`
  });

  const reasonHint = incident.title.includes(':') ? incident.title.split(':')[1]?.trim() : '';
  if (reasonHint) {
    params.set('reason_codes', reasonHint);
  }
  if (incident.trigger_event_id) {
    params.set('event_id', incident.trigger_event_id);
  }

  return `/changes?${params.toString()}`;
}

export default function IncidentsPage() {
  const [status, setStatus] = useState<(typeof statusFilters)[number]>('All');
  const [selectedId, setSelectedId] = useState<string>('');

  const incidentsQuery = useQueryResource<Incident[]>(() => {
    if (status === 'All') return api.get('/incidents');
    return api.get(`/incidents?status=${encodeURIComponent(status)}`);
  });

  const detailsQuery = useQueryResource<IncidentDetails | null>(() => {
    if (!selectedId) return Promise.resolve(null);
    return api.get(`/incidents/${selectedId}`);
  });

  useEffect(() => {
    void incidentsQuery.refetch();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!incidentsQuery.data?.length) {
      setSelectedId('');
      return;
    }
    if (!selectedId || !incidentsQuery.data.some((item) => item.id === selectedId)) {
      setSelectedId(incidentsQuery.data[0].id);
    }
  }, [incidentsQuery.data, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    void detailsQuery.refetch();
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedIncident = useMemo(
    () => incidentsQuery.data?.find((item) => item.id === selectedId) ?? null,
    [incidentsQuery.data, selectedId]
  );

  if (incidentsQuery.loading && !incidentsQuery.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading incidents...</CardTitle>
          <CardDescription>Building operational queue from policy outcomes.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (incidentsQuery.error && !incidentsQuery.data) {
    const forbidden = incidentsQuery.error.includes('Insufficient permissions');
    return (
      <Card>
        <CardHeader>
          <CardTitle>{forbidden ? 'No access to incidents' : 'Unable to load incidents'}</CardTitle>
          <CardDescription>{incidentsQuery.error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void incidentsQuery.refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Incidents</h2>
          <p className="prose-limited text-sm text-muted-foreground">
            Investigate policy-triggered incidents and route mitigation into governed change proposals.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="incident-status-filter">Status filter</Label>
          <Select
            id="incident-status-filter"
            value={status}
            onChange={(event) => setStatus(event.target.value as (typeof statusFilters)[number])}
          >
            {statusFilters.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Incident Queue</CardTitle>
            <CardDescription>Keyboard-accessible rows; Enter/Space opens details panel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {incidentsQuery.data?.length ? (
              incidentsQuery.data.map((incident) => (
                <div
                  key={incident.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(incident.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(incident.id);
                    }
                  }}
                  className={`rounded-lg border px-3 py-3 ${
                    selectedId === incident.id
                      ? 'border-primary/45 bg-primary/5'
                      : 'border-border bg-card hover:bg-muted/40'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{incident.title}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={severityTone(incident.severity)}>{incident.severity}</Badge>
                      <Badge variant="outline">{incident.status}</Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Model: {incident.model_id} • Owner role: {incident.owner_role} • Created:{' '}
                    {new Date(incident.created_at).toLocaleString()}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {incident.trigger_event_id ? (
                      <Link href={`/audit?event_id=${encodeURIComponent(incident.trigger_event_id)}`}>
                        <Button size="sm" variant="outline">
                          Open linked event
                        </Button>
                      </Link>
                    ) : null}
                    <Link href={buildChangeHref(incident)}>
                      <Button size="sm">Create Change Proposal</Button>
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No incidents for selected filter.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Incident Details</CardTitle>
            <CardDescription>Timeline evidence and direct path to controlled mitigation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!selectedIncident ? (
              <p className="text-muted-foreground">Select an incident from the queue.</p>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-muted/35 p-3">
                  <p className="font-medium">{selectedIncident.title}</p>
                  <p className="text-xs text-muted-foreground">ID: {selectedIncident.id}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Updated: {new Date(selectedIncident.updated_at).toLocaleString()}
                  </p>
                  {selectedIncident.rca_notes ? (
                    <p className="mt-2 text-xs text-muted-foreground">RCA notes: {selectedIncident.rca_notes}</p>
                  ) : null}
                </div>

                {detailsQuery.loading ? <p className="text-muted-foreground">Loading timeline...</p> : null}
                {detailsQuery.error ? (
                  <p className="text-rose-700">Failed to load timeline: {detailsQuery.error}</p>
                ) : null}
                {detailsQuery.data?.timeline?.length ? (
                  <div className="space-y-2">
                    {detailsQuery.data.timeline.map((entry) => (
                      <div key={entry.id} className="rounded-lg border border-border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{entry.action}</p>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">Actor: {entry.actor}</p>
                        {entry.note ? <p className="mt-1 text-xs">{entry.note}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
