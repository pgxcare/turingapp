'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { HealthChip, StatusLegend } from '@/components/features/status-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { useQueryResource } from '@/lib/use-query-resource';

type PassportPayload = {
  model: {
    id: string;
    code: string;
    name: string;
    description: string;
    intended_use: string;
    exclusions: string;
    owner: string;
    stop_criteria: string;
    default_threshold: number;
    status: string;
    tags: string[];
  };
  policy?: {
    id: string;
    name: string;
    auto_incident_for: string[];
  };
  deployments: Array<{
    id: string;
    site_name: string;
    unit_name: string;
    care_setting: string;
    is_active: boolean;
  }>;
  config_versions: Array<{
    id: string;
    version: string;
    threshold: number;
    changelog: string;
    changed_by: string;
    changed_at: string;
  }>;
};

export default function ModelPassportPage() {
  const params = useParams<{ id: string }>();
  const modelId = params.id;

  const { data, loading, error } = useQueryResource<PassportPayload>(() =>
    api.get(`/models/${modelId}/passport`)
  );

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/70 px-3 py-2 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Loading model passport…</p>
        </div>
      </div>
    );
  }
  if (error || !data) return <p className="text-sm text-rose-700">{error || 'Unable to load model passport'}</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Model Passport</p>
          <h2 className="text-2xl font-semibold">{data.model.name}</h2>
          <p className="text-sm text-muted-foreground">{data.model.code}</p>
        </div>
        <div className="flex items-center gap-2">
          <HealthChip status={data.model.status} />
          <Badge variant="outline">Threshold: {data.model.default_threshold}</Badge>
          <Link href={`/drift/${data.model.id}`}>
            <Button>Open Drift Workspace</Button>
          </Link>
        </div>
      </div>

      <StatusLegend />

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Intended Use</CardTitle>
            <CardDescription>
              <Tooltip text="Model is allowed only inside these contexts.">Clinical scope and ownership</Tooltip>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="font-medium">Intended use:</span> {data.model.intended_use}
            </p>
            <p>
              <span className="font-medium">Exclusions:</span> {data.model.exclusions}
            </p>
            <p>
              <span className="font-medium">Owner:</span> {data.model.owner}
            </p>
            <p>
              <span className="font-medium">Stop criteria:</span> {data.model.stop_criteria}
            </p>
            <div className="flex flex-wrap gap-2">
              {data.model.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linked Policy</CardTitle>
            <CardDescription>Gate action map and auto-incident behavior.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="font-medium">Policy:</span> {data.policy?.name || 'No policy linked'}
            </p>
            <p>
              <span className="font-medium">Auto incident outcomes:</span>{' '}
              {(data.policy?.auto_incident_for || []).join(', ') || 'None'}
            </p>
            <Separator />
            <p className="text-xs text-muted-foreground">
              All changes are versioned. Deployment without owner + stop criteria is blocked.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Deployments by Unit</CardTitle>
            <CardDescription>Operational footprint across care settings.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Care setting</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.deployments.map((deployment) => (
                  <TableRow key={deployment.id}>
                    <TableCell>{deployment.site_name}</TableCell>
                    <TableCell>{deployment.unit_name}</TableCell>
                    <TableCell>{deployment.care_setting}</TableCell>
                    <TableCell>{deployment.is_active ? 'Active' : 'Paused'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuration History</CardTitle>
            <CardDescription>Who changed threshold/policy and when.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Threshold</TableHead>
                  <TableHead>Changed by</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.config_versions.map((version) => (
                  <TableRow key={version.id}>
                    <TableCell>{version.version}</TableCell>
                    <TableCell>{version.threshold}</TableCell>
                    <TableCell>{version.changed_by}</TableCell>
                    <TableCell>{new Date(version.changed_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
