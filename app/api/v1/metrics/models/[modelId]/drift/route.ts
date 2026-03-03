import { NextResponse } from 'next/server';

import { getDriftPayload } from '@/lib/public-demo-api';

export async function GET(
  request: Request,
  context: {
    params: {
      modelId: string;
    };
  }
) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('event_id');
  return NextResponse.json(getDriftPayload(context.params.modelId, eventId));
}
