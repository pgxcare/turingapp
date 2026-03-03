import { NextResponse } from 'next/server';

import { getControlTowerPayload } from '@/lib/public-demo-api';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const modelId = searchParams.get('model_id');
  return NextResponse.json(getControlTowerPayload(modelId));
}
