import { NextResponse } from 'next/server';

import { getAuditEventDetail } from '@/lib/public-demo-api';

export async function GET(
  _request: Request,
  context: {
    params: {
      eventId: string;
    };
  }
) {
  return NextResponse.json(getAuditEventDetail(context.params.eventId));
}
