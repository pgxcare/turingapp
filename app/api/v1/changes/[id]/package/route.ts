import { NextRequest, NextResponse } from 'next/server';

import {
  buildRoiArtifactsPayload,
  escapeHtml,
  fetchUpstreamSources,
  type UpstreamChange,
  type UpstreamModel
} from '@/app/api/v1/_shared/export-artifacts';

export const runtime = 'nodejs';

type CasePacketPayload = {
  packet_type: 'case_packet_bundle';
  generated_at: string;
  case_context: {
    change_id: string;
    title: string;
    status: string;
    model_id: string;
    model_name: string;
    incident_id: string | null;
    created_at: string | null;
    updated_at: string | null;
  };
  policy_evidence_summary: {
    threshold_before: number;
    threshold_after: number;
    threshold_delta: number;
    simulation_result: UpstreamChange['simulation_result'];
    policy_patch: Record<string, unknown>;
    health_context: {
      model_health: string | null;
      health_reason: string | null;
    };
  };
  change_proposal_context: {
    summary: string;
    disposition: string;
    recommendation: string;
  };
  roi_context: {
    kpi_before: ReturnType<typeof buildRoiArtifactsPayload>['kpi_before'];
    kpi_after: ReturnType<typeof buildRoiArtifactsPayload>['kpi_after'];
    kpi_delta: ReturnType<typeof buildRoiArtifactsPayload>['kpi_delta'];
    incident_count: number;
    change_count: number;
  };
};

function recommendationFor(change: UpstreamChange): string {
  if (change.status === 'RolledBack') {
    return 'Keep rollback package active and reopen change review with updated guardrails.';
  }
  if (change.status === 'Released') {
    return 'Monitor released threshold for alert burden and PPV proxy drift.';
  }
  if (change.status === 'Canary') {
    return 'Continue controlled canary and promote only if risk metrics stay stable.';
  }
  if (change.status === 'Approved') {
    return 'Proceed to canary with rollback path pre-authorized.';
  }
  if (change.status === 'Review') {
    return 'Collect sign-off from quality/risk reviewers before canary.';
  }
  return 'Draft remains in planning state pending reviewer approval.';
}

function buildPacket(change: UpstreamChange, model: UpstreamModel | undefined, roi: ReturnType<typeof buildRoiArtifactsPayload>): CasePacketPayload {
  return {
    packet_type: 'case_packet_bundle',
    generated_at: new Date().toISOString(),
    case_context: {
      change_id: change.id,
      title: change.title,
      status: change.status,
      model_id: change.model_id,
      model_name: model?.name || change.model_id,
      incident_id: change.incident_id || null,
      created_at: change.created_at || null,
      updated_at: change.updated_at || null
    },
    policy_evidence_summary: {
      threshold_before: change.current_threshold,
      threshold_after: change.proposed_threshold,
      threshold_delta: Number((change.proposed_threshold - change.current_threshold).toFixed(4)),
      simulation_result: change.simulation_result,
      policy_patch: change.policy_patch || {},
      health_context: {
        model_health: model?.health || null,
        health_reason: model?.health_reason || null
      }
    },
    change_proposal_context: {
      summary: `Change "${change.title}" moves threshold from ${change.current_threshold} to ${change.proposed_threshold}.`,
      disposition: `Current workflow state: ${change.status}.`,
      recommendation: recommendationFor(change)
    },
    roi_context: {
      kpi_before: roi.kpi_before,
      kpi_after: roi.kpi_after,
      kpi_delta: roi.kpi_delta,
      incident_count: roi.incidents.length,
      change_count: roi.change_log.length
    }
  };
}

function htmlPacket(packet: CasePacketPayload): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Case Packet ${escapeHtml(packet.case_context.change_id)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #0f172a; }
      h1, h2 { margin: 0 0 8px 0; }
      section { margin: 18px 0; padding: 14px; border: 1px solid #cbd5e1; border-radius: 10px; }
      .meta { color: #475569; font-size: 13px; margin-bottom: 8px; }
      pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; overflow: auto; white-space: pre-wrap; }
      table { border-collapse: collapse; width: 100%; }
      td, th { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 14px; }
      th { background: #f1f5f9; }
    </style>
  </head>
  <body>
    <h1>Case Packet</h1>
    <p class="meta">Generated at ${escapeHtml(packet.generated_at)}</p>

    <section>
      <h2>Case Context</h2>
      <table>
        <tr><th>Change ID</th><td>${escapeHtml(packet.case_context.change_id)}</td></tr>
        <tr><th>Title</th><td>${escapeHtml(packet.case_context.title)}</td></tr>
        <tr><th>Status</th><td>${escapeHtml(packet.case_context.status)}</td></tr>
        <tr><th>Model</th><td>${escapeHtml(packet.case_context.model_name)} (${escapeHtml(packet.case_context.model_id)})</td></tr>
        <tr><th>Incident ID</th><td>${escapeHtml(packet.case_context.incident_id || '-')}</td></tr>
      </table>
    </section>

    <section>
      <h2>Policy / Evidence Summary</h2>
      <p>Threshold ${packet.policy_evidence_summary.threshold_before} -> ${packet.policy_evidence_summary.threshold_after} (delta ${packet.policy_evidence_summary.threshold_delta})</p>
      <p>Model health: ${escapeHtml(packet.policy_evidence_summary.health_context.model_health || '-')}</p>
      <p>${escapeHtml(packet.policy_evidence_summary.health_context.health_reason || '')}</p>
      <pre>${escapeHtml(JSON.stringify(packet.policy_evidence_summary.simulation_result || {}, null, 2))}</pre>
      <pre>${escapeHtml(JSON.stringify(packet.policy_evidence_summary.policy_patch || {}, null, 2))}</pre>
    </section>

    <section>
      <h2>Change / Proposal Context</h2>
      <p>${escapeHtml(packet.change_proposal_context.summary)}</p>
      <p>${escapeHtml(packet.change_proposal_context.disposition)}</p>
      <p>${escapeHtml(packet.change_proposal_context.recommendation)}</p>
    </section>

    <section>
      <h2>ROI Context</h2>
      <table>
        <tr><th>Metric</th><th>Before</th><th>After</th><th>Delta</th></tr>
        <tr><td>Alert rate %</td><td>${packet.roi_context.kpi_before.alert_rate_pct}</td><td>${packet.roi_context.kpi_after.alert_rate_pct}</td><td>${packet.roi_context.kpi_delta.alert_rate_pct_delta}</td></tr>
        <tr><td>Non-ALLOW rate %</td><td>${packet.roi_context.kpi_before.non_allow_rate_pct}</td><td>${packet.roi_context.kpi_after.non_allow_rate_pct}</td><td>${packet.roi_context.kpi_delta.non_allow_rate_pct_delta}</td></tr>
        <tr><td>PPV proxy %</td><td>${packet.roi_context.kpi_before.ppv_proxy_pct}</td><td>${packet.roi_context.kpi_after.ppv_proxy_pct}</td><td>${packet.roi_context.kpi_delta.ppv_proxy_pct_delta}</td></tr>
        <tr><td>Mean score</td><td>${packet.roi_context.kpi_before.mean_score}</td><td>${packet.roi_context.kpi_after.mean_score}</td><td>${packet.roi_context.kpi_delta.mean_score_delta}</td></tr>
      </table>
      <p class="meta">Incident count: ${packet.roi_context.incident_count}; Change count: ${packet.roi_context.change_count}</p>
    </section>
  </body>
</html>`;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const format = request.nextUrl.searchParams.get('format') || 'json';
  const upstream = await fetchUpstreamSources(request);
  const change = upstream.changes.find((item) => item.id === params.id);

  if (!change) {
    return NextResponse.json({ detail: 'Change package not found' }, { status: 404 });
  }

  const roiArtifacts = buildRoiArtifactsPayload({
    models: upstream.models,
    changes: upstream.changes,
    metrics: upstream.metrics,
    startTime: request.nextUrl.searchParams.get('start_time'),
    endTime: request.nextUrl.searchParams.get('end_time')
  });

  const model = upstream.models.find((item) => item.id === change.model_id);
  const packet = buildPacket(change, model, roiArtifacts);

  if (format === 'html') {
    const body = htmlPacket(packet);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="case-packet-${params.id}.html"`,
        'Cache-Control': 'no-store'
      }
    });
  }

  return NextResponse.json(packet, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}
