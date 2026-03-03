'use client';

import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { StatusLegend } from '@/components/features/status-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useQueryResource } from '@/lib/use-query-resource';

const schema = z.object({
  psi_threshold: z.coerce.number().min(0).max(1),
  psi_hold_threshold: z.coerce.number().min(0).max(1),
  alert_delta_threshold_pct: z.coerce.number().min(0).max(500),
  data_quality_fail: z.enum(['HOLD', 'ABSTAIN', 'CAUTION', 'ALLOW']),
  intended_use_fail: z.enum(['HOLD', 'ABSTAIN', 'CAUTION', 'ALLOW']),
  drift_warn: z.enum(['HOLD', 'ABSTAIN', 'CAUTION', 'ALLOW']),
  drift_fail: z.enum(['HOLD', 'ABSTAIN', 'CAUTION', 'ALLOW'])
});

type FormValues = z.infer<typeof schema>;

type Policy = {
  id: string;
  name: string;
  description: string;
  version: number;
  drift_config: {
    psi_threshold?: number;
    psi_hold_threshold?: number;
    alert_delta_threshold_pct?: number;
  };
  action_map: {
    data_quality_fail?: 'HOLD' | 'ABSTAIN' | 'CAUTION' | 'ALLOW';
    intended_use_fail?: 'HOLD' | 'ABSTAIN' | 'CAUTION' | 'ALLOW';
    drift_warn?: 'HOLD' | 'ABSTAIN' | 'CAUTION' | 'ALLOW';
    drift_fail?: 'HOLD' | 'ABSTAIN' | 'CAUTION' | 'ALLOW';
  };
};

export default function PolicyPage() {
  const { data, loading, error, refetch } = useQueryResource<Policy[]>(() => api.get('/policies'));
  const { pushToast } = useToast();
  const [selectedId, setSelectedId] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const selected = useMemo(() => data?.find((item) => item.id === selectedId) ?? null, [data, selectedId]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      psi_threshold: 0.2,
      psi_hold_threshold: 0.35,
      alert_delta_threshold_pct: 25,
      data_quality_fail: 'HOLD',
      intended_use_fail: 'ABSTAIN',
      drift_warn: 'CAUTION',
      drift_fail: 'CAUTION'
    }
  });

  useEffect(() => {
    if (!data || data.length === 0) return;
    if (!selectedId) setSelectedId(data[0].id);
  }, [data, selectedId]);

  useEffect(() => {
    if (!selected) return;
    form.reset({
      psi_threshold: selected.drift_config.psi_threshold ?? 0.2,
      psi_hold_threshold: selected.drift_config.psi_hold_threshold ?? 0.35,
      alert_delta_threshold_pct: selected.drift_config.alert_delta_threshold_pct ?? 25,
      data_quality_fail: selected.action_map.data_quality_fail ?? 'HOLD',
      intended_use_fail: selected.action_map.intended_use_fail ?? 'ABSTAIN',
      drift_warn: selected.action_map.drift_warn ?? 'CAUTION',
      drift_fail: selected.action_map.drift_fail ?? 'CAUTION'
    });
  }, [form, selected]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading policies...</CardTitle>
          <CardDescription>Fetching policy definitions and current versions.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{error?.includes('Insufficient permissions') ? 'No access to Policy Engine' : 'Unable to load policies'}</CardTitle>
          <CardDescription>{error || 'Unknown API error'}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Policy Engine</h2>
          <p className="text-sm text-muted-foreground">
            Simplified visual rules builder for gate thresholds and action mapping.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="policy">Policy</Label>
          <Select id="policy" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {data.map((policy) => (
              <option key={policy.id} value={policy.id}>
                {policy.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <StatusLegend />

      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {selected.name} <Badge variant="outline">v{selected.version}</Badge>
            </CardTitle>
            <CardDescription>{selected.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={form.handleSubmit(async (values) => {
                setMessage('');
                setSubmitError('');
                setSaving(true);
                try {
                  await api.patch(`/policies/${selected.id}`, {
                    drift_config: {
                      psi_threshold: values.psi_threshold,
                      psi_hold_threshold: values.psi_hold_threshold,
                      alert_delta_threshold_pct: values.alert_delta_threshold_pct
                    },
                    action_map: {
                    data_quality_fail: values.data_quality_fail,
                    intended_use_fail: values.intended_use_fail,
                    drift_warn: values.drift_warn,
                    drift_fail: values.drift_fail
                  }
                  });
                  setMessage('Policy updated and versioned.');
                  pushToast({
                    title: 'Policy saved',
                    description: 'New policy version was created successfully.',
                    variant: 'success'
                  });
                  await refetch();
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'Policy update failed';
                  setSubmitError(message);
                  pushToast({
                    title: 'Policy update failed',
                    description: message,
                    variant: 'error'
                  });
                } finally {
                  setSaving(false);
                }
              })}
            >
              <div className="space-y-1.5">
                <Label htmlFor="psi-threshold">
                  <Tooltip text="Warning threshold for PSI drift signal.">PSI caution threshold</Tooltip>
                </Label>
                <Input id="psi-threshold" type="number" step="0.01" {...form.register('psi_threshold')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="psi-hold-threshold">
                  <Tooltip text="Critical threshold, allows HOLD decision.">PSI hold threshold</Tooltip>
                </Label>
                <Input id="psi-hold-threshold" type="number" step="0.01" {...form.register('psi_hold_threshold')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="alert-delta-threshold">
                  <Tooltip text="Percent alert burden increase threshold.">Alert burden spike %</Tooltip>
                </Label>
                <Input id="alert-delta-threshold" type="number" step="1" {...form.register('alert_delta_threshold_pct')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="policy-data-quality-fail">Data Quality FAIL outcome</Label>
                <Select id="policy-data-quality-fail" {...form.register('data_quality_fail')}>
                  <option value="HOLD">HOLD</option>
                  <option value="ABSTAIN">ABSTAIN</option>
                  <option value="CAUTION">CAUTION</option>
                  <option value="ALLOW">ALLOW</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="policy-intended-use-fail">Intended Use FAIL outcome</Label>
                <Select id="policy-intended-use-fail" {...form.register('intended_use_fail')}>
                  <option value="ABSTAIN">ABSTAIN</option>
                  <option value="HOLD">HOLD</option>
                  <option value="CAUTION">CAUTION</option>
                  <option value="ALLOW">ALLOW</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="policy-drift-warn">Drift WARN outcome</Label>
                <Select id="policy-drift-warn" {...form.register('drift_warn')}>
                  <option value="CAUTION">CAUTION</option>
                  <option value="HOLD">HOLD</option>
                  <option value="ABSTAIN">ABSTAIN</option>
                  <option value="ALLOW">ALLOW</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="policy-drift-fail">Drift FAIL outcome</Label>
                <Select id="policy-drift-fail" {...form.register('drift_fail')}>
                  <option value="CAUTION">CAUTION</option>
                  <option value="HOLD">HOLD</option>
                  <option value="ABSTAIN">ABSTAIN</option>
                  <option value="ALLOW">ALLOW</option>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save policy'}
                </Button>
              </div>
              {message ? <p className="text-sm text-emerald-700 md:col-span-2">{message}</p> : null}
              {submitError ? <p className="text-sm text-rose-700 md:col-span-2">{submitError}</p> : null}
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
