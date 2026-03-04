import { jsPDF } from 'jspdf';
import { NextRequest, NextResponse } from 'next/server';

import { buildRoiArtifactsPayload, fetchUpstreamSources } from '@/app/api/v1/_shared/export-artifacts';

export const runtime = 'nodejs';

function buildCsv(payload: ReturnType<typeof buildRoiArtifactsPayload>): string {
  const lines: string[] = [];
  lines.push('section,metric,before,after,delta,id,title,status,severity,model_id,created_at');
  const metrics = [
    'predictions_total',
    'alerts_total',
    'non_allow_total',
    'alert_rate_pct',
    'non_allow_rate_pct',
    'ppv_proxy_pct',
    'mean_score'
  ];

  for (const metric of metrics) {
    const deltaKey = `${metric}_delta` as keyof typeof payload.kpi_delta;
    lines.push(
      [
        'kpi',
        metric,
        payload.kpi_before[metric as keyof typeof payload.kpi_before],
        payload.kpi_after[metric as keyof typeof payload.kpi_after],
        payload.kpi_delta[deltaKey] ?? '',
        '',
        '',
        '',
        '',
        '',
        ''
      ].join(',')
    );
  }

  for (const incident of payload.incidents) {
    lines.push(
      ['incident', '', '', '', '', incident.id, incident.title, incident.status, incident.severity, incident.model_id, incident.created_at || '']
        .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
        .join(',')
    );
  }

  for (const change of payload.change_log) {
    lines.push(
      [
        'change',
        '',
        change.current_threshold,
        change.proposed_threshold,
        Number(change.proposed_threshold) - Number(change.current_threshold),
        change.id,
        change.title,
        change.status,
        '',
        change.model_id,
        change.created_at || ''
      ]
        .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
        .join(',')
    );
  }

  return `${lines.join('\n')}\n`;
}

function buildPdfBuffer(payload: ReturnType<typeof buildRoiArtifactsPayload>): ArrayBuffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 14;
  let y = 42;

  const write = (text: string, bold = false) => {
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    if (y + lines.length * lineHeight >= pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(lines, margin, y);
    y += lines.length * lineHeight + 2;
  };

  write('ROI Artifacts Report', true);
  write(`Generated at: ${payload.generated_at}`);
  write(`Window start: ${payload.window.start_time || '-'}`);
  write(`Window end: ${payload.window.end_time || '-'}`);
  write(`Split time: ${payload.window.split_time || '-'}`);
  y += 6;

  write('KPI Before/After', true);
  write(
    `Alert rate: ${payload.kpi_before.alert_rate_pct.toFixed(2)}% -> ${payload.kpi_after.alert_rate_pct.toFixed(2)}% (delta ${payload.kpi_delta.alert_rate_pct_delta.toFixed(2)}%)`
  );
  write(
    `Non-ALLOW rate: ${payload.kpi_before.non_allow_rate_pct.toFixed(2)}% -> ${payload.kpi_after.non_allow_rate_pct.toFixed(2)}% (delta ${payload.kpi_delta.non_allow_rate_pct_delta.toFixed(2)}%)`
  );
  write(
    `PPV proxy: ${payload.kpi_before.ppv_proxy_pct.toFixed(2)}% -> ${payload.kpi_after.ppv_proxy_pct.toFixed(2)}% (delta ${payload.kpi_delta.ppv_proxy_pct_delta.toFixed(2)}%)`
  );
  write(
    `Mean score: ${payload.kpi_before.mean_score.toFixed(4)} -> ${payload.kpi_after.mean_score.toFixed(4)} (delta ${payload.kpi_delta.mean_score_delta.toFixed(4)})`
  );
  y += 6;

  write(`Incidents (${payload.incidents.length})`, true);
  if (payload.incidents.length === 0) {
    write('No incidents in selected period.');
  } else {
    payload.incidents.slice(0, 25).forEach((incident, index) => {
      write(`${index + 1}. ${incident.title} | ${incident.status} | ${incident.severity} | ${incident.model_id}`);
    });
  }
  y += 6;

  write(`Change Log (${payload.change_log.length})`, true);
  if (payload.change_log.length === 0) {
    write('No changes in selected period.');
  } else {
    payload.change_log.slice(0, 40).forEach((change, index) => {
      write(
        `${index + 1}. ${change.title} | ${change.status} | ${change.model_id} | threshold ${change.current_threshold} -> ${change.proposed_threshold}`
      );
    });
  }

  return doc.output('arraybuffer');
}

export async function GET(request: NextRequest) {
  const startTime = request.nextUrl.searchParams.get('start_time');
  const endTime = request.nextUrl.searchParams.get('end_time');
  const format = request.nextUrl.searchParams.get('format') || 'json';

  const upstream = await fetchUpstreamSources(request);
  const payload = buildRoiArtifactsPayload({
    models: upstream.models,
    changes: upstream.changes,
    metrics: upstream.metrics,
    startTime,
    endTime
  });
  const stamp = payload.generated_at.replace(/[:.]/g, '-');

  if (format === 'csv') {
    const csv = buildCsv(payload);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="roi-artifacts-${stamp}.csv"`,
        'Cache-Control': 'no-store'
      }
    });
  }

  if (format === 'pdf') {
    const pdfBuffer = buildPdfBuffer(payload);
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="roi-artifacts-${stamp}.pdf"`,
        'Cache-Control': 'no-store'
      }
    });
  }

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}
