import { NextResponse } from 'next/server';

import { getSmartDiscoveryConfig } from '@/lib/public-demo-api';

export async function GET() {
  return NextResponse.json(getSmartDiscoveryConfig());
}
