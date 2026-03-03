import { NextResponse } from 'next/server';

import { getSmartPublicConfig } from '@/lib/public-demo-api';

export async function GET() {
  return NextResponse.json(getSmartPublicConfig());
}
